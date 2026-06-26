"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { IconNav } from "@/components/layout/icon-nav";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { useAuthStore } from "@/store/auth";
import { useRoomsStore } from "@/store/rooms";
import { users as usersApi, saveTokens, logoutUser } from "@/lib/api";
import type { TeamInitData } from "@/lib/api";
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

function getTokenExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

function secondsUntilExpiry(): number {
  const token = getStoredToken("syncai_access_token");
  if (!token) return 0;
  const exp = getTokenExpiry(token);
  if (!exp) return 0;
  return exp - Math.floor(Date.now() / 1000);
}

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
  const { user, setUser, setTeam, setTeams, logout } = useAuthStore();
  const { setTeamsCache } = useRoomsStore();
  const checked = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAliveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function scheduleRefresh() {
    if (!isTauri()) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const secs = secondsUntilExpiry();
    const delay = Math.max((secs - 300) * 1000, 0);
    refreshTimer.current = setTimeout(async () => {
      const ok = await silentRefresh();
      if (ok) {
        scheduleRefresh();
      } else {
        logout();
        router.replace("/login");
      }
    }, delay);
  }

  // SSR 후 hydration 완료 시점에 Zustand persist 복원 (skipHydration: true 대응)
  useEffect(() => {
    useAuthStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (checked.current) return;
    checked.current = true;

    // Fly.io suspend 방지
    fetch(HEALTH_URL).catch(() => {});
    keepAliveTimer.current = setInterval(() => {
      fetch(HEALTH_URL).catch(() => {});
    }, 4 * 60 * 1000);

    const init = async () => {
      if (isTauri()) {
        const secs = secondsUntilExpiry();
        if (secs < 300) {
          const ok = await silentRefresh();
          if (!ok) {
            logout();
            router.replace("/login");
            return;
          }
        }
        scheduleRefresh();
      }

      // meInit — 유저 + 모든 팀 데이터를 한 번에 로드
      usersApi.meInit()
        .then((res) => {
          const { user, teams: teamsWithData } = res.data;
          setUser(user);

          // 팀 목록 auth store에 저장
          const teamsList = teamsWithData.map((td) => td.team);
          setTeams(teamsList);

          // 팀별 데이터를 rooms store 캐시에 저장
          const cache: Record<string, TeamInitData> = {};
          for (const td of teamsWithData) {
            cache[td.team.id] = {
              rooms: td.rooms,
              workers: td.workers,
              mcp_configs: td.mcp_configs,
            };
          }
          setTeamsCache(cache);

          // 마지막으로 선택한 팀 복원
          const savedId = typeof window !== "undefined" ? localStorage.getItem("team_id") : null;
          const active = teamsList.find((t) => t.id === savedId) ?? teamsList[0];
          if (active) setTeam(active);
        })
        .catch((err) => {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            // 인증 만료 — 쿠키까지 제대로 삭제하고 /login으로 (루프 방지)
            logoutUser();
          }
          // 5xx·네트워크 오류는 로그아웃하지 않음 (쿠키 유지, 새로고침으로 복구 가능)
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
    <ConfirmDialogProvider>
      <div className="flex h-full bg-[var(--bg-base)]">
        <IconNav />
        <div className="flex-1 flex overflow-hidden">{children}</div>
      </div>
    </ConfirmDialogProvider>
  );
}
