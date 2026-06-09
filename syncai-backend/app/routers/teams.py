import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.core.deps import get_current_user, require_team_member, require_team_owner
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.invitation import TeamInvitation, InvitationStatus
from app.schemas.team import TeamCreate, TeamOut, TeamUpdate, MemberInvite, MemberOut, MemberRoleUpdate

router = APIRouter(prefix="/teams", tags=["Teams"])


@router.post("", response_model=TeamOut, status_code=201)
def create_team(body: TeamCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # UUID 미리 생성 — db.flush() 타이밍 이슈 방지
    new_id = _uuid.uuid4()
    team = Team(id=new_id, name=body.name, owner_id=current_user.id, color=body.color, icon=body.icon)
    db.add(team)
    db.add(TeamMember(team_id=new_id, user_id=current_user.id, role="owner"))
    db.commit()
    db.refresh(team)
    return team


@router.get("/{team_id}", response_model=TeamOut)
def get_team(team_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_team_member(team_id, current_user, db)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.patch("/{team_id}", response_model=TeamOut)
def update_team(team_id: str, body: TeamUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = db.query(Team).filter(Team.id == team_id, Team.owner_id == current_user.id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found or not authorized")
    if body.name is not None:
        team.name = body.name
    if body.color is not None:
        team.color = body.color
    if body.icon is not None:
        team.icon = body.icon
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    from app.models.chat_room import ChatRoom, RoomMember
    from app.models.message import Message
    from app.models.task import Task
    from app.models.file_lock import FileLock
    from app.models.worker import Worker
    from app.models.invitation import TeamInvitation
    from app.models.mcp_config_team import McpConfigTeam

    team = db.query(Team).filter(Team.id == team_id, Team.owner_id == current_user.id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found or not authorized")

    # 채팅방 관련 데이터 cascade
    room_ids = [r.id for r in db.query(ChatRoom.id).filter(ChatRoom.team_id == team_id).all()]
    if room_ids:
        task_ids = [t.id for t in db.query(Task.id).filter(Task.room_id.in_(room_ids)).all()]
        if task_ids:
            db.query(FileLock).filter(FileLock.task_id.in_(task_ids)).delete(synchronize_session=False)
        db.query(Task).filter(Task.room_id.in_(room_ids)).delete(synchronize_session=False)
        db.query(Message).filter(Message.room_id.in_(room_ids)).delete(synchronize_session=False)
        db.query(RoomMember).filter(RoomMember.room_id.in_(room_ids)).delete(synchronize_session=False)
        db.query(ChatRoom).filter(ChatRoom.id.in_(room_ids)).delete(synchronize_session=False)

    # MCP 연결, Worker, 초대 내역, 팀원 삭제
    db.query(McpConfigTeam).filter(McpConfigTeam.team_id == team_id).delete(synchronize_session=False)
    db.query(Worker).filter(Worker.team_id == team_id).delete(synchronize_session=False)
    db.query(TeamInvitation).filter(TeamInvitation.team_id == team_id).delete(synchronize_session=False)
    db.query(TeamMember).filter(TeamMember.team_id == team_id).delete(synchronize_session=False)
    db.delete(team)
    db.commit()


@router.get("/{team_id}/members", response_model=list[MemberOut])
def get_members(team_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_team_member(team_id, current_user, db)
    return (
        db.query(TeamMember)
        .options(joinedload(TeamMember.user))
        .filter(TeamMember.team_id == team_id)
        .all()
    )


@router.post("/{team_id}/members", status_code=201)
def invite_member(team_id: str, body: MemberInvite, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_team_member(team_id, current_user, db)
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    existing_inv = db.query(TeamInvitation).filter(
        TeamInvitation.team_id == team_id,
        TeamInvitation.invitee_email == body.email,
        TeamInvitation.status == InvitationStatus.pending,
    ).first()
    if existing_inv:
        raise HTTPException(status_code=409, detail="Already invited")

    user = db.query(User).filter(User.email == body.email).first()
    if user:
        existing_member = db.query(TeamMember).filter(
            TeamMember.team_id == team_id,
            TeamMember.user_id == user.id,
        ).first()
        if existing_member:
            raise HTTPException(status_code=409, detail="Already a member")

    inv = TeamInvitation(
        team_id=team_id,
        inviter_id=current_user.id,
        invitee_email=body.email,
    )
    db.add(inv)
    db.commit()
    return {"ok": True, "invitation_id": str(inv.id)}


@router.patch("/{team_id}/members/{user_id}", response_model=MemberOut)
def update_member_role(
    team_id: str, user_id: str, body: MemberRoleUpdate,
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if str(team.owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Only owner can change roles")
    if body.role == "owner":
        raise HTTPException(status_code=400, detail="Cannot assign owner role")

    member = (
        db.query(TeamMember)
        .options(joinedload(TeamMember.user))
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if str(member.user_id) == str(team.owner_id):
        raise HTTPException(status_code=400, detail="Cannot change owner's role")

    member.role = body.role
    db.commit()
    db.refresh(member)
    return member


@router.delete("/{team_id}/members/{user_id}", status_code=204)
def remove_member(team_id: str, user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 본인 탈퇴이거나 owner만 허용
    if str(current_user.id) != user_id:
        require_team_owner(team_id, current_user, db)
    member = db.query(TeamMember).filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(member)
    db.commit()
