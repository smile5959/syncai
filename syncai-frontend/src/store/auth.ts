import { create } from "zustand";
import type { User, Team } from "@/types";

interface AuthState {
  user: User | null;
  team: Team | null;
  setUser: (user: User) => void;
  setTeam: (team: Team) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  team: null,

  setUser: (user) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("team_id", ""); // team_id는 비워두고 setTeam에서 세팅
    }
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
}));
