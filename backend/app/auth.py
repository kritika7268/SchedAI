"""
Place this file at: backend/app/auth.py

Password hashing + JWT auth + role-based access control.
Uses the same raw mysql.connector style as the rest of your backend.
"""

from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.database import get_db_connection

# IMPORTANT: change this to a long random string before you deploy anywhere
# public. For a college project running on localhost this is fine as-is.
import os
import secrets
import hashlib

# JWT secret – read from environment (must be set in Render secrets)
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change-this-to-a-long-random-string")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # tokens stay valid for 1 day
RESET_TOKEN_EXPIRE_MINUTES = 15  # password reset link valid for 15 minutes

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def _hash_reset_token(token: str) -> str:
    """Convert the raw reset token into a SHA-256 hash for DB storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_password_reset_token(user_id: int) -> str:
    """
    Create a secure random password-reset token, store only its hash
    in the database, and return the raw token for sending by email.
    """
    raw_token = secrets.token_urlsafe(32)
    token_hash = _hash_reset_token(raw_token)

    expires_at = datetime.utcnow() + timedelta(
        minutes=RESET_TOKEN_EXPIRE_MINUTES
    )

    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO password_reset_tokens
                (user_id, token_hash, expires_at)
            VALUES
                (%s, %s, %s)
            """,
            (user_id, token_hash, expires_at),
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()

    return raw_token


def get_valid_password_reset_token(token: str):
    """
    Find a password-reset token that:
    - matches the SHA-256 hash
    - has not been used
    - has not expired
    """
    token_hash = _hash_reset_token(token)
    now = datetime.utcnow()

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            """
            SELECT
                reset_id,
                user_id,
                expires_at,
                used_at
            FROM password_reset_tokens
            WHERE token_hash = %s
            AND used_at IS NULL
            AND expires_at > %s
            """,
            (token_hash, now),
        )

        return cursor.fetchone()
    finally:
        cursor.close()
        connection.close()


def mark_password_reset_token_used(reset_id: int):
    """Mark a reset token as consumed after the password is changed."""
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = %s
            WHERE reset_id = %s
            AND used_at IS NULL
            """,
            (datetime.utcnow(), reset_id),
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def get_current_user(token: str = Depends(oauth2_scheme)):
    """
    Decodes the JWT sent in the Authorization header, loads the matching
    user row from the DB, and returns it. Use as a FastAPI dependency on
    any endpoint that requires someone to be logged in.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        role = payload.get("role")
        if user_id is None or role is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
    user = cursor.fetchone()
    cursor.close()
    connection.close()

    if user is None:
        raise credentials_exception

    return user


def require_role(*allowed_roles: str):
    """
    Use like: current_user: dict = Depends(require_role("admin"))
    or:       current_user: dict = Depends(require_role("admin", "teacher"))
    Raises 403 if the logged-in user's role isn't in the allowed list.
    """
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires one of these roles: {', '.join(allowed_roles)}",
            )
        return current_user
    return role_checker