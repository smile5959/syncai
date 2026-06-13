"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Zap, Settings, LogOut, HelpCircle, Sun, Moon, Coffee, Plus, Pencil, Trash2, LogOut as LeaveIcon, MoreHorizontal } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { InvitationBell } from "@/components/team/invitation-bell";
import { users as usersApi, teams as teamsApi, logoutUser } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Team } from "@/types";

// ─── 상수 ──────────────────────────────────────────────

const COLOR_PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#f59e0b", "#10b981", "#14b8a6",
  "#3b82f6", "#06b6d4", "#84cc16", "#64748b",
];

const EMOJI_LIST = [
  "⚡","🚀","🔥","💡","🎯","🛠️","💎","🌟",
  "🦁","🐯","🦊","🐺","🦋","🐉","🦅","🐬",
  "🍀","🌈","⛰️","🌊","🌙","☀️","❄️","🍕",
  "🎸","🎮","🏆","🎲","🎨","📸","🎬","🎤",
  "💻","📱","🖥️","⌨️","🖱️","🔧","⚙️","🔬",
  "📦","📋","🗂️","📊","📈","💬","📡","🔐",
];

// ─── 유틸 ──────────────────────────────────────────────

function hashColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

function getTeamColor(team: Team): string {
  return team.color ?? hashColor(team.id);
}

function getInitials(name: string): string {
  return name.slice(0, 3).toUpperCase();
}

// ─── 서브 컴포넌트: 팀 생성/수정 모달 ─────────────────

interface TeamFormModalProps {
  title: string;
  initialName?: string;
  initialColor?: string | null;
  initialIcon?: string | null;
  submitting: boolean;
  onSubmit: (name: string, color: string | null, icon: string | null) => void;
  onClose: () => void;
}

