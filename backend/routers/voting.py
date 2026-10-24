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
        .options(
            selectinload(Poll.pitching_team),
            selectinload(Poll.pitching_team_b),
            selectinload(Poll.first_pitcher),
            selectinload(Poll.votes)
        )
        .where(Poll.is_active == True)
    )
    poll = result.scalars().first()
    if not poll:
        return {"active": False, "poll": None}
    
    now = utc_now()
    ends_at_utc = ensure_utc(poll.ends_at)
    remaining = max(0.0, (ends_at_utc - now).total_seconds())

    user_has_voted = False
    is_pitching = False

    if x_team_code:
        team_res = await db.execute(select(Team).where(Team.code == x_team_code.strip()))
        team = team_res.scalars().first()
        if team:
            # In Round 1: pitching_team_id is locked out
            # In Round 2: BOTH pitching_team_id and pitching_team_b_id are locked out
            if team.id == poll.pitching_team_id or (poll.pitching_team_b_id and team.id == poll.pitching_team_b_id):
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
            "round_number": poll.round_number,
            "pitching_team_id": poll.pitching_team_id,
            "pitching_team_name": poll.pitching_team.name if poll.pitching_team else "Unknown",
            "pitching_team_b_id": poll.pitching_team_b_id,
            "pitching_team_b_name": poll.pitching_team_b.name if poll.pitching_team_b else None,
            "first_pitcher_id": poll.first_pitcher_id,
            "pitch_stage": poll.pitch_stage,
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
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Voting time is up! If the organizer extends the poll (+15s), you can submit then."
        )

    # 4. Check if team is participating pitcher (LOCK OUT BOTH TEAMS IN 1V1 BATTLE)
    if team.id == poll.pitching_team_id or (poll.pitching_team_b_id and team.id == poll.pitching_team_b_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your team is currently battling on stage and cannot participate in the vote!"
        )

    # 5. Validate vote payload according to round
    is_round_2 = (poll.round_number == 2 or poll.pitching_team_b_id is not None)
    if is_round_2:
        if not payload.voted_for_team_id or payload.voted_for_team_id not in (poll.pitching_team_id, poll.pitching_team_b_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="In Round 2, you must select one of the two competing teams."
            )
    else:
        if payload.score is None or payload.score < 1 or payload.score > 10:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="In Round 1, score must be between 1 and 10."
            )

    # 6. STRICT ENFORCEMENT: ONLY ONE MEMBER PER TEAM MAY VOTE
    existing_vote = await db.execute(
        select(Vote).where(Vote.poll_id == poll.id, Vote.voter_team_id == team.id)
    )
    if existing_vote.scalars().first():
        await manager.send_to_team(team.code, {
            "event": "already_voted",
            "poll_id": poll.id,
            "message": "A member of your team has already voted!"
        })
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vote has already been submitted by a member of your team. Only one vote per team is allowed."
        )

    # 7. Insert vote (protected additionally by DB UNIQUE constraint)
    new_vote = Vote(
        poll_id=poll.id,
        voter_team_id=team.id,
        score=payload.score if not is_round_2 else 1,
        voted_for_team_id=payload.voted_for_team_id if is_round_2 else None
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

    # 8. Count total votes and duel breakdown for live admin dashboard
    votes_res = await db.execute(
        select(Vote).where(Vote.poll_id == poll.id)
    )
    all_votes = votes_res.scalars().all()
    total_votes = len(all_votes)

    votes_team_a = sum(1 for v in all_votes if v.voted_for_team_id == poll.pitching_team_id)
    votes_team_b = sum(1 for v in all_votes if v.voted_for_team_id == poll.pitching_team_b_id)

    # 9. Real-time updates:
    # A) Inform voter's team devices
    await manager.send_to_team(team.code, {
        "event": "vote_confirmed",
        "poll_id": poll.id,
        "score": payload.score,
        "voted_for_team_id": payload.voted_for_team_id,
        "message": "Your team's vote has been officially locked in!"
    })

    # B) Inform admin dashboard of new vote tally
    await manager.broadcast_to_admin({
        "event": "vote_cast",
        "poll_id": poll.id,
        "total_votes": total_votes,
        "votes_team_a": votes_team_a,
        "votes_team_b": votes_team_b,
        "latest_voter_team": team.name
    })

    return VoteResponse(
        success=True,
        message="Vote cast successfully!",
        poll_id=poll.id,
        score=payload.score,
        voted_for_team_id=payload.voted_for_team_id
    )
