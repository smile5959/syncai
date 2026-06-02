"use client";

import { useState } from "react";
import { formatTime } from "@/lib/utils";
import {
  CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronRight,
  Loader2, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { tasks as tasksApi } from "@/lib/api";
import type { AiTask, Worker, Message } from "@/types";

interface TaskProgress {
  task_id: string;
  progress: number;
  message: string;
}

interface WorkerPanelProps {
  workers: Worker[];
  tasks: AiTask[];
  msgs?: Message[];
  activeProgress: TaskProgress | null;
  onRevert?: (taskId: string) => void;
}

export function WorkerPanel({ workers, tasks, msgs = [], activeProgress, onRevert }: WorkerPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  const idleCount = workers.filter((w) => w.status === "idle").length;
  const busyCount = workers.filter((w) => w.status === "busy").length;

  async function handleRevert(taskId: string) {
    setReverting(taskId);
    try {
      await tasksApi.revert(taskId);
      onRevert?.(taskId);
    } catch (e) {
      console.error(e);
    } finally {
      setReverting(null);
    }
  }

  function getCommand(task: AiTask): string {
    const raw = task.command ?? msgs.find((m) => m.id === task.message_id)?.content ?? "";
    const c = raw.replace(/^\/ai\s*/i, "").trim() || "AI 작업";
    return c.length > 55 ? c.slice(0, 55) + "…" : c;
  }

  function getErrorText(task: AiTask): string {
    if (!task.error) return "";
    const e = task.error
      .replace(/Error code: \d+ - \[.*?'message': '/g, "")
      .replace(/'.*$/g, "")
      .replace(/MCP endpoint 없음[:：]\s*/i, "MCP 오프라인")
      .replace(/MCP 오프라인[:：]\s*/i, "MCP 오프라인")
      .trim();
    return e.length > 60 ? e.slice(0, 60) + "…" : e;
  }

  const sorted = [...tasks]
    .filter((t) => t.result_diff || t.error || t.status === "running")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);

  return (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%",
      borderLeft: "1px solid var(--border-subtle)",
      background: "var(--bg-surface)",
      overflow: "hidden",
      minWidth: 260,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Worker
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            {idleCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: "#4ade80",
                background: "rgba(74,222,128,0.1)", borderRadius: 6,
                padding: "2px 7px", border: "1px solid rgba(74,222,128,0.2)",
              }}>
                대기 {idleCount}
              </span>
            )}
            {busyCount > 0 && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: "var(--accent)",
                background: "rgba(99,102,241,0.1)", borderRadius: 6,
                padding: "2px 7px", border: "1px solid rgba(99,102,241,0.2)",
              }}>
                작업 {busyCount}
              </span>
            )}
          </div>
        </div>

        {workers.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Worker 슬롯이 없어요.<br />팀 설정에서 추가하세요.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {workers.map((w) => {
              const isBusy = w.status === "busy";
              return (
                <div key={w.id} style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 10px", borderRadius: 8,
                  background: isBusy ? "rgba(99,102,241,0.06)" : "var(--bg-elevated)",
                  border: `1px solid ${isBusy ? "rgba(99,102,241,0.15)" : "var(--border-subtle)"}`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: isBusy ? "var(--accent)" : "#4ade80",
                    boxShadow: isBusy ? "0 0 6px var(--accent)" : "0 0 5px #4ade80",
                  }} />
                  <span style={{ fontSize: 12, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {w.name}
                  </span>
                  {isBusy && <Loader2 size={11} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", flexShrink: 0 }} />}
                </div>
              );
            })}
          </div>
        )}

        {/* 진행 바 */}
        {activeProgress && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {activeProgress.message}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0, marginLeft: 6 }}>{activeProgress.progress}%</span>
            </div>
            <div style={{ height: 3, background: "rgba(99,102,241,0.12)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${activeProgress.progress}%`,
                background: "var(--accent)", borderRadius: 99,
                transition: "width 0.4s ease",
              }} />
            </div>
          </div>
        )}
      </div>

      {/* 작업 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
        {sorted.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 140, gap: 8 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: "rgba(99,102,241,0.08)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap size={14} style={{ color: "var(--accent)" }} />
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
              {workers.length === 0
                ? "MCP 연결 후\n/ai 명령으로 시작하세요"
                : "/ai 명령을 사용하면\n여기에 작업 내역이 쌓여요"}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {sorted.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                command={getCommand(task)}
                errorText={getErrorText(task)}
                expanded={expandedId === task.id}
                onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                onRevert={() => handleRevert(task.id)}
                reverting={reverting === task.id}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </aside>
  );
}

// ─── Task Card ───────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: AiTask;
  command: string;
  errorText: string;
  expanded: boolean;
  onToggle: () => void;
  onRevert: () => void;
  reverting: boolean;
}

function TaskCard({ task, command, errorText, expanded, onToggle, onRevert, reverting }: TaskCardProps) {
  const hasDiff = !!task.result_diff;

  type StatusKey = "completed" | "failed" | "running" | "pending" | "awaiting_confirm" | "cancelled";
  const STATUS_CONFIG: Record<StatusKey, { dot: string; label: string; labelColor: string; cardBorder: string }> = {
    completed:       { dot: "#4ade80", label: "완료",     labelColor: "#4ade80",            cardBorder: "rgba(34,197,94,0.15)" },
    failed:          { dot: "#f87171", label: "실패",     labelColor: "#f87171",            cardBorder: "rgba(239,68,68,0.15)" },
    running:         { dot: "var(--accent)", label: "진행중", labelColor: "var(--accent)",  cardBorder: "rgba(99,102,241,0.2)" },
    pending:         { dot: "var(--accent)", label: "대기중", labelColor: "var(--accent)",  cardBorder: "rgba(99,102,241,0.12)" },
    awaiting_confirm:{ dot: "#facc15", label: "동의 필요", labelColor: "#facc15",           cardBorder: "rgba(234,179,8,0.18)" },
    cancelled:       { dot: "var(--text-muted)", label: "취소", labelColor: "var(--text-muted)", cardBorder: "var(--border-subtle)" },
  };

  const cfg = STATUS_CONFIG[task.status as StatusKey] ?? STATUS_CONFIG.pending;

  return (
    <div style={{ borderRadius: 9, border: `1px solid ${cfg.cardBorder}`, overflow: "hidden", background: "var(--bg-base)" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center",
          gap: 9, padding: "9px 11px", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: cfg.dot,
          boxShadow: task.status === "running" ? `0 0 5px ${cfg.dot}` : "none",
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {command}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
              {formatTime(task.completed_at ?? task.created_at)}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 2 }}>
            <span style={{ fontSize: 10, color: cfg.labelColor, fontWeight: 600 }}>{cfg.label}</span>
            {errorText ? (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>· {errorText}</span>
            ) : hasDiff ? (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>· 파일 변경됨</span>
            ) : null}
          </div>
        </div>

        {hasDiff && (
          <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </button>

      {expanded && hasDiff && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <DiffViewer diff={task.result_diff!} />
          {task.status === "completed" && (
            <div style={{ padding: "0 11px 11px" }}>
              <Button
                variant="outline"
                size="sm"
                style={{ width: "100%", fontSize: 11, height: 28 }}
                onClick={onRevert}
                loading={reverting}
              >
                <RotateCcw size={10} />
                되돌리기
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <div style={{ maxHeight: 200, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: "19px", padding: "10px 12px", background: "var(--bg-base)" }}>
      {lines.map((line, i) => {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        const isRemoved = line.startsWith("-") && !line.startsWith("---");
        const isHeader = line.startsWith("@@") || line.startsWith("diff");
        return (
          <div key={i} style={{
            color: isAdded ? "#4ade80" : isRemoved ? "#f87171" : isHeader ? "var(--accent)" : "var(--text-secondary)",
            background: isAdded ? "rgba(34,197,94,0.06)" : isRemoved ? "rgba(239,68,68,0.06)" : "transparent",
            whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}

