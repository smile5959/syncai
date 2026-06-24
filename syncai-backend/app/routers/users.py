from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.team import Team
from app.models.team import TeamMember
from app.schemas.auth import UserOut
from pydantic import BaseModel, ConfigDict
import uuid

router = APIRouter(prefix="/v1/users", tags=["Users"])


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    plan: str
    owner_id: uuid.UUID


class MeTeamsResponse(BaseModel):
    teams: list[TeamOut]


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/teams", response_model=MeTeamsResponse)
def get_my_teams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # 멤버 팀 ID 먼저 조회 후 owner 포함 한 번에 fetch — 3쿼리 → 2쿼리
    member_team_ids = [
        r[0] for r in
        db.query(TeamMember.team_id).filter(TeamMember.user_id == current_user.id).all()
    ]
    teams = db.query(Team).filter(
        or_(Team.owner_id == current_user.id, Team.id.in_(member_team_ids))
    ).all()
    all_teams = {str(t.id): t for t in teams}
    return {"teams": list(all_teams.values())}
