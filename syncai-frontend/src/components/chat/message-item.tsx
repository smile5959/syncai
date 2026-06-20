"use client";

import { useState, useEffect } from "react";
import { cn, formatTime, getInitials } from "@/lib/utils";
import type { Message, AiPlanPayload, AiTask } from "@/types";
import { messages as messagesApi, mcpConfigs } from "@/lib/api";
import { Bot, Zap, Check, X, Loader2, ShieldCheck, ChevronDown, ChevronRight, Shield } from "lucide-react";

interface MessageItemProps {
  message: Message;
  showAvatar?: boolean;
  isMe?: boolean;
  roomId?: string;
  tasks?: AiTask[];
  isStreaming?: boolean;
  thinkingSteps?: string[];
  currentUserId?: string;
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

function AiPlanCard({ message, roomId, tasks, currentUserId }: { message: Message; roomId: string; tasks?: AiTask[]; currentUserId?: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "confirmed" | "cancelled">("idle");
  const [autoApproved, setAutoApproved] = useState(false);

  let plan: AiPlanPayload | null = null;
  try {
    plan = JSON.parse(message.content) as AiPlanPayload;
  } catch {
    return null;
  }

  const task = tasks?.find((t) => t.id === plan?.task_id);
  const taskStatus = task?.status;

  // 5분 이상 된 ai_plan은 만료 처리
  const isExpired = message.created_at
    ? Date.now() - new Date(message.created_at).getTime() > 5 * 60 * 1000
    : false;

  // plan.triggered_by를 기준으로 판단 — task 로드 여부와 무관하게 즉시 확정
  const isTriggerer = !currentUserId || plan.triggered_by === currentUserId;

  const showButtons =
    status !== "idle" ? false
    : isExpired ? false
    : !isTriggerer ? false
    : taskStatus === "awaiting_confirm" || taskStatus === "pending" || taskStatus === undefined;

  const showSuccess =
    status === "confirmed" ||
    taskStatus === "running" ||
    taskStatus === "completed";

  const handleConfirm = async (confirmed: boolean) => {
    if (status !== "idle" || !plan) return;
    setStatus("loading");
    try {
      await messagesApi.confirmAi(roomId, plan.task_id, confirmed, plan.composio_app);
      setStatus(confirmed ? "confirmed" : "cancelled");
    } catch {
      setStatus("idle");
    }
  };

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
          style={{ borderRadius: 12, padding: "14px 16px", maxWidth: 440 }}
        >
          {/* 접근 대상 배지 */}
          <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
            {plan.needs_mcp && (
              <div
                className="inline-flex items-center bg-[var(--accent)]/10 text-[var(--accent)]"
                style={{ borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}
              >
                <Zap size={10} style={{ marginRight: 4 }} fill="currentColor" />
                {plan.mcp_name ?? "PC"}
              </div>
            )}
            {plan.needs_composio && plan.composio_app && (
              <div
                className="inline-flex items-center bg-[var(--accent)]/10 text-[var(--accent)]"
                style={{ borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}
              >
                <Zap size={10} style={{ marginRight: 4 }} fill="currentColor" />
                {plan.composio_app.charAt(0).toUpperCase() + plan.composio_app.slice(1)}
              </div>
            )}
            {!plan.needs_mcp && !plan.needs_composio && (
              <div
                className="inline-flex items-center bg-[var(--accent)]/10 text-[var(--accent)]"
                style={{ borderRadius: 6, padding: "3px 8px", fontSize: 11, fontWeight: 600 }}
              >
                <Zap size={10} style={{ marginRight: 4 }} fill="currentColor" />
                PC
              </div>
            )}
          </div>

          {/* 접근 설명 */}
          <p
            className="text-[var(--text-primary)] leading-relaxed"
            style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}
          >
            {plan.confirmation_message || `${plan.task_title}하겠습니다`}
          </p>

          {/* 워커 커맨드 박스 */}
          {plan.task_plan && (
            <div
              style={{
                background: "var(--bg-elevated, rgba(0,0,0,0.15))",
                border: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: showButtons ? 12 : 8,
                fontFamily: "monospace",
                fontSize: 12,
                color: "var(--text-muted)",
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {plan.task_plan}
            </div>
          )}

          {showSuccess && (
            <p className="text-emerald-400" style={{ fontSize: 12, fontWeight: 500, marginTop: plan.task_plan ? 0 : 4 }}>
              ✓ 작업을 시작했어요
            </p>
          )}
          {status === "cancelled" && (
            <p className="text-[var(--text-muted)]" style={{ fontSize: 12 }}>
              취소했습니다
            </p>
          )}

          {/* 호출자에게만 버튼 표시 */}
          {showButtons && (
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => handleConfirm(false)}
                disabled={status === "loading"}
                className="flex items-center gap-1 text-[var(--text-muted)] border border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
                style={{ borderRadius: 7, padding: "5px 11px", fontSize: 12, background: "transparent", flex: 1, justifyContent: "center" }}
              >
                <X size={11} />
                거부
              </button>
              <button
                onClick={() => handleConfirm(true)}
                disabled={status === "loading"}
                className="flex items-center gap-1 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors disabled:opacity-50"
                style={{ borderRadius: 7, padding: "5px 11px", fontSize: 12, background: "transparent", flex: 1, justifyContent: "center" }}
              >
                {status === "loading" ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                이번만 허용
              </button>
              {plan.mcp_config_id && !autoApproved && (
                <button
                  onClick={async () => {
                    if (!plan.mcp_config_id) return;
                    await mcpConfigs.toggleAutoApprove(plan.mcp_config_id);
                    setAutoApproved(true);
                    handleConfirm(true);
                  }}
                  disabled={status === "loading"}
                  className="flex items-center gap-1 bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ borderRadius: 7, padding: "5px 11px", fontSize: 12, flex: 1, justifyContent: "center" }}
                >
                  <Shield size={11} />
                  항상 허용
                </button>
              )}
              {autoApproved && (
                <p style={{ fontSize: 12, color: "var(--accent)", alignSelf: "center" }}>✓ 자동 허용됨</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Thinking Panel ──────────────────────────────────────────────────────────

function shortenStep(step: string): string {
  // "파일 읽는 중: /long/path/file.txt" → "파일 읽는 중: file.txt"
  return step.replace(/(:\s*)(\/[^\s]+)/g, (_, prefix, path) => {
    const parts = path.split("/");
    return prefix + parts[parts.length - 1];
  });
}

function ThinkingPanel({ steps, isStreaming }: { steps: string[]; isStreaming: boolean }) {
  const [open, setOpen] = useState(isStreaming);

  useEffect(() => { if (isStreaming) setOpen(true); }, [isStreaming]);

  // 연속 중복 제거 + 경로 간소화
  const dedupedSteps = steps
    .filter((s, i) => s !== steps[i - 1])
    .map(shortenStep);

  if (dedupedSteps.length === 0 && !isStreaming) return null;

  const lastStep = dedupedSteps.length > 0 ? dedupedSteps[dedupedSteps.length - 1] : "작업 중...";

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
        {isStreaming ? lastStep : `작업 내역 ${dedupedSteps.length}단계`}
        <style>{"@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}"}</style>
      </button>
      {open && (
        <div style={{
          marginTop: 4, marginLeft: 2,
          borderLeft: "2px solid rgba(99,102,241,0.25)",
          paddingLeft: 12,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          {dedupedSteps.map((step, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: "50%", flexShrink: 0,
                background: i === dedupedSteps.length - 1 && isStreaming ? "var(--accent)" : "rgba(99,102,241,0.4)",
              }} />
              {step}
            </div>
          ))}
          {isStreaming && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
              <Loader2 size={9} style={{ animation: "spin 1s linear infinite", color: "var(--accent)", flexShrink: 0 }} />
              처리 중...
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function MessageItem({ message, showAvatar = true, isMe = false, roomId = "", tasks, isStreaming = false, thinkingSteps = [], currentUserId }: MessageItemProps) {
  const isAi = message.type === "ai_res";
  const isPlan = message.type === "ai_plan";
  const isCmd = message.type === "ai_cmd" || message.content.startsWith("/ai ");
  const userName = message.user?.name ?? "사용자";
  const userId = message.user_id ?? message.user?.name ?? "u";

  // ai_plan → 동의 요청 카드
  if (isPlan) {
    return <AiPlanCard message={message} roomId={roomId} tasks={tasks} currentUserId={currentUserId} />;
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
          {(thinkingSteps.length > 0 || isStreaming) && (
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
