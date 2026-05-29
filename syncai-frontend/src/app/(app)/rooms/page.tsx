"use client";

import { useRouter } from "next/navigation";
import { Hash, Plus, Zap, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoomsStore } from "@/store/rooms";

export default function RoomsPage() {
  const router = useRouter();
  const rooms = useRoomsStore((s) => s.rooms);
  const setShowCreate = useRoomsStore((s) => s.setShowCreate);

  return (
    <main className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)]">
      <div className="flex flex-col items-center gap-7 max-w-sm text-center px-8">
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-[var(--accent)] flex items-center justify-center shadow-[0_0_48px_var(--accent-glow)]">
            <Zap size={34} className="text-white" fill="white" />
          </div>
          <div className="absolute inset-0 rounded-3xl bg-[var(--accent)] opacity-20 blur-2xl animate-pulse" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-3 tracking-tight">
            채팅방을 선택하세요
          </h2>
          <p className="text-[14px] text-[var(--text-muted)] leading-relaxed">
            AI에게 코드 수정을 맡기거나
            <br />
            팀원과 함께 실시간으로 작업하세요
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setShowCreate(true)}
          className="px-6 h-11 text-[14px]"
        >
          <Plus size={16} />새 채팅방 만들기
        </Button>
      </div>

      {rooms.length > 0 && (
        <div className="mt-14 w-full max-w-lg px-8">
          <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold mb-4">
            채팅방 목록
          </p>
          <div className="flex flex-col gap-2">
            {rooms.slice(0, 6).map((room) => (
              <button
                key={room.id}
                onClick={() => router.push(`/rooms/${room.id}`)}
                className="flex items-center gap-4 px-6 py-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--accent-dim)] hover:bg-[var(--bg-elevated)] transition-all duration-150 text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center shrink-0">
                  <Hash size={17} className="text-[var(--accent)]" />
                </div>
                <span className="flex-1 text-[15px] font-medium text-[var(--text-primary)]">
                  {room.name}
                </span>
                <ArrowRight
                  size={17}
                  className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0"
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
