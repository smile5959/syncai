"use client";

import { useState, useMemo } from "react";
import { formatTime } from "@/lib/utils";
import {
  CheckCircle2, XCircle, ChevronDown, ChevronRight,
  Loader2, Zap, Square, Clock, BotMessageSquare, AlertTriangle,
} from "lucide-react";
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
  onCancel?: (taskId: string) => void;
}

type FilterTab = "all" | "running" | "completed" | "failed";

export function WorkerPanel({ workers, tasks, msgs = [], activeProgress, onCancel }: WorkerPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>("all");

  const idleCount = workers.filter((w) => w.status === "idle").length;
  const busyCount = workers.filter((w) => w.status === "busy").length;

  async function handleCancel(taskId: string) {
    setCancelling(taskId);
    try {
      await tasksApi.cancel(taskId);
      onCancel?.(taskId);
    } catch (e) {
      console.error(e);
    } finally {
      setCancelling(null);
    }
  }

  function getAiPlanPayload(task: AiTask) {
    const m = msgs.find((m) => {
      if (m.type !== "ai_plan") return false;
      try { return JSON.parse(m.content).task_id === task.id; }
      catch { return false; }
    });
    if (!m) return null;
    try { return JSON.parse(m.content); } catch { return null; }
  }

  function getCommand(task: AiTask): string {
    const payload = getAiPlanPayload(task);
    if (payload?.confirmation_message) {
      const title = (payload.confirmation_message as string)
        .replace(/\?$|？$/, "")
        .replace(/할까요$|하시겠어요$|진행할까요$/, "")
        .replace(/^.+?님의\s+PC에\s+/, "")
        .replace(/^.+?의\s+PC에\s+/, "")
        .trim();
      return title.length > 32 ? title.slice(0, 32) + "…" : title || "AI 작업";
    }
    const raw = task.command ?? msgs.find((m) => m.id === task.message_id)?.content ?? "";
    let c = raw.replace(/^\/ai\s*/i, "").trim() || "AI 작업";
    c = c
      .replace(/해\s*줘\s*$|해\s*주세요\s*$|부탁해\s*$|해\s*봐\s*$|해\s*줄래\s*$|해\s*줘요\s*$/i, "")
      .replace(/해\s*$/, "")
      .replace(/\s*(좀|한번|한 번|제발|바로|빨리)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!c) c = "AI 작업";
    return c.length > 30 ? c.slice(0, 30) + "…" : c;
  }

  function getMcpName(task: AiTask): string | null {
    const payload = getAiPlanPayload(task);
    return payload?.mcp_name ?? null;
  }

  function getErrorSummary(task: AiTask): string {
    if (!task.error) return "";
    const e = task.error;
    if (/quota|rate.?limit|429/i.test(e)) return "API 한도 초과";
    if (/offline|오프라인|not.?connected/i.test(e)) return "MCP 오프라인";
    if (/401|unauthorized/i.test(e)) return "인증 실패";
    if (/timeout/i.test(e)) return "응답 시간 초과";
    if (/최대 반복/.test(e)) return "반복 한도 초과";
    if (/Prompt tokens limit exceeded/i.test(e)) return "토큰 한도 초과";
    const match = e.match(/'message':\s*'([^']{0,60})/);
    if (match) return match[1];
    return e.slice(0, 40);
  }

  function getFullError(task: AiTask): string {
    if (!task.error) return "";
    const match = task.error.match(/'message':\s*'([^']+)'/);
    if (match) return match[1];
    return task.error;
  }

  function getDuration(task: AiTask): string | null {
    if (!task.completed_at) return null;
    const ms = new Date(task.completed_at).getTime() - new Date(task.created_at).getTime();
    if (ms < 0) return null;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}초`;
    return `${Math.floor(s / 60)}분 ${s % 60}초`;
  }

  // 작업 목록 (표시할 작업들)
  const allSorted = useMemo(() => [...tasks]
    // chat-only(결과없고 완료된 것) 제외 — running/failed/interrupted는 항상 표시
    .filter((t) => t.status === "running" || t.status === "failed" || t.status === "interrupted" || t.result_diff || t.mcp_config_id)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50),
    [tasks]
  );

  // 통계
  const stats = useMemo(() => ({
    running: allSorted.filter((t) => t.status === "running").length,
    completed: allSorted.filter((t) => t.status === "completed").length,
    failed: allSorted.filter((t) => t.status === "failed").length,
    interrupted: allSorted.filter((t) => t.status === "interrupted").length,
  }), [allSorted]);

  const filtered = useMemo(() => {
    if (filter === "all") return allSorted;
    if (filter === "running") return allSorted.filter((t) => t.status === "running");
    if (filter === "completed") return allSorted.filter((t) => t.status === "completed");
    if (filter === "failed") return allSorted.filter((t) => t.status === "failed" || t.status === "interrupted");
    return allSorted;
  }, [allSorted, filter]);

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "전체", count: allSorted.length },
    { key: "running", label: "진행중", count: stats.running },
    { key: "completed", label: "완료", count: stats.completed },
    { key: "failed", label: "실패/중단", count: stats.failed + stats.interrupted },
  ];

  return (
    <aside style={{
      display: "flex", flexDirection: "column",
      width: "100%", height: "100%",
      borderLeft: "1px solid var(--border)",
      background: "var(--bg-surface)",
      overflow: "hidden",
      minWidth: 260,
    }}>

      {/* ── Worker 슬롯 섹션 ── */}
      <div style={{ padding: "14px 12px 10px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {/* 섹션 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Workers
          </span>
          <div style={{ display: "flex", gap: 4 }}>
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
                background: "var(--accent-bg)", borderRadius: 6,
                padding: "2px 7px", border: "1px solid rgba(129,140,248,0.2)",
              }}>
                작업 {busyCount}
              </span>
            )}
          </div>
        </div>

        {/* 슬롯 카드 */}
        {workers.length === 0 ? (
          <div style={{ padding: "12px 8px", textAlign: "center" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>
              Worker 슬롯이 없어요.<br />
              <span style={{ color: "var(--accent)", fontWeight: 500 }}>팀 설정</span>에서 추가하세요.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {workers.map((w) => {
              const isBusy = w.status === "busy";
              const busyTask = isBusy ? allSorted.find((t) => t.id === w.current_task_id && t.status === "running") : null;
              const busyTaskName = busyTask ? getCommand(busyTask) : null;
              const taskProgress = busyTask && activeProgress?.task_id === busyTask.id ? activeProgress : null;

              return (
                <div key={w.id} style={{
                  borderRadius: 10,
                  border: `1px solid ${isBusy ? "rgba(129,140,248,0.2)" : "var(--border)"}`,
                  background: isBusy
                    ? "linear-gradient(135deg, rgba(129,140,248,0.07) 0%, rgba(99,102,241,0.04) 100%)"
                    : "var(--bg-elevated)",
                  overflow: "hidden",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px" }}>
                    {/* 상태 dot */}
                    <span style={{ position: "relative", display: "flex", flexShrink: 0, width: 8, height: 8 }}>
                      {isBusy && (
                        <span style={{
                          position: "absolute", inset: 0, borderRadius: "50%",
                          background: "var(--accent)", opacity: 0.5,
                          animation: "ping 1.2s cubic-bezier(0,0,0.2,1) infinite",
                        }} />
                      )}
                      <span style={{
                        position: "relative", width: 8, height: 8, borderRadius: "50%",
                        background: isBusy ? "var(--accent)" : "#4ade80",
                        boxShadow: isBusy ? "0 0 6px var(--accent)" : "0 0 5px #4ade80",
                        flexShrink: 0,
                      }} />
                    </span>

                    {/* 이름 + 모델 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {(w.model ?? "").split("/").pop()?.replace(":free", "") ?? ""}
                      </div>
                    </div>

                    {isBusy
                      ? <Loader2 size={12} style={{ color: "var(--accent)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                      : <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 600, flexShrink: 0 }}>대기중</span>
                    }
                  </div>

                  {/* 작업 중인 경우: task 이름 + 진행률 */}
                  {isBusy && (busyTaskName || taskProgress) && (
                    <div style={{
                      padding: "6px 10px 8px",
                      borderTop: "1px solid rgba(129,140,248,0.12)",
                      background: "rgba(129,140,248,0.04)",
                    }}>
                      {busyTaskName && (
                        <div style={{
                          fontSize: 11, color: "var(--accent-soft)", fontWeight: 500,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginBottom: taskProgress ? 5 : 0,
                        }}>
                          {taskProgress?.message ?? busyTaskName}
                        </div>
                      )}
                      {taskProgress && (
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ flex: 1, height: 3, background: "rgba(129,140,248,0.2)", borderRadius: 99, overflow: "hidden" }}>
                            <div style={{
                              height: "100%", width: `${taskProgress.progress}%`,
                              background: "var(--gradient-accent)", borderRadius: 99,
                              transition: "width 0.4s ease",
                            }} />
                          </div>
                          <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                            {taskProgress.progress}%
                          </span>
                          <button
                            onClick={() => handleCancel(taskProgress.task_id)}
                            disabled={cancelling === taskProgress.task_id}
                            title="중단"
                            style={{
                              width: 18, height: 18, borderRadius: 5,
                              border: "1px solid var(--status-error-border)",
                              background: "var(--status-error-bg)", cursor: "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              color: "var(--status-error)", flexShrink: 0,
                            }}
                          >
                            {cancelling === taskProgress.task_id
                              ? <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} />
                              : <Square size={8} fill="currentColor" />}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 작업 히스토리 섹션 ── */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* 섹션 헤더 + 통계 */}
        <div style={{ padding: "10px 12px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              작업 기록
            </span>
            {allSorted.length > 0 && (
              <div style={{ display: "flex", gap: 8, fontSize: 10 }}>
                {stats.completed > 0 && (
                  <span style={{ color: "#4ade80", fontWeight: 600 }}>✓ {stats.completed}</span>
                )}
                {stats.failed > 0 && (
                  <span style={{ color: "var(--status-error)", fontWeight: 600 }}>✗ {stats.failed}</span>
                )}
                {stats.running > 0 && (
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>⟳ {stats.running}</span>
                )}
              </div>
            )}
          </div>

          {/* 필터 탭 */}
          {allSorted.length > 0 && (
            <div style={{ display: "flex", gap: 2, marginBottom: 8 }}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  style={{
                    flex: 1, padding: "4px 2px", borderRadius: 7, fontSize: 10, fontWeight: 600,
                    border: filter === tab.key ? "1px solid var(--accent-dim)" : "1px solid transparent",
                    background: filter === tab.key ? "var(--accent-bg)" : "transparent",
                    color: filter === tab.key ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ marginLeft: 3, opacity: 0.7 }}>{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 작업 목록 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 8px" }}>
          {allSorted.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 120, gap: 8 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 12,
                background: "var(--accent-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <BotMessageSquare size={16} style={{ color: "var(--accent)" }} />
              </div>
              <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6 }}>
                {workers.length === 0
                  ? "MCP 연결 후\n/ai 명령으로 시작하세요"
                  : "/ai 명령을 사용하면\n여기에 작업 내역이 쌓여요"}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, color: "var(--text-muted)" }}>
              해당하는 작업이 없어요
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {filtered.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  command={getCommand(task)}
                  mcpName={getMcpName(task)}
                  errorSummary={getErrorSummary(task)}
                  fullError={getFullError(task)}
                  duration={getDuration(task)}
                  expanded={expandedId === task.id}
                  onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                  onCancel={() => handleCancel(task.id)}
                  cancelling={cancelling === task.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes ping { 75%, 100% { transform: scale(2); opacity: 0 } }
      `}</style>
    </aside>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

