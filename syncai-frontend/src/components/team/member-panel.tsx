"use client";

import { useState, useEffect } from "react";
import { X, Crown, Shield, User, ChevronDown, UserMinus } from "lucide-react";
import { teams as teamsApi } from "@/lib/api";
import type { TeamMember, TeamRole } from "@/types";

interface MemberPanelProps {
  teamId: string;
  ownerId: string;
  myUserId: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "방장",
  manager: "팀장",
  member: "팀원",
};

const ROLE_ICONS: Record<TeamRole, React.ReactNode> = {
  owner: <Crown size={13} className="text-yellow-400" />,
  manager: <Shield size={13} className="text-[var(--accent)]" />,
  member: <User size={13} className="text-[var(--text-muted)]" />,
};

export function MemberPanel({ teamId, ownerId, myUserId, onClose }: MemberPanelProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  const isOwner = myUserId === ownerId;

  useEffect(() => {
    if (!teamId) return;
    teamsApi.members(teamId)
      .then((r) => setMembers(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [teamId]);

  async function changeRole(userId: string, role: string) {
    setUpdatingId(userId);
    setOpenDropdownId(null);
    try {
      const res = await teamsApi.updateMemberRole(teamId, userId, role);
      setMembers((prev) =>
        prev.map((m) => m.user_id === userId ? { ...m, role: res.data.role } : m)
      );
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(`역할 변경 실패: ${msg ?? "오류가 발생했습니다."}`);
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeMember(userId: string, name: string) {
    if (!confirm(`"${name}" 님을 팀에서 내보낼까요?`)) return;
    try {
      await teamsApi.removeMember(teamId, userId);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(`내보내기 실패: ${msg ?? "오류가 발생했습니다."}`);
    }
  }

  // owner 정렬: owner → manager → member
  const roleOrder: Record<TeamRole, number> = { owner: 0, manager: 1, member: 2 };
  const sorted = [...members].sort((a, b) => (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2));

  return (
    <div
      style={{
        width: 260,
        height: "100%",
        background: "var(--bg-surface)",
        borderLeft: "1px solid var(--border-subtle)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          팀원 목록 <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>({members.length})</span>
        </p>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: 8, border: "none",
            background: "transparent", color: "var(--text-muted)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}
          className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Member List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {loading ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>불러오는 중...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>팀원이 없어요</p>
          </div>
        ) : (
          sorted.map((member) => {
            const name = member.user?.name ?? "알 수 없음";
            const email = member.user?.email ?? "";
            const role = member.role as TeamRole;
            const isMe = member.user_id === myUserId;
            const isThisOwner = member.user_id === ownerId;
            const canChangeRole = isOwner && !isThisOwner;
            const isUpdating = updatingId === member.user_id;
            const dropdownOpen = openDropdownId === member.user_id;

            return (
              <div
                key={member.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 14px",
                  position: "relative",
                }}
                className="hover:bg-[var(--bg-hover)] transition-colors group"
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: "var(--accent-bg)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                    fontSize: 13, fontWeight: 600, color: "var(--accent)",
                  }}
                >
                  {name.charAt(0).toUpperCase()}
                </div>

                {/* Name + role */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {name}
                    </span>
                    {isMe && (
                      <span style={{ fontSize: 10, color: "var(--accent)", background: "var(--accent-bg)", padding: "1px 5px", borderRadius: 4, flexShrink: 0 }}>나</span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {email}
                  </p>
                </div>

                {/* Role badge / dropdown */}
                {canChangeRole ? (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      onClick={() => setOpenDropdownId(dropdownOpen ? null : member.user_id)}
                      disabled={isUpdating}
                      style={{
                        display: "flex", alignItems: "center", gap: 3,
                        padding: "3px 7px", borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--bg-elevated)",
                        cursor: "pointer", color: "var(--text-secondary)",
                        fontSize: 11, fontWeight: 500,
                      }}
                      className="hover:border-[var(--accent-dim)] transition-colors"
                    >
                      {ROLE_ICONS[role]}
                      {ROLE_LABELS[role]}
                      <ChevronDown size={10} />
                    </button>

                    {dropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setOpenDropdownId(null)} />
                        <div
                          style={{
                            position: "absolute", right: 0, top: "calc(100% + 4px)",
                            zIndex: 40, width: 110,
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--border)",
                            borderRadius: 10, overflow: "hidden",
                            boxShadow: "var(--shadow-lg)",
                          }}
                        >
                          {(["manager", "member"] as TeamRole[]).map((r) => (
                            <button
                              key={r}
                              onClick={() => changeRole(member.user_id, r)}
                              style={{
                                width: "100%", display: "flex", alignItems: "center",
                                gap: 7, padding: "8px 11px",
                                background: role === r ? "var(--accent-bg)" : "transparent",
                                border: "none", cursor: "pointer",
                                color: role === r ? "var(--accent)" : "var(--text-primary)",
                                fontSize: 12, fontWeight: role === r ? 600 : 400,
                                textAlign: "left",
                              }}
                              className="hover:bg-[var(--bg-hover)] transition-colors"
                            >
                              {ROLE_ICONS[r]}
                              {ROLE_LABELS[r]}
                            </button>
                          ))}

                          <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "2px 0" }} />

                          <button
                            onClick={() => { setOpenDropdownId(null); removeMember(member.user_id, name); }}
                            style={{
                              width: "100%", display: "flex", alignItems: "center",
                              gap: 7, padding: "8px 11px",
                              background: "transparent", border: "none", cursor: "pointer",
                              color: "var(--text-danger, #f87171)",
                              fontSize: 12, textAlign: "left",
                            }}
                            className="hover:bg-red-500/10 transition-colors"
                          >
                            <UserMinus size={12} />
                            내보내기
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      padding: "3px 7px", borderRadius: 6,
                      background: "var(--bg-elevated)",
                      fontSize: 11, fontWeight: 500, color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    {ROLE_ICONS[role]}
                    {ROLE_LABELS[role]}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
