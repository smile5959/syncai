from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.team import Team, TeamMember
from app.models.invitation import TeamInvitation, InvitationStatus
from app.models.chat_room import ChatRoom, RoomMember
from app.schemas.invitation import InvitationOut

router = APIRouter(prefix="/v1/invitations", tags=["Invitations"])


@router.get("", response_model=list[InvitationOut])
def list_my_invitations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """내 이메일로 온 pending 초대 목록"""
    invitations = (
        db.query(TeamInvitation)
        .filter(
            TeamInvitation.invitee_email == current_user.email,
            TeamInvitation.status == InvitationStatus.pending,
        )
        .order_by(TeamInvitation.created_at.desc())
        .all()
    )
    result = []
    for inv in invitations:
        item = InvitationOut.model_validate(inv)
        item.team_name = inv.team.name if inv.team else None
        item.inviter_name = inv.inviter.name if inv.inviter else None
        result.append(item)
    return result


@router.post("/{invitation_id}/accept", status_code=200)
def accept_invitation(invitation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(TeamInvitation).filter(
        TeamInvitation.id == invitation_id,
        TeamInvitation.invitee_email == current_user.email,
        TeamInvitation.status == InvitationStatus.pending,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    # 이미 팀 멤버인지 확인
    existing = db.query(TeamMember).filter(
        TeamMember.team_id == inv.team_id,
        TeamMember.user_id == current_user.id,
    ).first()
    if not existing:
        db.add(TeamMember(team_id=inv.team_id, user_id=current_user.id, role="member"))

    # B안: 팀 내 모든 채팅방에 자동으로 RoomMember 추가
    team_rooms = db.query(ChatRoom).filter(ChatRoom.team_id == inv.team_id).all()
    for room in team_rooms:
        already_in_room = db.query(RoomMember).filter(
            RoomMember.room_id == room.id,
            RoomMember.user_id == current_user.id,
        ).first()
        if not already_in_room:
            db.add(RoomMember(room_id=room.id, user_id=current_user.id))

    inv.status = InvitationStatus.accepted
    db.commit()
    return {"ok": True, "team_id": str(inv.team_id)}


@router.post("/{invitation_id}/reject", status_code=200)
def reject_invitation(invitation_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    inv = db.query(TeamInvitation).filter(
        TeamInvitation.id == invitation_id,
        TeamInvitation.invitee_email == current_user.email,
        TeamInvitation.status == InvitationStatus.pending,
    ).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    inv.status = InvitationStatus.rejected
    db.commit()
    return {"ok": True}
