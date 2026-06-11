"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconNav } from "@/components/layout/icon-nav";
import { useAuthStore } from "@/store/auth";
import { users as usersApi, saveTokens } from "@/lib/api";
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";
const HEALTH_URL = BASE.replace(/\/v1$/, "") + "/health";

function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window || "__TAURI__" in window;
}

function getStoredToken(key: string): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(key);
}

/** JWT exp 필드 디코딩 (초 단위) */
function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

/** access_token 만료까지 남은 초 */
function secondsUntilExpiry(): number {
  const token = getStoredToken("syncai_access_token");
  if (!token) return 0;
  const exp = getTokenExpiry(token);
  if (!exp) return 0;
  return exp - Math.floor(Date.now() / 1000);
}

/** Tauri 전용 silent token refresh */
async function silentRefresh(): Promise<boolean> {
  if (!isTauri()) return false;
  const refreshToken = getStoredToken("syncai_refresh_token");
  if (!refreshToken) return false;
  try {
    const res = await axios.post(
      `${BASE}/auth/refresh`,
      { refresh_token: refreshToken },
      { withCredentials: true }
    );
    if (res.data?.token) {
      saveTokens(res.data.token, res.data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, setUser, logout } = useAuthStore();
  const checked = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 만료 5분 전에 자동 refresh 예약 */
  function scheduleRefresh() {
    if (!isTauri()) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const secs = secondsUntilExpiry();
    // 만료까지 5분(300초) 이상 남아있을 때 → (secs - 300)초 후 refresh
    // 5분 미만 남았으면 → 즉시 refresh
    const delay = Math.max((secs - 300) * 1000, 0);
    refreshTimer.current = setTimeout(async () => {
      const ok = await silentRefresh();
      if (ok) {
        scheduleRefresh(); // 성공하면 다음 만료 예약
      } else {
        logout();
        router.replace("/login");
      }
    }, delay);
  }

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Fly.io suspend 방지: 앱 시작 시 즉시 ping + 4분마다 keep-alive
    fetch(HEALTH_URL).catch(() => {});
    keepAliveTimer.current = setInterval(() => {
      fetch(HEALTH_URL).catch(() => {});
    }, 4 * 60 * 1000);

    const init = async () => {
      // Tauri: access_token이 만료됐거나 5분 이내면 즉시 refresh
      if (isTauri()) {
        const secs = secondsUntilExpiry();
        if (secs < 300) {
          const ok = await silentRefresh();
          if (!ok) {
            // refresh 실패 = 세션 만료 → 무조건 로그아웃
            logout();
            router.replace("/login");
            return;
          }
        }
        scheduleRefresh();
      }

      // 유저 정보 확인 (persist store에 있어도 항상 검증)
      usersApi.me()
        .then((res) => setUser(res.data))
        .catch(() => {
          logout();
          router.replace("/login");
        });
    };

    init();

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (keepAliveTimer.current) clearInterval(keepAliveTimer.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full bg-[var(--bg-base)]">
      <IconNav />
      <div className="flex-1 flex overflow-hidden">{children}</div>
    </div>
  );
}
