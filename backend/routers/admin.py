import os
import random
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update
from sqlalchemy.orm import selectinload

from database import get_db
from models import Team, Round, Poll, Vote, utc_now, ensure_utc
from schemas import (
    TeamCreate, TeamResponse, TeamToggleActive,
    StartPollRequest, ExtendPollRequest, PollResponse, PollResult, SetPitchingRequest
)
from services.poll_manager import manager

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "pitchadmin2026")

async def verify_admin(x_admin_key: Optional[str] = Header(None)):
    if not x_admin_key or x_admin_key != ADMIN_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin key"
        )
    return True

async def generate_unique_code(db: AsyncSession) -> str:
    for _ in range(50):
        code = f"{random.randint(100000, 999999)}"
        existing = await db.execute(select(Team).where(Team.code == code))
        if not existing.scalars().first():
            return code
    raise HTTPException(status_code=500, detail="Failed to generate unique 6-digit code")

@router.post("/teams", response_model=TeamResponse)
async def create_team(
    team_in: TeamCreate,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    code = await generate_unique_code(db)
    team = Team(
        name=team_in.name.strip(),
        code=code,
        is_active=True
    )
    db.add(team)
    await db.commit()
    await db.refresh(team)
    await manager.broadcast_to_admin({"event": "teams_updated"})
    return team

@router.get("/teams", response_model=List[TeamResponse])
async def list_teams(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    # Query which teams have had a poll in the current event
    pitched_res = await db.execute(select(Poll.pitching_team_id).distinct())
    pitched_ids = set(pitched_res.scalars().all())

    result = await db.execute(select(Team).order_by(Team.created_at.asc()))
    teams = result.scalars().all()
    output = []
    for t in teams:
        output.append(TeamResponse(
            id=t.id,
            name=t.name,
            code=t.code,
            is_active=t.is_active,
            has_pitched=(t.id in pitched_ids),
            created_at=t.created_at
        ))
    return output

@router.patch("/teams/{team_id}/toggle", response_model=TeamResponse)
async def toggle_team_active(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    team.is_active = not team.is_active
    await db.commit()
    await db.refresh(team)
    await manager.broadcast_to_admin({"event": "teams_updated"})
    
    # Check if pitched
    pitched_res = await db.execute(select(Poll.pitching_team_id).where(Poll.pitching_team_id == team.id))
    has_pitched = bool(pitched_res.scalars().first())
    return TeamResponse(
        id=team.id,
        name=team.name,
        code=team.code,
        is_active=team.is_active,
        has_pitched=has_pitched,
        created_at=team.created_at
    )

@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    team = await db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await db.delete(team)
    await db.commit()
    await manager.broadcast_to_admin({"event": "teams_updated"})
    return {"success": True, "message": f"Team {team.name} deleted"}

@router.get("/wheel/teams")
async def get_wheel_teams(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    # Only active teams that have NOT pitched yet can be on the wheel
    pitched_res = await db.execute(select(Poll.pitching_team_id).distinct())
    pitched_ids = set(pitched_res.scalars().all())

    result = await db.execute(
        select(Team)
        .where(Team.is_active == True)
        .order_by(Team.name.asc())
    )
    teams = result.scalars().all()
    eligible = [t for t in teams if t.id not in pitched_ids]
    return [{"id": t.id, "name": t.name, "code": t.code} for t in eligible]

@router.post("/pitching/select")
async def select_pitching_team(
    payload: SetPitchingRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    team = await db.get(Team, payload.team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    manager.current_pitching_team = {
        "id": team.id,
        "name": team.name,
        "code": team.code
    }
    await manager.broadcast_all({
        "event": "pitching_selected",
        "team": manager.current_pitching_team
    })
    return {"success": True, "team": manager.current_pitching_team}

@router.get("/pitching/current")
async def get_current_pitching(
    _: bool = Depends(verify_admin)
):
    return {"team": manager.current_pitching_team}

@router.post("/poll/start")
async def start_poll(
    payload: StartPollRequest,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    # Verify pitching team
    team = await db.get(Team, payload.pitching_team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Pitching team not found")
    
    # Check or create current Round 1
    round_result = await db.execute(select(Round).where(Round.is_current == True))
    current_round = round_result.scalars().first()
    if not current_round:
        current_round = Round(name="Round 1", max_score=10, is_current=True)
        db.add(current_round)
        await db.commit()
        await db.refresh(current_round)

    # Close any currently active poll
    active_polls = await db.execute(select(Poll).where(Poll.is_active == True))
    for p in active_polls.scalars().all():
        p.is_active = False
        p.ends_at = utc_now()

    now = utc_now()
    ends_at = now + timedelta(seconds=payload.duration_secs)

    poll = Poll(
        round_id=current_round.id,
        pitching_team_id=team.id,
        duration_secs=payload.duration_secs,
        started_at=now,
        ends_at=ends_at,
        is_active=True
    )
    db.add(poll)
    await db.commit()
    await db.refresh(poll)

    manager.current_pitching_team = {"id": team.id, "name": team.name, "code": team.code}

    broadcast_data = {
        "event": "poll_started",
        "poll_id": poll.id,
        "pitching_team_id": team.id,
        "pitching_team_name": team.name,
        "duration_secs": poll.duration_secs,
        "started_at": poll.started_at.isoformat(),
        "ends_at": poll.ends_at.isoformat(),
        "max_score": current_round.max_score
    }
    await manager.broadcast_all(broadcast_data)
    return broadcast_data

@router.post("/poll/extend")
async def extend_poll(
    payload: ExtendPollRequest = ExtendPollRequest(),
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    active_result = await db.execute(
        select(Poll).options(selectinload(Poll.pitching_team)).where(Poll.is_active == True)
    )
    poll = active_result.scalars().first()
    if not poll:
        # Fallback to the latest poll created if it was marked inactive when timer reached 0
        recent_result = await db.execute(
            select(Poll).options(selectinload(Poll.pitching_team)).order_by(Poll.created_at.desc())
        )
        poll = recent_result.scalars().first()
        if not poll:
            raise HTTPException(status_code=400, detail="No poll found to extend")
    
    poll.is_active = True
    now = utc_now()
    current_ends = ensure_utc(poll.ends_at)
    # If poll time already completed (current_ends < now), add the seconds from NOW
    # so teams get a full fresh duration (e.g. +15s)!
    base_time = max(now, current_ends)
    poll.ends_at = base_time + timedelta(seconds=payload.seconds)
    poll.duration_secs += payload.seconds
    await db.commit()

    broadcast_data = {
        "event": "poll_extended",
        "poll_id": poll.id,
        "added_seconds": payload.seconds,
        "ends_at": poll.ends_at.isoformat(),
        "total_duration": poll.duration_secs
    }
    await manager.broadcast_all(broadcast_data)
    return broadcast_data

@router.post("/poll/end")
async def end_poll(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    active_result = await db.execute(
        select(Poll).options(selectinload(Poll.pitching_team), selectinload(Poll.votes)).where(Poll.is_active == True)
    )
    poll = active_result.scalars().first()
    if not poll:
        raise HTTPException(status_code=400, detail="No active poll to end")
    
    poll.is_active = False
    poll.ends_at = utc_now()
    await db.commit()

    # Calculate average
    scores = [v.score for v in poll.votes]
    total_votes = len(scores)
    avg_score = round(sum(scores) / total_votes, 2) if total_votes > 0 else 0.0

    breakdown = {i: 0 for i in range(1, 11)}
    for s in scores:
        if 1 <= s <= 10:
            breakdown[s] += 1

    result_data = {
        "event": "poll_ended",
        "poll_id": poll.id,
        "pitching_team_id": poll.pitching_team_id,
        "pitching_team_name": poll.pitching_team.name,
        "total_votes": total_votes,
        "average_score": avg_score,
        "breakdown": breakdown
    }
    await manager.broadcast_all(result_data)
    return result_data

@router.get("/results", response_model=List[PollResult])
async def get_results(
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    result = await db.execute(
        select(Poll)
        .options(selectinload(Poll.pitching_team), selectinload(Poll.votes))
        .order_by(Poll.created_at.desc())
    )
    polls = result.scalars().all()
    output = []
    for p in polls:
        scores = [v.score for v in p.votes]
        total_votes = len(scores)
        avg = round(sum(scores) / total_votes, 2) if total_votes > 0 else 0.0
        bd = {i: 0 for i in range(1, 11)}
        for s in scores:
            if 1 <= s <= 10:
                bd[s] += 1
        output.append(PollResult(
            poll_id=p.id,
            round_id=p.round_id,
            pitching_team_id=p.pitching_team_id,
            pitching_team_name=p.pitching_team.name if p.pitching_team else "Unknown",
            started_at=p.started_at,
            duration_secs=p.duration_secs,
            is_active=p.is_active,
            total_votes=total_votes,
            average_score=avg,
            breakdown=bd
        ))
    return output

@router.delete("/poll/{poll_id}")
async def delete_poll(
    poll_id: int,
    db: AsyncSession = Depends(get_db),
    _: bool = Depends(verify_admin)
):
    poll = await db.get(Poll, poll_id)
    if not poll:
        raise HTTPException(status_code=404, detail="Poll not found")
    await db.delete(poll)
    await db.commit()
    await manager.broadcast_to_admin({"event": "results_updated"})
    return {"success": True, "message": f"Poll {poll_id} and all associated votes deleted"}
