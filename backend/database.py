import os

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from typing import AsyncGenerator

# ─────────────────────────────────────────────
# Database URL
# Points to a local SQLite file: fantacalcio.db
# The file will be created automatically on first run
# ─────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'fantacalcio.db')}"


# ─────────────────────────────────────────────
# Async Engine
# echo=True logs all SQL queries to the console
# useful during development for debugging
# ─────────────────────────────────────────────
engine = create_async_engine(
    DATABASE_URL,
    echo=True,
)


# ─────────────────────────────────────────────
# Async Session Factory
# Each request gets its own session
# expire_on_commit=False prevents issues when
# accessing model attributes after a commit
# ─────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ─────────────────────────────────────────────
# Base Class
# All SQLAlchemy models will inherit from this
# It keeps track of all table definitions
# ─────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ─────────────────────────────────────────────
# Database Dependency
# Used in FastAPI route functions via Depends()
# Automatically opens and closes the session
# for each incoming HTTP request
#
# Usage in a route:
#   async def my_route(db: AsyncSession = Depends(get_db)):
#       ...
# ─────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()


# ─────────────────────────────────────────────
# Table Initialisation
# Creates all tables defined in models.py
# Called once on application startup in main.py
# Safe to call multiple times — only creates
# tables that don't already exist
# ─────────────────────────────────────────────
async def init_db() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)