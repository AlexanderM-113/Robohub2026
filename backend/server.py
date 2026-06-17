from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import json
import base64
import uuid
import logging
import asyncio
import secrets as pysecrets
from datetime import datetime, timezone, timedelta

import jwt
import bcrypt
import requests
import resend
from pywebpush import webpush, WebPushException
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

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

VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_PRIVATE_KEY_B64 = os.environ.get('VAPID_PRIVATE_KEY_B64', '')
VAPID_CLAIM_EMAIL = os.environ.get('VAPID_CLAIM_EMAIL', 'mailto:admin@example.com')
VAPID_PEM_PATH = str(ROOT_DIR / 'vapid_private.pem')

# US carrier email-to-SMS gateways (free, best-effort)
CARRIER_GATEWAYS = {
    "verizon": "vtext.com",
    "att": "txt.att.net",
    "tmobile": "tmomail.net",
    "sprint": "messaging.sprintpcs.com",
    "boost": "sms.myboostmobile.com",
    "cricket": "sms.cricketwireless.net",
    "uscellular": "email.uscc.net",
    "metropcs": "mymetropcs.com",
    "googlefi": "msg.fi.google.com",
    "xfinity": "vtext.com",
    "virgin": "vmobl.com",
}

# Monthly cap on outbound notification emails (digest + email-to-SMS) to protect quota
EMAIL_MONTHLY_LIMIT = int(os.environ.get('EMAIL_MONTHLY_LIMIT', '2500'))

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("robotics-hub")

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------------------------------------------------------------------
# Channel definitions
# ---------------------------------------------------------------------------
# Per-program channels: VEX uses a single General chat; FRC has full categories incl. Design.
PROGRAM_CHANNELS = {
    "vex": {"label": "VEX", "subs": [("general", "General")]},
    "frc": {"label": "FRC", "subs": [
        ("programming", "Programming"),
        ("building", "Building"),
        ("business", "Business"),
        ("team", "Team Chat"),
        ("design", "Design"),
    ]},
}

