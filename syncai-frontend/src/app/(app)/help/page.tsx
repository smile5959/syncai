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

// ── FAQ ───────────────────────────────────────────────
const FAQ: { q: string; a: string }[] = [
  {
    q: "SyncAI는 어떤 서비스인가요?",
    a: "SyncAI는 팀이 AI 에이전트와 함께 실시간으로 코드 작업을 수행할 수 있는 협업 플랫폼입니다. 채팅방에서 AI에게 명령을 내리면, AI가 실제 파일을 수정하고 결과를 팀원들과 공유합니다.",
  },
  {
    q: "AI에게 어떻게 작업을 맡기나요?",
    a: "@ai 또는 /ai 명령어로 시작하는 메시지를 채팅방에 입력하면 됩니다. AI가 작업 계획을 제시하고, 확인 후 실행합니다.",
  },
  {
    q: "MCP 연결이란 무엇인가요?",
    a: "MCP(Model Context Protocol)는 AI가 실제 파일 시스템과 도구에 접근할 수 있게 해주는 연결 설정입니다. 로컬 PC에 MCP 에이전트를 설치하고 연결하면 AI가 직접 코드를 읽고 수정할 수 있습니다.",
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
    a: "AI가 작업을 완료하면 채팅방에 변경된 파일 목록이 표시됩니다. 변경 사항을 검토한 후 직접 Git 커밋하거나 추가 수정을 요청할 수 있습니다.",
  },
];

// ── 주요 기능 ─────────────────────────────────────────
const FEATURES = [
  {
    icon: <Hash size={18} />,
    title: "채팅방",
    desc: "팀 단위로 채팅방을 만들고, AI와 팀원이 함께 작업 흐름을 공유합니다.",
    color: "#818CF8",
    bg: "rgba(129,140,248,0.12)",
  },
  {
    icon: <Bot size={18} />,
    title: "AI 에이전트",
    desc: "@ai 명령으로 코드 수정, 버그 분석, 문서 생성 등 다양한 작업을 위임하세요.",
    color: "#C084FC",
    bg: "rgba(192,132,252,0.12)",
  },
  {
    icon: <Wrench size={18} />,
    title: "MCP 연결",
    desc: "로컬 파일 시스템과 AI를 연결해 실제 프로젝트에서 바로 작업합니다.",
    color: "#34D399",
    bg: "rgba(52,211,153,0.12)",
  },
  {
    icon: <Users size={18} />,
    title: "팀 협업",
    desc: "팀원 초대, 실시간 작업 공유로 함께 개발하세요.",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.12)",
  },
];

// ── 빠른 시작 스텝 ────────────────────────────────────
const STEPS = [
  {
    icon: <Zap size={15} />,
    title: "팀 만들기",
    desc: "좌측 상단 ⚡ 버튼으로 새 팀을 생성하세요",
  },
  {
    icon: <MessageSquare size={15} />,
    title: "채팅방 개설",
    desc: "팀에 채팅방을 만들고 팀원을 초대하세요",
  },
  {
    icon: <Cpu size={15} />,
    title: "MCP 연결",
    desc: "인스톨러를 실행해 로컬 파일 접근을 허용하세요",
  },
  {
    icon: <Terminal size={15} />,
    title: "AI 명령 실행",
    desc: "채팅에서 /ai로 시작하는 메시지를 입력하세요",
  },
];

// ── FAQ 아이템 ────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button
        className="w-full flex items-center justify-between py-4 text-left gap-4 group"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="text-[14px] font-medium transition-colors duration-150"
          style={{ color: open ? "var(--accent)" : "var(--text-primary)" }}
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
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <p
          className="text-[13px] pb-4 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {a}
        </p>
      )}
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────
export default function HelpPage() {
  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-2xl mx-auto px-6 py-10">

        {/* ── 히어로 배너 ──────────────────────────────── */}
        <div
          className="relative rounded-2xl overflow-hidden mb-6 px-7 py-8"
          style={{
            background: "var(--gradient-accent-soft)",
            border: "1px solid var(--border)",
          }}
        >
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "radial-gradient(circle at 90% 10%, var(--accent) 0%, transparent 50%), radial-gradient(circle at 10% 90%, var(--accent-violet) 0%, transparent 50%)",
            }}
          />
          <div className="relative">
            <div
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
            >
              <Zap size={10} />
              도움말
            </div>
            <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              SyncAI 사용 가이드
            </h1>
            <p className="text-[13px] mt-1.5" style={{ color: "var(--text-muted)" }}>
              빠른 시작부터 고급 기능까지, 필요한 모든 것을 찾아보세요
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {/* ── 빠른 시작 ─────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                빠른 시작
              </p>
            </div>
            <div className="p-5">
              <div className="flex flex-col gap-0">
                {STEPS.map((step, i) => (
                  <div key={i} className="flex gap-4">
                    {/* 타임라인 라인 */}
                    <div className="flex flex-col items-center">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 z-10"
                        style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                      >
                        {step.icon}
                      </div>
                      {i < STEPS.length - 1 && (
                        <div
                          className="w-px flex-1 my-1"
                          style={{ background: "var(--border)", minHeight: "20px" }}
                        />
                      )}
                    </div>
                    {/* 내용 */}
                    <div className={`pb-${i < STEPS.length - 1 ? "4" : "0"} pt-1 flex-1`}
                      style={{ paddingBottom: i < STEPS.length - 1 ? "16px" : "0" }}
                    >
                      <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                        {step.title}
                      </p>
                      <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {step.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── 주요 기능 ─────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                주요 기능
              </p>
            </div>
            <div className="p-5 grid grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl p-4 transition-all duration-200 cursor-default"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = f.color + "55";
                    (e.currentTarget as HTMLDivElement).style.background = f.bg;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
                    (e.currentTarget as HTMLDivElement).style.background = "var(--bg-elevated)";
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: f.bg, color: f.color }}
                  >
                    {f.icon}
                  </div>
                  <p className="text-[13px] font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
                    {f.title}
                  </p>
                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── FAQ ───────────────────────────────────── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                자주 묻는 질문
              </p>
            </div>
            <div className="px-5">
              {FAQ.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

          {/* ── 문의 ─────────────────────────────────── */}
          <div
            className="rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{
              background: "var(--gradient-accent-soft)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              >
                <Mail size={16} />
              </div>
              <div>
                <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  해결되지 않은 문제가 있나요?
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  이메일로 문의하면 빠르게 답변드립니다
                </p>
              </div>
            </div>
            <a
              href="mailto:support@syncai.dev"
              className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all duration-150 shrink-0 hover:opacity-90"
              style={{
                background: "var(--accent)",
                color: "white",
              }}
            >
              문의하기
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <p className="text-center text-[12px] mt-8" style={{ color: "var(--text-muted)" }}>
          SyncAI v1.0 · 더 나은 서비스를 위해 계속 업데이트됩니다
        </p>
      </div>
    </main>
  );
}
