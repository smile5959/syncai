import { rooms as roomsApi } from "@/lib/api";
import type { RoomInitData } from "@/lib/api";

const CACHE_TTL = 30_000; // 30초

interface CacheEntry {
  data: RoomInitData;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Set<string>();

export function getCachedRoom(id: string): RoomInitData | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(id);
    return null;
  }
  return entry.data;
}

export function setCachedRoom(id: string, data: RoomInitData) {
  cache.set(id, { data, ts: Date.now() });
}

export function prefetchRoom(id: string) {
  if (!id) return;
  if (inFlight.has(id)) return;
  const entry = cache.get(id);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return;

  inFlight.add(id);
  roomsApi.init(id)
    .then((r) => { cache.set(id, { data: r.data, ts: Date.now() }); })
    .catch(() => {})
    .finally(() => { inFlight.delete(id); });
}

export function invalidateRoom(id: string) {
  cache.delete(id);
}
