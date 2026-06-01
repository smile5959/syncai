"use client";

import { useState } from "react";
import {
  HelpCircle,
  Zap,
  Hash,
  Users,
  Bot,
  Wrench,
  ChevronDown,
  ChevronUp,
  Mail,
  ExternalLink,
} from "lucide-react";

// ─── FAQ 데이터 ─────────────────────────────────────────

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
    a: "좌측 사이드바의 초대 버튼(벨 아이콘 옆)을 클릭하거나, 채팅방 상단의 팀 멤버 버튼을 통해 이메일로 초대할 수 있습니다.",
  },
  {
    q: "팀은 몇 개까지 만들 수 있나요?",
    a: "현재 무료 플랜에서는 팀을 무제한으로 생성할 수 있습니다. 각 팀은 독립적인 채팅방과 멤버를 가집니다.",
  },
  {
    q: "AI 작업 결과는 어떻게 확인하나요?",
    a: "AI가 작업을 완료하면 채팅방에 변경된 파일 목록(diff)이 표시됩니다. 변경 사항을 검토한 후 직접 Git 커밋하거나 추가 수정을 요청할 수 있습니다.",
  },
];

// ─── 기능 카드 데이터 ────────────────────────────────────

const FEATURES = [
  {
    icon: <Hash size={18} />,
    title: "채팅방",
    desc: "팀 단위로 채팅방을 만들고, AI와 팀원이 함께 작업 흐름을 공유합니다.",
  },
  {
    icon: <Bot size={18} />,
    title: "AI 에이전트",
    desc: "@ai 명령으로 코드 수정, 버그 분석, 문서 생성 등 다양한 작업을 AI에게 위임하세요.",
  },
  {
    icon: <Wrench size={18} />,
    title: "MCP 연결",
    desc: "로컬 파일 시스템과 AI를 연결해 실제 프로젝트에서 바로 작업할 수 있습니다.",
  },
  {
    icon: <Users size={18} />,
    title: "팀 협업",
    desc: "팀원 초대, 역할 관리, 실시간 작업 공유로 함께 개발하세요.",
  },
];

// ─── FAQ 아이템 ─────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <button
        className="w-full flex items-center justify-between py-4 text-left gap-4"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="text-[14px] font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {q}
        </span>
        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
      {open && (
        <p
          className="text-[14px] pb-4 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          {a}
        </p>
      )}
    </div>
  );
}

// ─── 메인 ───────────────────────────────────────────────

export default function HelpPage() {
  return (
    <main
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8">
          <h1
            className="text-[24px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            도움말
          </h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--text-muted)" }}>
            SyncAI 사용법과 자주 묻는 질문을 확인하세요
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* ── 빠른 시작 ─────────────────────────────── */}
          <div
            className="rounded-2xl border p-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 mb-5">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              >
                <Zap size={16} />
              </span>
              <h2
                className="text-[15px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                빠른 시작
              </h2>
            </div>
            <ol className="flex flex-col gap-3">
              {[
                "좌측 상단 ⚡ 버튼으로 팀을 만드세요",
                "채팅방을 생성하고 팀원을 초대하세요",
                "MCP 에이전트를 연결해 로컬 파일 접근을 허용하세요",
                "채팅방에서 @ai 명령으로 AI에게 작업을 맡기세요",
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0 mt-0.5"
                    style={{
                      background: "var(--accent-bg)",
                      color: "var(--accent)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className="text-[14px] leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* ── 주요 기능 ─────────────────────────────── */}
          <div
            className="rounded-2xl border p-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 mb-5">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              >
                <HelpCircle size={16} />
              </span>
              <h2
                className="text-[15px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                주요 기능
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {FEATURES.map((f) => (
                <div
                  key={f.title}
                  className="rounded-xl p-4 border"
                  style={{
                    background: "var(--bg-elevated)",
                    borderColor: "var(--border)",
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                    style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                  >
                    {f.icon}
                  </div>
                  <p
                    className="text-[14px] font-semibold mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {f.title}
                  </p>
                  <p
                    className="text-[12px] leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {f.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ── FAQ ───────────────────────────────────── */}
          <div
            className="rounded-2xl border p-6"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              >
                <HelpCircle size={16} />
              </span>
              <h2
                className="text-[15px] font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                자주 묻는 질문
              </h2>
            </div>
            <div>
              {FAQ.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </div>

          {/* ── 문의 ─────────────────────────────────── */}
          <div
            className="rounded-2xl border p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-3">
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
              >
                <Mail size={16} />
              </span>
              <div>
                <p
                  className="text-[14px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  해결되지 않은 문제가 있나요?
                </p>
                <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  이메일로 문의하면 빠르게 답변드립니다
                </p>
              </div>
            </div>
            <a
              href="mailto:support@syncai.dev"
              className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-[13px] font-medium transition-all duration-150 shrink-0"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent-dim)",
              }}
            >
              문의하기
              <ExternalLink size={13} />
            </a>
          </div>
        </div>

        <p
          className="text-center text-[12px] mt-8"
          style={{ color: "var(--text-muted)" }}
        >
          SyncAI v1.0 · 더 나은 서비스를 위해 계속 업데이트됩니다
        </p>
      </div>
    </main>
  );
}
