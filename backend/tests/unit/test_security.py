"""Unit tests for app/utils/security.py — all pure Python, no DB."""
import uuid

import pytest

from app.utils.security import (
    compute_rate_limit_key,
    create_access_token,
    create_refresh_token,
    generate_api_key,
    generate_totp_secret,
    hash_password,
    hash_token,
    sanitize_email,
    validate_password_strength,
    verify_api_key,
    verify_password,
    verify_token,
    verify_token_hash,
    verify_totp,
)

# ── Password hashing ──────────────────────────────────────────────────────────

def test_hash_password_returns_bcrypt_string():
    h = hash_password("Secret1!")
    assert h.startswith("$2")


def test_verify_password_correct():
    h = hash_password("Secret1!")
    assert verify_password("Secret1!", h) is True


def test_verify_password_wrong():
    h = hash_password("Secret1!")
    assert verify_password("wrong", h) is False


# ── Token hashing ─────────────────────────────────────────────────────────────

def test_hash_token_is_deterministic():
    assert hash_token("abc") == hash_token("abc")


def test_hash_token_differs_for_different_input():
    assert hash_token("abc") != hash_token("xyz")


def test_verify_token_hash_match():
    t = "my-secret-refresh-token"
    assert verify_token_hash(t, hash_token(t)) is True


def test_verify_token_hash_mismatch():
    assert verify_token_hash("token-a", hash_token("token-b")) is False


# ── JWT ──────────────────────────────────────────────────────────────────────

def test_create_and_verify_access_token():
    uid = uuid.uuid4()
    token = create_access_token(uid, role="user")
    payload = verify_token(token, expected_type="access")
    assert payload is not None
    assert payload["sub"] == str(uid)
    assert payload["role"] == "user"
    assert payload["type"] == "access"


def test_create_and_verify_refresh_token():
    uid = uuid.uuid4()
    token = create_refresh_token(uid)
    payload = verify_token(token, expected_type="refresh")
    assert payload is not None
    assert payload["sub"] == str(uid)
    assert payload["type"] == "refresh"


def test_access_token_rejects_wrong_type():
    uid = uuid.uuid4()
    token = create_access_token(uid)
    assert verify_token(token, expected_type="refresh") is None


def test_verify_token_rejects_garbage():
    assert verify_token("not.a.jwt") is None


def test_access_token_contains_permissions():
    uid = uuid.uuid4()
    token = create_access_token(uid, permissions=["read", "trade"])
    payload = verify_token(token)
    assert "read" in payload["permissions"]
    assert "trade" in payload["permissions"]


def test_access_token_default_permissions():
    uid = uuid.uuid4()
    token = create_access_token(uid)
    payload = verify_token(token)
    assert payload["permissions"] == ["read"]


# ── API keys ──────────────────────────────────────────────────────────────────

def test_generate_api_key_returns_three_values():
    key, secret, hashed = generate_api_key()
    assert key.startswith("CEX-")
    assert len(secret) == 64  # 32 bytes hex
    assert len(hashed) == 64  # sha256 hex


def test_verify_api_key_valid():
    key, secret, hashed = generate_api_key()
    assert verify_api_key(key, secret, hashed) is True


def test_verify_api_key_wrong_secret():
    key, secret, hashed = generate_api_key()
    assert verify_api_key(key, "wrong-secret", hashed) is False


def test_two_api_keys_are_unique():
    key1, _, _ = generate_api_key()
    key2, _, _ = generate_api_key()
    assert key1 != key2


# ── TOTP ─────────────────────────────────────────────────────────────────────

def test_totp_secret_is_base32():
    secret = generate_totp_secret()
    import base64
    base64.b32decode(secret)  # raises ValueError if not valid base32


def test_verify_totp_correct():
    import pyotp
    secret = generate_totp_secret()
    code = pyotp.TOTP(secret).now()
    assert verify_totp(secret, code) is True


def test_verify_totp_wrong_code():
    secret = generate_totp_secret()
    assert verify_totp(secret, "000000") is False


# ── Helpers ───────────────────────────────────────────────────────────────────

def test_sanitize_email_strips_and_lowercases():
    assert sanitize_email("  User@Example.COM  ") == "user@example.com"


def test_compute_rate_limit_key_format():
    key = compute_rate_limit_key("1.2.3.4", "/api/auth/login")
    assert key == "ratelimit:/api/auth/login:1.2.3.4"


# ── Password strength ─────────────────────────────────────────────────────────

@pytest.mark.parametrize("password,expected_valid", [
    ("Secret1!", True),
    ("short1!", False),        # too short
    ("secret1!abc", False),    # no uppercase
    ("SECRET1!ABC", False),    # no lowercase
    ("SecretABC!", False),     # no digit
    ("Secret123", False),      # no special char
])
def test_validate_password_strength(password, expected_valid):
    valid, reason = validate_password_strength(password)
    assert valid == expected_valid
    if not valid:
        assert len(reason) > 0
