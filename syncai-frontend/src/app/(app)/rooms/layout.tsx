"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { RoomSidebar } from "@/components/layout/room-sidebar";
import { InviteModal } from "@/components/team/invite-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, X } from "lucide-react";
import { rooms as roomsApi } from "@/lib/api";
import { createChatWS } from "@/lib/ws";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";
import type { WsChatEvent } from "@/types";

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname(); // 네비게이션 시 리렌더 트리거용
  // usePathname/useParams 모두 RSC context에서 읽어 __placeholder__ 반환 가능.
  // window.location은 pushState 직후 업데이트되므로 항상 정확함.
  const currentRoomId = typeof window !== "undefined"
    ? (() => { const s = window.location.pathname.split("/").filter(Boolean).at(-1); return s === "rooms" ? undefined : s; })()
    : undefined;
  const currentTeam = useAuthStore((s) => s.team);
  const me = useAuthStore((s) => s.user);

  const {
    rooms,
    showSidebar,
    showCreate,
    showInvite,
    setRooms,
    addRoom,
    setShowCreate,
    setShowInvite,
    incrementUnread,
    clearUnread,
  } = useRoomsStore();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // currentRoomId와 rooms를 ref로 유지 — WS 클로저에서 항상 최신값 참조
  const currentRoomIdRef = useRef(currentRoomId);
  const roomsRef = useRef(rooms);
  useEffect(() => { currentRoomIdRef.current = currentRoomId; }, [currentRoomId]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);

  // page.tsx가 room 로드 완료 후 저장한 UUID — 가장 신뢰할 수 있는 현재 방 판단 기준
  const currentRoomUuidRef = useRef<string | null>(null);
  useEffect(() => {
    return useRoomsStore.subscribe(
      (s) => { currentRoomUuidRef.current = s.currentRoomUuid; },
    );
  }, []);

  // 탭 다시 활성화 시 현재 방 미읽 즉시 초기화
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && currentRoomIdRef.current) {
        const cur = currentRoomIdRef.current;
        const room = rooms.find((r) => r.id === cur || r.slug === cur);
        clearUnread(room?.id ?? cur);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [rooms, clearUnread]);


  // 창 크기에 따라 사이드바 자동 조절
  useEffect(() => {
    const { setShowSidebar } = useRoomsStore.getState();
    function handleResize() {
      setShowSidebar(window.innerWidth >= 900);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 팀 변경 시 채팅방 목록 fetch
  useEffect(() => {
    if (!currentTeam) return;
    roomsApi
      .list(currentTeam.id)
      .then((r) => setRooms(r.data ?? []))
      .catch(console.error);
  }, [currentTeam, setRooms]);

  // 현재 방 입장 시 미읽 초기화
  useEffect(() => {
    if (!currentRoomId) return;
    // slug 또는 id 모두 처리
    const room = rooms.find((r) => r.id === currentRoomId || r.slug === currentRoomId);
    if (room) clearUnread(room.id);
    else clearUnread(currentRoomId);
  }, [currentRoomId, rooms, clearUnread]);

  // 모든 방 WS 연결 — 미읽 카운트 + 브라우저 알림
  const wsRefs = useRef<Map<string, ReturnType<typeof createChatWS>>>(new Map());
  // room.id → 대기 중인 timer (per-room 추적으로 삭제된 방 timer 정확히 취소)
  const wsTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // me를 ref로 유지 — WS handler 클로저에서 항상 최신값 참조
  const meRef = useRef(me);
  useEffect(() => { meRef.current = me; }, [me]);

  // 언마운트 시에만 전체 WS 정리 (rooms 변경마다 전체 재생성 방지)
  useEffect(() => {
    return () => {
      wsTimers.current.forEach(clearTimeout);
      wsTimers.current.clear();
      wsRefs.current.forEach((ws) => ws.close());
      wsRefs.current.clear();
    };
  }, []);

  // rooms 변경 시 델타만 처리: 삭제된 방 WS 닫기 + 새 방 WS 추가만
  useEffect(() => {
    if (rooms.length === 0) return;

    const existingIds = new Set(wsRefs.current.keys());
    const newIds = new Set(rooms.map((r) => r.id));

    // 삭제된 방: pending timer + WS 모두 정리
    existingIds.forEach((id) => {
      if (!newIds.has(id)) {
        const t = wsTimers.current.get(id);
        if (t) { clearTimeout(t); wsTimers.current.delete(id); }
        wsRefs.current.get(id)?.close();
        wsRefs.current.delete(id);
      }
    });

    // 새 방 WS 생성 — 3초 지연 (현재 방 WS가 먼저 백엔드를 깨울 시간 확보)
    rooms.forEach((room, idx) => {
      if (wsRefs.current.has(room.id) || wsTimers.current.has(room.id)) return;

      const timer = setTimeout(() => {
        wsTimers.current.delete(room.id);
        if (wsRefs.current.has(room.id)) return;
        const ws = createChatWS(room.id);
        ws.on((event: WsChatEvent) => {
          if (event.type !== "message") return;
          const msg = event.data;

          if (msg.user_id === meRef.current?.id) return;

          const resolvedUuid = currentRoomUuidRef.current ?? (() => {
            const cur = currentRoomIdRef.current;
            const found = roomsRef.current.find((r) => r.id === cur || r.slug === cur);
            return found?.id ?? cur;
          })();
          if (resolvedUuid === room.id && !document.hidden) return;

          incrementUnread(room.id);

          if (
            document.hidden &&
            typeof window !== "undefined" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const senderName = msg.user?.name ?? "SyncAI";
            const body = msg.content.length > 80 ? msg.content.slice(0, 80) + "…" : msg.content;
            const n = new Notification(`#${room.name}`, {
              body: `${senderName}: ${body}`,
              icon: "/favicon.ico",
              tag: room.id,
            });
            n.onclick = () => {
              window.focus();
              router.push(`/rooms/${room.slug ?? room.id}`);
              n.close();
            };
          }
        });

        wsRefs.current.set(room.id, ws);
      }, 3000 + idx * 300);
      wsTimers.current.set(room.id, timer);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.map((r) => r.id).join(",")]);

  async function createRoom() {
    if (!newName.trim() || !currentTeam) return;
    setCreating(true);
    try {
      const res = await roomsApi.create(currentTeam.id, newName.trim());
      addRoom(res.data);
      setShowCreate(false);
      setNewName("");
      router.push(`/rooms/${res.data.slug ?? res.data.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minWidth: 0 }}>
      {/* Sidebar */}
      <div
        style={{
          width: showSidebar ? 240 : 0,
          minWidth: 0,
          overflow: "hidden",
          transition: "width 0.25s ease",
          flexShrink: 0,
        }}
      >
        <RoomSidebar
          rooms={rooms}
          onNewRoom={() => setShowCreate(true)}
          onInvite={() => setShowInvite(true)}
          onRoomsChange={setRooms}
        />
      </div>

      {/* 페이지 컨텐츠 */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minWidth: 0 }}>
        {children}
      </div>

      {/* 새 채팅방 모달 */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setShowCreate(false); setNewName(""); }}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              padding: "32px 36px",
              width: "100%",
              maxWidth: 480,
              boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: "var(--accent-bg)",
                  border: "1px solid var(--accent-dim)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Hash size={22} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                    새 채팅방 만들기
                  </h3>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
                    팀원들과 대화할 공간을 만들어보세요
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); }}
                style={{
                  width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "transparent", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", marginTop: 2,
                }}
                className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <Input
              label="채팅방 이름"
              placeholder="예: frontend, backend, hotfix..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <Button
                variant="ghost"
                style={{ flex: 1, height: 46, fontSize: 14, borderRadius: 12 }}
                onClick={() => { setShowCreate(false); setNewName(""); }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                style={{ flex: 2, height: 46, fontSize: 14, borderRadius: 12, fontWeight: 600 }}
                onClick={createRoom}
                loading={creating}
                disabled={!newName.trim()}
              >
                만들기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 초대 모달 */}
      {showInvite && currentTeam && (
        <InviteModal teamId={currentTeam.id} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
