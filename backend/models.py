from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint, Float
from sqlalchemy.orm import relationship
from database import Base

def utc_now():
    return datetime.now(timezone.utc)

def ensure_utc(dt: datetime) -> datetime:
    if dt is None:
        return dt
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(6), unique=True, index=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_promoted_round_2 = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    # Relationships
    polls_as_pitcher = relationship("Poll", back_populates="pitching_team", foreign_keys="Poll.pitching_team_id", cascade="all, delete-orphan")
    votes_cast = relationship("Vote", back_populates="voter_team", foreign_keys="Vote.voter_team_id", cascade="all, delete-orphan")

class Round(Base):
    __tablename__ = "rounds"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), default="Round 1", nullable=False)
    max_score = Column(Integer, default=10, nullable=False)
    is_current = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    polls = relationship("Poll", back_populates="round", cascade="all, delete-orphan")

class Poll(Base):
    __tablename__ = "polls"

    id = Column(Integer, primary_key=True, index=True)
    round_id = Column(Integer, ForeignKey("rounds.id", ondelete="CASCADE"), nullable=False)
    round_number = Column(Integer, default=1, nullable=False)
    pitching_team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    pitching_team_b_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    first_pitcher_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    pitch_stage = Column(String(30), default="single", nullable=False) # 'single', 'pitch1', 'pitch2', 'voting_ready', 'voting_live', 'ended'
    duration_secs = Column(Integer, nullable=False)
    started_at = Column(DateTime(timezone=True), default=utc_now)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    round = relationship("Round", back_populates="polls")
    pitching_team = relationship("Team", foreign_keys=[pitching_team_id], back_populates="polls_as_pitcher")
    pitching_team_b = relationship("Team", foreign_keys=[pitching_team_b_id])
    first_pitcher = relationship("Team", foreign_keys=[first_pitcher_id])
    votes = relationship("Vote", back_populates="poll", cascade="all, delete-orphan")

class Vote(Base):
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("polls.id", ondelete="CASCADE"), nullable=False)
    voter_team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, nullable=True, default=0) # 1-10 for Round 1, or 0/null for Round 2
    voted_for_team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    poll = relationship("Poll", back_populates="votes")
    voter_team = relationship("Team", foreign_keys=[voter_team_id], back_populates="votes_cast")
    voted_for_team = relationship("Team", foreign_keys=[voted_for_team_id])

    # CRITICAL: Database level guarantee that only one vote is allowed per team per poll
    __table_args__ = (
        UniqueConstraint("poll_id", "voter_team_id", name="uq_poll_voter_team"),
    )
