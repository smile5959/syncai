"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { Hash, Settings2, Users, PanelRightOpen, PanelRightClose, Menu } from "lucide-react";
import { MessageItem } from "@/components/chat/message-item";
import { ChatInput } from "@/components/chat/chat-input";
import { WorkerPanel } from "@/components/worker/worker-panel";
import { McpSettingsModal } from "@/components/worker/mcp-settings-modal";
import { MemberPanel } from "@/components/team/member-panel";
import { Badge } from "@/components/ui/badge";
import {
  rooms as roomsApi,
  messages as messagesApi,
  tasks as tasksApi,
  users as usersApi,
  workers as workersApi,
  mcpConfigs as mcpConfigsApi,
} from "@/lib/api";
import { InviteModal } from "@/components/team/invite-modal";
import { createChatWS, createTaskWS } from "@/lib/ws";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";
import type {
  ChatRoom,
  Message,
  AiTask,
  Worker,
  McpConfigWithTeam,
  WsChatEvent,
  WsTaskEvent,
} from "@/types";

interface TaskProgress {
  task_id: string;
  progress: number;
  message: string;
}

function parseDiffSummary(diff: string): string {
  const fileStats: Record<string, { added: number; removed: number }> = {};
  let curFile = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ ")) {
      curFile = line.replace(/^\+\+\+ [ab]\//, "").replace(/^\+\+\+ /, "").split("/").pop() ?? line;
      if (!fileStats[curFile]) fileStats[curFile] = { added: 0, removed: 0 };
    } else if (curFile && line.startsWith("+") && !line.startsWith("+++")) {
      fileStats[curFile].added++;
    } else if (curFile && line.startsWith("-") && !line.startsWith("---")) {
      fileStats[curFile].removed++;
    }
  }
  const entries = Object.entries(fileStats);
  if (entries.length === 0) return "";
  return entries.map(([file, { added, removed }]) => {
    const parts = [];
    if (added > 0) parts.push(`+${added}`);
    if (removed > 0) parts.push(`-${removed}`);
    return `• ${file}${parts.length ? " (" + parts.join(" / ") + ")" : ""}`;
  }).join("\n");
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();

  // Data
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [taskList, setTaskList] = useState<AiTask[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [teamMcpConfigs, setTeamMcpConfigs] = useState<McpConfigWithTeam[]>([]);
  const [activeProgress, setActiveProgress] = useState<TaskProgress | null>(null);
  const [streamingTaskId, setStreamingTaskId] = useState<string | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showWorker, setShowWorker] = useState(true);

  // 사이드바 토글은 store에서 공유
  const showSidebar = useRoomsStore((s) => s.showSidebar);
  const setShowSidebar = useRoomsStore((s) => s.setShowSidebar);

  const bottomRef = useRef<HTMLDivElement>(null);
  const chatWsRef = useRef<ReturnType<typeof createChatWS> | null>(null);
  const pendingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const currentTeam = useAuthStore((s) => s.team);
  const teamId = currentTeam?.id ?? "";

  // 창 크기에 따라 Worker 패널 자동 조절
  useEffect(() => {
    function handleResize() {
      setShowWorker(window.innerWidth >= 1200);
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // me 정보 없으면 API로 복구
  useEffect(() => {
    if (me) return;
    usersApi.me().then((r) => setUser(r.data)).catch(() => {});
  }, [me, setUser]);

  // Load room + messages + tasks
  useEffect(() => {
    if (!id) return;
    roomsApi.get(id).then((r) => setRoom(r.data));
    messagesApi.list(id).then((r) => setMsgs(r.data.messages.reverse()));
    tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
  }, [id]);

  // Workers + MCP Configs 로드 (teamId 준비되면)
  useEffect(() => {
    if (!teamId) return;
    workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
    mcpConfigsApi.listForTeam(teamId).then((r) => setTeamMcpConfigs(r.data)).catch(() => {});
  }, [teamId]);

  // Auto scroll — smooth 제거, 즉시 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "instant" });
  }, [msgs]);

  // Chat WebSocket
  useEffect(() => {
    if (!id) return;

    const handleReconnect = () => {
      messagesApi.list(id).then((r) => {
        const fresh = r.data.messages.reverse();
        setMsgs((prev) => {
          const prevIds = new Set(prev.map((m) => m.id));
          const newOnes = fresh.filter((m) => !prevIds.has(m.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
      }).catch(() => {});
    };

    const ws = createChatWS(id, handleReconnect);
    chatWsRef.current = ws;
    const unsub = ws.on((event: WsChatEvent) => {
      if (event.type === "message") {
        setMsgs((prev) => {
          const filtered = prev.filter((m) => !m.id.startsWith("streaming-"));
          if (filtered.some((m) => m.id === event.data.id)) return filtered;
          // WS가 API 응답보다 먼저 오면 낙관적 temp 메시지를 실제 메시지로 교체
          const tempIdx = filtered.findLastIndex(
            (m) => m.id.startsWith("temp-") && m.content === event.data.content
          );
          if (tempIdx !== -1) {
            const tempId = filtered[tempIdx].id;
            const timer = pendingTimers.current.get(tempId);
            if (timer) { clearTimeout(timer); pendingTimers.current.delete(tempId); }
            const next = [...filtered];
            next[tempIdx] = event.data;
            return next;
          }
          return [...filtered, event.data];
        });
        setStreamingTaskId(null);
        setThinkingSteps([]);
      } else if (event.type === "message_chunk") {
        const streamId = `streaming-${event.data.task_id}`;
        setMsgs((prev) => {
          const exists = prev.some((m) => m.id === streamId);
          if (!exists) {
            return [...prev, {
              id: streamId,
              room_id: id,
              user_id: null,
              content: event.data.text,
              type: "ai_res" as const,
              created_at: new Date().toISOString(),
            }];
          }
          return prev.map((m) =>
            m.id === streamId ? { ...m, content: m.content + event.data.text } : m
          );
        });
      }
    });
    return () => { unsub(); ws.close(); chatWsRef.current = null; };
  }, [id]);

  // Worker 슬롯 폴링 — 5초마다 갱신
  useEffect(() => {
    if (!teamId) return;
    const interval = setInterval(() => {
      workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [teamId]);

  // AI 태스크 진행 중 메시지 폴링 — WS로 실시간 수신하므로 폴링 불필요, handleReconnect가 재연결 시 처리

  // Task WebSocket
  useEffect(() => {
    if (!id) return;
    const ws = createTaskWS(id);
    const unsub = ws.on((event: WsTaskEvent) => {
      if (event.type === "task_progress") {
        setActiveProgress(event.data);
        if (event.data.step) setThinkingSteps((prev) => [...prev, event.data.step!]);
      } else if (event.type === "task_started") {
        setActiveProgress({ task_id: event.data.task_id, progress: 0, message: "AI가 작업을 시작했어요..." });
        setStreamingTaskId(event.data.task_id);
        setThinkingSteps([]);
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
      } else if (event.type === "task_completed") {
        setActiveProgress(null);
        tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
        if (event.data.result_diff) {
          const diffSummary = parseDiffSummary(event.data.result_diff);
          if (diffSummary) {
            const completeMsg: Message = {
              id: `complete-${event.data.task_id}`,
              room_id: id,
              user_id: null,
              content: `✅ 작업 완료\n${diffSummary}`,
              type: "ai_res",
              created_at: event.data.completed_at,
            };
            setMsgs((prev) =>
              prev.some((m) => m.id === completeMsg.id) ? prev : [...prev, completeMsg]
            );
          }
        }
      } else if (event.type === "task_failed") {
        setActiveProgress(null);
        setStreamingTaskId(null);
        setThinkingSteps([]);
        setMsgs((prev) => prev.filter((m) => !m.id.startsWith("streaming-")));
        tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
      } else if (event.type === "task_interrupted") {
        setActiveProgress(null);
        setStreamingTaskId(null);
        setThinkingSteps([]);
        setMsgs((prev) => prev.filter((m) => !m.id.startsWith("streaming-")));
        tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
      } else if (event.type === "task_cancelled") {
        setActiveProgress(null);
        setStreamingTaskId(null);
        setThinkingSteps([]);
        setMsgs((prev) => prev.filter((m) => !m.id.startsWith("streaming-")));
        tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
      } else if (event.type === "task_queued") {
        // 큐 대기 안내 메시지를 채팅에 임시 표시
        const queueMsg: Message = {
          id: `queued-${event.data.task_id}`,
          room_id: id,
          user_id: null,
          content: `⏳ ${event.data.message}`,
          type: "ai_res",
          created_at: new Date().toISOString(),
        };
        setMsgs((prev) =>
          prev.some((m) => m.id === queueMsg.id) ? prev : [...prev, queueMsg]
        );
      }
    });
    return () => { unsub(); ws.close(); };
  }, [id, teamId]);

  const handleSend = useCallback(async (content: string, isAi: boolean) => {
    if (!id) return;
    if (isAi) {
      const cmdContent = content.replace(/^\/ai\s*/, "");
      try {
        await messagesApi.sendAi(id, cmdContent);
      } catch (err: unknown) {
        const detail =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          room_id: id,
          user_id: null,
          content: `⚠️ AI 요청 실패: ${detail ?? "사용 가능한 MCP가 없거나 오류가 발생했습니다."}`,
          type: "ai_res",
          created_at: new Date().toISOString(),
        };
        setMsgs((prev) => [...prev, errorMsg]);
      }
    } else {
      // 낙관적 업데이트 — 즉시 표시
      const tempId = `temp-${Date.now()}`;
      const optimistic: Message = {
        id: tempId,
        room_id: id,
        user_id: me?.id ?? null,
        content,
        type: "chat",
        created_at: new Date().toISOString(),
        user: me ?? undefined,
      };
      setMsgs((prev) => [...prev, optimistic]);

      const httpFallback = () =>
        messagesApi.send(id, content)
          .then((res) => setMsgs((prev) => prev.map((m) => m.id === tempId ? res.data : m)))
          .catch(() => setMsgs((prev) => prev.filter((m) => m.id !== tempId)));

      // WS로 전송 — 실패 시 즉시 HTTP fallback
      const wsSent = chatWsRef.current?.send({ type: "send_message", content }) ?? false;
      if (!wsSent) {
        httpFallback();
        return;
      }

      // WS 전송 성공했지만 3초 안에 서버 echo 없으면 HTTP fallback (서버 크래시 대비)
      const fallbackTimer = setTimeout(() => {
        pendingTimers.current.delete(tempId);
        setMsgs((prev) => {
          const stillTemp = prev.some((m) => m.id === tempId);
          if (stillTemp) httpFallback();
          return prev;
        });
      }, 3000);
      pendingTimers.current.set(tempId, fallbackTimer);
    }
  }, [id, me]);

  // AI는 항상 사용 가능 (MCP 없어도 대화 가능)
  const mcpAvailable = true;
  // MCP 연결 여부 (파일 접근 가능한지)
  const mcpConnected = teamMcpConfigs.some((c) => c.is_public);
  const availableMcpNames = teamMcpConfigs.filter((c) => c.is_public).map((c) => c.name);

  const idleCount = workers.filter((w) => w.status === "idle").length;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden", minWidth: 0 }}>
      {/* Chat area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          background: "var(--bg-base)",
        }}
      >
        {/* Header */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 20px",
            height: 56,
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-surface)",
            flexShrink: 0,
            gap: 12,
          }}
        >
          {/* 왼쪽: 사이드바 토글 + 방 이름 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button
              onClick={() => setShowSidebar((v) => !v)}
              title="사이드바 토글"
              style={{
                width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, border: "none", background: "transparent",
                color: "var(--text-muted)", cursor: "pointer", flexShrink: 0,
              }}
              className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Menu size={17} />
            </button>
            <Hash size={16} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
            <h1
              style={{
                fontSize: 15, fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}
            >
              {room?.name ?? "..."}
            </h1>
            {/* Worker 슬롯 상태 표시 */}
            {workers.length > 0 && (
              idleCount > 0 ? (
                <span
                  className="shrink-0 inline-flex items-center gap-2 px-3 py-1"
                  style={{
                    borderRadius: 999,
                    background: "linear-gradient(135deg, rgba(74,222,128,0.12) 0%, rgba(34,197,94,0.07) 100%)",
                    border: "1px solid rgba(74,222,128,0.25)",
                    boxShadow: "0 0 10px rgba(74,222,128,0.1)",
                    fontSize: 11.5, fontWeight: 600, color: "#4ade80",
                    letterSpacing: "0.01em",
                  }}
                >
                  <span className="relative flex" style={{ width: 9, height: 9 }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-60" />
                    <span className="relative inline-flex rounded-full bg-[#4ade80]" style={{ width: 9, height: 9 }} />
                  </span>
                  슬롯 {idleCount}개 대기중
                </span>
              ) : (
                <span
                  className="shrink-0 inline-flex items-center gap-2 px-3 py-1"
                  style={{
                    borderRadius: 999,
                    background: "linear-gradient(135deg, rgba(129,140,248,0.12) 0%, rgba(99,102,241,0.07) 100%)",
                    border: "1px solid rgba(129,140,248,0.25)",
                    boxShadow: "0 0 10px rgba(129,140,248,0.1)",
                    fontSize: 11.5, fontWeight: 600, color: "var(--accent)",
                    letterSpacing: "0.01em",
                  }}
                >
                  <span className="relative flex" style={{ width: 9, height: 9 }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60" />
                    <span className="relative inline-flex rounded-full bg-[var(--accent)]" style={{ width: 9, height: 9 }} />
                  </span>
                  작업중
                </span>
              )
            )}
          </div>

          {/* 오른쪽: 버튼들 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              onClick={() => setShowMembers((v) => !v)}
              style={{
                width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, border: "none",
                background: showMembers ? "var(--accent-bg)" : "transparent",
                color: showMembers ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
              className="hover:bg-[var(--bg-hover)] transition-colors"
              title="팀원 목록"
            >
              <Users size={16} />
            </button>
            <button
              onClick={() => setShowMcpSettings(true)}
              style={{
                width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, border: "none", background: "transparent",
                color: "var(--text-muted)", cursor: "pointer",
              }}
              className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
              title="MCP 연결 설정"
            >
              <Settings2 size={16} />
            </button>
            <button
              onClick={() => setShowWorker((v) => !v)}
              style={{
                width: 34, height: 34,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 10, border: "none",
                background: showWorker ? "var(--accent-bg)" : "transparent",
                color: showWorker ? "var(--accent)" : "var(--text-muted)",
                cursor: "pointer",
              }}
              className="hover:bg-[var(--bg-hover)] transition-colors"
              title="Worker 패널"
            >
              {showWorker ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          </div>
        </header>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", justifyContent: "flex-end" }}>
            {msgs.length === 0 && (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", gap: 16, textAlign: "center",
                padding: "96px 32px",
              }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 16,
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Hash size={20} style={{ color: "var(--text-muted)" }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>
                    #{room?.name ?? "채팅방"} 시작
                  </p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                    메시지를 보내거나{" "}
                    <span style={{ color: "var(--accent)", fontWeight: 500 }}>/ai</span>
                    로 AI에게 코드 수정을 맡기세요
                  </p>
                </div>
              </div>
            )}

            <div style={{ paddingTop: 12, paddingBottom: 12 }}>
              {msgs.map((msg, i) => {
                const prev = msgs[i - 1];
                const showAvatar =
                  !prev ||
                  prev.user_id !== msg.user_id ||
                  prev.type !== msg.type ||
                  new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
                return (
                  <MessageItem
                    key={msg.id}
                    message={msg}
                    showAvatar={showAvatar}
                    isMe={msg.user_id === me?.id}
                    roomId={id}
                    tasks={taskList}
                    isStreaming={msg.id === `streaming-${streamingTaskId}`}
                    thinkingSteps={msg.id === `streaming-${streamingTaskId}` ? thinkingSteps : []}
                  />
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>
        </div>

        {/* Input */}
        <ChatInput
          onSend={handleSend}
          mcpAvailable={mcpAvailable}
          mcpConnected={mcpConnected}
          availableMcpNames={availableMcpNames}
          disabled={!room}
        />
      </div>

      {/* Worker Panel */}
      <div
        style={{
          width: showWorker ? 300 : 0,
          minWidth: 0,
          overflow: "hidden",
          transition: "width 0.25s ease",
          flexShrink: 0,
        }}
      >
        <WorkerPanel
          workers={workers}
          tasks={taskList}
          msgs={msgs}
          activeProgress={activeProgress}
          onCancel={(taskId) => {
            setTaskList((prev) => prev.map((t) =>
              t.id === taskId ? { ...t, status: "cancelled" as const } : t
            ));
            setActiveProgress(null);
            setStreamingTaskId(null);
            setThinkingSteps([]);
            setMsgs((prev) => prev.filter((m) => !m.id.startsWith("streaming-")));
          }}
        />
      </div>

      {/* Member Panel */}
      <div
        style={{
          width: showMembers ? 260 : 0,
          minWidth: 0,
          overflow: "hidden",
          transition: "width 0.25s ease",
          flexShrink: 0,
        }}
      >
        {showMembers && currentTeam && me && (
          <MemberPanel
            teamId={teamId}
            ownerId={currentTeam.owner_id}
            myUserId={me.id}
            onClose={() => setShowMembers(false)}
          />
        )}
      </div>

      {/* MCP Settings Modal */}
      {showMcpSettings && teamId && (
        <McpSettingsModal
          teamId={teamId}
          onWorkerUpdate={(updatedWorker) => {
            setWorkers((prev) => prev.map((w) => w.id === updatedWorker.id ? updatedWorker : w));
          }}
          onClose={() => {
            setShowMcpSettings(false);
            mcpConfigsApi.listForTeam(teamId).then((r) => setTeamMcpConfigs(r.data)).catch(() => {});
          }}
        />
      )}

      {/* Invite Modal */}
      {showInvite && teamId && (
        <InviteModal teamId={teamId} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
