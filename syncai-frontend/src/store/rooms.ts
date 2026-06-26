import { create } from "zustand";
import type { ChatRoom, Worker, McpConfigWithTeam } from "@/types";
import type { TeamInitData } from "@/lib/api";

interface RoomsState {
  rooms: ChatRoom[];
  workers: Worker[];
  teamMcpConfigs: McpConfigWithTeam[];
  // meInit으로 미리 로드된 팀별 캐시 — teamId → {rooms, workers, mcp_configs}
  teamsCache: Record<string, TeamInitData>;
  showSidebar: boolean;
  showCreate: boolean;
  showInvite: boolean;
  unreadCounts: Record<string, number>;
  currentRoomUuid: string | null;
  setRooms: (rooms: ChatRoom[]) => void;
  addRoom: (room: ChatRoom) => void;
  updateRoom: (id: string, updates: Partial<ChatRoom>) => void;
  removeRoom: (id: string) => void;
  setWorkers: (workers: Worker[]) => void;
  updateWorker: (worker: Worker) => void;
  setTeamMcpConfigs: (configs: McpConfigWithTeam[]) => void;
  setTeamsCache: (cache: Record<string, TeamInitData>) => void;
  updateTeamCache: (teamId: string, data: TeamInitData) => void;
  setShowSidebar: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowCreate: (v: boolean) => void;
  setShowInvite: (v: boolean) => void;
  setCurrentRoomUuid: (uuid: string | null) => void;
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  workers: [],
  teamMcpConfigs: [],
  teamsCache: {},
  showSidebar: true,
  showCreate: false,
  showInvite: false,
  unreadCounts: {},
  currentRoomUuid: null,

  setRooms: (rooms) => set({ rooms }),
  setWorkers: (workers) => set({ workers }),

  updateWorker: (worker) =>
    set((s) => ({
      workers: s.workers.some((w) => w.id === worker.id)
        ? s.workers.map((w) => (w.id === worker.id ? worker : w))
        : [...s.workers, worker],
    })),

  setTeamMcpConfigs: (teamMcpConfigs) => set({ teamMcpConfigs }),
  setTeamsCache: (teamsCache) => set({ teamsCache }),
  updateTeamCache: (teamId, data) =>
    set((s) => ({ teamsCache: { ...s.teamsCache, [teamId]: data } })),

  addRoom: (room) => set((s) => ({ rooms: [room, ...s.rooms] })),

  updateRoom: (id, updates) =>
    set((s) => ({
      rooms: s.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

  removeRoom: (id) =>
    set((s) => ({ rooms: s.rooms.filter((r) => r.id !== id) })),

  setShowSidebar: (v) =>
    set((s) => ({
      showSidebar: typeof v === "function" ? v(s.showSidebar) : v,
    })),

  setShowCreate: (v) => set({ showCreate: v }),
  setShowInvite: (v) => set({ showInvite: v }),
  setCurrentRoomUuid: (uuid) => set({ currentRoomUuid: uuid }),

  incrementUnread: (roomId) =>
    set((s) => ({
      unreadCounts: {
        ...s.unreadCounts,
        [roomId]: (s.unreadCounts[roomId] ?? 0) + 1,
      },
    })),

  clearUnread: (roomId) =>
    set((s) => {
      const next = { ...s.unreadCounts };
      delete next[roomId];
      return { unreadCounts: next };
    }),
}));
