"use client";

import { useState, useEffect } from "react";
import { cn, formatTime, getInitials } from "@/lib/utils";
import type { Message, AiPlanPayload, AiTask } from "@/types";
import { messages as messagesApi, mcpConfigs } from "@/lib/api";
import { Bot, Zap, Check, X, Loader2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";

interface MessageItemProps {
  message: Message;
  showAvatar?: boolean;
  isMe?: boolean;
  roomId?: string;
  tasks?: AiTask[];
  isStreaming?: boolean;
  thinkingSteps?: string[];
}

const AVATAR_GRADIENTS = [
  "from-indigo-500 to-violet-500",
  "from-violet-500 to-purple-500",
  "from-pink-500 to-rose-500",
  "from-cyan-500 to-blue-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-blue-500 to-indigo-500",
  "from-fuchsia-500 to-pink-500",
];

function getAvatarGradient(seed: string) {
  const hash = seed.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function Avatar({ name, userId }: { name: string; userId: string }) {
  const gradient = getAvatarGradient(userId || name);
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center shrink-0",
        "bg-gradient-to-br shadow-sm",
        gradient
      )}
      style={{ width: 36, height: 36 }}
    >
      <span className="text-[12px] font-bold text-white tracking-wide">
        {getInitials(name)}
      </span>
    </div>
  );
}

// ── AI Plan 메시지 (동의 요청 카드) ──────────────────────────────────────────

