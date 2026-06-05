"""Authentication API endpoints."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.dependencies import current_user
from app.config import settings
from app.db.session import get_db
from app.models.user import Session as DBSession
from app.models.user import User
from app.utils.security import (
    create_access_token,
    create_refresh_token,
    generate_totp_qr_code,
    generate_totp_secret,
    hash_password,
    hash_token,
    sanitize_email,
    validate_password_strength,
    verify_password,
    verify_token,
    verify_totp,
)

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str
    totp_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(BaseModel):
    refresh_token: str


class MfaVerifyRequest(BaseModel):
    totp_code: str
    secret: str


class LogoutRequest(BaseModel):
    refresh_token: str


@router.post("/register", status_code=201, response_model=TokenResponse)
async def register(req: RegisterRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Register a new user."""
    email = sanitize_email(req.email)
    
    # Validate password
    is_valid, reason = validate_password_strength(req.password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=reason)
    
    # Check if user exists
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")
    
    # Create user
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=hash_password(req.password),
        display_name=email.split("@")[0],
    )
    db.add(user)
    await db.flush()

    access_token = create_access_token(user.id, role=user.role)
    refresh_token = create_refresh_token(user.id)
    db.add(
        DBSession(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh_token),
            ip_address=request.client.host if request.client else None,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    user.last_login_at = datetime.now(timezone.utc)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Authenticate user and return JWT tokens."""
    email = sanitize_email(req.email)
    
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    if user.mfa_enabled:
        if not req.totp_code:
            raise HTTPException(status_code=401, detail="MFA code required")
        if not verify_totp(user.mfa_secret, req.totp_code):
            raise HTTPException(status_code=401, detail="Invalid MFA code")
    
    # Create tokens
    access_token = create_access_token(user.id, role=user.role)
    refresh_token = create_refresh_token(user.id)
    
    # Store session
    session = DBSession(
        user_id=user.id,
        refresh_token_hash=hash_token(refresh_token),
        ip_address=request.client.host if request.client else None,
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )
    db.add(session)
    
    user.last_login_at = datetime.now(timezone.utc)
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(req: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Refresh an access token using a refresh token."""
    payload = verify_token(req.refresh_token, expected_type="refresh")
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    user_id = uuid.UUID(payload["sub"])

    session_hash = hash_token(req.refresh_token)
    session_result = await db.execute(
        select(DBSession).where(
            DBSession.user_id == user_id,
            DBSession.refresh_token_hash == session_hash,
            DBSession.expires_at > datetime.now(timezone.utc),
        )
    )
    session = session_result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=401, detail="Refresh session expired or revoked")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access_token = create_access_token(user_id, role=user.role)
    new_refresh_token = create_refresh_token(user_id)
    await db.delete(session)
    db.add(
        DBSession(
            user_id=user_id,
            refresh_token_hash=hash_token(new_refresh_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    
    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.post("/logout")
async def logout(req: LogoutRequest, db: AsyncSession = Depends(get_db)):
    """Revoke a refresh session."""
    from sqlalchemy import delete

    await db.execute(
        delete(DBSession).where(DBSession.refresh_token_hash == hash_token(req.refresh_token))
    )
    return {"message": "Logged out"}


@router.post("/mfa/setup")
async def setup_mfa(user: User = Depends(current_user)):
    """Generate TOTP secret and QR code for MFA setup."""
    secret = generate_totp_secret()
    qr_code = generate_totp_qr_code(secret, email=user.email)
    return {"secret": secret, "qr_code": qr_code}


@router.post("/mfa/verify")
async def verify_mfa(
    req: MfaVerifyRequest,
    user: User = Depends(current_user),
):
    """Verify and enable MFA for a user."""
    if not verify_totp(req.secret, req.totp_code):
        raise HTTPException(status_code=400, detail="Invalid TOTP code")

    user.mfa_secret = req.secret
    user.mfa_enabled = True
    return {"mfa_enabled": True}