interface TaskCardProps {
  task: AiTask;
  command: string;
  mcpName: string | null;
  errorSummary: string;
  fullError: string;
  duration: string | null;
  expanded: boolean;
  onToggle: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

function TaskCard({ task, command, mcpName, errorSummary, fullError, duration, expanded, onToggle, onCancel, cancelling }: TaskCardProps) {
  const hasDiff = !!task.result_diff;
  const hasFailed = task.status === "failed" && (!!fullError || !!errorSummary);
  const isExpandable = hasDiff || hasFailed;

  type StatusKey = "completed" | "failed" | "running" | "pending" | "awaiting_confirm" | "cancelled" | "interrupted";

  const STATUS_CONFIG: Record<StatusKey, {
    icon: React.ReactNode;
    label: string;
    labelColor: string;
    cardBorder: string;
    bgAccent: string;
  }> = {
    completed: {
      icon: <CheckCircle2 size={13} />,
      label: "완료", labelColor: "#4ade80",
      cardBorder: "rgba(74,222,128,0.18)",
      bgAccent: "rgba(74,222,128,0.05)",
    },
    failed: {
      icon: <XCircle size={13} />,
      label: "실패", labelColor: "var(--status-error)",
      cardBorder: "var(--status-error-border)",
      bgAccent: "rgba(239,68,68,0.04)",
    },
    running: {
      icon: <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />,
      label: "진행중", labelColor: "var(--accent)",
      cardBorder: "rgba(129,140,248,0.25)",
      bgAccent: "rgba(129,140,248,0.05)",
    },
    pending: {
      icon: <Clock size={13} />,
      label: "대기중", labelColor: "var(--text-muted)",
      cardBorder: "var(--border)",
      bgAccent: "transparent",
    },
    awaiting_confirm: {
      icon: <Zap size={13} />,
      label: "동의 필요", labelColor: "#f59e0b",
      cardBorder: "rgba(245,158,11,0.25)",
      bgAccent: "rgba(245,158,11,0.04)",
    },
    cancelled: {
      icon: <Square size={11} />,
      label: "취소", labelColor: "var(--text-faint)",
      cardBorder: "var(--border)",
      bgAccent: "transparent",
    },
    interrupted: {
      icon: <AlertTriangle size={13} />,
      label: "중단됨", labelColor: "#f59e0b",
      cardBorder: "rgba(245,158,11,0.25)",
      bgAccent: "rgba(245,158,11,0.04)",
    },
  };

  const cfg = STATUS_CONFIG[task.status as StatusKey] ?? STATUS_CONFIG.pending;

  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${cfg.cardBorder}`,
      background: `color-mix(in srgb, var(--bg-elevated) 100%, transparent)`,
      overflow: "hidden",
    }}>
      {/* 메인 행 */}
      <div
        role={isExpandable ? "button" : undefined}
        onClick={isExpandable ? onToggle : undefined}
        style={{
          display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
          cursor: isExpandable ? "pointer" : "default",
          background: cfg.bgAccent,
        }}
      >
        {/* 상태 아이콘 */}
        <span style={{ color: cfg.labelColor, flexShrink: 0, display: "flex", alignItems: "center" }}>
          {cfg.icon}
        </span>

        {/* 내용 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {command}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-faint)", flexShrink: 0 }}>
              {formatTime(task.completed_at ?? task.created_at)}
            </span>
          </div>

          {/* 태그 행 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
            {mcpName && (
              <span style={{
                fontSize: 10, padding: "1px 5px", borderRadius: 4, fontWeight: 500,
                background: "var(--accent-bg)", color: "var(--accent-soft)",
                border: "1px solid rgba(129,140,248,0.18)",
              }}>
                {mcpName}
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 600, color: cfg.labelColor }}>
              {cfg.label}
            </span>
            {errorSummary ? (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>· {errorSummary}</span>
            ) : hasDiff ? (
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>· 파일 변경됨</span>
            ) : null}
            {duration && (
              <span style={{ fontSize: 10, color: "var(--text-faint)", marginLeft: "auto" }}>
                {duration}
              </span>
            )}
          </div>
        </div>

        {/* 우측 액션 */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          {task.status === "running" && (
            <button
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              disabled={cancelling}
              title="중단"
              style={{
                width: 22, height: 22, borderRadius: 6,
                border: "1px solid var(--status-error-border)",
                background: "var(--status-error-bg)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--status-error)",
              }}
            >
              {cancelling
                ? <Loader2 size={9} style={{ animation: "spin 1s linear infinite" }} />
                : <Square size={8} fill="currentColor" />}
            </button>
          )}
          {isExpandable && (
            <span style={{ color: "var(--text-muted)", display: "flex" }}>
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          )}
        </div>
      </div>

      {/* 확장 영역 */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${cfg.cardBorder}` }}>
          {hasFailed && (
            <div style={{ padding: "10px 12px", background: "var(--status-error-bg)" }}>
              <p style={{ fontSize: 11, color: "var(--status-error)", fontWeight: 600, marginBottom: 4 }}>오류 내용</p>
              <p style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6, wordBreak: "break-all" }}>
                {fullError || errorSummary || "알 수 없는 오류가 발생했어요."}
              </p>
            </div>
          )}
          {hasDiff && <DiffViewer diff={task.result_diff!} />}
        </div>
      )}
    </div>
  );
}

