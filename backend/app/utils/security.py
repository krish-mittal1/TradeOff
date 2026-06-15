"""Security utilities: JWT, password hashing, TOTP MFA, API keys."""
import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import pyotp
import qrcode
import qrcode.image.svg
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# Password hashing (bcrypt)
pwd_context = CryptContext(schemes=["bcrypt"], bcrypt__rounds=settings.BCRYPT_ROUNDS)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_token(token: str) -> str:
    """Hash a high-entropy token for lookup and revocation storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_token_hash(token: str, stored_hash: str) -> bool:
    """Constant-time comparison for a stored token hash."""
    return hmac.compare_digest(hash_token(token), stored_hash)


# JWT Tokens


def create_access_token(user_id: uuid.UUID, role: str = "user", permissions: list[str] | None = None) -> str:
    """Create a JWT access token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "permissions": permissions or ["read"],
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(user_id: uuid.UUID) -> str:
    """Create a JWT refresh token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "jti": str(uuid.uuid4()),
        "type": "refresh",
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token


def verify_token(token: str, expected_type: str = "access") -> dict | None:
    """Verify a JWT token and return its payload."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        if payload.get("type") != expected_type:
            return None
        return payload
    except JWTError:
        return None


def get_user_id_from_token(token: str) -> uuid.UUID | None:
    """Extract user ID from a JWT token."""
    payload = verify_token(token)
    if payload and "sub" in payload:
        return uuid.UUID(payload["sub"])
    return None


# TOTP MFA


def generate_totp_secret() -> str:
    """Generate a new TOTP secret key."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str, issuer: str = "TradeOff") -> str:
    """Get the otpauth URI for QR code generation."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name=issuer)


def generate_totp_qr_code(secret: str, email: str) -> str:
    """Generate a QR code SVG string for TOTP setup."""
    uri = get_totp_uri(secret, email)
    img = qrcode.make(uri, image_factory=qrcode.image.svg.SvgImage)
    return img.to_string().decode("utf-8")


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code against the secret."""
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


# API Key generation


def generate_api_key() -> tuple[str, str]:
    """Generate an API key and secret pair. Returns (key_prefix, full_key, hashed_key)."""
    key = f"CEX-{secrets.token_hex(16)}"
    secret = secrets.token_hex(32)
    # Hash the secret for storage
    hashed = hashlib.sha256(f"{key}.{secret}".encode()).hexdigest()
    return key, secret, hashed


def verify_api_key(key: str, secret: str, stored_hash: str) -> bool:
    """Verify an API key secret against its stored hash."""
    computed = hashlib.sha256(f"{key}.{secret}".encode()).hexdigest()
    return hmac.compare_digest(computed, stored_hash)


# Rate limiting helpers


def compute_rate_limit_key(identifier: str, endpoint: str) -> str:
    """Compute a Redis key for rate limiting."""
    return f"ratelimit:{endpoint}:{identifier}"


# Security helpers


def sanitize_email(email: str) -> str:
    """Sanitize and normalize an email address."""
    return email.strip().lower()


def validate_password_strength(password: str) -> tuple[bool, str]:
    """Validate password strength. Returns (is_valid, reason)."""
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return False, "Password must contain an uppercase letter"
    if not any(c.islower() for c in password):
        return False, "Password must contain a lowercase letter"
    if not any(c.isdigit() for c in password):
        return False, "Password must contain a number"
    if not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/~`" for c in password):
        return False, "Password must contain a special character"
    return True, ""
