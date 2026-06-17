from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import asyncio
import secrets as pysecrets
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import requests
import resend

from fastapi import (
    FastAPI, APIRouter, Depends, HTTPException, Request, Response,
    UploadFile, File, Form, Query, Header
)
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from bson import ObjectId

# ---------------------------------------------------------------------------
# Config / DB
# ---------------------------------------------------------------------------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
OWNER_EMAIL = os.environ['OWNER_EMAIL'].lower()
OWNER_PASSWORD = os.environ['OWNER_PASSWORD']
OWNER_NAME = os.environ.get('OWNER_NAME', 'Owner')

EMERGENT_KEY = os.environ.get('EMERGENT_LLM_KEY')
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "robotics-hub"

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
TEXTBEE_API_KEY = os.environ.get('TEXTBEE_API_KEY', '')
TEXTBEE_DEVICE_ID = os.environ.get('TEXTBEE_DEVICE_ID', '')
TEXTBEE_URL = "https://api.textbee.dev/api/v1"

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("robotics-hub")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Channel definitions
# ---------------------------------------------------------------------------
PROGRAMS = [("vex", "VEX"), ("frc", "FRC")]
SUBCATS = [
    ("programming", "Programming"),
    ("building", "Building"),
    ("business", "Business"),
    ("team", "Team Chat"),
]

CHANNELS = []
for pkey, plabel in PROGRAMS:
    for ckey, clabel in SUBCATS:
        CHANNELS.append({
            "id": f"{pkey}-{ckey}",
            "name": clabel,
            "program": pkey,
            "program_label": plabel,
            "private": False,
        })
CHANNELS.append({
    "id": "members-only",
    "name": "Members Only",
    "program": "private",
    "program_label": "Private",
    "private": True,
})
CHANNEL_IDS = {c["id"] for c in CHANNELS}


def channel_visible_to(channel_id: str, role: str) -> bool:
    if channel_id == "members-only":
        return role in ("member", "owner")  # mentors excluded
    return channel_id in CHANNEL_IDS


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "member"),
        "phone": user.get("phone", ""),
        "email_notifications": user.get("email_notifications", True),
        "sms_notifications": user.get("sms_notifications", False),
        "created_at": user.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return checker


# ---------------------------------------------------------------------------
# Object storage helpers
# ---------------------------------------------------------------------------
storage_key = None


def init_storage():
    global storage_key
    if storage_key:
        return storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    storage_key = resp.json()["storage_key"]
    return storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ---------------------------------------------------------------------------
# Notification helpers (graceful no-op if keys missing)
# ---------------------------------------------------------------------------
def _send_email_sync(to_email: str, subject: str, html: str):
    if not RESEND_API_KEY:
        logger.info(f"[email skipped - no key] to={to_email} subject={subject}")
        return
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({"from": SENDER_EMAIL, "to": [to_email], "subject": subject, "html": html})
        logger.info(f"[email sent] to={to_email}")
    except Exception as e:
        logger.error(f"[email failed] to={to_email} err={e}")


def _send_sms_sync(to_phone: str, body: str):
    if not (TEXTBEE_API_KEY and TEXTBEE_DEVICE_ID):
        logger.info(f"[sms skipped - no key] to={to_phone}")
        return
    try:
        resp = requests.post(
            f"{TEXTBEE_URL}/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms",
            headers={"x-api-key": TEXTBEE_API_KEY},
            json={"recipients": [to_phone], "message": body},
            timeout=30,
        )
        resp.raise_for_status()
        logger.info(f"[sms sent] to={to_phone}")
    except Exception as e:
        logger.error(f"[sms failed] to={to_phone} err={e}")


