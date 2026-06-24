import { create } from "zustand";
import type { ChatRoom, Worker, McpConfigWithTeam } from "@/types";

interface RoomsState {
  rooms: ChatRoom[];
  workers: Worker[];
  teamMcpConfigs: McpConfigWithTeam[];
  showSidebar: boolean;
  showCreate: boolean;
  showInvite: boolean;
  unreadCounts: Record<string, number>;
  currentRoomUuid: string | null;   // 현재 보고 있는 방의 UUID (slug 변환 완료)
  setRooms: (rooms: ChatRoom[]) => void;
  addRoom: (room: ChatRoom) => void;
  updateRoom: (id: string, updates: Partial<ChatRoom>) => void;
  removeRoom: (id: string) => void;
  setWorkers: (workers: Worker[]) => void;
  setTeamMcpConfigs: (configs: McpConfigWithTeam[]) => void;
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
  showSidebar: true,
  showCreate: false,
  showInvite: false,
  unreadCounts: {},
  currentRoomUuid: null,

  setRooms: (rooms) => set({ rooms }),
  setWorkers: (workers) => set({ workers }),
  setTeamMcpConfigs: (teamMcpConfigs) => set({ teamMcpConfigs }),

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
