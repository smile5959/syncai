"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Plug, Loader2, X, Zap } from "lucide-react";
import { integrations as integrationsApi } from "@/lib/api";
import type { ComposioApp, ComposioConnection } from "@/types";

// ─── 스켈레톤 카드 ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-2xl animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl flex-shrink-0" style={{ background: "var(--bg-hover)" }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-3 rounded-full w-3/4" style={{ background: "var(--bg-hover)" }} />
          <div className="h-2.5 rounded-full w-1/2" style={{ background: "var(--bg-hover)" }} />
        </div>
      </div>
      <div className="h-2.5 rounded-full w-full" style={{ background: "var(--bg-hover)" }} />
      <div className="h-2.5 rounded-full w-5/6" style={{ background: "var(--bg-hover)" }} />
      <div className="h-8 rounded-xl mt-1" style={{ background: "var(--bg-hover)" }} />
    </div>
  );
}

// ─── 앱 카드 ─────────────────────────────────────────────────────────────────

interface AppCardProps {
  app: ComposioApp;
  connection?: ComposioConnection;
  onConnect: (appName: string) => void;
  onDisconnect: (connectionId: string) => void;
  connecting: boolean;
}

function AppCard({ app, connection, onConnect, onDisconnect, connecting }: AppCardProps) {
  const isConnected = !!connection;
  const displayName = app.displayName || app.name;

  return (
    <div
      className="flex flex-col gap-3 p-4 rounded-2xl transition-all duration-200"
      style={{
        background: isConnected ? "var(--accent-bg)" : "var(--bg-surface)",
        border: `1px solid ${isConnected ? "var(--accent-dim, var(--border-strong))" : "var(--border)"}`,
        opacity: connecting ? 0.65 : 1,
        transform: connecting ? "scale(0.98)" : "scale(1)",
      }}
    >
      {/* 로고 + 이름 */}
      <div className="flex items-start gap-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{ background: "var(--bg-elevated, var(--bg-hover))", border: "1px solid var(--border)" }}
        >
          {app.logo ? (
            <img
              src={app.logo}
              alt={displayName}
              className="w-7 h-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.innerHTML =
                  `<span style="font-size:13px;font-weight:700;color:var(--text-muted)">${displayName.slice(0, 2).toUpperCase()}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)", lineHeight: 1.3 }}>
              {displayName}
            </p>
            {isConnected && (
              <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: "var(--accent)" }} />
            )}
          </div>
          {app.categories?.[0] && (
            <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {app.categories[0]}
            </p>
          )}
        </div>
      </div>

      {/* 설명 */}
      {app.description && (
        <p
          className="text-xs leading-relaxed line-clamp-2 flex-1"
          style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.55 }}
        >
          {app.description}
        </p>
      )}

      {/* 버튼 */}
      <div className="mt-auto pt-1">
        {isConnected ? (
          <button
            onClick={() => onDisconnect(connection!.id)}
            disabled={connecting}
            className="w-full py-2 rounded-xl font-medium transition-all duration-150"
            style={{ color: "var(--text-muted)", border: "1px solid var(--border)", background: "transparent", fontSize: 12 }}
            onMouseEnter={e => {
              const b = e.currentTarget;
              b.style.color = "var(--red, #f87171)";
              b.style.borderColor = "rgba(248,113,113,0.4)";
              b.style.background = "rgba(248,113,113,0.06)";
            }}
            onMouseLeave={e => {
              const b = e.currentTarget;
              b.style.color = "var(--text-muted)";
              b.style.borderColor = "var(--border)";
              b.style.background = "transparent";
            }}
          >
            연결 해제
          </button>
        ) : (
          <button
            onClick={() => onConnect(app.key)}
            disabled={connecting}
            className="w-full py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-opacity duration-150"
            style={{ background: "var(--accent)", color: "#fff", fontSize: 12, opacity: connecting ? 0.7 : 1 }}
          >
            {connecting ? <><Loader2 size={11} className="animate-spin" />연결 중...</> : "연결하기"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 섹션 라벨 ───────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <p
      className="text-xs font-semibold mb-3 uppercase tracking-wider"
      style={{ color: "var(--text-muted)", fontSize: 11 }}
    >
      {label}
    </p>
  );
}

// ─── 그리드 ──────────────────────────────────────────────────────────────────

function AppGrid({ items, connectionMap, connectingApp, onConnect, onDisconnect }: {
  items: ComposioApp[];
  connectionMap: Record<string, ComposioConnection>;
  connectingApp: string | null;
  onConnect: (k: string) => void;
  onDisconnect: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
    >
      {items.map((app) => (
        <AppCard
          key={app.key}
          app={app}
          connection={connectionMap[app.key.toLowerCase()]}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          connecting={connectingApp === app.key}
        />
      ))}
    </div>
  );
}

// ─── 메인 컨텐츠 ─────────────────────────────────────────────────────────────

function IntegrationsContent() {
  const searchParams = useSearchParams();

  const [apps, setApps] = useState<ComposioApp[]>([]);
  const [connections, setConnections] = useState<ComposioConnection[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "connected">("all");
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadConnections = useCallback(async () => {
    try {
      const res = await integrationsApi.listConnections();
      setConnections(Array.isArray(res.data) ? res.data : []);
    } catch { /* 조용히 */ }
  }, []);

  // 앱 목록과 커넥션을 분리해서 로드 — 하나 실패해도 다른 건 표시
  useEffect(() => {
    setLoadingApps(true);
    integrationsApi.listApps()
      .then((res) => setApps(Array.isArray(res.data) ? res.data : []))
      .catch(() => showToast("앱 목록을 불러오지 못했습니다", "error"))
      .finally(() => setLoadingApps(false));

    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    if (searchParams.get("connected")) {
      showToast("연결이 완료되었습니다!");
      loadConnections();
      window.history.replaceState({}, "", "/integrations");
    }
  }, [searchParams, loadConnections]);

  const connectionMap = useMemo(() => {
    const map: Record<string, ComposioConnection> = {};
    for (const c of connections) if (c.appName) map[c.appName.toLowerCase()] = c;
    return map;
  }, [connections]);

  const filtered = useMemo(() => {
    let list = apps;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.displayName || a.name).toLowerCase().includes(s) ||
          a.key.toLowerCase().includes(s) ||
          a.categories?.some((c) => c.toLowerCase().includes(s))
      );
    }
    if (filter === "connected") {
      list = list.filter((a) => connectionMap[a.key.toLowerCase()]);
    }
    return list;
  }, [apps, search, filter, connectionMap]);

  const connectedInFiltered = useMemo(
    () => filtered.filter((a) => connectionMap[a.key.toLowerCase()]),
    [filtered, connectionMap]
  );
  const unconnectedInFiltered = useMemo(
    () => filtered.filter((a) => !connectionMap[a.key.toLowerCase()]),
    [filtered, connectionMap]
  );

  async function handleConnect(appName: string) {
    setConnectingApp(appName);
    try {
      const res = await integrationsApi.connect(appName);
      if (res.data.redirectUrl) {
        window.location.href = res.data.redirectUrl;
      } else {
        await loadConnections();
        showToast("연결이 완료되었습니다!");
      }
    } catch {
      showToast("연결에 실패했습니다", "error");
    } finally {
      setConnectingApp(null);
    }
  }

  async function handleDisconnect(connectionId: string) {
    try {
      await integrationsApi.disconnect(connectionId);
      await loadConnections();
      showToast("연결이 해제되었습니다");
    } catch {
      showToast("연결 해제에 실패했습니다", "error");
    }
  }

  const connectedCount = connections.length;

  return (
    // 전체 스크롤 컨테이너 — 부모 flex 컨테이너에서 남은 공간 전부 차지
    <div className="flex-1 min-w-0 h-full overflow-y-auto" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* 가운데 정렬 + 반응형 너비 */}
      <div className="mx-auto w-full px-6 py-8" style={{ maxWidth: 960 }}>

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "var(--gradient-accent, var(--accent))", boxShadow: "var(--shadow-md)" }}
              >
                <Zap size={15} fill="white" color="white" />
              </div>
              <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
                연동
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)", marginLeft: 42 }}>
              Notion, Figma, GitHub 등 외부 서비스를 연결하면 AI가 직접 작업합니다
            </p>
          </div>

          {connectedCount > 0 && (
            <div
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 mt-1"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent-dim, var(--border-strong))",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              {connectedCount}개 연결됨
            </div>
          )}
        </div>

        {/* ── 검색 + 필터 ── */}
        <div className="flex items-center gap-2.5 mb-6">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="앱 이름이나 카테고리 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 13,
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow, var(--accent-bg))";
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div
            className="flex p-1 rounded-xl gap-1 flex-shrink-0"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {(["all", "connected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3.5 py-1.5 rounded-lg font-medium transition-all duration-150"
                style={{
                  background: filter === f ? "var(--accent)" : "transparent",
                  color: filter === f ? "#fff" : "var(--text-muted)",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {f === "all" ? "전체" : `연결됨${connectedCount > 0 ? ` ${connectedCount}` : ""}`}
              </button>
            ))}
          </div>
        </div>

        {/* ── 구분선 ── */}
        <div className="mb-6" style={{ height: 1, background: "var(--border)" }} />

        {/* ── 앱 목록 ── */}
        {loadingApps ? (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              <Plug size={22} style={{ color: "var(--text-muted)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
              {filter === "connected" ? "연결된 앱이 없습니다" : "검색 결과가 없습니다"}
            </p>
            <p className="text-xs text-center" style={{ color: "var(--text-muted)", maxWidth: 280 }}>
              {filter === "connected"
                ? "앱을 연결하면 AI가 Notion, Figma 등 외부 서비스에 직접 접근할 수 있어요"
                : "다른 검색어로 시도해보세요"}
            </p>
            {filter === "connected" && (
              <button
                onClick={() => setFilter("all")}
                className="mt-1 px-4 py-2 rounded-lg font-medium"
                style={{ background: "var(--accent)", color: "#fff", fontSize: 12 }}
              >
                앱 찾아보기
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {/* 연결됨 섹션 (전체 필터일 때만 분리) */}
            {filter === "all" && connectedInFiltered.length > 0 && (
              <div>
                <SectionLabel label="연결됨" />
                <AppGrid
                  items={connectedInFiltered}
                  connectionMap={connectionMap}
                  connectingApp={connectingApp}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
              </div>
            )}

            {/* 전체 앱 섹션 */}
            {(filter !== "all" || unconnectedInFiltered.length > 0) && (
              <div>
                {filter === "all" && connectedInFiltered.length > 0 && (
                  <SectionLabel label="전체 앱" />
                )}
                <AppGrid
                  items={filter === "all" ? unconnectedInFiltered : filtered}
                  connectionMap={connectionMap}
                  connectingApp={connectingApp}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm z-50"
          style={{
            background: toast.type === "error" ? "var(--red, #e55)" : "var(--accent)",
            color: "#fff",
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.2))",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100 transition-opacity ml-1">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 페이지 래퍼 ─────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsContent />
    </Suspense>
  );
}
