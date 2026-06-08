import axios from "axios";
import type {
  Invitation,
  AuthResponse,
  User,
  Team,
  TeamMember,
  Worker,
  McpConfig,
  McpConfigWithTeam,
  ChatRoom,
  Message,
  MessagesPage,
  AiTask,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

const http = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// 401 시 토큰 갱신
let _refreshing: Promise<void> | null = null;

async function _logoutAndRedirect() {
  // /api/auth/logout: Next.js 프록시 라우트.
  // fly.io 쿠키(백엔드) + vercel 쿠키(미들웨어가 심은 것) 동시 삭제.
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch { /* 무시 */ }
  window.location.href = "/login";
}

http.interceptors.response.use(
  (r) => r,
  async (err) => {
    const skipUrls = ["/auth/login", "/auth/signup", "/auth/refresh"];
    const isSkip = skipUrls.some((u) => err.config?.url?.includes(u));
    if (err.response?.status === 401 && !err.config._retry && !isSkip) {
      err.config._retry = true;
      if (!_refreshing) {
        _refreshing = axios
          .post(`${BASE}/auth/refresh`, {}, { withCredentials: true })
          .then(() => { _refreshing = null; })
          .catch(() => {
            _refreshing = null;
            return Promise.reject(new Error("refresh_failed"));
          });
      }
      try {
        await _refreshing;
        return http(err.config);
      } catch {
        await _logoutAndRedirect();
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

// ─── Users ────────────────────────────────────────────
export const users = {
  me: () => http.get<User>("/users/me"),
  myTeams: () => http.get<{ teams: Team[] }>("/users/me/teams"),
};

// ─── Auth ─────────────────────────────────────────────
export const auth = {
  signup: (email: string, password: string, name: string) =>
    http.post<AuthResponse>("/auth/signup", { email, password, name }),
  login: (email: string, password: string) =>
    http.post<AuthResponse>("/auth/login", { email, password }),
  logout: () => http.post("/auth/logout"),
  refresh: () => http.post<AuthResponse>("/auth/refresh", {}),
};

// ─── Teams ────────────────────────────────────────────
export const teams = {
  create: (name: string) => http.post<Team>("/teams", { name }),
  get: (id: string) => http.get<Team>(`/teams/${id}`),
  update: (id: string, data: Partial<Team>) => http.patch<Team>(`/teams/${id}`, data),
  delete: (id: string) => http.delete(`/teams/${id}`),
  members: (id: string) => http.get<TeamMember[]>(`/teams/${id}/members`),
  invite: (id: string, email: string, role = "member") =>
    http.post<TeamMember>(`/teams/${id}/members`, { email, role }),
  updateMemberRole: (id: string, userId: string, role: string) =>
    http.patch<TeamMember>(`/teams/${id}/members/${userId}`, { role }),
  removeMember: (id: string, userId: string) =>
    http.delete(`/teams/${id}/members/${userId}`),
};

// ─── Workers (AI 슬롯) ────────────────────────────────
export const workers = {
  list: (teamId: string) =>
    http.get<Worker[]>(`/teams/${teamId}/workers`),
  create: (teamId: string, name: string) =>
    http.post<Worker>(`/teams/${teamId}/workers`, { name }),
  delete: (teamId: string, workerId: string) =>
    http.delete(`/teams/${teamId}/workers/${workerId}`),
  updateModel: (teamId: string, workerId: string, model: string) =>
    http.patch<Worker>(`/teams/${teamId}/workers/${workerId}/model`, { model }),
};

// ─── MCP Configs (사용자 PC 접근 설정) ───────────────
export const mcpConfigs = {
  /** 내 MCP 목록 */
  listMine: () =>
    http.get<McpConfig[]>("/mcp-configs"),
  /** 내 MCP 등록 — 응답: { mcp_config, token, online } */
  create: (data: { name: string; mcp_token?: string; base_dir?: string }) =>
    http.post<{ mcp_config: McpConfig; token: string; online: boolean }>("/mcp-configs", data),
  /** 내 MCP 수정 */
  update: (id: string, data: { name?: string; base_dir?: string }) =>
    http.put<McpConfig>(`/mcp-configs/${id}`, data),
  /** 내 MCP 삭제 */
  delete: (id: string) =>
    http.delete(`/mcp-configs/${id}`),
  /** 팀별 공개/비공개 설정 */
  setTeamVisibility: (configId: string, teamId: string, isPublic: boolean) =>
    http.put<{ ok: boolean; is_public: boolean }>(
      `/mcp-configs/${configId}/teams/${teamId}`,
      null,
      { params: { is_public: isPublic } }
    ),
  /** 팀 내 접근 가능한 MCP 목록 (본인 소유 + 팀 public) */
  listForTeam: (teamId: string) =>
    http.get<McpConfigWithTeam[]>(`/teams/${teamId}/mcp-configs`),
  /** 파일시스템 탐색 (MCP 서버 프록시) */
  browse: (configId: string, path = ".") =>
    http.get<{ items: Array<{ name: string; type: string; path: string; size: number | null }>; base_dir: string | null }>(
      `/mcp-configs/${configId}/fs/browse`,
      { params: { path } }
    ),
  /** OS 네이티브 폴더 선택 다이얼로그 (MCP 서버 프록시 — 전체 경로 반환) */
  pickFolder: (configId: string) =>
    http.get<{ path: string | null }>(`/mcp-configs/${configId}/fs/pick-folder`),
  /** config 없어도 폴더 선택 다이얼로그 (pending endpoint 또는 연결된 config 사용) */
  pickFolderDetect: () =>
    http.get<{ path: string | null }>("/mcp-configs/pick-folder-detect"),
  /** 이름만 변경 (MCP 서버 관여 없음) */
  rename: (id: string, name: string) =>
    http.patch<McpConfig>(`/mcp-configs/${id}/name`, { name }),
  /** 경로 변경 — WS로 MCP 서버에 폴더 선택 팝업 요청 */
  requestFolderPick: (configId: string) =>
    http.post<{ ok: boolean; message: string }>(`/mcp-configs/${configId}/request-folder-pick`),
  /** 자동 승인 토글 */
  toggleAutoApprove: (id: string) =>
    http.patch<{ auto_approve: boolean }>(`/mcp-configs/${id}/auto-approve`),
  /** 인스톨러 다운로드 URL 반환 */
  getDownloadUrl: (token: string) =>
    http.get<{ download_url: string; token: string; config_id: string; name: string }>(
      `/mcp-configs/download`, { params: { token } }
    ),
};

// ─── Rooms ────────────────────────────────────────────
export const rooms = {
  list: (teamId: string) =>
    http.get<ChatRoom[]>(`/teams/${teamId}/rooms`),
  create: (teamId: string, name: string) =>
    http.post<ChatRoom>(`/teams/${teamId}/rooms`, { name }),
  get: (id: string) => http.get<ChatRoom>(`/rooms/${id}`),
  update: (id: string, data: { name?: string }) =>
    http.patch<ChatRoom>(`/rooms/${id}`, data),
  delete: (id: string) => http.delete(`/rooms/${id}`),
  members: (id: string) => http.get(`/rooms/${id}/members`),
  addMember: (id: string, userId: string) =>
    http.post(`/rooms/${id}/members`, { user_id: userId }),
  removeMember: (id: string, userId: string) =>
    http.delete(`/rooms/${id}/members/${userId}`),
};

// ─── Messages ─────────────────────────────────────────
export const messages = {
  list: (roomId: string, cursor?: string, limit = 50) =>
    http.get<MessagesPage>(`/rooms/${roomId}/messages`, {
      params: { cursor, limit },
    }),
  send: (roomId: string, content: string) =>
    http.post<Message>(`/rooms/${roomId}/messages`, { content }),
  sendAi: (roomId: string, content: string) =>
    http.post<{ task_id: string }>(`/rooms/${roomId}/ai`, { content }),
  confirmAi: (roomId: string, taskId: string, confirmed: boolean) =>
    http.post<{ status: string; task_id?: string }>(`/rooms/${roomId}/ai/confirm`, {
      task_id: taskId,
      confirmed,
    }),
};


// ─── Invitations ──────────────────────────────────────────────
export const invitations = {
  list: () => http.get<Invitation[]>("/invitations"),
  accept: (id: string) => http.post<{ ok: boolean; team_id: string }>(`/invitations/${id}/accept`),
  reject: (id: string) => http.post<{ ok: boolean }>(`/invitations/${id}/reject`),
};

// ─── Tasks ────────────────────────────────────────────────
export const tasks = {
  list: (roomId: string) =>    http.get<{ tasks: AiTask[] }>(`/rooms/${roomId}/tasks`),
  get: (id: string) => http.get<AiTask>(`/tasks/${id}`),
  revert: (id: string) => http.post(`/tasks/${id}/revert`),
  cancel: (id: string) => http.post(`/tasks/${id}/cancel`),
};
