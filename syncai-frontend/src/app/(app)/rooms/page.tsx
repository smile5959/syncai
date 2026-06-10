"use client";

import { useRouter } from "next/navigation";
import { Hash, Plus, ArrowRight, Zap, Bot, Cpu } from "lucide-react";
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
    <main className="flex-1 flex items-center justify-center overflow-y-auto bg-[var(--bg-base)] relative">

      {/* 배경 글로우 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] rounded-full bg-[var(--accent)] opacity-[0.04] blur-[100px]" />
      </div>

      <div className="flex flex-col w-full max-w-lg px-6 relative z-10">

        {/* 인사말 */}
        <div className="mb-8 text-center">
          <p className="text-[12px] font-medium text-[var(--accent)] tracking-widest uppercase mb-3">
            {team ? team.name : "SyncAI"}
          </p>
          <h1 className="text-[32px] font-bold text-[var(--text-primary)] tracking-tight">
            안녕하세요, {firstName}님 👋
          </h1>
          <p className="text-[14px] text-[var(--text-muted)] mt-2">
            오늘도 AI와 함께 빠르게 개발해보세요
          </p>
        </div>

        {rooms.length === 0 ? (
          <div className="flex flex-col gap-3">
            {/* 메인 CTA */}
            <button
              onClick={() => setShowCreate(true)}
              className="group relative flex flex-col items-center gap-4 p-8 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--accent)] transition-all duration-200 overflow-hidden"
            >
              {/* 호버 글로우 */}
              <div className="absolute inset-0 bg-gradient-to-b from-[var(--accent)] to-transparent opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300" />

              <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] flex items-center justify-center shadow-[0_0_32px_var(--accent-glow)]">
                <Zap size={24} className="text-white" fill="white" />
              </div>
              <div className="text-center">
                <p className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
                  첫 채팅방 만들기
                </p>
                <p className="text-[12.5px] text-[var(--text-muted)]">
                  팀원과 대화하고 AI로 코드를 바로 수정하세요
                </p>
              </div>
              <div className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-[13px] font-semibold shadow-[0_2px_16px_var(--accent-glow)] group-hover:shadow-[0_4px_24px_var(--accent-glow)] transition-shadow">
                <Plus size={14} />
                채팅방 만들기
              </div>
            </button>

            {/* 기능 힌트 2개 */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Bot size={15} />, title: "AI 코드 수정", desc: "/ai 명령으로 파일을 바로 수정" },
                { icon: <Cpu size={15} />, title: "MCP 연결", desc: "내 PC를 AI에 직접 연결" },
              ].map((f, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)]">
                  <div className="w-7 h-7 rounded-lg bg-[var(--accent-bg)] flex items-center justify-center text-[var(--accent)] shrink-0 mt-0.5">
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-[12.5px] font-semibold text-[var(--text-primary)]">{f.title}</p>
                    <p className="text-[11.5px] text-[var(--text-muted)] mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
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
