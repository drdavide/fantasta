import os
import warnings
from datetime import datetime, timedelta
from typing import Optional

from dotenv import load_dotenv
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from database import get_db
from models import Manager
from schemas import TokenData

# ─────────────────────────────────────────────
# Load environment variables from .env file
#
# Create a .env file in your project root with:
#   SECRET_KEY=your-very-secret-random-string
#
# You can generate a strong key with:
#   python -c "import secrets; print(secrets.token_hex(32))"
# ─────────────────────────────────────────────
load_dotenv()

# ─────────────────────────────────────────────
# JWT Configuration
#
# SECRET_KEY: used to sign and verify tokens.
#   If someone gets this key, they can forge tokens.
#   Keep it secret, never commit it to git.
#
# ALGORITHM: HS256 is a standard, secure choice
#   for single-server apps like this one.
#
# ACCESS_TOKEN_EXPIRE_MINUTES: 8 hours is enough
#   for a full auction night without forcing
#   anyone to log back in mid-auction.
# ─────────────────────────────────────────────
_DEFAULT_SECRET = "dev-secret-key-change-this-in-production"

SECRET_KEY: str = os.getenv("SECRET_KEY", _DEFAULT_SECRET)

if SECRET_KEY == _DEFAULT_SECRET:
    warnings.warn(
        "\n⚠️  WARNING: Using default SECRET_KEY. "
        "Create a .env file with a real SECRET_KEY before sharing this app. "
        "Run: python -c \"import secrets; print(secrets.token_hex(32))\" to generate one.\n",
        stacklevel=2
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours


# ─────────────────────────────────────────────
# Password Hashing
#
# CryptContext handles hashing and verifying
# passwords using bcrypt — a slow, secure
# algorithm specifically designed for passwords.
# "deprecated='auto'" means old hash formats
# are automatically flagged for upgrade.
# ─────────────────────────────────────────────
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─────────────────────────────────────────────
# OAuth2 Scheme
#
# Tells FastAPI where the login endpoint is.
# When a protected route is accessed, FastAPI
# looks for a Bearer token in the Authorization
# header: "Authorization: Bearer <token>"
# ─────────────────────────────────────────────
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ─────────────────────────────────────────────
# PASSWORD UTILITIES
# ─────────────────────────────────────────────

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Check if a plain text password matches a stored bcrypt hash.

    bcrypt is a one-way hash — you can never reverse it.
    Instead, we re-hash the plain password and compare
    it to the stored hash. Returns True if they match.

    Usage:
        if verify_password("mypassword", manager.hashed_password):
            # password is correct
    """
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(plain_password: str) -> str:
    """
    Hash a plain text password using bcrypt.

    Always call this before storing a password in the database.
    The result is a string like:
        "\$2b\$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW"

    Usage:
        manager.hashed_password = hash_password("mypassword")
    """
    return pwd_context.hash(plain_password)


# ─────────────────────────────────────────────
# JWT TOKEN UTILITIES
# ─────────────────────────────────────────────

def create_access_token(
    data: dict,
    expires_delta: Optional[timedelta] = None
) -> str:
    """
    Create a signed JWT token containing the manager's identity.

    A JWT is a string made of three parts separated by dots:
        header.payload.signature

    The payload carries data (username, manager_id, etc.)
    The signature ensures the token hasn't been tampered with.

    Args:
        data: dict with keys: username, auction_id, manager_id, is_admin
        expires_delta: how long the token is valid. Defaults to 8 hours.

    Returns:
        A signed JWT string to send to the client.
    """
    to_encode = data.copy()

    expire = datetime.utcnow() + (
        expires_delta if expires_delta
        else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    # "exp" is a standard JWT claim — jose uses it to check expiry automatically
    to_encode.update({"exp": expire})

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


# ─────────────────────────────────────────────
# FASTAPI DEPENDENCIES
# These functions are injected into route handlers
# via Depends(). FastAPI calls them automatically.
# ─────────────────────────────────────────────

async def get_current_manager(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> Manager:
    """
    FastAPI dependency — decodes the JWT and returns the current Manager.

    How it works:
    1. FastAPI extracts the Bearer token from the Authorization header
    2. We decode it using our SECRET_KEY
    3. We extract the manager_id from the payload
    4. We query the database for that manager
    5. We return the Manager ORM object

    Raises 401 Unauthorized if:
    - The token is missing or malformed
    - The token has expired
    - The manager no longer exists in the DB

    Usage in a route:
        async def my_route(manager: Manager = Depends(get_current_manager)):
            return {"hello": manager.username}
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        # Decode the JWT — jose raises JWTError if expired or invalid
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # Extract identity fields from the token payload
        username: Optional[str] = payload.get("username")
        manager_id: Optional[str] = payload.get("manager_id")

        if username is None or manager_id is None:
            raise credentials_exception

        token_data = TokenData(
            username=username,
            manager_id=manager_id,
            auction_id=payload.get("auction_id"),
            is_admin=payload.get("is_admin", False)
        )

    except JWTError:
        raise credentials_exception

    # Query the database to confirm the manager still exists
    result = await db.execute(
        select(Manager).where(Manager.id == token_data.manager_id)
    )
    manager = result.scalar_one_or_none()

    if manager is None:
        raise credentials_exception

    return manager


async def get_current_admin(
    current_manager: Manager = Depends(get_current_manager)
) -> Manager:
    """
    FastAPI dependency — ensures the current manager is an admin.

    Builds on top of get_current_manager. If the manager is not
    an admin, raises 403 Forbidden immediately.

    Raises:
        403 Forbidden if the manager does not have is_admin=True

    Usage in a route:
        async def admin_only_route(admin: Manager = Depends(get_current_admin)):
            # Only admins reach this point
            ...
    """
    if not current_manager.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action. Admin access required."
        )
    return current_manager


# ─────────────────────────────────────────────
# AUTHENTICATION LOGIC
# ─────────────────────────────────────────────

async def authenticate_manager(
    db: AsyncSession,
    username: str,
    password: str
) -> Optional[Manager]:
    """
    Verify a manager's credentials and return the Manager object.

    This is called during login. It:
    1. Looks up the manager by username in the database
    2. Verifies the provided password against the stored hash
    3. Returns the Manager if credentials are valid, None otherwise

    Returning None (instead of raising an exception) lets the
    login route decide how to respond — typically with a 401.

    Args:
        db:       The async database session
        username: Plain text username submitted on login
        password: Plain text password submitted on login

    Returns:
        Manager object if credentials are valid, None if not.

    Usage:
        manager = await authenticate_manager(db, "Luca", "mypassword")
        if not manager:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    """
    # Query manager by username
    result = await db.execute(
        select(Manager).where(Manager.username == username)
    )
    manager = result.scalar_one_or_none()

    # No manager found with this username
    if manager is None:
        return None

    # Username found but password is wrong
    if not verify_password(password, manager.hashed_password):
        return None

    return manager