import { create } from "zustand";
import type { ChatRoom } from "@/types";

interface RoomsState {
  rooms: ChatRoom[];
  showSidebar: boolean;
  showCreate: boolean;
  showInvite: boolean;
  unreadCounts: Record<string, number>;
  setRooms: (rooms: ChatRoom[]) => void;
  addRoom: (room: ChatRoom) => void;
  updateRoom: (id: string, updates: Partial<ChatRoom>) => void;
  removeRoom: (id: string) => void;
  setShowSidebar: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowCreate: (v: boolean) => void;
  setShowInvite: (v: boolean) => void;
  incrementUnread: (roomId: string) => void;
  clearUnread: (roomId: string) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  showSidebar: true,
  showCreate: false,
  showInvite: false,
  unreadCounts: {},

  setRooms: (rooms) => set({ rooms }),

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
