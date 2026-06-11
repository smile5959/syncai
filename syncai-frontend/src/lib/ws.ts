import type { WsChatEvent, WsTaskEvent } from "@/types";
import { logoutUser, saveTokens } from "@/lib/api";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

/** Tauri 환경에서 WS URL에 ?token= 쿼리 파라미터 추가 */
function withToken(url: string): string {
  if (typeof window === "undefined") return url;
  if (!("__TAURI_INTERNALS__" in window || "__TAURI__" in window)) return url;
  const token = typeof localStorage !== "undefined"
    ? localStorage.getItem("syncai_access_token")
    : null;
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${token}`;
}

type Handler<T> = (event: T) => void;

/**
 * Refresh access token using refresh_token cookie.
 * Retries up to maxAttempts times with exponential backoff (1s, 2s, 4s).
 * Returns true on success, false if all attempts fail.
 */
async function tryRefreshToken(maxAttempts = 3): Promise<boolean> {
  const REFRESH_KEY = "syncai_refresh_token";
  const TOKEN_KEY = "syncai_access_token";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
    try {
      // Tauri 환경: localStorage refresh_token을 body에 포함
      const storedRefresh =
        typeof localStorage !== "undefined" ? localStorage.getItem(REFRESH_KEY) : null;
      const body = storedRefresh ? { refresh_token: storedRefresh } : {};
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // 새 토큰 받으면 localStorage에도 저장
        try {
          const data = await res.json();
          if (data?.token) {
            saveTokens(data.token, data.refresh_token);
            if (typeof localStorage !== "undefined") {
              localStorage.setItem(TOKEN_KEY, data.token);
            }
          }
        } catch { /* 무시 */ }
        return true;
      }
      // 401/403 means refresh_token itself is expired - no point retrying
      if (res.status === 401 || res.status === 403) return false;
    } catch {
      // Network error - retry
    }
  }
  return false;
}

async function clearAuthAndRedirect() {
  await logoutUser();
}

export class SyncWS<T> {
  private ws: WebSocket | null = null;
  private handlers: Set<Handler<T>> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private url: string;
  private onReconnect?: () => void;
  private isFirstConnect = true;

  constructor(url: string, onReconnect?: () => void) {
    this.url = url;
    this.onReconnect = onReconnect;
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      if (!this.isFirstConnect && this.onReconnect) {
        this.onReconnect();
      }
      this.isFirstConnect = false;
    };

    this.ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as T;
        this.handlers.forEach((h) => h(data));
      } catch {
        // ignore parse errors
      }
    };

    this.ws.onclose = (event) => {
      if (this.closed) return;

      if (event.code === 4001) {
        // Auth failure - retry refresh up to 3 times before logout
        tryRefreshToken(3).then((ok) => {
          if (ok) {
            this.connect();
          } else {
            clearAuthAndRedirect();
          }
        });
        return;
      }

      // Other errors (network drop etc.) - reconnect after 3s
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  send(data: unknown): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  on(handler: Handler<T>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}

export function createChatWS(roomId: string, onReconnect?: () => void) {
  return new SyncWS<WsChatEvent>(withToken(`${WS_BASE}/rooms/${roomId}/chat`), onReconnect);
}

export function createTaskWS(roomId: string) {
  return new SyncWS<WsTaskEvent>(withToken(`${WS_BASE}/rooms/${roomId}/tasks`));
}

export function createMcpWS(onReconnect?: () => void) {
  return new SyncWS<{ type: string; config_id: string }>(withToken(`${WS_BASE}/mcp`), onReconnect);
}
