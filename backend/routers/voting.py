from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from database import get_db
from models import Team, Poll, Vote, utc_now, ensure_utc
from schemas import VoteSubmitRequest, VoteResponse, PollResponse
from services.poll_manager import manager

router = APIRouter(prefix="/api", tags=["voting"])

async def get_team_by_code(x_team_code: Optional[str] = Header(None), db: AsyncSession = Depends(get_db)) -> Optional[Team]:
    if not x_team_code:
        return None
    result = await db.execute(select(Team).where(Team.code == x_team_code.strip()))
    return result.scalars().first()

@router.get("/poll/current")
async def get_current_poll(
    x_team_code: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Poll)
        .options(selectinload(Poll.pitching_team), selectinload(Poll.votes))
        .where(Poll.is_active == True)
    )
    poll = result.scalars().first()
    if not poll:
        return {"active": False, "poll": None}
    
    now = utc_now()
    ends_at_utc = ensure_utc(poll.ends_at)
    remaining = max(0.0, (ends_at_utc - now).total_seconds())

    # Check if poll timer actually ended
    if remaining <= 0:
        poll.is_active = False
        await db.commit()
        return {"active": False, "poll": None}

    user_has_voted = False
    is_pitching = False

    if x_team_code:
        team_res = await db.execute(select(Team).where(Team.code == x_team_code.strip()))
        team = team_res.scalars().first()
        if team:
            if team.id == poll.pitching_team_id:
                is_pitching = True
            
            # Check if this team has already voted
            vote_res = await db.execute(
                select(Vote).where(Vote.poll_id == poll.id, Vote.voter_team_id == team.id)
            )
            if vote_res.scalars().first():
                user_has_voted = True

    return {
        "active": True,
        "poll": {
            "id": poll.id,
            "round_id": poll.round_id,
            "pitching_team_id": poll.pitching_team_id,
            "pitching_team_name": poll.pitching_team.name if poll.pitching_team else "Unknown",
            "duration_secs": poll.duration_secs,
            "started_at": poll.started_at.isoformat(),
            "ends_at": poll.ends_at.isoformat(),
            "remaining_secs": round(remaining, 1),
            "user_has_voted": user_has_voted,
            "is_pitching_team": is_pitching
        }
    }

@router.post("/vote", response_model=VoteResponse)
async def submit_vote(
    payload: VoteSubmitRequest,
    x_team_code: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
):
    if not x_team_code:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You must be signed in with a team code to vote."
        )
    
    # 1. Identify team
    team_res = await db.execute(select(Team).where(Team.code == x_team_code.strip()))
    team = team_res.scalars().first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid team credentials.")

    # 2. Get active poll
    poll_res = await db.execute(
        select(Poll).where(Poll.is_active == True)
    )
    poll = poll_res.scalars().first()
    if not poll:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No active poll currently running.")

    # 3. Check poll time validity (Server authoritative)
    now = utc_now()
    if now > ensure_utc(poll.ends_at):
        poll.is_active = False
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Voting time has expired!")

    # 4. Check if team is pitching team
    if team.id == poll.pitching_team_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your team is currently pitching and cannot vote on your own pitch!"
        )

    # 5. STRICT ENFORCEMENT: ONLY ONE MEMBER PER TEAM MAY VOTE
    existing_vote = await db.execute(
        select(Vote).where(Vote.poll_id == poll.id, Vote.voter_team_id == team.id)
    )
    if existing_vote.scalars().first():
        # Notify team device in real-time
        await manager.send_to_team(team.code, {
            "event": "already_voted",
            "poll_id": poll.id,
            "message": "A member of your team has already voted!"
        })
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vote has already been submitted by a member of your team. Only one vote per team is allowed."
        )

    # 6. Insert vote (protected additionally by DB UNIQUE constraint)
    new_vote = Vote(
        poll_id=poll.id,
        voter_team_id=team.id,
        score=payload.score
    )
    db.add(new_vote)
    try:
        await db.commit()
        await db.refresh(new_vote)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vote from your team was just recorded simultaneously. Only one vote per team is permitted."
        )

    # 7. Count total votes for live admin dashboard
    vote_count_res = await db.execute(
        select(func.count(Vote.id)).where(Vote.poll_id == poll.id)
    )
    total_votes = vote_count_res.scalar_one()

    # 8. Real-time updates:
    # A) Inform all devices logged in with this team code that their team has voted
    await manager.send_to_team(team.code, {
        "event": "vote_confirmed",
        "poll_id": poll.id,
        "score": payload.score,
        "message": "Your team's vote has been officially locked in!"
    })

    # B) Inform admin dashboard of new vote tally
    await manager.broadcast_to_admin({
        "event": "vote_cast",
        "poll_id": poll.id,
        "total_votes": total_votes,
        "latest_voter_team": team.name
    })

    return VoteResponse(
        success=True,
        message="Vote cast successfully!",
        poll_id=poll.id,
        score=payload.score
    )
