import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Team } from "@/types";

interface AuthState {
  user: User | null;
  team: Team | null;
  autoLogin: boolean;
  setUser: (user: User) => void;
  setTeam: (team: Team) => void;
  setAutoLogin: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      team: null,
      autoLogin: true,

      setUser: (user) => {
        set({ user });
      },

      setTeam: (team) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("team_id", team.id);
        }
        set({ team });
      },

      setAutoLogin: (v) => set({ autoLogin: v }),

      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("team_id");
        }
        set({ user: null, team: null });
      },
    }),
    {
      name: "syncai-auth",
      // autoLogin=false 시 user를 저장하지 않음 → 앱 재시작 시 로그인 요구
      partialize: (state) => ({
        autoLogin: state.autoLogin,
        team: state.team,
        user: state.autoLogin ? state.user : null,
      }),
    }
  )
);
