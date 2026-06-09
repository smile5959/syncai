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
  const currentId = params?.id as string | undefined;
  const currentTeam = useAuthStore((s) => s.team);
  const unreadCounts = useRoomsStore((s) => s.unreadCounts);
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
      <div className="flex-1 overflow-y-auto py-2">
        <div className="flex items-center gap-2 px-4 py-2">
          <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--accent)", opacity: 0.7, flexShrink: 0 }} />
          <p className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-widest truncate">
            {displayName} 채팅방
          </p>
        </div>
        <div className="px-3">
          {filteredRooms.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-[var(--text-muted)]">
                {search ? "검색 결과가 없어요" : "채팅방이 없어요"}
              </p>
              {!search && (
                <button onClick={onNewRoom} className="text-[13px] text-[var(--accent)] hover:underline mt-2 block mx-auto">
                  + 새 채팅방 만들기
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
                <div key={room.id} className="relative mb-1">
                  {isRenaming ? (
                    <div className="flex items-center gap-2 px-4 min-h-[52px] rounded-xl bg-[var(--accent-bg)]">
                      <Hash size={15} className="shrink-0 text-[var(--accent)]" />
                      <input
                        ref={renameRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => submitRename(room)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitRename(room);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="flex-1 bg-transparent text-[14px] font-medium text-[var(--text-primary)] outline-none"
                      />
                    </div>
                  ) : (
                    <Link
                      href={`/rooms/${room.slug ?? room.id}`}
                      className={cn(
                        "flex items-center gap-3 px-4 rounded-xl text-sm transition-all duration-150 group",
                        "min-h-[52px]",
                        active
                          ? "bg-[var(--accent-bg)] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      )}
                    >
                      <Hash size={15} className={cn("shrink-0", active ? "text-[var(--accent)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]")} />
                      <span className="flex-1 truncate text-[14px] font-medium">{room.name}</span>

                      {unread > 0 && !active && (
                        <span style={{
                          minWidth: 18, height: 18, borderRadius: 9,
                          background: "var(--accent)",
                          color: "white", fontSize: 10, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: "0 5px", flexShrink: 0,
                        }}>
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
                          "w-5 h-5 flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-all",
                          menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                        )}
                      >
                        <MoreHorizontal size={13} />
                      </button>

                    </Link>
                  )}

                  {menuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setMenuRoomId(null)} />
                      <div
                        ref={menuRef}
                        className="absolute right-3 top-8 z-30 w-36 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden"
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(room); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                          <Pencil size={13} className="text-[var(--text-muted)]" />
                          이름 변경
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteRoom(room); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={13} />
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
