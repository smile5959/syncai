"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Plug, Loader2, X, Zap, ChevronRight } from "lucide-react";
import { integrations as integrationsApi } from "@/lib/api";
import type { ComposioApp, ComposioConnection } from "@/types";

// ─── 스켈레톤 ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex flex-col gap-5 p-6 rounded-2xl animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl flex-shrink-0" style={{ background: "var(--bg-hover)" }} />
        <div className="flex-1 flex flex-col gap-2.5">
          <div className="h-4 rounded-full w-2/3" style={{ background: "var(--bg-hover)" }} />
          <div className="h-3 rounded-full w-1/3" style={{ background: "var(--bg-hover)" }} />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-3 rounded-full w-full" style={{ background: "var(--bg-hover)" }} />
        <div className="h-3 rounded-full w-5/6" style={{ background: "var(--bg-hover)" }} />
        <div className="h-3 rounded-full w-3/4" style={{ background: "var(--bg-hover)" }} />
      </div>
      <div className="h-10 rounded-xl mt-1" style={{ background: "var(--bg-hover)" }} />
    </div>
  );
}

// ─── 앱 카드 ─────────────────────────────────────────────────────────────────

interface AppCardProps {
  app: ComposioApp;
  connection?: ComposioConnection;
  onConnect: (key: string) => void;
  onDisconnect: (id: string) => void;
  connecting: boolean;
}

