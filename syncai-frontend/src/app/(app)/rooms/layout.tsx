"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { RoomSidebar } from "@/components/layout/room-sidebar";
import { InviteModal } from "@/components/team/invite-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rooms as roomsApi } from "@/lib/api";
import { createChatWS } from "@/lib/ws";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";
import type { WsChatEvent } from "@/types";

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const currentRoomId = params?.id as string | undefined;
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

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

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

  useEffect(() => {
    if (rooms.length === 0) return;

    const existingIds = new Set(wsRefs.current.keys());
    const newIds = new Set(rooms.map((r) => r.id));

    // 삭제된 방 WS 닫기
    existingIds.forEach((id) => {
      if (!newIds.has(id)) {
        wsRefs.current.get(id)?.close();
        wsRefs.current.delete(id);
      }
    });

    // 새 방 WS 생성
    rooms.forEach((room) => {
      if (wsRefs.current.has(room.id)) return;

      const ws = createChatWS(room.id);
      ws.on((event: WsChatEvent) => {
        if (event.type !== "message") return;
        const msg = event.data;

        // 내가 보낸 메시지는 무시
        if (msg.user_id === me?.id) return;
        // AI 응답도 알림 (user_id === null)

        // 현재 보고 있는 방이면 무시
        const isCurrentRoom =
          currentRoomId === room.id || currentRoomId === room.slug;
        if (isCurrentRoom && !document.hidden) return;

        // 미읽 카운트 증가
        incrementUnread(room.id);

        // 브라우저 알림 (창이 포커스 없을 때)
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
    });

    return () => {
      wsRefs.current.forEach((ws) => ws.close());
      wsRefs.current.clear();
    };
  // rooms가 바뀔 때마다 재구성
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms.map((r) => r.id).join(","), me?.id]);

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
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-7 w-full max-w-sm shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-5">
              새 채팅방 만들기
            </h3>
            <Input
              label="채팅방 이름"
              placeholder="예: frontend, backend, hotfix..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createRoom()}
              autoFocus
            />
            <div className="flex gap-2.5 mt-5">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCreate(false)}>
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1"
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
