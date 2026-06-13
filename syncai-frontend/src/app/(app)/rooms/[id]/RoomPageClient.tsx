"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

// Tauri static export: usePathname()이 RSC payload context를 읽어 __placeholder__를 반환함.
// window.location.pathname은 history.pushState 이후 즉시 업데이트되므로 항상 정확한 URL을 반환.
function getRealRoomId(): string {
  if (typeof window === "undefined") return "";
  const seg = window.location.pathname.split("/").filter(Boolean);
  const id = seg.at(-1) ?? "";
  return id === "rooms" || id === "" ? "" : id;
}
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
  // usePathname()/useParams() 모두 RSC payload context를 읽어 __placeholder__ 반환.
  // window.location은 pushState 직후 업데이트되므로 항상 실제 URL을 가짐.
  const pathname = usePathname(); // 네비게이션 시 리렌더 트리거용으로만 사용
  const id = getRealRoomId();

  // Data
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [taskList, setTaskList] = useState<AiTask[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [teamMcpConfigs, setTeamMcpConfigs] = useState<McpConfigWithTeam[]>([]);
  const [activeProgress, setActiveProgress] = useState<TaskProgress | null>(null);
  const [streamingTaskId, setStreamingTaskId] = useState<string | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);
  // 완료된 메시지 ID → 작업 과정 steps 매핑 (접었다 폈다 유지용)
  const [msgStepsMap, setMsgStepsMap] = useState<Record<string, string[]>>({});
  const streamingTaskIdRef = useRef<string | null>(null);
  const thinkingStepsRef = useRef<string[]>([]);
  const [showMcpSettings, setShowMcpSettings] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showWorker, setShowWorker] = useState(true);

  // 사이드바 토글은 store에서 공유
  const showSidebar = useRoomsStore((s) => s.showSidebar);
  const setShowSidebar = useRoomsStore((s) => s.setShowSidebar);
  const clearUnread = useRoomsStore((s) => s.clearUnread);
  const setCurrentRoomUuid = useRoomsStore((s) => s.setCurrentRoomUuid);
  const storeRooms = useRoomsStore((s) => s.rooms);

  // slug → UUID 변환 헬퍼 (store rooms 기반, room 상태 로드 전에도 동작)
  const getRoomUuid = (slugOrId: string) => {
    const found = storeRooms.find((r) => r.id === slugOrId || r.slug === slugOrId);
    return found?.id ?? slugOrId;
  };

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
    // 방 전환 즉시 이전 상태 초기화 → 체감 딜레이 제거
    setRoom(null);
    setMsgs([]);
    setTaskList([]);
    setActiveProgress(null);
    setStreamingTaskId(null);
    streamingTaskIdRef.current = null;
    setThinkingSteps([]);
    thinkingStepsRef.current = [];
    roomsApi.get(id).then((r) => {
      setRoom(r.data);
      // room UUID를 store에 저장 → layout WS isCurrentRoom 판단에 사용
      setCurrentRoomUuid(r.data.id);
      clearUnread(r.data.id);
      // 마지막 접속 방 저장 → 앱 재시작 시 복원
      try { localStorage.setItem("syncai-last-room", r.data.slug ?? r.data.id); } catch {}
    });
    messagesApi.list(id).then((r) => setMsgs(r.data.messages.reverse()));
    tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
    // 방 나갈 때 초기화
    return () => setCurrentRoomUuid(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // 방 안에 있을 때 메시지 수신 → 미읽 즉시 초기화 (항상 최신 rooms로 UUID 변환)
        {
          const latestRooms = useRoomsStore.getState().rooms;
          const found = latestRooms.find((r) => r.id === id || r.slug === id);
          useRoomsStore.getState().clearUnread(found?.id ?? id);
        }
        // ai_res 완료 시 steps를 메시지 ID에 매핑해서 보존
        if (event.data.type === "ai_res" && streamingTaskIdRef.current && thinkingStepsRef.current.length > 0) {
          const steps = [...thinkingStepsRef.current];
          setMsgStepsMap((prev) => ({ ...prev, [event.data.id]: steps }));
        }
        setStreamingTaskId(null);
        streamingTaskIdRef.current = null;
        setThinkingSteps([]);
        thinkingStepsRef.current = [];
        // ai_plan 메시지 도착 시 task 목록 즉시 갱신 (확인 버튼 표시용)
        if (event.data.type === "ai_plan") {
          tasksApi.list(id).then((r) => setTaskList(r.data.tasks)).catch(() => {});
        }
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
        if (event.data.step) {
          setThinkingSteps((prev) => {
            const next = [...prev, event.data.step!];
            thinkingStepsRef.current = next;
            return next;
          });
        }
      } else if (event.type === "task_started") {
        setActiveProgress({ task_id: event.data.task_id, progress: 0, message: "AI가 작업을 시작했어요..." });
        setStreamingTaskId(event.data.task_id);
        streamingTaskIdRef.current = event.data.task_id;
        setThinkingSteps([]);
        thinkingStepsRef.current = [];
        // task_started 즉시 빈 스트리밍 메시지 생성 → ThinkingPanel 실시간 표시
        const streamId = `streaming-${event.data.task_id}`;
        setMsgs((prev) => {
          if (prev.some((m) => m.id === streamId)) return prev;
          return [...prev, {
            id: streamId,
            room_id: id,
            user_id: null,
            content: "",
            type: "ai_res" as const,
            created_at: new Date().toISOString(),
          }];
        });
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
      } else if (event.type === "task_completed") {
        setActiveProgress(null);
        // streaming 메시지와 streamingTaskId는 건드리지 않음
        // → ai_res 메시지가 chat WS로 도착하면 자연스럽게 교체됨 (race condition 방지)
        tasksApi.list(id).then((r) => setTaskList(r.data.tasks));
        if (teamId) workersApi.list(teamId).then((r) => setWorkers(r.data)).catch(() => {});
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

  const idleWorkers = workers.filter((w) => w.status === "idle");
  const idleCount = idleWorkers.length;

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
                  className="shrink-0 inline-flex items-center gap-2.5"
                  style={{
                    borderRadius: 10,
                    background: "rgba(74,222,128,0.08)",
                    border: "1px solid rgba(74,222,128,0.2)",
                    padding: "5px 12px 5px 10px",
                  }}
                >
                  <span className="relative flex shrink-0" style={{ width: 8, height: 8 }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-50" />
                    <span className="relative inline-flex rounded-full bg-[#4ade80]" style={{ width: 8, height: 8 }} />
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#4ade80", letterSpacing: "-0.01em" }}>
                      {idleCount === 1 ? idleWorkers[0].name : `${idleWorkers[0].name} 외 ${idleCount - 1}명`}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 400, color: "rgba(74,222,128,0.6)" }}>대기중</span>
                  </span>
                </span>
              ) : (
                <span
                  className="shrink-0 inline-flex items-center gap-2.5"
                  style={{
                    borderRadius: 10,
                    background: "rgba(129,140,248,0.08)",
                    border: "1px solid rgba(129,140,248,0.2)",
                    padding: "5px 12px 5px 10px",
                  }}
                >
                  <span className="relative flex shrink-0" style={{ width: 8, height: 8 }}>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-50" />
                    <span className="relative inline-flex rounded-full bg-[var(--accent)]" style={{ width: 8, height: 8 }} />
                  </span>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", letterSpacing: "-0.01em" }}>작업중</span>
                  </span>
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
                    thinkingSteps={msg.id === `streaming-${streamingTaskId}` ? thinkingSteps : (msgStepsMap[msg.id] ?? [])}
                    currentUserId={me?.id}
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
          myUserId={me?.id}
          teamOwnerId={currentTeam?.owner_id}
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