function AppCard({ app, connection, onConnect, onDisconnect, connecting }: AppCardProps) {
  const isConnected = !!connection;
  const displayName = app.displayName || app.name;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="flex flex-col gap-5 p-6 rounded-2xl transition-all duration-200"
      style={{
        background: isConnected ? "var(--accent-bg)" : "var(--bg-surface)",
        border: `1.5px solid ${isConnected
          ? "var(--accent-dim, var(--border-strong))"
          : hovered ? "var(--border-strong)" : "var(--border)"}`,
        boxShadow: hovered && !isConnected
          ? "var(--shadow-md, 0 4px 16px rgba(0,0,0,0.08))"
          : "none",
        transform: connecting ? "scale(0.98)" : "scale(1)",
        opacity: connecting ? 0.65 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 로고 + 이름 + 카테고리 */}
      <div className="flex items-start gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{
            background: "var(--bg-base, var(--bg))",
            border: "1px solid var(--border)",
          }}
        >
          {app.logo ? (
            <img
              src={app.logo}
              alt={displayName}
              className="w-9 h-9 object-contain"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                el.parentElement!.innerHTML = `<span style="font-size:15px;font-weight:700;color:var(--text-muted)">${displayName.slice(0, 2).toUpperCase()}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text-muted)" }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3
              className="font-semibold truncate"
              style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.3 }}
            >
              {displayName}
            </h3>
            {isConnected && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
                style={{
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-dim, var(--border-strong))",
                  fontSize: 10,
                }}
              >
                <CheckCircle2 size={10} />
                연결됨
              </span>
            )}
          </div>
          {app.categories?.[0] && (
            <span
              className="inline-block px-2 py-0.5 rounded-md text-xs"
              style={{
                background: "var(--bg-elevated, var(--bg-hover))",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                fontSize: 11,
              }}
            >
              {app.categories[0]}
            </span>
          )}
        </div>
      </div>

      {/* 설명 */}
      {app.description && (
        <p
          className="line-clamp-3 flex-1"
          style={{ color: "var(--text-soft, var(--text-muted))", fontSize: 13, lineHeight: 1.65 }}
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
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="w-full h-10 rounded-xl font-medium flex items-center justify-center gap-2 transition-all duration-150"
      style={{
        background: "var(--accent)",
        color: "#fff",
        fontSize: 13,
        opacity: disabled ? 0.6 : h ? 0.88 : 1,
        letterSpacing: "0.01em",
      }}
    >
      {loading ? <><Loader2 size={13} className="animate-spin" />연결 중...</> : "연결하기"}
    </button>
  );
}

function DisconnectButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      className="w-full h-10 rounded-xl font-medium transition-all duration-150"
      style={{
        fontSize: 13,
        color: h ? "var(--red, #c0392b)" : "var(--text-muted)",
        border: `1px solid ${h ? "rgba(192,57,43,0.3)" : "var(--border)"}`,
        background: h ? "rgba(192,57,43,0.05)" : "transparent",
      }}
    >
      연결 해제
    </button>
  );
}

// ─── 카테고리 필 ──────────────────────────────────────────────────────────────

function CategoryPills({
  categories,
  selected,
  onSelect,
}: {
  categories: string[];
  selected: string;
  onSelect: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
      {["전체", ...categories].map((cat) => {
        const active = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-150 capitalize"
            style={{
              background: active ? "var(--accent)" : "var(--bg-surface)",
              color: active ? "#fff" : "var(--text-muted)",
              border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              fontSize: 12,
            }}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}

// ─── 메인 ────────────────────────────────────────────────────────────────────

function IntegrationsContent() {
  const searchParams = useSearchParams();

  const [apps, setApps] = useState<ComposioApp[]>([]);
  const [connections, setConnections] = useState<ComposioConnection[]>([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("전체");
  const [showConnectedOnly, setShowConnectedOnly] = useState(false);
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
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

  // 카테고리 목록 추출
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const app of apps) {
      for (const cat of app.categories ?? []) {
        if (cat) set.add(cat);
      }
    }
    return Array.from(set).sort();
  }, [apps]);

  const connectionMap = useMemo(() => {
    const map: Record<string, ComposioConnection> = {};
    for (const c of connections) if (c.appName) map[c.appName.toLowerCase()] = c;
    return map;
  }, [connections]);

  const filtered = useMemo(() => {
    let list = apps;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((a) =>
        (a.displayName || a.name).toLowerCase().includes(s) ||
        a.key.toLowerCase().includes(s) ||
        a.categories?.some((c) => c.toLowerCase().includes(s))
      );
    }
    if (category !== "전체") {
      list = list.filter((a) => a.categories?.includes(category));
    }
    if (showConnectedOnly) {
      list = list.filter((a) => connectionMap[a.key.toLowerCase()]);
    }
    return list;
  }, [apps, search, category, showConnectedOnly, connectionMap]);

  const connectedCount = connections.length;

  async function handleConnect(appKey: string) {
    setConnectingApp(appKey);
    try {
      const res = await integrationsApi.connect(appKey);
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

  const gridProps = {
    connectionMap,
    connectingApp,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
  };

  return (
    <div
      className="flex-1 min-w-0 h-full overflow-y-auto"
      style={{ background: "var(--bg)" }}
    >
      {/* ── 헤더 영역 ── */}
      <div
        className="w-full px-10 pt-12 pb-8"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg)",
        }}
      >
        <div className="mx-auto" style={{ maxWidth: 1100 }}>
          {/* 타이틀 */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "var(--gradient-accent, var(--accent))",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                <Zap size={18} fill="white" color="white" />
              </div>
              <div>
                <h1
                  className="font-bold leading-tight"
                  style={{ fontSize: 22, color: "var(--text)" }}
                >
                  연동
                </h1>
                <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 1 }}>
                  외부 서비스를 연결해 AI가 직접 접근하게 하세요
                </p>
              </div>
            </div>

            {connectedCount > 0 && (
              <button
                onClick={() => setShowConnectedOnly((v) => !v)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-150"
                style={{
                  background: showConnectedOnly ? "var(--accent)" : "var(--accent-bg)",
                  color: showConnectedOnly ? "#fff" : "var(--accent)",
                  border: "1px solid var(--accent-dim, var(--border-strong))",
                  fontSize: 13,
                }}
              >
                <CheckCircle2 size={14} />
                연결됨 {connectedCount}
              </button>
            )}
          </div>

          {/* 검색창 */}
          <div className="relative mb-5">
            <Search
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="Gmail, Notion, Slack 등 앱을 검색하세요..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full outline-none transition-all"
              style={{
                paddingLeft: 44,
                paddingRight: 16,
                paddingTop: 14,
                paddingBottom: 14,
                borderRadius: 14,
                background: "var(--bg-surface)",
                border: "1.5px solid var(--border)",
                color: "var(--text)",
                fontSize: 14,
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
            {search && (
              <button
                className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                onClick={() => setSearch("")}
              >
                <X size={14} style={{ color: "var(--text-muted)" }} />
              </button>
            )}
          </div>

          {/* 카테고리 필터 */}
          {!loadingApps && categories.length > 0 && (
            <CategoryPills
              categories={categories}
              selected={category}
              onSelect={(c) => {
                setCategory(c);
                setShowConnectedOnly(false);
              }}
            />
          )}
        </div>
      </div>

      {/* ── 콘텐츠 영역 ── */}
      <div className="mx-auto px-10 py-8" style={{ maxWidth: 1100 }}>
        {loadingApps ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {Array.from({ length: 9 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasSearch={!!search || category !== "전체" || showConnectedOnly}
            onReset={() => { setSearch(""); setCategory("전체"); setShowConnectedOnly(false); }}
          />
        ) : (
          <>
            {/* 결과 수 */}
            <div className="flex items-center justify-between mb-5">
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                {showConnectedOnly
                  ? `${filtered.length}개 연결됨`
                  : search || category !== "전체"
                  ? `${filtered.length}개 결과`
                  : `${filtered.length}개 앱`}
              </p>
              {(search || category !== "전체" || showConnectedOnly) && (
                <button
                  onClick={() => { setSearch(""); setCategory("전체"); setShowConnectedOnly(false); }}
                  className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={12} />
                  필터 초기화
                </button>
              )}
            </div>

            {/* 그리드 */}
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}
            >
              {/* 연결됨 먼저 */}
              {!showConnectedOnly && filtered
                .filter((a) => connectionMap[a.key.toLowerCase()])
                .map((app) => (
                  <AppCard
                    key={app.key}
                    app={app}
                    connection={connectionMap[app.key.toLowerCase()]}
                    {...gridProps}
                    connecting={connectingApp === app.key}
                  />
                ))}
              {/* 나머지 */}
              {filtered
                .filter((a) => showConnectedOnly || !connectionMap[a.key.toLowerCase()])
                .map((app) => (
                  <AppCard
                    key={app.key}
                    app={app}
                    connection={connectionMap[app.key.toLowerCase()]}
                    {...gridProps}
                    connecting={connectingApp === app.key}
                  />
                ))}
            </div>
          </>
        )}
      </div>

      {/* ── 토스트 ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl z-50"
          style={{
            background: toast.type === "error" ? "var(--red, #c0392b)" : "var(--accent)",
            color: "#fff",
            boxShadow: "var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.2))",
            fontSize: 13,
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 transition-opacity ml-1">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 빈 상태 ─────────────────────────────────────────────────────────────────

function EmptyState({ hasSearch, onReset }: { hasSearch: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-28">
      <div
        className="w-16 h-16 rounded-3xl flex items-center justify-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <Plug size={26} style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="text-center">
        <p className="font-semibold mb-1.5" style={{ fontSize: 16, color: "var(--text)" }}>
          {hasSearch ? "검색 결과가 없습니다" : "연결된 앱이 없습니다"}
        </p>
        <p className="text-sm" style={{ color: "var(--text-muted)", maxWidth: 320 }}>
          {hasSearch
            ? "다른 검색어나 카테고리를 시도해보세요"
            : "앱을 연결하면 AI가 외부 서비스에 직접 접근할 수 있어요"}
        </p>
      </div>
      {hasSearch && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-medium text-sm"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          전체 보기 <ChevronRight size={14} />
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
