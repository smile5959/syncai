from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.chat_room import ChatRoom
from app.models.worker import Worker
from app.models.mcp_config import McpConfig
from app.models.mcp_config_team import McpConfigTeam
from app.schemas.auth import UserOut
from app.schemas.team import TeamOut
from app.schemas.room import RoomOut
from app.schemas.worker import WorkerOut
from app.schemas.mcp_config import McpConfigWithTeam
from app.core import mcp_broker

router = APIRouter(prefix="/v1/users", tags=["Users"])


class MeTeamsResponse(BaseModel):
    teams: list[TeamOut]


class TeamWithData(BaseModel):
    team: TeamOut
    rooms: list[RoomOut]
    workers: list[WorkerOut]
    mcp_configs: list[McpConfigWithTeam]


class MeInitResponse(BaseModel):
    user: UserOut
    teams: list[TeamWithData]


def _get_user_teams(user_id, db: Session) -> list[Team]:
    member_team_ids = [
        r[0] for r in
        db.query(TeamMember.team_id).filter(TeamMember.user_id == user_id).all()
    ]
    teams = db.query(Team).filter(
        or_(Team.owner_id == user_id, Team.id.in_(member_team_ids))
    ).all()
    return list({str(t.id): t for t in teams}.values())


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/teams", response_model=MeTeamsResponse)
def get_my_teams(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    teams = _get_user_teams(current_user.id, db)
    return {"teams": teams}


@router.get("/me/init", response_model=MeInitResponse)
def me_init(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """앱 초기 로딩 — 유저 + 모든 팀의 rooms·workers·mcp_configs를 한 번에 반환."""
    teams = _get_user_teams(current_user.id, db)

    teams_data: list[TeamWithData] = []
    for team in teams:
        rooms = db.query(ChatRoom).filter(ChatRoom.team_id == team.id).all()
        workers = db.query(Worker).filter(Worker.team_id == team.id).all()

        rows = (
            db.query(McpConfig, McpConfigTeam)
            .join(McpConfigTeam, McpConfig.id == McpConfigTeam.mcp_config_id)
            .filter(
                McpConfigTeam.team_id == team.id,
                or_(
                    McpConfig.owner_user_id == current_user.id,
                    McpConfigTeam.is_public.is_(True),
                ),
            )
            .all()
        )
        mcp_configs_out = [
            McpConfigWithTeam(
                id=c.id,
                owner_user_id=c.owner_user_id,
                name=c.name,
                endpoint=c.endpoint,
                base_dir=c.base_dir,
                mcp_token=c.mcp_token,
                created_at=c.created_at,
                is_public=link.is_public,
                is_online=bool(c.mcp_token and mcp_broker.is_online(c.mcp_token)),
            )
            for c, link in rows
        ]

        teams_data.append(TeamWithData(
            team=TeamOut.model_validate(team),
            rooms=[RoomOut.model_validate(r) for r in rooms],
            workers=[WorkerOut.model_validate(w) for w in workers],
            mcp_configs=mcp_configs_out,
        ))

    return MeInitResponse(
        user=UserOut.model_validate(current_user),
        teams=teams_data,
    )
