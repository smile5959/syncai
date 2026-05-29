import { create } from "zustand";
import type { ChatRoom } from "@/types";

interface RoomsState {
  rooms: ChatRoom[];
  showSidebar: boolean;
  showCreate: boolean;
  showInvite: boolean;
  setRooms: (rooms: ChatRoom[]) => void;
  addRoom: (room: ChatRoom) => void;
  updateRoom: (id: string, updates: Partial<ChatRoom>) => void;
  removeRoom: (id: string) => void;
  setShowSidebar: (v: boolean | ((prev: boolean) => boolean)) => void;
  setShowCreate: (v: boolean) => void;
  setShowInvite: (v: boolean) => void;
}

export const useRoomsStore = create<RoomsState>((set) => ({
  rooms: [],
  showSidebar: true,
  showCreate: false,
  showInvite: false,

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
}));