def _email_template(title: str, body: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#f4f6fb;padding:24px;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f0;">
        <div style="background:#1d4ed8;padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">Robotics Team Hub</div>
        <div style="padding:28px;color:#1a1a1a;">
          <h2 style="margin:0 0 12px;font-size:20px;">{title}</h2>
          <p style="font-size:15px;line-height:1.6;color:#333;">{body}</p>
        </div>
        <div style="padding:16px 28px;background:#f9fafb;color:#888;font-size:12px;">You are receiving this because notifications are enabled in your Robotics Hub profile.</div>
      </div>
    </div>"""


async def notify_team(subject: str, short_text: str, html_body: str, exclude_user_id: Optional[str] = None,
                      roles: Optional[List[str]] = None):
    query = {}
    if roles:
        query["role"] = {"$in": roles}
    users = await db.users.find(query).to_list(1000)
    html = _email_template(subject, html_body)
    for u in users:
        if exclude_user_id and str(u["_id"]) == exclude_user_id:
            continue
        if u.get("email_notifications", True) and u.get("email"):
            asyncio.create_task(asyncio.to_thread(_send_email_sync, u["email"], subject, html))
        if u.get("sms_notifications", False) and u.get("phone"):
            asyncio.create_task(asyncio.to_thread(_send_sms_sync, u["phone"], short_text))


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "member"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class MessageCreate(BaseModel):
    text: str
    attachment_file_id: Optional[str] = None


class EventCreate(BaseModel):
    title: str
    description: str = ""
    date: str  # ISO date/datetime string
    location: str = ""


class SettingsUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None


class RoleUpdate(BaseModel):
    role: str


# ---------------------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------------------
@api_router.post("/auth/register")
async def register(req: RegisterRequest, response: Response):
    email = req.email.lower()
    if email == OWNER_EMAIL:
        raise HTTPException(status_code=400, detail="This email is reserved. Please sign in instead.")
    if req.role not in ("member", "mentor"):
        raise HTTPException(status_code=400, detail="Role must be member or mentor")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(req.password),
        "name": req.name.strip() or email.split("@")[0],
        "role": req.role,
        "phone": "",
        "email_notifications": True,
        "sms_notifications": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    token = create_access_token(str(result.inserted_id), email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": serialize_user(doc)}


@api_router.post("/auth/login")
async def login(req: LoginRequest, response: Response):
    email = req.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": serialize_user(user)}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@api_router.put("/auth/me/settings")
async def update_settings(req: SettingsUpdate, user: dict = Depends(get_current_user)):
    updates = {}
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.phone is not None:
        updates["phone"] = req.phone.strip()
    if req.email_notifications is not None:
        updates["email_notifications"] = req.email_notifications
    if req.sms_notifications is not None:
        updates["sms_notifications"] = req.sms_notifications
    if updates:
        await db.users.update_one({"_id": user["_id"]}, {"$set": updates})
    updated = await db.users.find_one({"_id": user["_id"]})
    return serialize_user(updated)


# ---------------------------------------------------------------------------
# Channels & messages
# ---------------------------------------------------------------------------
@api_router.get("/channels")
async def list_channels(user: dict = Depends(get_current_user)):
    role = user.get("role")
    visible = [c for c in CHANNELS if channel_visible_to(c["id"], role)]
    return visible


@api_router.get("/channels/{channel_id}/messages")
async def get_messages(channel_id: str, user: dict = Depends(get_current_user)):
    if channel_id not in CHANNEL_IDS:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not channel_visible_to(channel_id, user.get("role")):
        raise HTTPException(status_code=403, detail="You don't have access to this channel")
    msgs = await db.messages.find({"channel_id": channel_id}, {"_id": 0}).sort("created_at", 1).to_list(1000)
    return msgs


@api_router.post("/channels/{channel_id}/messages")
async def post_message(channel_id: str, req: MessageCreate, user: dict = Depends(get_current_user)):
    if channel_id not in CHANNEL_IDS:
        raise HTTPException(status_code=404, detail="Channel not found")
    if not channel_visible_to(channel_id, user.get("role")):
        raise HTTPException(status_code=403, detail="You don't have access to this channel")
    attachment = None
    if req.attachment_file_id:
        f = await db.files.find_one({"id": req.attachment_file_id, "is_deleted": False}, {"_id": 0})
        if f:
            attachment = {
                "file_id": f["id"],
                "filename": f["original_filename"],
                "content_type": f["content_type"],
                "kind": f["kind"],
            }
    msg = {
        "id": str(uuid.uuid4()),
        "channel_id": channel_id,
        "user_id": str(user["_id"]),
        "user_name": user.get("name", ""),
        "user_role": user.get("role", "member"),
        "text": req.text,
        "attachment": attachment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.messages.insert_one(dict(msg))
    return msg


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------
def classify_file(filename: str, content_type: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if content_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
        return "image"
    if ext == "zip" or content_type in ("application/zip", "application/x-zip-compressed"):
        return "zip"
    return "code"


@api_router.post("/files/upload")
async def upload_file(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    path = f"{APP_NAME}/uploads/{str(user['_id'])}/{uuid.uuid4()}.{ext}"
    content_type = file.content_type or "application/octet-stream"
    try:
        result = await asyncio.to_thread(put_object, path, data, content_type)
    except Exception as e:
        logger.error(f"upload failed: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")
    kind = classify_file(file.filename, content_type)
    rec = {
        "id": str(uuid.uuid4()),
        "storage_path": result["path"],
        "original_filename": file.filename,
        "content_type": content_type,
        "size": result.get("size", len(data)),
        "kind": kind,
        "uploaded_by": str(user["_id"]),
        "uploader_name": user.get("name", ""),
        "is_deleted": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.files.insert_one(dict(rec))
    rec.pop("_id", None)
    return rec


@api_router.get("/files")
async def list_files(kind: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {"is_deleted": False}
    if kind:
        query["kind"] = kind
    files = await db.files.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return files


@api_router.get("/files/{file_id}/download")
async def download_file(file_id: str, request: Request, auth: Optional[str] = Query(None)):
    # auth via header or query param (for <img> tags)
    token = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
    elif auth:
        token = auth
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    rec = await db.files.find_one({"id": file_id, "is_deleted": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    try:
        content, ctype = await asyncio.to_thread(get_object, rec["storage_path"])
    except Exception as e:
        logger.error(f"download failed: {e}")
        raise HTTPException(status_code=500, detail="Download failed")
    headers = {"Content-Disposition": f'inline; filename="{rec["original_filename"]}"'}
    return Response(content=content, media_type=rec.get("content_type", ctype), headers=headers)


@api_router.delete("/files/{file_id}")
async def delete_file(file_id: str, user: dict = Depends(get_current_user)):
    rec = await db.files.find_one({"id": file_id, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="File not found")
    if rec["uploaded_by"] != str(user["_id"]) and user.get("role") not in ("owner", "mentor"):
        raise HTTPException(status_code=403, detail="Not allowed to delete this file")
    await db.files.update_one({"id": file_id}, {"$set": {"is_deleted": True}})
    return {"ok": True}


# ---------------------------------------------------------------------------
# Events / Calendar
# ---------------------------------------------------------------------------
@api_router.get("/events")
async def list_events(user: dict = Depends(get_current_user)):
    events = await db.events.find({}, {"_id": 0}).sort("date", 1).to_list(1000)
    return events


@api_router.post("/events")
async def create_event(req: EventCreate, user: dict = Depends(require_roles("owner", "mentor"))):
    ev = {
        "id": str(uuid.uuid4()),
        "title": req.title,
        "description": req.description,
        "date": req.date,
        "location": req.location,
        "created_by": str(user["_id"]),
        "creator_name": user.get("name", ""),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.events.insert_one(dict(ev))
    ev.pop("_id", None)
    body = f"<b>{req.title}</b><br>{req.date}{(' &middot; ' + req.location) if req.location else ''}<br><br>{req.description}"
    sms = f"New Robotics event: {req.title} on {req.date}" + (f" @ {req.location}" if req.location else "")
    await notify_team(f"New Event: {req.title}", sms, body, exclude_user_id=str(user["_id"]))
    return ev


@api_router.put("/events/{event_id}")
async def update_event(event_id: str, req: EventCreate, user: dict = Depends(require_roles("owner", "mentor"))):
    existing = await db.events.find_one({"id": event_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Event not found")
    await db.events.update_one({"id": event_id}, {"$set": {
        "title": req.title, "description": req.description, "date": req.date, "location": req.location,
    }})
    updated = await db.events.find_one({"id": event_id}, {"_id": 0})
    return updated


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(require_roles("owner", "mentor"))):
    res = await db.events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin / team management (owner only)
# ---------------------------------------------------------------------------
@api_router.get("/users")
async def list_users(user: dict = Depends(require_roles("owner"))):
    users = await db.users.find({}).sort("created_at", 1).to_list(1000)
    return [serialize_user(u) for u in users]


@api_router.put("/users/{user_id}/role")
async def update_user_role(user_id: str, req: RoleUpdate, user: dict = Depends(require_roles("owner"))):
    if req.role not in ("member", "mentor"):
        raise HTTPException(status_code=400, detail="Role must be member or mentor (owner is reserved)")
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="Cannot change the owner's role")
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"role": req.role}})
    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    return serialize_user(updated)


# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@api_router.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    next_event = await db.events.find_one({"date": {"$gte": now}}, {"_id": 0}, sort=[("date", 1)])
    if not next_event:
        next_event = await db.events.find_one({}, {"_id": 0}, sort=[("date", -1)])
    file_count = await db.files.count_documents({"is_deleted": False})
    role = user.get("role")
    visible_ids = [c["id"] for c in CHANNELS if channel_visible_to(c["id"], role)]
    msg_count = await db.messages.count_documents({"channel_id": {"$in": visible_ids}})
    member_count = await db.users.count_documents({})
    recent_files = await db.files.find({"is_deleted": False}, {"_id": 0}).sort("created_at", -1).to_list(4)
    return {
        "next_event": next_event,
        "file_count": file_count,
        "message_count": msg_count,
        "member_count": member_count,
        "recent_files": recent_files,
    }


@api_router.get("/")
async def root():
    return {"message": "Robotics Team Hub API"}


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    # Seed owner
    existing = await db.users.find_one({"email": OWNER_EMAIL})
    if existing is None:
        await db.users.insert_one({
            "email": OWNER_EMAIL,
            "password_hash": hash_password(OWNER_PASSWORD),
            "name": OWNER_NAME,
            "role": "owner",
            "phone": "",
            "email_notifications": True,
            "sms_notifications": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info("Owner account seeded")
    else:
        update = {"role": "owner"}
        if not verify_password(OWNER_PASSWORD, existing["password_hash"]):
            update["password_hash"] = hash_password(OWNER_PASSWORD)
        await db.users.update_one({"email": OWNER_EMAIL}, {"$set": update})
    try:
        await asyncio.to_thread(init_storage)
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
