"use client";

import { useRouter } from "next/navigation";
import { Hash, Plus, ArrowRight, Zap } from "lucide-react";
import { useRoomsStore } from "@/store/rooms";
import { useAuthStore } from "@/store/auth";

export default function RoomsPage() {
  const router = useRouter();
  const rooms = useRoomsStore((s) => s.rooms);
  const setShowCreate = useRoomsStore((s) => s.setShowCreate);
  const user = useAuthStore((s) => s.user);
  const team = useAuthStore((s) => s.team);

  const firstName = user?.name?.split(" ")[0] ?? "팀원";

  return (
    <main className="flex-1 flex items-center justify-center overflow-y-auto bg-[var(--bg-base)]">
      <div className="flex flex-col w-full max-w-xl px-6">

        {/* 헤더 */}
        <div className="mb-10">
          <p className="text-[12px] text-[var(--text-muted)] font-medium mb-1.5">
            {team ? team.name : "SyncAI"}
          </p>
          <h1 className="text-[24px] font-bold text-[var(--text-primary)] tracking-tight leading-snug">
            안녕하세요, {firstName}님 👋
          </h1>
        </div>

        {rooms.length === 0 ? (
          /* ── 빈 상태 ── */
          <div
            className="flex flex-col items-center justify-center gap-5 py-16 rounded-2xl border border-dashed border-[var(--border)] text-center cursor-pointer hover:border-[var(--accent-dim)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
            onClick={() => setShowCreate(true)}
          >
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-bg)] flex items-center justify-center">
              <Zap size={22} className="text-[var(--accent)]" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">
                첫 채팅방을 만들어보세요
              </p>
              <p className="text-[12.5px] text-[var(--text-muted)]">
                팀원과 대화하고 AI로 코드를 바꿔보세요
              </p>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-[13px] font-semibold shadow-[0_2px_12px_var(--accent-glow)]">
              <Plus size={14} />
              채팅방 만들기
            </div>
          </div>
        ) : (
          /* ── 채팅방 목록 ── */
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-semibold">
                채팅방 {rooms.length}개
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 text-[12px] text-[var(--accent)] font-medium hover:opacity-80 transition-opacity"
              >
                <Plus size={13} />새 채팅방
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => router.push(`/rooms/${room.slug ?? room.id}`)}
                  className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--accent-dim)] hover:bg-[var(--bg-elevated)] transition-all duration-150 text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--accent-bg)] flex items-center justify-center shrink-0">
                    <Hash size={14} className="text-[var(--accent)]" />
                  </div>
                  <span className="flex-1 text-[13.5px] font-medium text-[var(--text-primary)]">
                    {room.name}
                  </span>
                  <ArrowRight
                    size={14}
                    className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all shrink-0"
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
