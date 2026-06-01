"use client";

import { useState } from "react";
import {
  Hash,
  Users,
  Bot,
  Wrench,
  ChevronDown,
  Mail,
  ExternalLink,
  Terminal,
  Cpu,
  Zap,
  MessageSquare,
} from "lucide-react";

const FAQ: { q: string; a: string }[] = [
  {
    q: "SyncAI는 어떤 서비스인가요?",
    a: "팀이 AI 에이전트와 함께 실시간으로 코드 작업을 수행할 수 있는 협업 플랫폼입니다. 채팅방에서 AI에게 명령을 내리면, AI가 실제 파일을 수정하고 결과를 팀원들과 공유합니다.",
  },
  {
    q: "AI에게 어떻게 작업을 맡기나요?",
    a: "/ai 명령어로 시작하는 메시지를 채팅방에 입력하면 됩니다. AI가 작업 계획을 제시하고, 확인 후 실행합니다.",
  },
  {
    q: "MCP 연결이란 무엇인가요?",
    a: "AI가 실제 파일 시스템에 접근할 수 있게 해주는 연결 설정입니다. 로컬 PC에 MCP 에이전트를 설치하면 AI가 직접 코드를 읽고 수정할 수 있습니다.",
  },
  {
    q: "팀원을 초대하려면 어떻게 하나요?",
    a: "좌측 사이드바의 초대 버튼을 클릭하거나, 채팅방 상단의 팀 멤버 버튼을 통해 이메일로 초대할 수 있습니다.",
  },
  {
    q: "팀은 몇 개까지 만들 수 있나요?",
    a: "현재 무료 플랜에서는 팀을 무제한으로 생성할 수 있습니다. 각 팀은 독립적인 채팅방과 멤버를 가집니다.",
  },
  {
    q: "AI 작업 결과는 어떻게 확인하나요?",
    a: "AI가 작업을 완료하면 채팅방에 변경된 파일 목록이 표시됩니다. 검토 후 직접 Git 커밋하거나 추가 수정을 요청할 수 있습니다.",
  },
];

const FEATURES = [
  { icon: Hash, title: "채팅방", desc: "팀 단위 채팅방 · AI와 팀원 공동 작업", color: "#818CF8", bg: "rgba(129,140,248,0.10)" },
  { icon: Bot, title: "AI 에이전트", desc: "/ai 명령으로 코드 수정·분석·문서 생성", color: "#C084FC", bg: "rgba(192,132,252,0.10)" },
  { icon: Wrench, title: "MCP 연결", desc: "로컬 파일 시스템을 AI에 직접 연결", color: "#34D399", bg: "rgba(52,211,153,0.10)" },
  { icon: Users, title: "팀 협업", desc: "팀원 초대 · 실시간 작업 공유", color: "#F59E0B", bg: "rgba(245,158,11,0.10)" },
];

const STEPS = [
  { icon: Zap, title: "팀 만들기", desc: "좌측 상단 ⚡ 버튼으로 새 팀 생성" },
  { icon: MessageSquare, title: "채팅방 개설", desc: "팀에 채팅방을 만들고 팀원 초대" },
  { icon: Cpu, title: "MCP 연결", desc: "인스톨러 실행으로 로컬 파일 접근 허용" },
  { icon: Terminal, title: "AI 명령 실행", desc: "채팅에서 /ai 명령으로 작업 위임" },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        className="w-full flex items-center justify-between py-3.5 text-left gap-4"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="text-[13px] font-medium"
          style={{ color: open ? "var(--accent)" : "var(--text)" }}
        >
          {q}
        </span>
        <span
          className="shrink-0 transition-transform duration-200"
          style={{
            color: open ? "var(--accent)" : "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <p className="text-[12.5px] pb-3.5 leading-relaxed" style={{ color: "var(--text-soft)" }}>
          {a}
        </p>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* 헤더 */}
        <div className="mb-7">
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
            도움말
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            사용법과 자주 묻는 질문
          </p>
        </div>

        <div className="flex flex-col gap-3">

          {/* ── 빠른 시작 ─────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 pt-4 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
                빠른 시작
              </p>
            </div>
            <div className="px-5 py-4">
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                      >
                        <Icon size={13} />
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="w-px flex-1 my-1" style={{ background: "var(--border)", minHeight: 16 }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < STEPS.length - 1 ? 14 : 0 }}>
                      <p className="text-[13px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
                        {step.title}
                      </p>
                      <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 주요 기능 ─────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 pt-4 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
                주요 기능
              </p>
            </div>
            <div className="p-4 grid grid-cols-2 gap-2">
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="rounded-xl p-3.5 transition-all duration-150 cursor-default"
                    style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderColor = f.color + "44";
                      el.style.background = f.bg;
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderColor = "var(--border)";
                      el.style.background = "var(--bg-elevated)";
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5"
                      style={{ background: f.bg, color: f.color }}
                    >
                      <Icon size={15} />
                    </div>
                    <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{f.title}</p>
                    <p className="text-[11.5px] mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── FAQ ───────────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 pt-4 pb-1">
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-faint)" }}>
                자주 묻는 질문
              </p>
            </div>
            <div className="px-5 pb-1">
              {FAQ.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

          {/* ── 문의 ─────────────────────────────────── */}
          <div
            className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-bg)" }}
              >
                <Mail size={14} style={{ color: "var(--accent)" }} />
              </div>
              <div>
                <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>해결되지 않은 문제가 있나요?</p>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>이메일로 문의하면 빠르게 답변드립니다</p>
              </div>
            </div>
            <a
              href="mailto:support@syncai.dev"
              className="inline-flex items-center gap-1.5 px-3.5 h-8 rounded-lg text-[12px] font-semibold transition-opacity duration-150 hover:opacity-85 shrink-0"
              style={{ background: "var(--accent)", color: "white" }}
            >
              문의하기
              <ExternalLink size={11} />
            </a>
          </div>

        </div>

        <p className="text-center text-[11px] mt-8" style={{ color: "var(--text-faint)" }}>
          SyncAI v1.0 · 더 나은 서비스를 위해 계속 업데이트됩니다
        </p>
      </div>
    </main>
  );
}
