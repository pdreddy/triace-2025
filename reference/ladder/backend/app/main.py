from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from .rules import can_challenge, response_deadline

app = FastAPI(title="PPRC Singles Ladder API", version="1.0.0")

class ChallengeIn(BaseModel):
    challenger_id: str
    opponent_id: str
    challenger_rank: int = Field(gt=0)
    opponent_rank: int = Field(gt=0)
    player_count: int = Field(ge=2)
    consecutive_wins: int = Field(ge=0)
    active_challenge: bool = False
    last_rematch_days: int | None = None

@app.get("/health")
def health(): return {"status": "ok", "service": "pprc-ladder-api"}

@app.get("/seasons/{season_id}/standings")
def standings(season_id: str):
    return {"season_id": season_id, "data": [], "message": "Wire to PostgreSQL repository"}

@app.post("/challenges")
def create_challenge(body: ChallengeIn):
    if body.active_challenge: raise HTTPException(409, "Only one active challenge is allowed")
    if body.last_rematch_days is not None and body.last_rematch_days < 14: raise HTTPException(422, "Rematch is blocked for 14 days")
    if not can_challenge(body.challenger_rank, body.opponent_rank, body.consecutive_wins, body.player_count):
        raise HTTPException(422, "Opponent is outside the permitted challenge range")
    now = datetime.now(timezone.utc)
    return {"status":"pending","created_at":now,"respond_by":response_deadline(now),"rule_snapshot":"season-v1"}

@app.post("/challenges/{challenge_id}/respond")
def respond(challenge_id: str, accept: bool):
    return {"challenge_id":challenge_id,"status":"accepted" if accept else "declined"}

@app.post("/matches/{match_id}/submit")
def submit_score(match_id: str): return {"match_id":match_id,"status":"pending_opponent_confirmation"}

@app.post("/extensions")
def request_extension(): return {"status":"pending_admin_review"}
