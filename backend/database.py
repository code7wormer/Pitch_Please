import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import declarative_base

from urllib.parse import urlsplit, urlunsplit, parse_qs, urlencode

load_dotenv()

# Neon URL or local sqlite fallback
raw_db_url = os.getenv("DATABASE_URL", "").strip()

if not raw_db_url:
    # Local fallback for immediate testing without configuring Neon yet
    DATABASE_URL = "sqlite+aiosqlite:///./pitch_please.db"
    connect_args = {"check_same_thread": False}
else:
    # Normalize postgres / postgresql schemes to asyncpg
    if raw_db_url.startswith("postgres://"):
        raw_db_url = "postgresql+asyncpg://" + raw_db_url[len("postgres://"):]
    elif raw_db_url.startswith("postgresql://"):
        raw_db_url = "postgresql+asyncpg://" + raw_db_url[len("postgresql://"):]
    
    # Clean query parameters for asyncpg compatibility
    split = urlsplit(raw_db_url)
    query_params = parse_qs(split.query)
    
    # Detect SSL requirement
    ssl_needed = (
        "sslmode" in query_params or
        "neon.tech" in split.netloc or
        "aws" in split.netloc
    )
    
    # Remove libpq-only query parameters that asyncpg doesn't support
    for param in ["sslmode", "channel_binding", "gssencmode", "target_session_attrs"]:
        query_params.pop(param, None)
    
    # Reassemble clean URL
    clean_query = urlencode(query_params, doseq=True)
    DATABASE_URL = urlunsplit((split.scheme, split.netloc, split.path, clean_query, split.fragment))
    connect_args = {"ssl": "require"} if ssl_needed else {}

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args=connect_args
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    # Auto-create tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
        # Safe idempotent migrations for Round 2 columns
        migration_statements = [
            "ALTER TABLE teams ADD COLUMN is_promoted_round_2 BOOLEAN DEFAULT FALSE",
            "ALTER TABLE polls ADD COLUMN round_number INTEGER DEFAULT 1",
            "ALTER TABLE polls ADD COLUMN pitching_team_b_id INTEGER REFERENCES teams(id) ON DELETE CASCADE",
            "ALTER TABLE polls ADD COLUMN first_pitcher_id INTEGER REFERENCES teams(id) ON DELETE CASCADE",
            "ALTER TABLE polls ADD COLUMN pitch_stage VARCHAR(30) DEFAULT 'single'",
            "ALTER TABLE votes ADD COLUMN voted_for_team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE",
            "ALTER TABLE votes ALTER COLUMN score DROP NOT NULL"
        ]
        for stmt in migration_statements:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
