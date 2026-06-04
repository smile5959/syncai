import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Team } from "@/types";

interface AuthState {
  user: User | null;
  team: Team | null;
  setUser: (user: User) => void;
  setTeam: (team: Team) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      team: null,

      setUser: (user) => {
        set({ user });
      },

      setTeam: (team) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("team_id", team.id);
        }
        set({ team });
      },

      logout: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem("team_id");
        }
        set({ user: null, team: null });
      },
    }),
    {
      name: "syncai-auth", // localStorage key
      partialize: (state) => ({ user: state.user, team: state.team }),
    }
  )
);
