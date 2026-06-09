"use client";

import { useRouter } from "next/navigation";
import { Hash, Plus, Zap, ArrowRight, MessageSquare, Code2, Sparkles } from "lucide-react";
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
    <main className="flex-1 flex flex-col overflow-y-auto bg-[var(--bg-base)]">
      <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-6 py-16">

        {/* 헤더 */}
        <div className="flex flex-col items-center gap-5 text-center mb-12">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-[0_0_40px_var(--accent-glow)]">
              <Zap size={28} className="text-white" fill="white" />
            </div>
            <div className="absolute inset-0 rounded-2xl bg-[var(--accent)] opacity-20 blur-xl animate-pulse" />
          </div>
          <div>
            <h1 className="text-[28px] font-bold text-[var(--text-primary)] tracking-tight leading-snug">
              안녕하세요, {firstName}님
            </h1>
            <p className="text-[14px] text-[var(--text-muted)] mt-1.5">
              {team ? `${team.name} 팀` : "SyncAI"}에 오신 걸 환영합니다
            </p>
          </div>
        </div>

        {/* 빈 상태 */}
        {rooms.length === 0 ? (
          <div className="flex flex-col items-center gap-8 w-full">
            {/* 기능 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
              {[
                { icon: <Code2 size={16} />, title: "코드 자동 수정", desc: "자연어로 요청하면 PR로 도착해요" },
                { icon: <MessageSquare size={16} />, title: "팀 채팅", desc: "채팅방에서 팀원과 실시간 협업" },
                { icon: <Sparkles size={16} />, title: "AI 맥락 이해", desc: "레포 전체를 읽고 의도에 맞게 수정" },
              ].map((f, i) => (
                <div
                  key={i}
                  className="flex flex-col gap-3 p-5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center text-[var(--accent)]">
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[var(--text-primary)]">{f.title}</p>
                    <p className="text-[12px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[var(--accent)] text-white text-[14px] font-semibold hover:opacity-90 transition-opacity shadow-[0_4px_16px_var(--accent-glow)]"
            >
              <Plus size={16} />
              첫 번째 채팅방 만들기
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-6 w-full">
            {/* 채팅방 목록 */}
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

            <div className="flex flex-col gap-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => router.push(`/rooms/${room.slug ?? room.id}`)}
                  className="flex items-center gap-4 px-5 py-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--accent-dim)] hover:bg-[var(--bg-elevated)] transition-all duration-150 text-left group"
                >
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center shrink-0">
                    <Hash size={16} className="text-[var(--accent)]" />
                  </div>
                  <span className="flex-1 text-[14px] font-medium text-[var(--text-primary)]">
                    {room.name}
                  </span>
                  <ArrowRight
                    size={15}
                    className="text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors shrink-0"
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