function TeamFormModal({ title, initialName = "", initialColor, initialIcon, submitting, onSubmit, onClose }: TeamFormModalProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<string | null>(initialColor ?? null);
  const [icon, setIcon] = useState<string | null>(initialIcon ?? null);
  const [showEmoji, setShowEmoji] = useState(false);

  const previewColor = color ?? (name ? hashColor(name + "preview") : COLOR_PALETTE[0]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 shadow-2xl"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{
          padding: "20px 24px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-muted)",
              fontSize: 18, lineHeight: 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >×</button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* 미리보기 */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <div
              style={{
                width: 72, height: 72, borderRadius: 20,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: previewColor,
                boxShadow: `0 8px 28px ${previewColor}44`,
                fontSize: 28,
                userSelect: "none",
              }}
            >
              {icon ?? <span style={{ fontSize: 22, fontWeight: 700, color: "white", letterSpacing: "-0.5px" }}>{getInitials(name || "?")}</span>}
            </div>
          </div>

          {/* 팀 이름 */}
          <Input
            label="팀 이름"
            placeholder="예: 프론트엔드팀, 백엔드팀..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !showEmoji && onSubmit(name, color, icon)}
            autoFocus
          />

          {/* 색상 */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>색상</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                    background: c,
                    outline: color === c ? `3px solid ${c}` : "3px solid transparent",
                    outlineOffset: 2,
                    transform: color === c ? "scale(1.18)" : "scale(1)",
                    transition: "transform 0.12s ease, outline 0.12s ease",
                    border: "none", cursor: "pointer",
                  }}
                />
              ))}
            </div>
          </div>

          {/* 아이콘 */}
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>아이콘</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => setShowEmoji((v) => !v)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "8px 14px", borderRadius: 10,
                  border: `1px solid ${showEmoji ? "var(--accent)" : "var(--border)"}`,
                  background: showEmoji ? "var(--accent-bg)" : "var(--bg-base)",
                  color: "var(--text-secondary)", fontSize: 13, cursor: "pointer",
                  transition: "border-color 0.15s, background 0.15s",
                }}
              >
                <span style={{ fontSize: 16 }}>{icon ?? "+"}</span>
                <span>{icon ? "이모지 변경" : "이모지 선택"}</span>
              </button>
              {icon && (
                <button
                  onClick={() => setIcon(null)}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "transparent", border: "1px solid var(--border)",
                    color: "var(--text-muted)", fontSize: 13, cursor: "pointer",
                  }}
                >✕</button>
              )}
            </div>

            {showEmoji && (
              <div style={{
                marginTop: 10, padding: 12, borderRadius: 12,
                border: "1px solid var(--border)", background: "var(--bg-base)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 4 }}>
                  {EMOJI_LIST.map((e) => (
                    <button
                      key={e}
                      onClick={() => { setIcon(e); setShowEmoji(false); }}
                      style={{
                        width: 34, height: 34,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        borderRadius: 8, border: "none", cursor: "pointer", fontSize: 18,
                        background: icon === e ? "var(--accent-bg)" : "transparent",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(ev) => { if (icon !== e) ev.currentTarget.style.background = "var(--bg-hover)"; }}
                      onMouseLeave={(ev) => { if (icon !== e) ev.currentTarget.style.background = "transparent"; }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 푸터 */}
        <div style={{
          padding: "16px 24px",
          borderTop: "1px solid var(--border)",
          display: "flex", gap: 10,
        }}>
          <Button variant="ghost" className="flex-1" onClick={onClose}>취소</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => onSubmit(name, color, icon)}
            loading={submitting}
            disabled={!name.trim()}
          >
            {title.includes("수정") ? "저장" : "만들기"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 컴포넌트 ─────────────────────────────────────

export function IconNav() {
  const router = useRouter();
  const { team: currentTeam, setTeam } = useAuthStore();
  const me = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggle } = useTheme();

  const setUser = useAuthStore((s) => s.setUser);
  const [teams, setTeams] = useState<Team[]>([]);

  // 모달 상태
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [updating, setUpdating] = useState(false);

  const [deleteConfirmTeam, setDeleteConfirmTeam] = useState<Team | null>(null);

  // 알림 벨
  const [bellOpen, setBellOpen] = useState(false);

  // 호버 메뉴
  const [menuTeamId, setMenuTeamId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [hoveredTeamId, setHoveredTeamId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);


  useEffect(() => {
    // 유저 정보 복구 (새로고침 시 store 초기화 대비 — 쿠키 자동 전송)
    if (!me) {
      usersApi.me().then((r) => setUser(r.data)).catch(console.error);
    }

    usersApi.myTeams().then((r) => {
      const myTeams = r.data.teams ?? [];
      setTeams(myTeams);
      if (myTeams.length === 0) return;
      const savedId = typeof window !== "undefined" ? localStorage.getItem("team_id") : null;
      const active = myTeams.find((t) => t.id === savedId) ?? myTeams[0];
      if (!currentTeam || !myTeams.find((t) => t.id === currentTeam.id)) {
        setTeam(active);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 메뉴 외부 클릭 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuTeamId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openMenu(e: React.MouseEvent, teamId: string) {
    e.stopPropagation();
    if (menuTeamId === teamId) {
      setMenuTeamId(null);
      setMenuPos(null);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenuPos({ top: rect.top, left: rect.right + 8 });
    setMenuTeamId(teamId);
  }

  function closeMenu() {
    setMenuTeamId(null);
    setMenuPos(null);
  }

  function handleSelectTeam(team: Team) {
    closeMenu();
    setTeam(team);
    router.push("/rooms");
  }

  async function handleCreate(name: string, color: string | null, icon: string | null) {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await teamsApi.create(name.trim());
      // color/icon은 create 후 patch로 저장 (create API가 color/icon 지원하므로 직접 전달)
      const newTeam = res.data;
      // API가 color/icon을 지원하지 않는 경우 patch fallback
      let finalTeam = newTeam;
      if (color || icon) {
        try {
          const upd = await teamsApi.update(newTeam.id, { color, icon });
          finalTeam = upd.data;
        } catch {}
      }
      setTeams((prev) => [...prev, finalTeam]);
      setTeam(finalTeam);
      setShowCreate(false);
      router.push("/rooms");
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(name: string, color: string | null, icon: string | null) {
    if (!editingTeam || !name.trim()) return;
    setUpdating(true);
    try {
      const res = await teamsApi.update(editingTeam.id, { name: name.trim(), color, icon });
      const updated = res.data;
      setTeams((prev) => prev.map((t) => t.id === updated.id ? updated : t));
      if (currentTeam?.id === updated.id) setTeam(updated);
      setEditingTeam(null);
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  }

  async function handleDelete(team: Team) {
    setMenuTeamId(null);
    setDeleteConfirmTeam(team);
  }

  async function confirmDelete() {
    const team = deleteConfirmTeam;
    if (!team) return;
    setDeleteConfirmTeam(null);
    try {
      await teamsApi.delete(team.id);
      const updated = teams.filter((t) => t.id !== team.id);
      setTeams(updated);
      if (currentTeam?.id === team.id) {
        if (updated.length > 0) {
          setTeam(updated[0]);
          router.push("/rooms");
        } else {
          router.push("/onboarding");
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(`삭제 실패: ${msg ?? "오류가 발생했어요."}`);
    }
  }

  async function handleLeave(team: Team) {
    setMenuTeamId(null);
    if (!me) return;
    if (!confirm(`"${team.name}" 팀에서 나갈까요?`)) return;
    try {
      await teamsApi.removeMember(team.id, me.id);
      const updated = teams.filter((t) => t.id !== team.id);
      setTeams(updated);
      if (currentTeam?.id === team.id) {
        if (updated.length > 0) {
          setTeam(updated[0]);
          router.push("/rooms");
        } else {
          router.push("/onboarding");
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleLogout() {
    logout();
    await logoutUser();
  }

  const navIconStyle: React.CSSProperties = {
    width: 36, height: 36, flexShrink: 0,
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--text-muted)",
  };

  return (
    <>
      <nav
        className="icon-nav-root flex flex-col border-r border-[var(--border)]"
        style={{ background: "var(--bg-soft)", flexShrink: 0, overflow: "hidden" }}
      >
        {/* 로고 */}
        <div style={{ height: 56, display: "flex", alignItems: "center", borderBottom: "1px solid var(--border)", flexShrink: 0, padding: "0 14px", gap: 10 }}>
          <Link
            href="/rooms"
            className="flex items-center justify-center rounded-xl text-white"
            style={{ width: 36, height: 36, flexShrink: 0, background: "var(--gradient-accent)", boxShadow: "0 4px 12px rgba(99,102,241,0.3), inset 0 1px 0 rgba(255,255,255,0.2)" }}
          >
            <Zap size={17} fill="white" />
          </Link>
          <span className="icon-nav-label" style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>SyncAI</span>
        </div>

        {/* 팀 목록 */}
        <div className="flex flex-col overflow-y-auto" style={{ flex: 1, minHeight: 0, paddingTop: 6, paddingBottom: 6 }}>
          {teams.map((team) => {
            const isActive = currentTeam?.id === team.id;
            const teamColor = getTeamColor(team);
            const isHovered = hoveredTeamId === team.id;

            return (
              <div
                key={team.id}
                className="relative"
                onMouseEnter={() => setHoveredTeamId(team.id)}
                onMouseLeave={() => setHoveredTeamId(null)}
              >
                <button
                  onClick={() => handleSelectTeam(team)}
                  onContextMenu={(e) => { e.preventDefault(); openMenu(e, team.id); }}
                  title={team.name}
                  className="flex items-center w-full transition-colors hover:bg-[var(--bg-hover)]"
                  style={{ height: 50, padding: "0 14px", gap: 10 }}
                >
                  <div
                    className="rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-150"
                    style={{
                      width: 40, height: 40,
                      background: teamColor,
                      opacity: isActive ? 1 : 0.5,
                      outline: isActive ? `2px solid ${teamColor}` : "2px solid transparent",
                      outlineOffset: 2,
                      boxShadow: isActive ? `0 4px 12px ${teamColor}66` : undefined,
                    }}
                  >
                    {team.icon
                      ? <span style={{ fontSize: 18, lineHeight: 1, color: "white" }}>{team.icon}</span>
                      : <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "-0.5px", color: "white" }}>{getInitials(team.name)}</span>
                    }
                  </div>
                  <span className="icon-nav-label" style={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                    flex: 1, minWidth: 0, textOverflow: "ellipsis", fontSize: 13,
                  }}>{team.name}</span>
                </button>

                {isHovered && (
                  <button
                    onClick={(e) => openMenu(e, team.id)}
                    style={{
                      position: "absolute", top: "50%", transform: "translateY(-50%)",
                      right: 8,
                      width: 18, height: 18, borderRadius: "50%",
                      background: "var(--bg-elevated)", border: "1px solid var(--border)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", zIndex: 10,
                    }}
                  >
                    <MoreHorizontal size={10} color="var(--text-muted)" />
                  </button>
                )}
              </div>
            );
          })}

          {/* 팀 추가 */}
          <button
            onClick={() => setShowCreate(true)}
            title="새 팀 만들기"
            className="flex items-center w-full transition-colors hover:bg-[var(--bg-hover)]"
            style={{ height: 50, padding: "0 14px", gap: 10 }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 12, border: "2px dashed var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", flexShrink: 0 }}>
              <Plus size={15} />
            </div>
            <span className="icon-nav-label" style={{ color: "var(--text-muted)", fontSize: 13 }}>새 팀 만들기</span>
          </button>
        </div>

        {/* 하단 유틸 */}
        <div className="flex flex-col" style={{ borderTop: "1px solid var(--border)", paddingTop: 4, paddingBottom: 4 }}>
          <button
            onClick={() => setBellOpen((v) => !v)}
            className="flex items-center w-full transition-colors hover:bg-[var(--bg-hover)]"
            style={{ height: 40, padding: "0 14px", gap: 10 }}
          >
            <div style={navIconStyle}>
              <InvitationBell
                open={bellOpen}
                onOpenChange={setBellOpen}
                onAccepted={(teamId) => {
                  setBellOpen(false);
                  usersApi.myTeams().then((r) => {
                    const myTeams = r.data.teams ?? [];
                    setTeams(myTeams);
                    const accepted = myTeams.find((t) => t.id === teamId);
                    if (accepted) { setTeam(accepted); router.push("/rooms"); }
                  }).catch(console.error);
                }}
              />
            </div>
            <span className="icon-nav-label" style={{ fontSize: 13 }}>알림</span>
          </button>

          <button
            onClick={toggle}
            title={theme === "dark" ? "라이트 모드로" : theme === "light" ? "Oat 모드로" : "다크 모드로"}
            className="flex items-center w-full transition-colors hover:bg-[var(--bg-hover)]"
            style={{ height: 40, padding: "0 14px", gap: 10 }}
          >
            <div style={navIconStyle}>
              {theme === "dark" ? <Sun size={17} /> : theme === "light" ? <Coffee size={17} /> : <Moon size={17} />}
            </div>
            <span className="icon-nav-label" style={{ fontSize: 13 }}>{theme === "dark" ? "라이트 모드" : theme === "light" ? "Oat 모드" : "다크 모드"}</span>
          </button>

          <div style={{ height: 1, background: "var(--border)", margin: "2px 14px" }} />

          <Link href="/settings" title="설정"
            className="flex items-center transition-colors hover:bg-[var(--bg-hover)]"
            style={{ height: 40, padding: "0 14px", gap: 10 }}>
            <div style={navIconStyle}><Settings size={17} /></div>
            <span className="icon-nav-label" style={{ fontSize: 13 }}>설정</span>
          </Link>

          <Link href="/help" title="도움말"
            className="flex items-center transition-colors hover:bg-[var(--bg-hover)]"
            style={{ height: 40, padding: "0 14px", gap: 10 }}>
            <div style={navIconStyle}><HelpCircle size={17} /></div>
            <span className="icon-nav-label" style={{ fontSize: 13 }}>도움말</span>
          </Link>

          <button onClick={handleLogout} title="로그아웃"
            className="flex items-center w-full transition-colors hover:bg-red-500/10"
            style={{ height: 40, padding: "0 14px", gap: 10 }}>
            <div style={{ ...navIconStyle, color: "var(--text-muted)" }}><LogOut size={17} /></div>
            <span className="icon-nav-label" style={{ fontSize: 13, color: "var(--red, #f87171)" }}>로그아웃</span>
          </button>
        </div>

        {/* 유저 패널 */}
        {me && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, background: "var(--bg-base)", flexShrink: 0 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--gradient-accent)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(99,102,241,0.25)" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "white", letterSpacing: "-0.5px" }}>
                  {me.name?.slice(0, 2).toUpperCase() ?? "?"}
                </span>
              </div>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22c55e", border: "2px solid var(--bg-base)", position: "absolute", bottom: -1, right: -1 }} />
            </div>
            <div className="icon-nav-label" style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>온라인</p>
            </div>
          </div>
        )}
      </nav>

      {/* 팀 컨텍스트 메뉴 — fixed 포지셔닝으로 overflow 클리핑 우회 */}
      {menuTeamId && menuPos && (() => {
        const team = teams.find((t) => t.id === menuTeamId);
        if (!team) return null;
        const isOwner = me?.id === team.owner_id;
        return (
          <>
            <div className="fixed inset-0 z-20" onClick={closeMenu} />
            <div
              ref={menuRef}
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                zIndex: 30,
                width: 160,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "var(--shadow-lg)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)" }}>{isOwner ? "owner" : "member"}</p>
              </div>

              {isOwner && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeMenu(); setEditingTeam(team); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "var(--text-primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <Pencil size={13} color="var(--text-muted)" />
                    팀 설정 수정
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); closeMenu(); handleDelete(team); }}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                  >
                    <Trash2 size={13} color="#f87171" />
                    팀 삭제
                  </button>
                </>
              )}

              {!isOwner && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeMenu(); handleLeave(team); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", fontSize: 13, color: "#f87171", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239,68,68,0.1)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <LeaveIcon size={13} color="#f87171" />
                  팀 나가기
                </button>
              )}
            </div>
          </>
        );
      })()}

      {/* 팀 생성 모달 */}
      {showCreate && (
        <TeamFormModal
          title="새 팀 만들기"
          submitting={creating}
          onSubmit={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* 팀 수정 모달 */}
      {editingTeam && (
        <TeamFormModal
          title="팀 설정 수정"
          initialName={editingTeam.name}
          initialColor={editingTeam.color}
          initialIcon={editingTeam.icon}
          submitting={updating}
          onSubmit={handleUpdate}
          onClose={() => setEditingTeam(null)}
        />
      )}

      {/* 팀 삭제 확인 모달 */}
      {deleteConfirmTeam && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setDeleteConfirmTeam(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 51, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 16, padding: "24px", width: 320, boxShadow: "var(--shadow-lg)" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8 }}>팀 삭제</p>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              <strong>&quot;{deleteConfirmTeam.name}&quot;</strong> 팀을 삭제할까요?<br />모든 채팅방과 데이터가 삭제됩니다.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteConfirmTeam(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", background: "none", color: "var(--text-secondary)", fontSize: 13, cursor: "pointer" }}>취소</button>
              <button onClick={confirmDelete} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>삭제</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