CHANNELS = []
for pkey, cfg in PROGRAM_CHANNELS.items():
    for ckey, clabel in cfg["subs"]:
        CHANNELS.append({
            "id": f"{pkey}-{ckey}",
            "name": clabel,
            "program": pkey,
            "program_label": cfg["label"],
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
        "carrier": user.get("carrier", ""),
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


def _send_email_plain_sync(to_email: str, subject: str, text: str):
    """Plain-text email, used for email-to-SMS carrier gateways."""
    if not RESEND_API_KEY:
        logger.info(f"[sms-email skipped - no key] to={to_email}")
        return
    try:
        resend.api_key = RESEND_API_KEY
        resend.Emails.send({"from": SENDER_EMAIL, "to": [to_email], "subject": subject, "text": text})
        logger.info(f"[sms-email sent] to={to_email}")
    except Exception as e:
        logger.error(f"[sms-email failed] to={to_email} err={e}")


def _normalize_phone(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit())[-10:]


def _send_webpush_sync(subscription_info: dict, payload: dict):
    if not (VAPID_PUBLIC_KEY and os.path.exists(VAPID_PEM_PATH)):
        return False
    try:
        webpush(
            subscription_info=subscription_info,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PEM_PATH,
            vapid_claims={"sub": VAPID_CLAIM_EMAIL},
        )
        return True
    except WebPushException as e:
        # 404/410 -> expired subscription, signal for cleanup
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return "expired"
        logger.error(f"[webpush failed] {e}")
        return False
    except Exception as e:
        logger.error(f"[webpush error] {e}")
        return False


def _email_template(title: str, body: str) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;background:#f4f6fb;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e6e9f0;">
        <div style="background:#1d4ed8;padding:20px 28px;color:#fff;font-size:18px;font-weight:bold;">Robotics Team Hub</div>
        <div style="padding:28px;color:#1a1a1a;">
          <h2 style="margin:0 0 12px;font-size:20px;">{title}</h2>
          <div style="font-size:15px;line-height:1.6;color:#333;">{body}</div>
        </div>
        <div style="padding:16px 28px;background:#f9fafb;color:#888;font-size:12px;">You receive this weekly digest because email notifications are enabled in your Robotics Hub profile.</div>
      </div>
    </div>"""


async def _push_to_user(user_id: str, payload: dict):
    subs = await db.push_subscriptions.find({"user_id": user_id}).to_list(50)
    for s in subs:
        result = await asyncio.to_thread(_send_webpush_sync, s["subscription"], payload)
        if result == "expired":
            await db.push_subscriptions.delete_one({"endpoint": s["endpoint"]})


async def _reserve_email_quota() -> bool:
    """Atomically reserve one slot of the monthly outbound-email budget.
    Returns False once EMAIL_MONTHLY_LIMIT is reached for the current month."""
    month = datetime.now(timezone.utc).strftime("%Y-%m")
    doc = await db.email_usage.find_one_and_update(
        {"month": month, "count": {"$lt": EMAIL_MONTHLY_LIMIT}},
        {"$inc": {"count": 1}},
        return_document=True,
    )
    if doc:
        return True
    existing = await db.email_usage.find_one({"month": month})
    if existing is None:
        try:
            await db.email_usage.insert_one({"month": month, "count": 1})
            return True
        except Exception:
            doc = await db.email_usage.find_one_and_update(
                {"month": month, "count": {"$lt": EMAIL_MONTHLY_LIMIT}},
                {"$inc": {"count": 1}}, return_document=True,
            )
            return doc is not None
    return False  # monthly limit reached


async def dispatch_email(to_email: str, subject: str, html: str):
    if await _reserve_email_quota():
        asyncio.create_task(asyncio.to_thread(_send_email_sync, to_email, subject, html))
    else:
        logger.warning(f"[email quota reached - {EMAIL_MONTHLY_LIMIT}/mo] skipped to={to_email}")


async def dispatch_sms_email(addr: str, subject: str, text: str):
    if await _reserve_email_quota():
        asyncio.create_task(asyncio.to_thread(_send_email_plain_sync, addr, subject, text))
    else:
        logger.warning(f"[sms quota reached - {EMAIL_MONTHLY_LIMIT}/mo] skipped to={addr}")


async def notify_new_message(channel: dict, msg: dict):
    """Web push + email-to-SMS to users with access to the channel (except sender)."""
    channel_id = channel["id"]
    sender_id = msg["user_id"]
    # recipients: users who can see this channel
    users = await db.users.find({}).to_list(1000)
    title = f"#{channel['name']}"
    preview = msg.get("text") or "Shared a file"
    body_text = f"{msg['user_name']}: {preview}"[:160]
    payload = {"title": title, "body": body_text, "url": "/chat"}
    for u in users:
        uid = str(u["_id"])
        if uid == sender_id:
            continue
        if not channel_visible_to(channel_id, u.get("role")):
            continue
        # web push (always on if subscribed)
        await _push_to_user(uid, payload)
        # email-to-SMS (counts against monthly cap)
        if u.get("sms_notifications") and u.get("phone") and u.get("carrier") in CARRIER_GATEWAYS:
            digits = _normalize_phone(u["phone"])
            if len(digits) == 10:
                addr = f"{digits}@{CARRIER_GATEWAYS[u['carrier']]}"
                await dispatch_sms_email(addr, title, body_text)


# ---------------------------------------------------------------------------
# Weekly digest (Wednesdays 10:00 America/Phoenix)
# ---------------------------------------------------------------------------
async def build_and_send_weekly_digest():
    logger.info("Running weekly digest job")
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    now_iso = datetime.now(timezone.utc).isoformat()
    week_ahead = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()

    # New messages per channel (this week)
    pipeline = [
        {"$match": {"created_at": {"$gte": week_ago}}},
        {"$group": {"_id": "$channel_id", "count": {"$sum": 1}}},
    ]
    msg_counts = {d["_id"]: d["count"] async for d in db.messages.aggregate(pipeline)}

    new_files = await db.files.find(
        {"is_deleted": False, "created_at": {"$gte": week_ago}}, {"_id": 0}
    ).sort("created_at", -1).to_list(50)

    upcoming = await db.events.find(
        {"date": {"$gte": now_iso, "$lte": week_ahead}}, {"_id": 0}
    ).sort("date", 1).to_list(50)

    channel_name = {c["id"]: c for c in CHANNELS}

    users = await db.users.find({"email_notifications": True}).to_list(1000)
    for u in users:
        if not u.get("email"):
            continue
        role = u.get("role")
        # messages section respecting visibility
        rows = []
        for cid, cnt in msg_counts.items():
            ch = channel_name.get(cid)
            if not ch or not channel_visible_to(cid, role):
                continue
            label = ch["name"] if ch["program"] == "private" else f"{ch['program_label']} · {ch['name']}"
            rows.append(f"<li><b>{cnt}</b> new in {label}</li>")
        msgs_html = f"<ul>{''.join(rows)}</ul>" if rows else "<p>No new messages this week.</p>"

        files_html = (
            "<ul>" + "".join(f"<li>{f['original_filename']} <span style='color:#888'>· {f['uploader_name']}</span></li>" for f in new_files) + "</ul>"
            if new_files else "<p>No new files this week.</p>"
        )

        events_html = (
            "<ul>" + "".join(
                f"<li><b>{e['title']}</b> — {datetime.fromisoformat(e['date']).strftime('%a %b %d, %I:%M %p')}"
                + (f" @ {e['location']}" if e.get('location') else "") + "</li>"
                for e in upcoming
            ) + "</ul>"
            if upcoming else "<p>No events in the next 7 days.</p>"
        )

        body = f"""
          <h3 style="margin:18px 0 6px;">💬 New Messages</h3>{msgs_html}
          <h3 style="margin:18px 0 6px;">📁 New Files</h3>{files_html}
          <h3 style="margin:18px 0 6px;">📅 Upcoming Events</h3>{events_html}
        """
        html = _email_template(f"Your Weekly Team Digest", body)
        await dispatch_email(u["email"], "Robotics Hub — Weekly Digest", html)


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
    carrier: Optional[str] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None


class PushSubscription(BaseModel):
    endpoint: str
    keys: dict


class PushUnsubscribe(BaseModel):
    endpoint: str


class RoleUpdate(BaseModel):
    role: str


class CreateUserRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: str = "member"


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
    if req.carrier is not None:
        updates["carrier"] = req.carrier.strip()
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
    channel = next((c for c in CHANNELS if c["id"] == channel_id), None)
    if channel:
        asyncio.create_task(notify_new_message(channel, msg))
    return msg


# ---------------------------------------------------------------------------
# Web Push subscriptions
# ---------------------------------------------------------------------------
@api_router.get("/push/public-key")
async def push_public_key(user: dict = Depends(get_current_user)):
    return {"publicKey": VAPID_PUBLIC_KEY}


@api_router.post("/push/subscribe")
async def push_subscribe(sub: PushSubscription, user: dict = Depends(get_current_user)):
    doc = {
        "user_id": str(user["_id"]),
        "endpoint": sub.endpoint,
        "subscription": {"endpoint": sub.endpoint, "keys": sub.keys},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint}, {"$set": doc}, upsert=True
    )
    return {"ok": True}


@api_router.post("/push/unsubscribe")
async def push_unsubscribe(req: PushUnsubscribe, user: dict = Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": req.endpoint, "user_id": str(user["_id"])})
    return {"ok": True}


@api_router.get("/push/status")
async def push_status(endpoint: Optional[str] = None, user: dict = Depends(get_current_user)):
    count = await db.push_subscriptions.count_documents({"user_id": str(user["_id"])})
    subscribed = False
    if endpoint:
        subscribed = await db.push_subscriptions.find_one({"endpoint": endpoint}) is not None
    return {"device_count": count, "subscribed": subscribed}


@api_router.post("/digest/send-now")
async def send_digest_now(user: dict = Depends(require_roles("owner"))):
    """Owner-only: trigger the weekly digest immediately (for testing/manual sends)."""
    await build_and_send_weekly_digest()
    return {"ok": True, "message": "Weekly digest sent to opted-in members."}


# ---------------------------------------------------------------------------
# Direct messages (person-to-person private chat)
# ---------------------------------------------------------------------------
def dm_conversation_id(a: str, b: str) -> str:
    return "dm:" + ":".join(sorted([a, b]))


async def notify_dm(recipient: dict, sender: dict, msg: dict):
    rid = str(recipient["_id"])
    sender_name = sender.get("name", "")
    title = f"DM from {sender_name}"
    preview = msg.get("text") or "Sent a file"
    body_text = f"{sender_name}: {preview}"[:160]
    payload = {"title": title, "body": body_text, "url": "/chat"}
    await _push_to_user(rid, payload)
    if recipient.get("sms_notifications") and recipient.get("phone") and recipient.get("carrier") in CARRIER_GATEWAYS:
        digits = _normalize_phone(recipient["phone"])
        if len(digits) == 10:
            addr = f"{digits}@{CARRIER_GATEWAYS[recipient['carrier']]}"
            await dispatch_sms_email(addr, title, body_text)


@api_router.get("/users/search")
async def search_users(q: Optional[str] = None, user: dict = Depends(get_current_user)):
    me = str(user["_id"])
    query = {}
    if q:
        rx = re.escape(q.strip())
        query = {"$or": [
            {"name": {"$regex": rx, "$options": "i"}},
            {"email": {"$regex": rx, "$options": "i"}},
        ]}
    users = await db.users.find(query).sort("name", 1).to_list(50)
    return [
        {"id": str(u["_id"]), "name": u.get("name", ""), "role": u.get("role", "member"), "email": u["email"]}
        for u in users if str(u["_id"]) != me
    ][:20]


@api_router.get("/dm/threads")
async def dm_threads(user: dict = Depends(get_current_user)):
    me = str(user["_id"])
    msgs = await db.dm_messages.find(
        {"$or": [{"sender_id": me}, {"recipient_id": me}]}, {"_id": 0}
    ).sort("created_at", -1).to_list(2000)
    threads = {}
    for m in msgs:
        other = m["recipient_id"] if m["sender_id"] == me else m["sender_id"]
        if other not in threads:
            threads[other] = m  # latest first due to desc sort
    result = []
    for other_id, last in threads.items():
        try:
            ou = await db.users.find_one({"_id": ObjectId(other_id)})
        except Exception:
            ou = None
        if not ou:
            continue
        result.append({
            "user_id": other_id,
            "name": ou.get("name", ""),
            "role": ou.get("role", "member"),
            "last_text": last.get("text") or "Attachment",
            "last_at": last["created_at"],
        })
    result.sort(key=lambda x: x["last_at"], reverse=True)
    return result


async def _resolve_other(other_id: str, me: str):
    if other_id == me:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    try:
        ou = await db.users.find_one({"_id": ObjectId(other_id)})
    except Exception:
        ou = None
    if not ou:
        raise HTTPException(status_code=404, detail="User not found")
    return ou


@api_router.get("/dm/{other_id}/messages")
async def get_dm(other_id: str, user: dict = Depends(get_current_user)):
    me = str(user["_id"])
    ou = await _resolve_other(other_id, me)
    conv = dm_conversation_id(me, other_id)
    raw = await db.dm_messages.find({"conversation_id": conv}, {"_id": 0}).sort("created_at", 1).to_list(2000)
    messages = [{
        **m,
        "user_id": m["sender_id"],
        "user_name": m["sender_name"],
        "user_role": m.get("sender_role", "member"),
    } for m in raw]
    return {"other": {"id": other_id, "name": ou.get("name", ""), "role": ou.get("role", "member")}, "messages": messages}


@api_router.post("/dm/{other_id}/messages")
async def post_dm(other_id: str, req: MessageCreate, user: dict = Depends(get_current_user)):
    me = str(user["_id"])
    ou = await _resolve_other(other_id, me)
    attachment = None
    if req.attachment_file_id:
        f = await db.files.find_one({"id": req.attachment_file_id, "is_deleted": False}, {"_id": 0})
        if f:
            attachment = {
                "file_id": f["id"], "filename": f["original_filename"],
                "content_type": f["content_type"], "kind": f["kind"],
            }
    conv = dm_conversation_id(me, other_id)
    msg = {
        "id": str(uuid.uuid4()),
        "conversation_id": conv,
        "sender_id": me,
        "sender_name": user.get("name", ""),
        "sender_role": user.get("role", "member"),
        "recipient_id": other_id,
        "text": req.text,
        "attachment": attachment,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.dm_messages.insert_one(dict(msg))
    asyncio.create_task(notify_dm(ou, user, msg))
    return {**msg, "user_id": me, "user_name": user.get("name", ""), "user_role": user.get("role", "member")}


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


@api_router.post("/users")
async def create_user(req: CreateUserRequest, user: dict = Depends(require_roles("owner"))):
    email = req.email.lower()
    if email == OWNER_EMAIL:
        raise HTTPException(status_code=400, detail="This email is reserved for the owner")
    if req.role not in ("member", "mentor"):
        raise HTTPException(status_code=400, detail="Role must be member or mentor (owner is reserved)")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(req.password),
        "name": req.name.strip() or email.split("@")[0],
        "role": req.role,
        "phone": "",
        "carrier": "",
        "email_notifications": True,
        "sms_notifications": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db.users.insert_one(doc)
    doc["_id"] = result.inserted_id
    return serialize_user(doc)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(require_roles("owner"))):
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user id")
    target = await db.users.find_one({"_id": oid})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "owner":
        raise HTTPException(status_code=400, detail="The owner account cannot be deleted")
    await db.users.delete_one({"_id": oid})
    await db.push_subscriptions.delete_many({"user_id": user_id})
    return {"ok": True}


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
    await db.push_subscriptions.create_index("endpoint", unique=True)
    # Write VAPID private key PEM to disk for pywebpush
    if VAPID_PRIVATE_KEY_B64:
        try:
            pem = base64.b64decode(VAPID_PRIVATE_KEY_B64)
            with open(VAPID_PEM_PATH, "wb") as fh:
                fh.write(pem)
            logger.info("VAPID key ready")
        except Exception as e:
            logger.error(f"VAPID key write failed: {e}")
    # Seed owner
    existing = await db.users.find_one({"email": OWNER_EMAIL})
    if existing is None:
        await db.users.insert_one({
            "email": OWNER_EMAIL,
            "password_hash": hash_password(OWNER_PASSWORD),
            "name": OWNER_NAME,
            "role": "owner",
            "phone": "",
            "carrier": "",
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
    # Weekly digest scheduler — Wednesdays 10:00 America/Phoenix
    try:
        scheduler = AsyncIOScheduler(timezone="America/Phoenix")
        scheduler.add_job(
            build_and_send_weekly_digest,
            CronTrigger(day_of_week="wed", hour=10, minute=0, timezone="America/Phoenix"),
            id="weekly_digest", replace_existing=True,
        )
        scheduler.start()
        app.state.scheduler = scheduler
        logger.info("Weekly digest scheduler started (Wed 10:00 America/Phoenix)")
    except Exception as e:
        logger.error(f"Scheduler start failed: {e}")


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
