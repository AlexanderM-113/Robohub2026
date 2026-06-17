"""Comprehensive backend tests for Robotics Team Hub."""
import io
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://robotics-hub-49.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

OWNER_EMAIL = "alexander_m113@outlook.com"
OWNER_PASSWORD = "Robotics2026!"

# Use unique emails per test run to avoid stale state
RUN_ID = uuid.uuid4().hex[:8]
MEMBER_EMAIL = f"test_member_{RUN_ID}@example.com"
MENTOR_EMAIL = f"test_mentor_{RUN_ID}@example.com"
PASSWORD = "pass1234"


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ---------------- Module-scoped session fixtures ----------------
@pytest.fixture(scope="module")
def owner_token():
    r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"]["role"] == "owner"
    return body["token"]


@pytest.fixture(scope="module")
def member_token():
    r = requests.post(f"{API}/auth/register", json={
        "name": "Test Member", "email": MEMBER_EMAIL, "password": PASSWORD, "role": "member"
    })
    if r.status_code == 400:  # already exists
        r = requests.post(f"{API}/auth/login", json={"email": MEMBER_EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def mentor_token():
    r = requests.post(f"{API}/auth/register", json={
        "name": "Test Mentor", "email": MENTOR_EMAIL, "password": PASSWORD, "role": "mentor"
    })
    if r.status_code == 400:
        r = requests.post(f"{API}/auth/login", json={"email": MENTOR_EMAIL, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["token"]


# ---------------- Auth tests ----------------
class TestAuth:
    def test_root(self):
        r = requests.get(f"{API}/")
        assert r.status_code == 200

    def test_owner_login(self, owner_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(owner_token))
        assert r.status_code == 200
        assert r.json()["role"] == "owner"
        assert r.json()["email"] == OWNER_EMAIL

    def test_register_with_owner_email_blocked(self):
        r = requests.post(f"{API}/auth/register", json={
            "name": "Imposter", "email": OWNER_EMAIL, "password": "whatever", "role": "member"
        })
        assert r.status_code == 400
        assert "reserved" in r.text.lower()

    def test_register_owner_role_blocked(self):
        # role param must be member/mentor only
        r = requests.post(f"{API}/auth/register", json={
            "name": "X", "email": f"badrole_{RUN_ID}@example.com", "password": PASSWORD, "role": "owner"
        })
        assert r.status_code == 400

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_member_register_and_me(self, member_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(member_token))
        assert r.status_code == 200
        assert r.json()["role"] == "member"

    def test_mentor_register_and_me(self, mentor_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(mentor_token))
        assert r.status_code == 200
        assert r.json()["role"] == "mentor"

    def test_no_token_unauthorized(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401


# ---------------- Channels / Messages ----------------
class TestChannels:
    def test_member_sees_members_only(self, member_token):
        r = requests.get(f"{API}/channels", headers=_auth_headers(member_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert "members-only" in ids
        assert "vex-programming" in ids
        assert "frc-team" in ids

    def test_owner_sees_members_only(self, owner_token):
        r = requests.get(f"{API}/channels", headers=_auth_headers(owner_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert "members-only" in ids

    def test_mentor_does_not_see_members_only(self, mentor_token):
        r = requests.get(f"{API}/channels", headers=_auth_headers(mentor_token))
        assert r.status_code == 200
        ids = [c["id"] for c in r.json()]
        assert "members-only" not in ids
        # but they DO see the standard channels
        assert "vex-programming" in ids

    def test_mentor_forbidden_members_only_messages(self, mentor_token):
        r = requests.get(f"{API}/channels/members-only/messages", headers=_auth_headers(mentor_token))
        assert r.status_code == 403

    def test_member_post_and_get_messages(self, member_token):
        text = f"hello from test {RUN_ID}"
        r = requests.post(f"{API}/channels/vex-programming/messages",
                          headers=_auth_headers(member_token), json={"text": text})
        assert r.status_code == 200, r.text
        assert r.json()["text"] == text
        # GET to verify persistence
        r2 = requests.get(f"{API}/channels/vex-programming/messages", headers=_auth_headers(member_token))
        assert r2.status_code == 200
        assert any(m["text"] == text for m in r2.json())

    def test_unknown_channel_404(self, member_token):
        r = requests.get(f"{API}/channels/nonexistent/messages", headers=_auth_headers(member_token))
        assert r.status_code == 404


# ---------------- Files ----------------
class TestFiles:
    def test_upload_image_and_list(self, member_token):
        # create a tiny PNG
        png_bytes = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xcf"
            b"\xc0\x00\x00\x00\x03\x00\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        files = {"file": ("test.png", io.BytesIO(png_bytes), "image/png")}
        r = requests.post(f"{API}/files/upload", headers=_auth_headers(member_token), files=files)
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["kind"] == "image"
        assert rec["original_filename"] == "test.png"
        assert "id" in rec
        pytest.image_file_id = rec["id"]

        # Listing
        r2 = requests.get(f"{API}/files?kind=image", headers=_auth_headers(member_token))
        assert r2.status_code == 200
        assert any(f["id"] == rec["id"] for f in r2.json())

    def test_upload_code_file(self, member_token):
        data = b"print('hi')\n"
        files = {"file": ("hello.py", io.BytesIO(data), "text/x-python")}
        r = requests.post(f"{API}/files/upload", headers=_auth_headers(member_token), files=files)
        assert r.status_code == 200
        assert r.json()["kind"] == "code"
        pytest.code_file_id = r.json()["id"]

    def test_upload_zip_file(self, mentor_token):
        # minimal zip
        data = b"PK\x05\x06" + b"\x00" * 18  # empty central dir end record
        files = {"file": ("bundle.zip", io.BytesIO(data), "application/zip")}
        r = requests.post(f"{API}/files/upload", headers=_auth_headers(mentor_token), files=files)
        assert r.status_code == 200
        assert r.json()["kind"] == "zip"
        pytest.zip_file_id = r.json()["id"]

    def test_download_with_bearer(self, member_token):
        fid = pytest.image_file_id
        r = requests.get(f"{API}/files/{fid}/download", headers=_auth_headers(member_token))
        assert r.status_code == 200
        assert len(r.content) > 0

    def test_download_with_query_auth(self, member_token):
        fid = pytest.image_file_id
        r = requests.get(f"{API}/files/{fid}/download?auth={member_token}")
        assert r.status_code == 200

    def test_download_without_auth(self):
        fid = pytest.image_file_id
        r = requests.get(f"{API}/files/{fid}/download")
        assert r.status_code == 401

    def test_member_cannot_delete_other_file(self, member_token):
        # mentor uploaded the zip; member is neither uploader nor mentor/owner
        r = requests.delete(f"{API}/files/{pytest.zip_file_id}", headers=_auth_headers(member_token))
        assert r.status_code == 403

    def test_owner_can_delete_any(self, owner_token):
        r = requests.delete(f"{API}/files/{pytest.zip_file_id}", headers=_auth_headers(owner_token))
        assert r.status_code == 200

    def test_uploader_can_delete_own(self, member_token):
        r = requests.delete(f"{API}/files/{pytest.code_file_id}", headers=_auth_headers(member_token))
        assert r.status_code == 200


# ---------------- Chat attachment ----------------
class TestChatAttachment:
    def test_send_message_with_attachment(self, member_token):
        # upload first
        files = {"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")}
        up = requests.post(f"{API}/files/upload", headers=_auth_headers(member_token), files=files)
        assert up.status_code == 200
        fid = up.json()["id"]

        r = requests.post(f"{API}/channels/vex-building/messages",
                          headers=_auth_headers(member_token),
                          json={"text": "see attached", "attachment_file_id": fid})
        assert r.status_code == 200
        msg = r.json()
        assert msg["attachment"] is not None
        assert msg["attachment"]["file_id"] == fid
        assert msg["attachment"]["filename"] == "note.txt"


# ---------------- Events ----------------
class TestEvents:
    def test_member_cannot_create_event(self, member_token):
        r = requests.post(f"{API}/events", headers=_auth_headers(member_token),
                          json={"title": "X", "date": "2026-12-01T10:00:00Z"})
        assert r.status_code == 403

    def test_owner_creates_event(self, owner_token):
        r = requests.post(f"{API}/events", headers=_auth_headers(owner_token),
                          json={"title": f"Owner Event {RUN_ID}", "description": "d",
                                "date": "2026-12-15T10:00:00Z", "location": "Lab"})
        assert r.status_code == 200, r.text
        pytest.event_id = r.json()["id"]

    def test_mentor_can_create_event(self, mentor_token):
        r = requests.post(f"{API}/events", headers=_auth_headers(mentor_token),
                          json={"title": f"Mentor Event {RUN_ID}", "date": "2026-11-01T10:00:00Z"})
        assert r.status_code == 200

    def test_list_events(self, member_token):
        r = requests.get(f"{API}/events", headers=_auth_headers(member_token))
        assert r.status_code == 200
        assert any(e["id"] == pytest.event_id for e in r.json())

    def test_update_event(self, owner_token):
        r = requests.put(f"{API}/events/{pytest.event_id}", headers=_auth_headers(owner_token),
                         json={"title": "Updated", "date": "2026-12-20T10:00:00Z", "location": "L2"})
        assert r.status_code == 200
        assert r.json()["title"] == "Updated"

    def test_delete_event(self, owner_token):
        r = requests.delete(f"{API}/events/{pytest.event_id}", headers=_auth_headers(owner_token))
        assert r.status_code == 200
        # verify removed
        r2 = requests.get(f"{API}/events", headers=_auth_headers(owner_token))
        assert not any(e["id"] == pytest.event_id for e in r2.json())


# ---------------- Team management ----------------
class TestTeam:
    def test_member_forbidden_list_users(self, member_token):
        r = requests.get(f"{API}/users", headers=_auth_headers(member_token))
        assert r.status_code == 403

    def test_mentor_forbidden_list_users(self, mentor_token):
        r = requests.get(f"{API}/users", headers=_auth_headers(mentor_token))
        assert r.status_code == 403

    def test_owner_lists_users(self, owner_token):
        r = requests.get(f"{API}/users", headers=_auth_headers(owner_token))
        assert r.status_code == 200
        emails = [u["email"] for u in r.json()]
        assert OWNER_EMAIL in emails
        assert MEMBER_EMAIL in emails
        pytest.member_id = next(u["id"] for u in r.json() if u["email"] == MEMBER_EMAIL)
        pytest.owner_id = next(u["id"] for u in r.json() if u["email"] == OWNER_EMAIL)

    def test_owner_changes_role(self, owner_token):
        r = requests.put(f"{API}/users/{pytest.member_id}/role",
                         headers=_auth_headers(owner_token), json={"role": "mentor"})
        assert r.status_code == 200
        assert r.json()["role"] == "mentor"
        # change back
        r2 = requests.put(f"{API}/users/{pytest.member_id}/role",
                          headers=_auth_headers(owner_token), json={"role": "member"})
        assert r2.status_code == 200

    def test_cannot_set_owner_role(self, owner_token):
        r = requests.put(f"{API}/users/{pytest.member_id}/role",
                         headers=_auth_headers(owner_token), json={"role": "owner"})
        assert r.status_code == 400

    def test_cannot_change_owners_role(self, owner_token):
        r = requests.put(f"{API}/users/{pytest.owner_id}/role",
                         headers=_auth_headers(owner_token), json={"role": "member"})
        assert r.status_code == 400


# ---------------- Settings ----------------
class TestSettings:
    def test_update_settings_persists(self, member_token):
        r = requests.put(f"{API}/auth/me/settings", headers=_auth_headers(member_token),
                         json={"name": "Renamed", "phone": "+15551234567",
                               "email_notifications": False, "sms_notifications": True})
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Renamed"
        assert body["phone"] == "+15551234567"
        assert body["email_notifications"] is False
        assert body["sms_notifications"] is True

        # confirm via /me
        r2 = requests.get(f"{API}/auth/me", headers=_auth_headers(member_token))
        assert r2.json()["name"] == "Renamed"
        assert r2.json()["sms_notifications"] is True


# ---------------- Dashboard ----------------
class TestDashboard:
    def test_dashboard_basics(self, owner_token):
        r = requests.get(f"{API}/dashboard", headers=_auth_headers(owner_token))
        assert r.status_code == 200
        b = r.json()
        for k in ("file_count", "message_count", "member_count", "recent_files"):
            assert k in b



# ---------------- NEW: Web Push endpoints ----------------
class TestWebPush:
    SUB = {
        "endpoint": f"https://example.com/push/{RUN_ID}",
        "keys": {"p256dh": "BFsP_HggwotuhL7tXWB8jza5R-NaLFXlx1hzd9ofrEIHhbWj6AZcLF2oPMCRrpAEFKgeNrCdgCIJljTMikh1LfM",
                 "auth": "abcdefghijklmnop12345678"}
    }

    def test_public_key(self, member_token):
        r = requests.get(f"{API}/push/public-key", headers=_auth_headers(member_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "publicKey" in body
        assert isinstance(body["publicKey"], str)
        assert len(body["publicKey"]) == 87, f"Expected 87 chars, got {len(body['publicKey'])}"

    def test_subscribe(self, member_token):
        r = requests.post(f"{API}/push/subscribe", headers=_auth_headers(member_token), json=self.SUB)
        assert r.status_code == 200, r.text

    def test_status_subscribed(self, member_token):
        r = requests.get(f"{API}/push/status",
                         headers=_auth_headers(member_token),
                         params={"endpoint": self.SUB["endpoint"]})
        assert r.status_code == 200
        body = r.json()
        assert body.get("subscribed") is True
        assert body.get("device_count", 0) >= 1

    def test_unsubscribe(self, member_token):
        r = requests.post(f"{API}/push/unsubscribe", headers=_auth_headers(member_token),
                          json={"endpoint": self.SUB["endpoint"]})
        assert r.status_code == 200
        # status should now be false
        r2 = requests.get(f"{API}/push/status", headers=_auth_headers(member_token),
                          params={"endpoint": self.SUB["endpoint"]})
        assert r2.status_code == 200
        assert r2.json().get("subscribed") is False


# ---------------- NEW: Posting with notifications still fast & 200 ----------------
class TestPostMessageWithNotifications:
    def test_post_vex_programming(self, member_token):
        start = time.time()
        r = requests.post(f"{API}/channels/vex-programming/messages",
                          headers=_auth_headers(member_token), json={"text": f"notif-test {RUN_ID}"})
        elapsed = time.time() - start
        assert r.status_code == 200, r.text
        assert elapsed < 5.0, f"Post took {elapsed:.2f}s (notifications must be background)"

    def test_post_members_only_as_member(self, member_token):
        r = requests.post(f"{API}/channels/members-only/messages",
                          headers=_auth_headers(member_token), json={"text": f"members-only {RUN_ID}"})
        assert r.status_code == 200, r.text


# ---------------- NEW: Settings carrier field ----------------
class TestSettingsCarrier:
    def test_me_has_carrier_field(self, member_token):
        r = requests.get(f"{API}/auth/me", headers=_auth_headers(member_token))
        assert r.status_code == 200
        assert "carrier" in r.json(), "GET /auth/me missing 'carrier' field"

    def test_update_carrier_persists(self, member_token):
        r = requests.put(f"{API}/auth/me/settings", headers=_auth_headers(member_token),
                         json={"carrier": "verizon", "phone": "+15555550123"})
        assert r.status_code == 200, r.text
        assert r.json().get("carrier") == "verizon"
        # confirm via /me
        r2 = requests.get(f"{API}/auth/me", headers=_auth_headers(member_token))
        assert r2.status_code == 200
        assert r2.json().get("carrier") == "verizon"
        assert r2.json().get("phone") == "+15555550123"


# ---------------- NEW: Weekly digest manual trigger ----------------
class TestDigest:
    def test_member_forbidden(self, member_token):
        r = requests.post(f"{API}/digest/send-now", headers=_auth_headers(member_token))
        assert r.status_code == 403

    def test_mentor_forbidden(self, mentor_token):
        r = requests.post(f"{API}/digest/send-now", headers=_auth_headers(mentor_token))
        assert r.status_code == 403

    def test_owner_ok(self, owner_token):
        r = requests.post(f"{API}/digest/send-now", headers=_auth_headers(owner_token))
        # must not 500 even if Resend sandbox blocks delivery
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        body = r.json()
        assert body.get("ok") is True