// ─── Diff Viewer ──────────────────────────────────────────────────────────────

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split("\n");

  type Section = { file: string; added: number; removed: number; content: { line: string; type: "add" | "del" | "ctx" }[] };
  const sections: Section[] = [];
  let cur: Section | null = null;

  for (const line of lines) {
    if (line.startsWith("diff ") || line.startsWith("--- ") || line.startsWith("\\ ")) continue;
    if (line.startsWith("+++ ")) {
      const file = line.replace(/^\+\+\+ [ab]\//, "").replace(/^\+\+\+ /, "").split("/").pop() ?? line;
      cur = { file, added: 0, removed: 0, content: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    if (line.startsWith("@@ ")) continue;
    if (line.startsWith("+")) { cur.added++; cur.content.push({ line: line.slice(1), type: "add" }); }
    else if (line.startsWith("-")) { cur.removed++; cur.content.push({ line: line.slice(1), type: "del" }); }
    else if (line !== "") { cur.content.push({ line: line.slice(1), type: "ctx" }); }
  }

  if (sections.length === 0) {
    return (
      <div style={{ maxHeight: 180, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: "18px", padding: "8px 12px" }}>
        {lines.map((l, i) => (
          <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "var(--text-secondary)" }}>{l || " "}</div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {sections.map((sec, si) => (
        <div key={si} style={{ borderTop: si > 0 ? "1px solid var(--border)" : undefined }}>
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "5px 12px", background: "var(--bg-soft)",
            borderBottom: "1px solid var(--border)",
          }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-muted)" }}>{sec.file}</span>
            <div style={{ display: "flex", gap: 6 }}>
              {sec.added > 0 && <span style={{ fontSize: 10, color: "#4ade80", fontWeight: 600 }}>+{sec.added}</span>}
              {sec.removed > 0 && <span style={{ fontSize: 10, color: "var(--status-error)", fontWeight: 600 }}>-{sec.removed}</span>}
            </div>
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto", fontFamily: "monospace", fontSize: 11, lineHeight: "18px", padding: "6px 12px" }}>
            {sec.content.map((c, i) => (
              <div key={i} style={{
                whiteSpace: "pre-wrap", wordBreak: "break-all",
                color: c.type === "add" ? "#4ade80" : c.type === "del" ? "var(--status-error)" : "var(--text-secondary)",
                background: c.type === "add" ? "rgba(74,222,128,0.06)" : c.type === "del" ? "var(--status-error-bg)" : "transparent",
                borderRadius: 2, paddingLeft: 2,
              }}>
                {c.type === "add" ? "+ " : c.type === "del" ? "- " : "  "}{c.line || " "}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
