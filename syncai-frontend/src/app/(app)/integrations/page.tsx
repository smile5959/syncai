"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Plug, Loader2, X, Zap } from "lucide-react";
import { integrations as integrationsApi } from "@/lib/api";
import type { ComposioApp, ComposioConnection } from "@/types";

// ─── 스켈레톤 ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex flex-col gap-4 p-5 rounded-2xl animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-2xl flex-shrink-0" style={{ background: "var(--bg-hover)" }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-3.5 rounded-full w-3/4" style={{ background: "var(--bg-hover)" }} />
          <div className="h-2.5 rounded-full w-2/5" style={{ background: "var(--bg-hover)" }} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-2.5 rounded-full w-full" style={{ background: "var(--bg-hover)" }} />
        <div className="h-2.5 rounded-full w-4/5" style={{ background: "var(--bg-hover)" }} />
      </div>
      <div className="h-9 rounded-xl mt-auto" style={{ background: "var(--bg-hover)" }} />
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
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex flex-col gap-4 p-5 rounded-2xl transition-all duration-200"
      style={{
        background: isConnected
          ? "var(--accent-bg)"
          : hovered
          ? "var(--bg-elevated, var(--bg-soft))"
          : "var(--bg-surface)",
        border: `1px solid ${
          isConnected
            ? "var(--accent-dim, var(--border-strong))"
            : hovered
            ? "var(--border-strong)"
            : "var(--border)"
        }`,
        boxShadow: hovered && !isConnected
          ? "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.08))"
          : isConnected
          ? "var(--shadow-sm, 0 1px 4px rgba(0,0,0,0.04))"
          : "none",
        opacity: connecting ? 0.6 : 1,
        transform: connecting ? "scale(0.97)" : "scale(1)",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 로고 + 이름 */}
      <div className="flex items-start gap-3.5">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{
            background: "var(--bg-base, var(--bg))",
            border: "1px solid var(--border)",
          }}
        >
          {app.logo ? (
            <img
              src={app.logo}
              alt={displayName}
              className="w-8 h-8 object-contain"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `<span style="font-size:14px;font-weight:700;color:var(--text-muted)">${displayName.slice(0, 2).toUpperCase()}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-muted)" }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
              {displayName}
            </p>
            {isConnected && (
              <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: "var(--accent)" }} />
            )}
          </div>
          {app.categories?.[0] && (
            <p className="truncate" style={{ color: "var(--text-muted)", fontSize: 11 }}>
              {app.categories[0]}
            </p>
          )}
        </div>
      </div>

      {/* 설명 */}
      {app.description && (
        <p
          className="line-clamp-2 leading-relaxed flex-1"
          style={{ color: "var(--text-soft, var(--text-muted))", fontSize: 12, lineHeight: 1.6 }}
        >
          {app.description}
        </p>
      )}

      {/* 버튼 */}
      <div className="mt-auto">
        {isConnected ? (
          <DisconnectButton onClick={() => onDisconnect(connection!.id)} disabled={connecting} />
        ) : (
          <ConnectButton onClick={() => onConnect(app.key)} disabled={connecting} loading={connecting} />
        )}
      </div>
    </div>
  );
}

function ConnectButton({ onClick, disabled, loading }: { onClick: () => void; disabled: boolean; loading: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full py-2.5 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all duration-150"
      style={{
        background: hovered ? "var(--accent-soft, var(--accent))" : "var(--accent)",
        color: "#fff",
        fontSize: 12,
        opacity: disabled ? 0.65 : 1,
        letterSpacing: "0.01em",
      }}
    >
      {loading ? <><Loader2 size={12} className="animate-spin" />연결 중...</> : "연결하기"}
    </button>
  );
}

function DisconnectButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full py-2.5 rounded-xl font-medium transition-all duration-150"
      style={{
        color: hovered ? "var(--red, #e55)" : "var(--text-muted)",
        border: `1px solid ${hovered ? "rgba(229,85,85,0.35)" : "var(--border)"}`,
        background: hovered ? "rgba(229,85,85,0.06)" : "transparent",
        fontSize: 12,
      }}
    >
      연결 해제
    </button>
  );
}

// ─── 앱 그리드 ───────────────────────────────────────────────────────────────

function AppGrid({ items, connectionMap, connectingApp, onConnect, onDisconnect }: {
  items: ComposioApp[];
  connectionMap: Record<string, ComposioConnection>;
  connectingApp: string | null;
  onConnect: (k: string) => void;
  onDisconnect: (id: string) => void;
}) {
  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "14px",
      }}
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
  const commonGridProps = {
    connectionMap,
    connectingApp,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
  };

  return (
    <div
      className="flex-1 min-w-0 h-full overflow-y-auto"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      <div className="mx-auto w-full px-8 pt-10 pb-12" style={{ maxWidth: 1040 }}>

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--gradient-accent, var(--accent))",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <Zap size={16} fill="white" color="white" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>
                연동
              </h1>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)", paddingLeft: 48 }}>
              외부 서비스를 연결하면 AI가 Notion, Figma, GitHub 등에 직접 접근해 작업합니다
            </p>
          </div>

          {connectedCount > 0 && (
            <div
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold flex-shrink-0 mt-1"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent-dim, var(--border-strong))",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
              {connectedCount}개 연결됨
            </div>
          )}
        </div>

        {/* ── 검색 + 필터 ── */}
        <div className="flex items-center gap-3 mb-8">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="앱 이름, 카테고리로 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl outline-none transition-all"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                fontSize: 13,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-glow, var(--accent-bg))";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div
            className="flex p-1 rounded-2xl gap-1 flex-shrink-0"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {(["all", "connected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-4 py-2 rounded-xl font-medium transition-all duration-150"
                style={{
                  background: filter === f ? "var(--accent)" : "transparent",
                  color: filter === f ? "#fff" : "var(--text-muted)",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                }}
              >
                {f === "all" ? "전체" : `연결됨 ${connectedCount > 0 ? connectedCount : ""}`}
              </button>
            ))}
          </div>
        </div>

        {/* ── 구분선 ── */}
        <div className="mb-8" style={{ height: 1, background: "var(--border)" }} />

        {/* ── 콘텐츠 ── */}
        {loadingApps ? (
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "14px" }}
          >
            {Array.from({ length: 12 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState filter={filter} onReset={() => setFilter("all")} />
        ) : (
          <div className="flex flex-col gap-10">
            {/* 연결됨 섹션 */}
            {filter === "all" && connectedInFiltered.length > 0 && (
              <section>
                <SectionLabel label="연결됨" count={connectedInFiltered.length} accent />
                <AppGrid items={connectedInFiltered} {...commonGridProps} />
              </section>
            )}

            {/* 전체 / 연결 안 된 앱 */}
            {(filter !== "all" || unconnectedInFiltered.length > 0) && (
              <section>
                {filter === "all" && connectedInFiltered.length > 0 && (
                  <SectionLabel label="전체 앱" count={unconnectedInFiltered.length} />
                )}
                <AppGrid
                  items={filter === "all" ? unconnectedInFiltered : filtered}
                  {...commonGridProps}
                />
              </section>
            )}
          </div>
        )}
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-2.5 rounded-2xl z-50"
          style={{
            background: toast.type === "error" ? "var(--red, #d94)" : "var(--accent)",
            color: "#fff",
            boxShadow: "var(--shadow-lg, 0 8px 24px rgba(0,0,0,0.18))",
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

// ─── 섹션 라벨 ───────────────────────────────────────────────────────────────

function SectionLabel({ label, count, accent }: { label: string; count?: number; accent?: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <p
        className="text-xs font-bold uppercase tracking-widest"
        style={{ color: accent ? "var(--accent)" : "var(--text-muted)", fontSize: 11 }}
      >
        {label}
      </p>
      {count !== undefined && (
        <span
          className="text-xs px-1.5 py-0.5 rounded-md font-semibold"
          style={{
            background: accent ? "var(--accent-bg)" : "var(--bg-surface)",
            color: accent ? "var(--accent)" : "var(--text-muted)",
            fontSize: 10,
            border: `1px solid ${accent ? "var(--accent-dim, var(--border))" : "var(--border)"}`,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}

// ─── 빈 상태 ─────────────────────────────────────────────────────────────────

function EmptyState({ filter, onReset }: { filter: "all" | "connected"; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <Plug size={24} style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold mb-1.5" style={{ color: "var(--text)" }}>
          {filter === "connected" ? "연결된 앱이 없습니다" : "검색 결과가 없습니다"}
        </p>
        <p className="text-sm" style={{ color: "var(--text-muted)", maxWidth: 300 }}>
          {filter === "connected"
            ? "앱을 연결하면 AI가 외부 서비스에 직접 접근할 수 있어요"
            : "다른 검색어로 시도해보세요"}
        </p>
      </div>
      {filter === "connected" && (
        <button
          onClick={onReset}
          className="px-5 py-2.5 rounded-xl font-medium text-sm mt-1"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          앱 둘러보기
        </button>
      )}
    </div>
  );
}

// ─── 페이지 ──────────────────────────────────────────────────────────────────

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsContent />
    </Suspense>
  );
}
