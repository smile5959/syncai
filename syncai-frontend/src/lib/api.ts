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
  ComposioApp,
  ComposioConnection,
} from "@/types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

// ── Tauri 감지 + 토큰 저장 헬퍼 ───────────────────────────────────────────────
function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  // Tauri v2는 __TAURI_INTERNALS__ 전역 객체를 자동으로 주입함
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

const TOKEN_KEY = "syncai_access_token";
const REFRESH_KEY = "syncai_refresh_token";

export function saveTokens(access: string, refresh?: string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function getAccessToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(REFRESH_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────

const http = axios.create({
  baseURL: BASE,
  withCredentials: true,
});

// Tauri 모드: 모든 요청에 Authorization: Bearer 헤더 추가
http.interceptors.request.use((config) => {
  if (isTauri()) {
    const token = getAccessToken();
    if (token) config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// 401 시 토큰 갱신
let _refreshing: Promise<void> | null = null;

export async function logoutUser() {
  clearTokens();
  // HttpOnly 쿠키는 document.cookie로 지울 수 없으므로 서버 엔드포인트를 await해야 함
  // navigate 전에 응답이 와야 미들웨어가 쿠키 없는 상태로 /login을 허용
  try {
    if (isTauri()) {
      await axios.post(`${BASE}/auth/logout`, {}, { withCredentials: true });
    } else {
      await axios.post("/api/auth/logout", {}, { withCredentials: true });
    }
  } catch {
    // 서버 실패해도 리다이렉트는 진행
  }
  window.location.href = "/login";
}

function _logoutAndRedirect() {
  logoutUser();
}

http.interceptors.response.use(
  (r) => r,
  async (err) => {
    const skipUrls = ["/auth/login", "/auth/signup", "/auth/refresh"];
    const isSkip = skipUrls.some((u) => err.config?.url?.includes(u));
    if (err.response?.status === 401 && !err.config._retry && !isSkip) {
      err.config._retry = true;
      if (!_refreshing) {
        const refreshToken = isTauri() ? getRefreshToken() : undefined;
        _refreshing = axios
          .post(
            `${BASE}/auth/refresh`,
            refreshToken ? { refresh_token: refreshToken } : {},
            { withCredentials: true }
          )
          .then((res) => {
            // Tauri: 새 토큰 localStorage에 저장
            if (isTauri() && res.data?.token) {
              saveTokens(res.data.token, res.data.refresh_token);
            }
            _refreshing = null;
          })
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
export interface TeamInitData {
  rooms: ChatRoom[];
  workers: Worker[];
  mcp_configs: McpConfigWithTeam[];
}

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
  init: (teamId: string) => http.get<TeamInitData>(`/teams/${teamId}/init`),
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
    http.get<{ download_url: string; install_sh_url?: string; install_ps1_url?: string; token: string; config_id: string; name: string }>(
      `/mcp-configs/download`, { params: { token } }
    ),
  /** macOS .command 파일 다운로드 URL */
  getInstallCommandUrl: (token: string) =>
    `${http.defaults.baseURL ?? ""}/mcp-configs/install-command?token=${encodeURIComponent(token)}`,
};

// ─── Rooms ────────────────────────────────────────────
export interface RoomInitData {
  room: ChatRoom;
  messages: Message[];
  next_cursor: string | null;
  tasks: AiTask[];
}

export const rooms = {
  list: (teamId: string) =>
    http.get<ChatRoom[]>(`/teams/${teamId}/rooms`),
  create: (teamId: string, name: string) =>
    http.post<ChatRoom>(`/teams/${teamId}/rooms`, { name }),
  get: (id: string) => http.get<ChatRoom>(`/rooms/${id}`),
  init: (id: string) => http.get<RoomInitData>(`/rooms/${id}/init`),
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
  confirmAi: (roomId: string, taskId: string, confirmed: boolean, composio_app?: string | null) =>
    http.post<{ status: string; task_id?: string }>(`/rooms/${roomId}/ai/confirm`, {
      task_id: taskId,
      confirmed,
      ...(composio_app ? { composio_app } : {}),
    }),
};


// ─── Invitations ──────────────────────────────────────────────
export const invitations = {
  list: () => http.get<Invitation[]>("/invitations"),
  accept: (id: string) => http.post<{ ok: boolean; team_id: string }>(`/invitations/${id}/accept`),
  reject: (id: string) => http.post<{ ok: boolean }>(`/invitations/${id}/reject`),
};

// ─── Integrations (Composio) ──────────────────────────────
export const integrations = {
  listApps: (search?: string) =>
    http.get<ComposioApp[]>("/integrations/apps", { params: search ? { search } : undefined }),
  listConnections: () => http.get<ComposioConnection[]>("/integrations/connections"),
  connect: (app_name: string) =>
    http.post<{ redirectUrl?: string; connectionStatus: string; connectedAccountId: string }>(
      "/integrations/connect",
      { app_name, redirect_uri: `${window.location.origin}/integrations` }
    ),
  disconnect: (connection_id: string) =>
    http.delete<{ ok: boolean }>(`/integrations/connections/${connection_id}`),
};

// ─── Tasks ────────────────────────────────────────────────
export const tasks = {
  list: (roomId: string) =>    http.get<{ tasks: AiTask[] }>(`/rooms/${roomId}/tasks`),
  get: (id: string) => http.get<AiTask>(`/tasks/${id}`),
  revert: (id: string) => http.post(`/tasks/${id}/revert`),
  cancel: (id: string) => http.post(`/tasks/${id}/cancel`),
};
