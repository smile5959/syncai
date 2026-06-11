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
          <div className="flex flex-col items-center gap-7">
            {/* 아이콘 */}
            <div
              style={{
                width: 52, height: 52, borderRadius: 16,
                background: "var(--accent-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Zap size={22} style={{ color: "var(--accent)" }} />
            </div>

            {/* 텍스트 */}
            <div className="text-center">
              <p style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, letterSpacing: "-0.01em" }}>
                첫 채팅방을 만들어보세요
              </p>
              <p style={{ fontSize: 13.5, color: "var(--text-muted)", lineHeight: 1.7 }}>
                팀원과 대화하고, AI로 코드를 바로 수정할 수 있어요
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 transition-opacity hover:opacity-80 active:scale-[0.98]"
              style={{
                padding: "10px 24px",
                borderRadius: 12,
                background: "var(--accent)",
                color: "white",
                fontSize: 13.5, fontWeight: 600,
                border: "none", cursor: "pointer",
                letterSpacing: "-0.01em",
              }}
            >
              <Plus size={15} />
              채팅방 만들기
            </button>

            {/* 기능 힌트 */}
            <div
              className="flex items-center gap-6 mt-1"
              style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: 20, width: "100%" }}
            >
              {[
                { icon: <Bot size={13} />, text: "/ai 명령으로 코드 수정" },
                { icon: <Cpu size={13} />, text: "MCP로 내 PC 직접 연결" },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-2 flex-1 justify-center">
                  <span style={{ color: "var(--text-muted)", display: "flex" }}>{f.icon}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{f.text}</span>
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
