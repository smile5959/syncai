// ─── Auth ─────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  plan?: string;
}

export interface AuthTokens {
  token: string;
  refresh_token: string;
}

export interface AuthResponse extends AuthTokens {
  user: User;
  teams?: Team[];
}

// ─── Team ─────────────────────────────────────────────
export type TeamPlan = "free" | "pro" | "business";

export interface Team {
  id: string;
  name: string;
  plan: TeamPlan;
  owner_id: string;
  color?: string | null;
  icon?: string | null;
  created_at: string;
}

export type TeamRole = "owner" | "manager" | "member";

export interface TeamMember {
  user_id: string;
  role: TeamRole;
  joined_at: string;
  user?: User;
}

// ─── Worker (AI 슬롯) ─────────────────────────────────
export type WorkerStatus = "idle" | "busy";

export interface Worker {
  id: string;
  team_id: string;
  name: string;
  status: WorkerStatus;
  current_task_id: string | null;
  model: string;
  created_at: string;
}

// ─── MCP Config (사용자 PC 접근 설정) ────────────────
export interface McpConfig {
  id: string;
  owner_user_id: string;
  name: string;
  endpoint: string | null;
  base_dir: string | null;
  mcp_token: string | null;
  is_online: boolean;
  auto_approve: boolean;
  created_at: string;
}

export interface McpConfigWithTeam extends McpConfig {
  is_public: boolean;
}

// ─── Room ─────────────────────────────────────────────
export interface ChatRoom {
  id: string;
  name: string;
  slug?: string | null;
  team_id: string;
  created_at: string;
  last_message?: Message;
  unread_count?: number;
}

// ─── Message ──────────────────────────────────────────
export type MessageType = "chat" | "ai_cmd" | "ai_res" | "ai_plan";

export interface Message {
  id: string;
  room_id: string;
  user_id: string | null;
  content: string;
  type: MessageType;
  created_at: string;
  user?: User;
}

// ai_plan 메시지의 content를 파싱한 구조
export interface AiPlanPayload {
  task_id: string;
  needs_mcp: boolean;
  needs_composio?: boolean;
  composio_app?: string | null;
  mcp_name: string | null;
  mcp_config_id: string | null;
  mcp_owner_id?: string | null;
  task_title?: string;
  confirmation_message: string;
  task_plan?: string;
  triggered_by?: string | null;
  model?: string;
}

export interface MessagesPage {
  messages: Message[];
  next_cursor: string | null;
}

// ─── Task ─────────────────────────────────────────────
export type AiTaskStatus = "pending" | "awaiting_confirm" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export interface AiTask {
  id: string;
  room_id: string;
  worker_id: string | null;
  message_id: string;
  triggered_by: string;
  status: AiTaskStatus;
  result_diff: string | null;
  error?: string | null;
  created_at: string;
  completed_at: string | null;
  command?: string | null;
  mcp_config_id?: string | null;
}

// ─── FileLock ─────────────────────────────────────────
export interface FileLock {
  id: string;
  file_path: string;
  task_id: string;
  locked_at: string;
}

// ─── WebSocket Events ─────────────────────────────────
export interface WsChatMessage {
  type: "message";
  data: Message;
}

export interface WsTaskStarted {
  type: "task_started";
  data: { task_id: string; worker_id: string };
}

export interface WsTaskProgress {
  type: "task_progress";
  data: { task_id: string; progress: number; message: string; step?: string };
}

export interface WsMessageChunk {
  type: "message_chunk";
  data: { task_id: string; text: string };
}

export interface WsTaskCompleted {
  type: "task_completed";
  data: { task_id: string; result_diff: string | null; completed_at: string };
}

export interface WsTaskFailed {
  type: "task_failed";
  data: { task_id: string; error: string };
}

export interface WsTaskQueued {
  type: "task_queued";
  data: { task_id: string; message: string };
}

export interface WsTaskCancelled {
  type: "task_cancelled";
  data: { task_id: string };
}

export interface WsTaskInterrupted {
  type: "task_interrupted";
  data: { task_id: string; error: string };
}

export interface WsTaskAwaitingConfirm {
  type: "task_awaiting_confirm";
  data: { task_id: string; triggered_by: string | null };
}

export type WsChatEvent = WsChatMessage | WsMessageChunk;
export type WsTaskEvent =
  | WsTaskStarted
  | WsTaskProgress
  | WsTaskCompleted
  | WsTaskFailed
  | WsTaskQueued
  | WsTaskCancelled
  | WsTaskInterrupted
  | WsTaskAwaitingConfirm;


export interface Invitation {
  id: string;
  team_id: string;
  inviter_id: string;
  invitee_email: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
  team_name: string | null;
  inviter_name: string | null;
}


// ─── Composio Integrations ────────────────────────────
export interface ComposioApp {
  key: string;
  name: string;
  displayName?: string;
  description?: string;
  logo?: string;
  categories?: string[];
  docs?: string;
}

export interface ComposioConnection {
  id: string;
  appName: string;
  appUniqueId?: string;
  clientUniqueUserId: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}
