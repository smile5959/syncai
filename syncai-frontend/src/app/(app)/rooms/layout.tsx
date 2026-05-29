"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RoomSidebar } from "@/components/layout/room-sidebar";
import { InviteModal } from "@/components/team/invite-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rooms as roomsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";

export default function RoomsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const currentTeam = useAuthStore((s) => s.team);

  const {
    rooms,
    showSidebar,
    showCreate,
    showInvite,
    setRooms,
    addRoom,
    setShowCreate,
    setShowInvite,
  } = useRoomsStore();

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

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

  async function createRoom() {
    if (!newName.trim() || !currentTeam) return;
    setCreating(true);
    try {
      const res = await roomsApi.create(currentTeam.id, newName.trim());
      addRoom(res.data);
      setShowCreate(false);
      setNewName("");
      router.push(`/rooms/${res.data.id}`);
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minWidth: 0 }}>
      {/* Sidebar — 레이아웃에서 공유, 페이지 전환 시 유지됨 */}
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