function AiPlanCard({ message, roomId, tasks }: { message: Message; roomId: string; tasks?: AiTask[] }) {
  const [status, setStatus] = useState<"idle" | "loading" | "confirmed" | "cancelled">("idle");
  const [autoApproved, setAutoApproved] = useState(false);

  let plan: AiPlanPayload | null = null;
  try {
    plan = JSON.parse(message.content) as AiPlanPayload;
  } catch {
    return null;
  }

  // task 상태로 버튼/결과 표시 결정
  const taskStatus = tasks?.find((t) => t.id === plan?.task_id)?.status;

  // 5분 이상 된 ai_plan은 만료 처리 (새로고침해도 이전 세션 확인창 안 뜸)
  const isExpired = message.created_at
    ? Date.now() - new Date(message.created_at).getTime() > 5 * 60 * 1000
    : false;

  // 버튼 표시 조건:
  // - 로컬에서 이미 클릭한 경우 → 숨김
  // - 5분 이상 된 ai_plan → 만료, 숨김 (이전 세션 확인창 방지)
  // - awaiting_confirm 상태 → 표시
  // - task가 목록에 없음(새로 생성된 직후) → 표시 (taskList 갱신 전)
  const showButtons =
    status !== "idle"
      ? false
      : isExpired
      ? false
      : taskStatus === "awaiting_confirm" || taskStatus === "pending" || taskStatus === undefined;

  // 성공 표시: 로컬 confirmed 또는 running/completed
  const showSuccess =
    status === "confirmed" ||
    taskStatus === "running" ||
    taskStatus === "completed";

  const handleConfirm = async (confirmed: boolean) => {
    if (status !== "idle" || !plan) return;
    setStatus("loading");
    try {
      await messagesApi.confirmAi(roomId, plan.task_id, confirmed);
      setStatus(confirmed ? "confirmed" : "cancelled");
    } catch {
      setStatus("idle");
    }
  };

  const isDone = !showButtons;

  return (
    <div
      className="group hover:bg-[var(--bg-surface)] transition-colors"
      style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "6px 20px 6px 28px", borderRadius: 16 }}
    >
      <div
        className="bg-gradient-to-br from-[var(--accent)] to-violet-600 flex items-center justify-center shrink-0 shadow-[0_0_14px_var(--accent-glow)]"
        style={{ width: 36, height: 36, borderRadius: "50%" }}
      >
        <Bot size={15} className="text-white" />
      </div>

      <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
        <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
          <span
            className="font-semibold bg-gradient-to-r from-[var(--accent)] to-violet-400 bg-clip-text text-transparent"
            style={{ fontSize: 13 }}
          >
            SyncAI
          </span>
          <span className="text-[var(--text-muted)]" style={{ fontSize: 11 }}>
            {formatTime(message.created_at)}
          </span>
        </div>

        <div
          className="border border-[var(--ai-border)] bg-[var(--ai-bubble)]"
          style={{ borderRadius: 12, padding: "12px 16px", maxWidth: 420 }}
        >
          {plan.mcp_name && (
            <div
              className="inline-flex items-center bg-[var(--accent)]/10 text-[var(--accent)]"
              style={{ borderRadius: 6, padding: "3px 8px", marginBottom: 8, fontSize: 11, fontWeight: 600 }}
            >
              <Zap size={10} style={{ marginRight: 4 }} fill="currentColor" />
              {plan.mcp_name}의 PC 접근 필요
            </div>
          )}

          <p
            className="text-[var(--text-primary)] leading-relaxed"
            style={{ fontSize: 13.5, marginBottom: isDone ? 0 : 12 }}
          >
            {plan.confirmation_message}
          </p>

          {showSuccess && (
            <p className="text-emerald-400" style={{ fontSize: 12, fontWeight: 500 }}>
              ✓ 작업을 시작했어요
            </p>
          )}
          {status === "cancelled" && (
            <p className="text-[var(--text-muted)]" style={{ fontSize: 12 }}>
              취소했습니다
            </p>
          )}

          {showButtons && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => handleConfirm(true)}
                  disabled={status === "loading"}
                  className="flex items-center gap-1.5 bg-[var(--accent)] text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ borderRadius: 8, padding: "6px 14px", fontSize: 13 }}
                >
                  {status === "loading" ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Check size={13} />
                  )}
                  진행할게요
                </button>
                <button
                  onClick={() => handleConfirm(false)}
                  disabled={status === "loading"}
                  className="flex items-center gap-1.5 text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                  style={{ borderRadius: 8, padding: "6px 14px", fontSize: 13, background: "transparent" }}
                >
                  <X size={13} />
                  취소
                </button>
              </div>
              {plan.mcp_config_id && !autoApproved && (
                <button
                  onClick={async () => {
                    if (!plan.mcp_config_id) return;
                    await mcpConfigs.toggleAutoApprove(plan.mcp_config_id);
                    setAutoApproved(true);
                    handleConfirm(true);
                  }}
                  className="flex items-center gap-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
                  style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 12, padding: "2px 0" }}
                >
                  <ShieldCheck size={12} />
                  이 PC는 항상 허용
                </button>
              )}
              {autoApproved && (
                <p style={{ fontSize: 12, color: "var(--accent)" }}>✓ 이제 이 PC는 자동으로 허용됩니다</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Thinking Panel ──────────────────────────────────────────────────────────

function ThinkingPanel({ steps, isStreaming }: { steps: string[]; isStreaming: boolean }) {
  const [open, setOpen] = useState(isStreaming);

  // 스트리밍 시작 시 자동 펼침
  useEffect(() => { if (isStreaming) setOpen(true); }, [isStreaming]);

  if (steps.length === 0 && !isStreaming) return null;

  return (
    <div style={{ marginBottom: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "none", border: "none",
          cursor: "pointer", fontSize: 12,
          color: isStreaming ? "var(--accent)" : "var(--text-muted)",
          fontWeight: 500, padding: "2px 0",
          transition: "color 0.15s",
        }}
      >
        {isStreaming
          ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite", color: "var(--accent)" }} />
          : open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {isStreaming
          ? (steps.length > 0 ? steps[steps.length - 1] : "작업 중...")
          : `작업 내역 ${steps.length}단계`}
        <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
      </button>
      {open && (
        <div style={{
          marginTop: 4, marginLeft: 2,
          borderLeft: "2px solid rgba(99,102,241,0.25)",
          paddingLeft: 12,
          display: "flex", flexDirection: "column", gap: 5,
        }}>
          {steps.map((step, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 7,
              fontSize: 11.5, color: "var(--text-muted)", lineHeight: 1.4,
            }}>
              <span style={{
                marginTop: 2, width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                background: i === steps.length - 1 && isStreaming ? "var(--accent)" : "rgba(99,102,241,0.4)",
              }} />
              {step}
            </div>
          ))}
          {isStreaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: "var(--text-muted)" }}>
              <Loader2 size={10} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", flexShrink: 0 }} />
              처리 중...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function MessageItem({ message, showAvatar = true, isMe = false, roomId = "", tasks, isStreaming = false, thinkingSteps = [] }: MessageItemProps) {
  const isAi = message.type === "ai_res";
  const isPlan = message.type === "ai_plan";
  const isCmd = message.type === "ai_cmd" || message.content.startsWith("/ai ");
  const userName = message.user?.name ?? "사용자";
  const userId = message.user_id ?? message.user?.name ?? "u";

  // ai_plan → 동의 요청 카드
  if (isPlan) {
    return <AiPlanCard message={message} roomId={roomId} tasks={tasks} />;
  }

  // /ai 커맨드 메시지 — 내가 보낸 것: 오른쪽, 타인이 보낸 것: 왼쪽
  if (isCmd) {
    if (isMe) {
      return (
        <div
          className="group"
          style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "4px 20px 4px 60px" }}
        >
          <div
            className="bg-[var(--accent)] text-white inline-flex items-center"
            style={{ gap: 10, borderRadius: "18px 18px 4px 18px", padding: "9px 14px", maxWidth: "70%" }}
          >
            <div
              className="bg-white/20 flex items-center justify-center shrink-0"
              style={{ width: 20, height: 20, borderRadius: 6 }}
            >
              <Zap size={10} className="text-white" fill="white" />
            </div>
            <span className="leading-relaxed whitespace-pre-wrap break-words" style={{ fontSize: 13.5 }}>
              {message.content.replace(/^\/ai\s*/, "")}
            </span>
          </div>
          <span className="text-[var(--text-muted)]" style={{ fontSize: 11, marginTop: 4 }}>
            {formatTime(message.created_at)}
          </span>
        </div>
      );    }
    // 타인의 /ai 커맨드 → 왼쪽
    return (
      <div
        className="group hover:bg-[var(--bg-surface)] transition-colors"
        style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "6px 20px 6px 28px", borderRadius: 16 }}
      >
        {showAvatar ? (
          <Avatar name={userName} userId={userId} />
        ) : (
          <div style={{ width: 36, flexShrink: 0 }} />
        )}
        <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
          {showAvatar && (
            <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
              <span className="font-semibold text-[var(--text-primary)]" style={{ fontSize: 13 }}>{userName}</span>
              <span className="text-[var(--text-muted)]" style={{ fontSize: 11 }}>{formatTime(message.created_at)}</span>
            </div>
          )}
          <div
            className="inline-flex items-center bg-[var(--ai-bubble)] border border-[var(--ai-border)]"
            style={{ gap: 10, borderRadius: 12, paddingLeft: 14, paddingRight: 14, paddingTop: 8, paddingBottom: 8 }}
          >
            <div
              className="bg-[var(--accent)] flex items-center justify-center shrink-0"
              style={{ width: 20, height: 20, borderRadius: 6 }}
            >
              <Zap size={10} className="text-white" fill="white" />
            </div>
            <span className="text-[var(--text-primary)] leading-relaxed" style={{ fontSize: 13.5 }}>
              {message.content.replace(/^\/ai\s*/, "")}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // AI 응답 메시지 (항상 왼쪽)
  if (isAi) {
    return (
      <div
        className="group hover:bg-[var(--bg-surface)] transition-colors"
        style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "6px 20px 6px 28px", borderRadius: 16 }}
      >
        <div
          className="bg-gradient-to-br from-[var(--accent)] to-violet-600 flex items-center justify-center shrink-0 shadow-[0_0_14px_var(--accent-glow)]"
          style={{ width: 36, height: 36, borderRadius: "50%", position: "relative" }}
        >
          <Bot size={15} className="text-white" />
          {isStreaming && (
            <span style={{
              position: "absolute", bottom: 1, right: 1,
              width: 8, height: 8, borderRadius: "50%",
              background: "var(--status-online)", boxShadow: "0 0 6px var(--status-online)",
              animation: "pulse 1.2s ease-in-out infinite",
            }} />
          )}
        </div>
        <div className="flex-1 min-w-0" style={{ paddingTop: 2 }}>
          <div className="flex items-center" style={{ gap: 8, marginBottom: 8 }}>
            <span
              className="font-semibold bg-gradient-to-r from-[var(--accent)] to-violet-400 bg-clip-text text-transparent"
              style={{ fontSize: 13 }}
            >
              SyncAI
            </span>
            <span className="text-[var(--text-muted)]" style={{ fontSize: 11 }}>{formatTime(message.created_at)}</span>
          </div>
          {thinkingSteps.length > 0 && (
            <ThinkingPanel steps={thinkingSteps} isStreaming={isStreaming} />
          )}
          <div className="border-l-2 border-[var(--ai-border)]" style={{ paddingLeft: 14 }}>
            <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap" style={{ fontSize: 13.5 }}>
              {message.content}
              {isStreaming && (
                <span style={{
                  display: "inline-block", width: 2, height: "1em",
                  background: "var(--accent)", marginLeft: 2,
                  verticalAlign: "text-bottom",
                  animation: "blink 1s step-end infinite",
                }} />
              )}
            </p>
          </div>
        </div>
        <style>{"@keyframes blink{0%,100%{opacity:1}50%{opacity:0}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}"}</style>
      </div>
    );
  }

  // 내 메시지 (오른쪽)
  if (isMe) {
    return (
      <div
        className="group"
        style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", padding: "4px 20px 4px 60px" }}
      >
        <div
          className="bg-[var(--accent)] text-white"
          style={{ borderRadius: "18px 18px 4px 18px", padding: "9px 14px", maxWidth: "70%" }}
        >
          <p className="leading-relaxed whitespace-pre-wrap break-words" style={{ fontSize: 13.5 }}>
            {message.content}
          </p>
        </div>
        <span className="text-[var(--text-muted)]" style={{ fontSize: 11, marginTop: 4 }}>
          {formatTime(message.created_at)}
        </span>
      </div>
    );
  }

  // 상대방 메시지 (왼쪽)
  return (
    <div
      className="group"
      style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "4px 60px 4px 20px" }}
    >
      {showAvatar ? (
        <Avatar name={userName} userId={userId} />
      ) : (
        <div style={{ width: 36, flexShrink: 0 }} />
      )}
      <div style={{ paddingTop: 2, maxWidth: "70%" }}>
        {showAvatar && (
          <span className="font-semibold text-[var(--text-primary)]" style={{ fontSize: 12, marginBottom: 4, display: "block" }}>
            {userName}
          </span>
        )}
        <div
          className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
          style={{ borderRadius: "18px 18px 18px 4px", padding: "9px 14px", display: "inline-block" }}
        >
          <p className="text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words" style={{ fontSize: 13.5 }}>
            {message.content}
          </p>
        </div>
        <span className="text-[var(--text-muted)]" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
