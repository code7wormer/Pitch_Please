from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Team
from schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login", response_model=LoginResponse)
async def login_team(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    code_clean = payload.code.strip()
    result = await db.execute(select(Team).where(Team.code == code_clean))
    team = result.scalars().first()
    if not team:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid 6-digit team code. Check with the event organizers."
        )
    return LoginResponse(
        team_id=team.id,
        name=team.name,
        code=team.code,
        is_active=team.is_active
    )

@router.get("/me", response_model=LoginResponse)
async def get_current_team(
    x_team_code: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    if not x_team_code:
        raise HTTPException(status_code=401, detail="Missing team code")
    result = await db.execute(select(Team).where(Team.code == x_team_code.strip()))
    team = result.scalars().first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return LoginResponse(
        team_id=team.id,
        name=team.name,
        code=team.code,
        is_active=team.is_active
    )
