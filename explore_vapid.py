import base64
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization
 
# Generate a P-256 key like VAPID
priv = ec.generate_private_key(ec.SECP256R1())
pub = priv.public_key()
 
# Raw private scalar (32 bytes) -> base64url (standard web-push private key format)
priv_int = priv.private_numbers().private_value
raw32 = priv_int.to_bytes(32, "big")
priv_b64url = base64.urlsafe_b64encode(raw32).rstrip(b"=").decode()
 
# Public uncompressed point (65 bytes) -> base64url (applicationServerKey)
pub_bytes = pub.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
pub_b64url = base64.urlsafe_b64encode(pub_bytes).rstrip(b"=").decode()
 
# PEM
pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
pem_b64 = base64.b64encode(pem).decode()
 
print("PRIV_B64URL:", priv_b64url, "len", len(priv_b64url))
print("PUB_B64URL:", pub_b64url, "len", len(pub_b64url))
print("PEM starts:", pem.split(b"\n")[0])
 
# --- test current loader logic ---
def current_loader(raw):
    if "BEGIN" in raw:
        p = raw.encode()
        if b"PRIVATE KEY" in p:
            return p
    try:
        p = base64.b64decode(raw)
        if b"BEGIN" in p and b"PRIVATE KEY" in p:
            return p
    except Exception:
        pass
    return None
 
print("current on raw b64url:", current_loader(priv_b64url))  # expect None (BUG)
print("current on pem_b64:", bool(current_loader(pem_b64)))     # expect True
print("current on raw pem:", bool(current_loader(pem.decode())))# expect True
