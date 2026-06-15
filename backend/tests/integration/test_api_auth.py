"""Integration tests for /api/v1/auth/* endpoints using a mocked DB."""
import uuid
from unittest.mock import AsyncMock, MagicMock

from app.utils.security import create_refresh_token, hash_password

# ── /auth/register ────────────────────────────────────────────────────────────

def test_register_success(client, mock_db):
    """Register with valid credentials returns 201 and JWT tokens."""
    # DB returns None → user doesn't exist yet
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=execute_result)

    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "Secret123!"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_register_weak_password_rejected(client):
    """Register with a weak password returns 400."""
    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "test@example.com", "password": "weak"},
    )
    assert resp.status_code == 400


def test_register_duplicate_email_rejected(client, mock_db):
    """Register with an already-registered email returns 409."""
    existing_user = MagicMock()
    existing_user.email = "existing@example.com"

    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = existing_user
    mock_db.execute = AsyncMock(return_value=execute_result)

    resp = client.post(
        "/api/v1/auth/register",
        json={"email": "existing@example.com", "password": "Secret123!"},
    )
    assert resp.status_code == 409


# ── /auth/login ───────────────────────────────────────────────────────────────

def test_login_success(client, mock_db):
    """Login with valid credentials returns tokens."""
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "user@example.com"
    user.password_hash = hash_password("Secret123!")
    user.role = "user"
    user.mfa_enabled = False

    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(return_value=execute_result)

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "Secret123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data


def test_login_wrong_password(client, mock_db):
    """Login with wrong password returns 401."""
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "user@example.com"
    user.password_hash = hash_password("RealPass123!")
    user.mfa_enabled = False

    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = user
    mock_db.execute = AsyncMock(return_value=execute_result)

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "WrongPass123!"},
    )
    assert resp.status_code == 401


def test_login_unknown_user(client, mock_db):
    """Login with unknown email returns 401."""
    execute_result = MagicMock()
    execute_result.scalar_one_or_none.return_value = None
    mock_db.execute = AsyncMock(return_value=execute_result)

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "Secret123!"},
    )
    assert resp.status_code == 401


# ── /auth/refresh ─────────────────────────────────────────────────────────────

def test_refresh_with_invalid_token(client):
    """Refresh with a garbage token returns 401."""
    resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": "not.a.real.token"},
    )
    assert resp.status_code == 401


def test_refresh_with_valid_token(client, mock_db):
    """Refresh with a valid refresh token returns a new access token."""
    uid = uuid.uuid4()
    refresh_tok = create_refresh_token(uid)

    # First execute call (session lookup) → valid session
    mock_session = MagicMock()
    mock_session.user_id = uid

    # Second execute call (user lookup) → valid user
    mock_user = MagicMock()
    mock_user.id = uid
    mock_user.role = "user"

    # Set up execute to return different results for each call
    execute_results = [
        MagicMock(**{"scalar_one_or_none.return_value": mock_session}),
        MagicMock(**{"scalar_one_or_none.return_value": mock_user}),
    ]
    mock_db.execute = AsyncMock(side_effect=execute_results)
    mock_db.delete = AsyncMock()

    resp = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_tok},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()
