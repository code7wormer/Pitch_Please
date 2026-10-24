from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, Field

class TeamCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Name of the pitching team")

class TeamResponse(BaseModel):
    id: int
    name: str
    code: str
    is_active: bool
    has_pitched: bool = False
    is_promoted_round_2: bool = False
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TeamToggleActive(BaseModel):
    is_active: bool

class PromoteTeamsRequest(BaseModel):
    team_ids: List[int]

class StartBattleRequest(BaseModel):
    team_a_id: int
    team_b_id: int
    first_pitcher_id: Optional[int] = None

class AdvanceStageRequest(BaseModel):
    poll_id: int
    stage: str # 'pitch1_done', 'pitch2_done'

class OpenVotingRequest(BaseModel):
    poll_id: int
    duration_secs: int = 60

class FinalizeBattleRequest(BaseModel):
    poll_id: int
    judge_score_a: float
    judge_score_b: float

class LoginRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6, description="6-digit team code")

class LoginResponse(BaseModel):
    team_id: int
    name: str
    code: str
    is_active: bool

class SetPitchingRequest(BaseModel):
    team_id: int

class StartPollRequest(BaseModel):
    pitching_team_id: int
    duration_secs: int = Field(..., description="Duration in seconds: 15, 30, 60, or 120")
    round_id: Optional[int] = None

class ExtendPollRequest(BaseModel):
    seconds: int = 15

class VoteSubmitRequest(BaseModel):
    score: Optional[int] = Field(None, ge=1, le=10, description="Score out of 10 for Round 1")
    voted_for_team_id: Optional[int] = Field(None, description="Team ID voted for in Round 2 1v1 battle")

class VoteResponse(BaseModel):
    success: bool
    message: str
    poll_id: int
    score: Optional[int] = None
    voted_for_team_id: Optional[int] = None

class PollResponse(BaseModel):
    id: int
    round_id: int
    round_number: int = 1
    pitching_team_id: int
    pitching_team_name: str
    pitching_team_b_id: Optional[int] = None
    pitching_team_b_name: Optional[str] = None
    first_pitcher_id: Optional[int] = None
    pitch_stage: str = "single"
    duration_secs: int
    started_at: datetime
    ends_at: datetime
    is_active: bool
    remaining_secs: float
    user_has_voted: bool = False
    is_pitching_team: bool = False

class PollResult(BaseModel):
    poll_id: int
    round_id: int
    pitching_team_id: int
    pitching_team_name: str
    started_at: datetime
    duration_secs: int
    is_active: bool
    total_votes: int
    average_score: float
    breakdown: Dict[int, int]

