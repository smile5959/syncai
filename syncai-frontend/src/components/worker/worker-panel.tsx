"use client";

import { useState } from "react";
import { formatTime } from "@/lib/utils";
import {
  CheckCircle2, XCircle, RotateCcw, ChevronDown, ChevronRight,
  Clock, Cpu, Loader2, Zap, Circle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    // "/ai " 접두사 제거
    const c = raw.replace(/^\/ai\s*/i, "").trim() || "AI 작업";
    return c.length > 60 ? c.slice(0, 60) + "…" : c;
  }

  function getErrorText(task: AiTask): string {
    if (!task.error) return "";
    return task.error
      .replace(/MCP endpoint 없음[:：]\s*/i, "MCP 오프라인 — ")
      .replace(/MCP 오프라인[:：]\s*/i, "MCP 오프라인 — ")
      .slice(0, 60);
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
      minWidth: 280,
    }}>
      {/* Header — Worker 슬롯 현황 */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border-subtle)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Worker 슬롯
          </span>
          {workers.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {idleCount > 0 && (
                <Badge variant="green" dot>{`idle ${idleCount}`}</Badge>
              )}
              {busyCount > 0 && (
                <Badge variant="default" dot>{`busy ${busyCount}`}</Badge>
              )}
            </div>
          )}
        </div>

        {workers.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Worker 슬롯이 없어요<br />
            <span style={{ fontSize: 11 }}>팀 설정에서 슬롯을 추가하세요</span>
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {workers.map((w) => (
              <div key={w.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
                borderRadius: 10,
                padding: "7px 12px",
              }}>
                <Circle
                  size={8}
                  fill={w.status === "idle" ? "#4ade80" : "var(--accent)"}
                  style={{ color: w.status === "idle" ? "#4ade80" : "var(--accent)", flexShrink: 0 }}
                />
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {w.name}
                </span>
                <span style={{ fontSize: 11, color: w.status === "idle" ? "#4ade80" : "var(--accent)", fontWeight: 600 }}>
                  {w.status === "idle" ? "대기" : "작업중"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 진행 중인 작업 — 실시간 WS */}
      {activeProgress && (
        <div style={{
          margin: "12px 12px 0",
          background: "rgba(99,102,241,0.06)",
          border: "1px solid rgba(99,102,241,0.2)",
          borderRadius: 14,
          padding: "14px 16px",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Loader2 size={13} style={{ color: "var(--accent)", animation: "spin 1s linear infinite" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)" }}>작업 중</span>
          </div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10, lineHeight: 1.5 }}>
            {activeProgress.message}
          </p>
          <div style={{ width: "100%", height: 4, background: "rgba(99,102,241,0.15)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${activeProgress.progress}%`,
              background: "var(--accent)",
              borderRadius: 99,
              transition: "width 0.5s ease",
            }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, textAlign: "right" }}>
            {activeProgress.progress}%
          </p>
        </div>
      )}

      {/* /ai 사용 힌트 */}
      {workers.length > 0 && !activeProgress && sorted.length === 0 && (
        <div style={{
          margin: "12px 12px 0",
          background: "rgba(99,102,241,0.04)",
          border: "1px solid rgba(99,102,241,0.12)",
          borderRadius: 14,
          padding: "12px 16px",
          flexShrink: 0,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "rgba(99,102,241,0.12)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <Zap size={13} style={{ color: "var(--accent)" }} />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>
            <code style={{ color: "var(--accent)", fontWeight: 600 }}>/ai</code> 명령을 사용하면<br />여기에 작업 내역이 쌓여요
          </p>
        </div>
      )}

      {/* 작업 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px" }}>
        {sorted.length === 0 && workers.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 160, gap: 10 }}>
            <Clock size={22} style={{ color: "var(--text-muted)" }} />
            <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
              MCP를 연결하고<br />/ai 명령으로 시작해보세요
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </aside>
  );
}

// ─── Task Card ──────────────────────────────────────────────

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

  const config = {
    completed: {
      border: "rgba(34,197,94,0.2)", bg: "rgba(34,197,94,0.04)", iconBg: "rgba(34,197,94,0.12)",
      icon: <CheckCircle2 size={13} style={{ color: "#4ade80" }} />,
      label: "완료", labelColor: "#4ade80",
    },
    failed: {
      border: "rgba(239,68,68,0.2)", bg: "rgba(239,68,68,0.04)", iconBg: "rgba(239,68,68,0.12)",
      icon: <XCircle size={13} style={{ color: "#f87171" }} />,
      label: "실패", labelColor: "#f87171",
    },
    running: {
      border: "rgba(99,102,241,0.2)", bg: "rgba(99,102,241,0.04)", iconBg: "rgba(99,102,241,0.12)",
      icon: <Cpu size={13} style={{ color: "var(--accent)" }} />,
      label: "진행중", labelColor: "var(--accent)",
    },
    pending: {
      border: "rgba(99,102,241,0.15)", bg: "rgba(99,102,241,0.02)", iconBg: "rgba(99,102,241,0.1)",
      icon: <Cpu size={13} style={{ color: "var(--accent)" }} />,
      label: "대기중", labelColor: "var(--accent)",
    },
    awaiting_confirm: {
      border: "rgba(234,179,8,0.2)", bg: "rgba(234,179,8,0.04)", iconBg: "rgba(234,179,8,0.12)",
      icon: <Clock size={13} style={{ color: "#facc15" }} />,
      label: "동의 대기", labelColor: "#facc15",
    },
    cancelled: {
      border: "rgba(156,163,175,0.2)", bg: "rgba(156,163,175,0.04)", iconBg: "rgba(156,163,175,0.1)",
      icon: <XCircle size={13} style={{ color: "var(--text-muted)" }} />,
      label: "취소됨", labelColor: "var(--text-muted)",
    },
  }[task.status] ?? {
    border: "var(--border)", bg: "transparent", iconBg: "var(--bg-elevated)",
    icon: <Clock size={13} style={{ color: "var(--text-muted)" }} />,
    label: task.status, labelColor: "var(--text-muted)",
  };

  return (
    <div style={{ border: `1px solid ${config.border}`, background: config.bg, borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start",
          gap: 12, padding: "12px 14px", textAlign: "left",
          background: "transparent", border: "none", cursor: "pointer",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: config.iconBg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
        }}>
          {config.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: config.labelColor }}>{config.label}</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
              {formatTime(task.completed_at ?? task.created_at)}
            </span>
          </div>
          <p style={{
            fontSize: 12.5, color: "var(--text-primary)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontWeight: 500, marginBottom: 2,
          }}>
            {command}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {errorText || (hasDiff ? "파일 변경됨 — 클릭해서 diff 보기" : "변경 없음")}
          </p>
        </div>
        {hasDiff && (
          <span style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: 6 }}>
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        )}
      </button>

      {expanded && hasDiff && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <DiffViewer diff={task.result_diff!} />
          {task.status === "completed" && (
            <div style={{ padding: "0 14px 14px" }}>
              <Button
                variant="outline"
                size="sm"
                style={{ width: "100%", fontSize: 11, height: 32 }}
                onClick={onRevert}
                loading={reverting}
              >
                <RotateCcw size={11} />
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
    <div style={{ maxHeight: 220, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: "20px", padding: "12px 14px", background: "var(--bg-base)" }}>
      {lines.map((line, i) => {
        const isAdded = line.startsWith("+") && !line.startsWith("+++");
        const isRemoved = line.startsWith("-") && !line.startsWith("---");        const isHeader = line.startsWith("@@") || line.startsWith("diff");
        return (
          <div
            key={i}
            style={{
              color: isAdded ? "#4ade80" : isRemoved ? "#f87171" : isHeader ? "var(--accent)" : "var(--text-secondary)",
              background: isAdded ? "rgba(34,197,94,0.06)" : isRemoved ? "rgba(239,68,68,0.06)" : "transparent",
              whiteSpace: "pre-wrap", wordBreak: "break-all",
            }}
          >
            {line || " "}
          </div>
        );
      })}
    </div>
  );
}
