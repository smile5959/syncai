import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Team } from "@/types";

interface AuthState {
  user: User | null;
  team: Team | null;
  teams: Team[];
  autoLogin: boolean;
  setUser: (user: User) => void;
  setTeam: (team: Team) => void;
  setTeams: (teams: Team[]) => void;
  setAutoLogin: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      team: null,
      teams: [],
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

      setTeams: (teams) => set({ teams }),

      setAutoLogin: (v) => set({ autoLogin: v }),

      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("team_id");
        }
        set({ user: null, team: null, teams: [] });
      },
    }),
    {
      name: "syncai-auth",
      partialize: (state) => ({
        autoLogin: state.autoLogin,
        team: state.team,
        user: state.autoLogin ? state.user : null,
      }),
      // SSR hydration mismatch 방지: 서버는 초기값(null)으로 렌더, 클라이언트는
      // hydration 완료 후 useEffect에서 rehydrate() 호출해 localStorage 복원
      skipHydration: true,
    }
  )
);
