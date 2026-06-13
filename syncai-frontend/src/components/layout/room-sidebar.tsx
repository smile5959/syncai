"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus, Search, Hash, UserPlus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { rooms as roomsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";
import type { ChatRoom } from "@/types";

interface RoomSidebarProps {
  rooms: ChatRoom[];
  onNewRoom?: () => void;
  onInvite?: () => void;
  onRoomsChange?: (rooms: ChatRoom[]) => void;
}

export function RoomSidebar({ rooms = [], onNewRoom, onInvite, onRoomsChange }: RoomSidebarProps) {
  const params = useParams();
  const router = useRouter();
  const currentTeam = useAuthStore((s) => s.team);
  const unreadCounts = useRoomsStore((s) => s.unreadCounts);
  // Tauri static export: useParams()는 항상 __placeholder__ 반환 → store의 UUID 우선 사용
  const currentRoomUuid = useRoomsStore((s) => s.currentRoomUuid);
  const paramsId = params?.id as string | undefined;
  const currentId = currentRoomUuid ?? paramsId;
  const displayName = currentTeam?.name ?? "내 팀";

  const [search, setSearch] = useState("");
  const [menuRoomId, setMenuRoomId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  const filteredRooms = rooms.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuRoomId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (renamingId && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renamingId]);

  function startRename(room: ChatRoom) {
    setMenuRoomId(null);
    setRenamingId(room.id);
    setRenameValue(room.name);
  }

  async function submitRename(room: ChatRoom) {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === room.name) {
      setRenamingId(null);
      return;
    }
    try {
      await roomsApi.update(room.id, { name: trimmed });
      onRoomsChange?.(rooms.map((r) => r.id === room.id ? { ...r, name: trimmed } : r));
    } catch {}
    setRenamingId(null);
  }

  async function deleteRoom(room: ChatRoom) {
    setMenuRoomId(null);
    if (!confirm(`"${room.name}" 채팅방을 삭제할까요?`)) return;
    try {
      await roomsApi.delete(room.id);
      const updated = rooms.filter((r) => r.id !== room.id);
      onRoomsChange?.(updated);
      if (currentId === room.id) {
        if (updated.length > 0) {
          router.push(`/rooms/${updated[0].slug ?? updated[0].id}`);
        } else {
          router.push("/rooms");
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      alert(`삭제 실패: ${msg ?? "오류가 발생했어요."}`);
    }
  }

  return (
    <aside
      style={{
        display: "flex", flexDirection: "column",
        width: "100%", height: "100%",
        borderRight: "2px solid var(--border)",
        background: "var(--bg-surface)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Team header */}
      <div style={{
        height: 56,
        display: "flex", alignItems: "center",
        padding: "0 16px 0 20px",
        borderBottom: "1px solid var(--border-subtle)",
        flexShrink: 0,
      }}>
        <div className="flex items-center justify-between" style={{ width: "100%" }}>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-[var(--text-muted)] font-semibold uppercase tracking-widest mb-0.5">팀</p>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)] truncate leading-tight">{displayName}</h2>
          </div>

          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={onInvite}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border)]"
              title="팀원 초대"
            >
              <UserPlus size={17} />
            </button>
            <button
              onClick={onNewRoom}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors border border-transparent hover:border-[var(--border)]"
              title="새 채팅방"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-3 bg-[var(--bg-base)] rounded-2xl px-4 py-3.5 border border-[var(--border-subtle)] transition-colors focus-within:border-[var(--accent-dim)] focus-within:shadow-[0_0_0_3px_var(--accent-glow)]">
          <Search size={15} className="text-[var(--text-muted)] shrink-0" />
          <input
            placeholder="채팅방 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors shrink-0 text-base leading-none"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Rooms */}
      <div className="flex-1 overflow-y-auto pt-3 pb-2">
        <p className="px-4 mb-1 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest">
          채널
        </p>
        <div className="px-2">
          {filteredRooms.length === 0 ? (
            <div className="px-2 py-5 flex flex-col items-center gap-3">
              <p className="text-[12px] text-[var(--text-muted)] text-center">
                {search ? "검색 결과가 없어요" : "채팅방이 없어요"}
              </p>
              {!search && (
                <button
                  onClick={onNewRoom}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12.5px] text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  style={{ border: "1px dashed var(--border)", background: "transparent", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent-dim)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <Plus size={12} />
                  새 채팅방 만들기
                </button>
              )}
            </div>
          ) : (
            filteredRooms.map((room) => {
              const active = currentId === room.id || (!!room.slug && currentId === room.slug);
              const isRenaming = renamingId === room.id;
              const unread = unreadCounts[room.id] ?? 0;
              const menuOpen = menuRoomId === room.id;

              return (
                <div key={room.id} className="relative mb-0.5">
                  {isRenaming ? (
                    <div className="flex items-center gap-2 px-3 h-9 rounded-lg bg-[var(--accent-bg)] border border-[var(--accent-dim)]">
                      <Hash size={13} className="shrink-0 text-[var(--accent)]" />
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => submitRename(room)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(room);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 bg-transparent text-[13px] font-medium text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  ) : (
                    <Link
                      href={`/rooms/${room.slug ?? room.id}`}
                      className={cn(
                        "flex items-center gap-2.5 px-3 h-9 rounded-lg text-[13px] transition-all duration-100 group relative",
                        active
                          ? "bg-[var(--gradient-accent-soft)] text-[var(--text-primary)] font-medium"
                          : "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                      )}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[var(--accent)]" />
                      )}
                      <Hash size={13} className={cn(
                        "shrink-0 transition-colors",
                        active ? "text-[var(--accent)]" : "group-hover:text-[var(--text-muted)]"
                      )} />
                      <span className="flex-1 truncate">{room.name}</span>

                      {unread > 0 && !active && (
                        <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-[var(--accent)] text-white text-[10px] font-bold flex items-center justify-center px-1">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}

                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setMenuRoomId(menuOpen ? null : room.id);
                        }}
                        className={cn(
                          "w-6 h-6 flex items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-soft)] transition-all shrink-0",
                          menuOpen ? "opacity-100 bg-[var(--bg-soft)]" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                    </Link>
                  )}

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuRoomId(null)} />
                      <div
                        ref={menuRef}
                        className="absolute right-2 top-8 z-30 menu-enter"
                        style={{
                          width: 192,
                          background: "var(--bg-elev)",
                          backdropFilter: "blur(24px) saturate(140%)",
                          WebkitBackdropFilter: "blur(24px) saturate(140%)",
                          border: "1px solid var(--border-strong)",
                          borderRadius: 16,
                          boxShadow: "0 20px 60px rgba(0,0,0,0.25), 0 4px 16px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
                          padding: "6px",
                          overflow: "hidden",
                        }}
                      >
                        {/* 방 이름 헤더 */}
                        <div style={{
                          padding: "8px 12px 6px",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "var(--text-muted)",
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                        }}>
                          {room.name}
                        </div>

                        <div style={{ height: 1, background: "var(--border)", margin: "2px 6px 4px" }} />

                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(room); }}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 11,
                            padding: "10px 12px", borderRadius: 10,
                            fontSize: 13.5, fontWeight: 500,
                            color: "var(--text)",
                            background: "transparent", border: 0, cursor: "pointer",
                            transition: "background 0.15s",
                            textAlign: "left",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-soft)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <span style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: "var(--accent-bg)",
                            color: "var(--accent-text)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Pencil size={13} />
                          </span>
                          이름 변경
                        </button>

                        <button
                          onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}
                          style={{
                            width: "100%", display: "flex", alignItems: "center", gap: 11,
                            padding: "10px 12px", borderRadius: 10,
                            fontSize: 13.5, fontWeight: 500,
                            color: "var(--red, #f87171)",
                            background: "transparent", border: 0, cursor: "pointer",
                            transition: "background 0.15s",
                            textAlign: "left",
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.07)"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                        >
                          <span style={{
                            width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                            background: "rgba(239,68,68,0.1)",
                            color: "var(--red, #f87171)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <Trash2 size={13} />
                          </span>
                          삭제
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
