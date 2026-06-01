"use client";

import { useState } from "react";
import {
  Hash, Users, Bot, Wrench,
  ChevronDown, Mail, ExternalLink,
  Terminal, Cpu, Zap, MessageSquare,
} from "lucide-react";

const FAQ = [
  { q: "SyncAI는 어떤 서비스인가요?", a: "팀이 AI 에이전트와 함께 실시간으로 코드 작업을 수행할 수 있는 협업 플랫폼입니다. 채팅방에서 AI에게 명령을 내리면, AI가 실제 파일을 수정하고 결과를 팀원들과 공유합니다." },
  { q: "AI에게 어떻게 작업을 맡기나요?", a: "/ai 명령어로 시작하는 메시지를 채팅방에 입력하면 됩니다. AI가 작업 계획을 제시하고, 확인 후 실행합니다." },
  { q: "MCP 연결이란 무엇인가요?", a: "AI가 실제 파일 시스템에 접근할 수 있게 해주는 연결 설정입니다. 로컬 PC에 MCP 에이전트를 설치하면 AI가 직접 코드를 읽고 수정할 수 있습니다." },
  { q: "팀원을 초대하려면 어떻게 하나요?", a: "좌측 사이드바의 초대 버튼을 클릭하거나, 채팅방 상단의 팀 멤버 버튼을 통해 이메일로 초대할 수 있습니다." },
  { q: "팀은 몇 개까지 만들 수 있나요?", a: "현재 무료 플랜에서는 팀을 무제한으로 생성할 수 있습니다. 각 팀은 독립적인 채팅방과 멤버를 가집니다." },
  { q: "AI 작업 결과는 어떻게 확인하나요?", a: "AI가 작업을 완료하면 채팅방에 변경된 파일 목록이 표시됩니다. 검토 후 직접 Git 커밋하거나 추가 수정을 요청할 수 있습니다." },
];

const FEATURES = [
  { icon: Hash, title: "채팅방", desc: "팀 단위 채팅방 · AI와 팀원 공동 작업", color: "#818CF8", bg: "rgba(129,140,248,0.13)" },
  { icon: Bot, title: "AI 에이전트", desc: "/ai 명령으로 코드 수정·분석·문서 생성", color: "#C084FC", bg: "rgba(192,132,252,0.13)" },
  { icon: Wrench, title: "MCP 연결", desc: "로컬 파일 시스템을 AI에 직접 연결", color: "#34D399", bg: "rgba(52,211,153,0.13)" },
  { icon: Users, title: "팀 협업", desc: "팀원 초대 · 실시간 작업 공유", color: "#F59E0B", bg: "rgba(245,158,11,0.13)" },
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
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 0", textAlign: "left", gap: 16,
          background: "none", border: "none", cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 500, color: open ? "var(--accent)" : "var(--text)" }}>{q}</span>
        <span style={{ flexShrink: 0, color: open ? "var(--accent)" : "var(--text-muted)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <ChevronDown size={14} />
        </span>
      </button>
      {open && (
        <p style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--text-soft)", paddingBottom: 14 }}>{a}</p>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>

        {/* 헤더 */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", color: "var(--text)" }}>도움말</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>사용법과 자주 묻는 질문</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* 빠른 시작 */}
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)" }}>빠른 시작</p>
            </div>
            <div style={{ padding: "16px 18px" }}>
              {STEPS.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div key={i} style={{ display: "flex", gap: 14 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: 9,
                        background: "var(--accent-bg)", color: "var(--accent)",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      }}>
                        <Icon size={13} />
                      </div>
                      {i < STEPS.length - 1 && (
                        <div style={{ width: 1, flex: 1, background: "var(--border)", margin: "4px 0", minHeight: 14 }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < STEPS.length - 1 ? 14 : 0, paddingTop: 4 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>{step.title}</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>{step.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 주요 기능 */}
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)" }}>주요 기능</p>
            </div>
            <div style={{ padding: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {FEATURES.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    style={{
                      borderRadius: 12, padding: "14px",
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      transition: "all 0.15s",
                      cursor: "default",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderColor = f.color + "55";
                      el.style.background = f.bg;
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLDivElement;
                      el.style.borderColor = "var(--border)";
                      el.style.background = "var(--bg-elevated)";
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10,
                      background: f.bg, color: f.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      marginBottom: 10,
                      border: `1px solid ${f.color}33`,
                    }}>
                      <Icon size={15} />
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{f.title}</p>
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FAQ */}
          <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
            <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--border)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)" }}>자주 묻는 질문</p>
            </div>
            <div style={{ padding: "0 18px" }}>
              {FAQ.map((item) => <FaqItem key={item.q} q={item.q} a={item.a} />)}
            </div>
          </div>

          {/* 문의 */}
          <div style={{
            borderRadius: 14, padding: "16px 18px",
            background: "linear-gradient(135deg, var(--accent-bg) 0%, rgba(192,132,252,0.08) 100%)",
            border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Mail size={15} color="var(--accent)" />
              </div>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>해결되지 않은 문제가 있나요?</p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>이메일로 문의하면 빠르게 답변드립니다</p>
              </div>
            </div>
            <a
              href="mailto:support@syncai.dev"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 9,
                background: "var(--accent)", color: "white",
                fontSize: 12, fontWeight: 600, textDecoration: "none",
                flexShrink: 0, transition: "opacity 0.15s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "0.85"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.opacity = "1"; }}
            >
              문의하기
              <ExternalLink size={11} />
            </a>
          </div>

        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-faint)", marginTop: 32 }}>
          SyncAI v1.0 &middot; 더 나은 서비스를 위해 계속 업데이트됩니다
        </p>
      </div>
    </main>
  );
}
