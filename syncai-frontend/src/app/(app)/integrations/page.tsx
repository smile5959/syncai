"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Plug, Loader2, X, Zap, ChevronRight, ArrowRight } from "lucide-react";
import { integrations as integrationsApi } from "@/lib/api";
import type { ComposioApp, ComposioConnection } from "@/types";

// ─── 스켈레톤 ────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="flex flex-col gap-4 p-5 rounded-2xl animate-pulse"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex-shrink-0" style={{ background: "var(--bg-hover)" }} />
        <div className="flex-1 flex flex-col gap-2">
          <div className="h-3.5 rounded-full w-2/3" style={{ background: "var(--bg-hover)" }} />
          <div className="h-3 rounded-full w-1/3" style={{ background: "var(--bg-hover)" }} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="h-3 rounded-full w-full" style={{ background: "var(--bg-hover)" }} />
        <div className="h-3 rounded-full w-5/6" style={{ background: "var(--bg-hover)" }} />
      </div>
      <div className="h-9 rounded-xl mt-1" style={{ background: "var(--bg-hover)" }} />
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
      className="flex flex-col gap-4 p-5 rounded-2xl transition-all duration-200"
      style={{
        background: isConnected ? "var(--accent-bg)" : "var(--bg-surface)",
        border: `1.5px solid ${isConnected
          ? "var(--accent-dim, var(--border-strong))"
          : hovered ? "var(--border-strong)" : "var(--border)"}`,
        boxShadow: hovered
          ? isConnected
            ? "0 6px 20px rgba(0,0,0,0.07)"
            : "0 8px 24px rgba(0,0,0,0.09)"
          : "none",
        transform: connecting ? "scale(0.98)" : hovered ? "translateY(-2px)" : "translateY(0)",
        opacity: connecting ? 0.65 : 1,
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 로고 + 이름 + 카테고리 */}
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden"
          style={{
            background: "var(--bg-base, var(--bg))",
            border: "1px solid var(--border)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
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
                el.parentElement!.innerHTML = `<span style="font-size:13px;font-weight:700;color:var(--text-muted)">${displayName.slice(0, 2).toUpperCase()}</span>`;
              }}
            />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-muted)" }}>
              {displayName.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <h3
              className="font-semibold truncate"
              style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.3, letterSpacing: "-0.01em" }}
            >
              {displayName}
            </h3>
            {isConnected && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                }}
              >
                <CheckCircle2 size={8} strokeWidth={2.5} />
                연결됨
              </span>
            )}
          </div>
          {app.categories?.[0] && (
            <span
              style={{
                fontSize: 10.5,
                color: "var(--text-muted)",
                letterSpacing: "0.01em",
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
          className="line-clamp-2 flex-1"
          style={{ color: "var(--text-soft, var(--text-muted))", fontSize: 12.5, lineHeight: 1.6 }}
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
      className="w-full h-9 rounded-xl font-medium flex items-center justify-center gap-1.5 transition-all duration-150"
      style={{
        background: h && !disabled ? "var(--accent)" : "var(--accent-bg, rgba(0,0,0,0.06))",
        color: h && !disabled ? "#fff" : "var(--accent)",
        border: `1.5px solid ${h && !disabled ? "var(--accent)" : "var(--accent-dim, var(--border-strong))"}`,
        fontSize: 12.5,
        fontWeight: 600,
        opacity: disabled ? 0.5 : 1,
        letterSpacing: "0.01em",
      }}
    >
      {loading
        ? <><Loader2 size={12} className="animate-spin" />연결 중...</>
        : <><span>연결하기</span><ArrowRight size={12} style={{ opacity: h ? 1 : 0.6, transition: "transform 0.15s, opacity 0.15s", transform: h ? "translateX(2px)" : "none" }} /></>
      }
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
      className="w-full h-9 rounded-xl font-medium transition-all duration-150"
      style={{
        fontSize: 12.5,
        fontWeight: 600,
        color: h ? "var(--red, #c0392b)" : "var(--text-muted)",
        border: `1.5px solid ${h ? "rgba(192,57,43,0.25)" : "var(--border)"}`,
        background: h ? "rgba(192,57,43,0.05)" : "transparent",
        opacity: disabled ? 0.5 : 1,
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
    <div
      className="flex items-center gap-1.5 overflow-x-auto"
      style={{ scrollbarWidth: "none", paddingBottom: 1 }}
    >
      {["전체", ...categories].map((cat) => {
        const active = cat === selected;
        return (
          <button
            key={cat}
            onClick={() => onSelect(cat)}
            className="flex-shrink-0 font-medium transition-all duration-150 capitalize whitespace-nowrap"
            style={{
              padding: "6px 13px",
              borderRadius: 8,
              background: active ? "var(--accent)" : "transparent",
              color: active ? "#fff" : "var(--text-muted)",
              border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
              fontSize: 12,
              letterSpacing: "0.01em",
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
    <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 28px 60px" }}>

        {/* ── 헤더 (sticky) ── */}
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "var(--bg-base)",
            borderBottom: "1px solid var(--border)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            marginLeft: -28,
            marginRight: -28,
            paddingLeft: 28,
            paddingRight: 28,
          }}
        >
          <div className="w-full pt-7 pb-4">
            {/* 타이틀 + 연결됨 버튼 */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "var(--gradient-accent, var(--accent))",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  }}
                >
                  <Zap size={16} fill="white" color="white" />
                </div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", lineHeight: 1.2, letterSpacing: "-0.03em" }}>
                    연동
                  </h1>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>
                    외부 서비스를 연결해 AI가 직접 접근하게 하세요
                  </p>
                </div>
              </div>

              {connectedCount > 0 && (
                <button
                  onClick={() => setShowConnectedOnly((v) => !v)}
                  className="flex items-center gap-1.5 font-semibold transition-all duration-150"
                  style={{
                    padding: "7px 14px",
                    borderRadius: 9,
                    background: showConnectedOnly ? "var(--accent)" : "var(--accent-bg)",
                    color: showConnectedOnly ? "#fff" : "var(--accent)",
                    border: "1.5px solid var(--accent-dim, var(--border-strong))",
                    fontSize: 12,
                  }}
                >
                  <CheckCircle2 size={13} />
                  연결됨 {connectedCount}
                </button>
              )}
            </div>

            {/* 검색창 */}
            <div className="relative mb-3">
              <Search
                size={15}
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
                  paddingLeft: 40,
                  paddingRight: search ? 40 : 16,
                  paddingTop: 11,
                  paddingBottom: 11,
                  borderRadius: 11,
                  background: "var(--bg-surface)",
                  border: "1.5px solid var(--border)",
                  color: "var(--text)",
                  fontSize: 13.5,
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
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 transition-opacity"
                  onClick={() => setSearch("")}
                >
                  <X size={14} style={{ color: "var(--text-muted)" }} />
                </button>
              )}
            </div>

            {/* 카테고리 탭 */}
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
        <div className="w-full pt-5 pb-2">
          {loadingApps ? (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
              {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              hasSearch={!!search || category !== "전체" || showConnectedOnly}
              onReset={() => { setSearch(""); setCategory("전체"); setShowConnectedOnly(false); }}
            />
          ) : (
            <>
              {/* 결과 수 */}
              <div className="flex items-center justify-between mb-4">
                <p style={{ fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.01em" }}>
                  {showConnectedOnly
                    ? `${filtered.length}개 연결됨`
                    : search || category !== "전체"
                    ? `${filtered.length}개 결과`
                    : `${filtered.length}개 앱`}
                </p>
                {(search || category !== "전체" || showConnectedOnly) && (
                  <button
                    onClick={() => { setSearch(""); setCategory("전체"); setShowConnectedOnly(false); }}
                    className="flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ color: "var(--text-muted)", fontSize: 11.5 }}
                  >
                    <X size={11} />
                    필터 초기화
                  </button>
                )}
              </div>

              {/* 그리드 */}
              <div
                className="grid gap-3.5"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
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
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl z-50"
            style={{
              background: toast.type === "error" ? "var(--red, #c0392b)" : "var(--accent)",
              color: "#fff",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            {toast.type === "success" && <CheckCircle2 size={14} />}
            {toast.msg}
            <button onClick={() => setToast(null)} className="opacity-50 hover:opacity-90 transition-opacity ml-0.5">
              <X size={13} />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

// ─── 빈 상태 ─────────────────────────────────────────────────────────────────

function EmptyState({ hasSearch, onReset }: { hasSearch: boolean; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <Plug size={22} style={{ color: "var(--text-muted)" }} />
      </div>
      <div className="text-center">
        <p className="font-semibold mb-1.5" style={{ fontSize: 15, color: "var(--text)", letterSpacing: "-0.02em" }}>
          {hasSearch ? "검색 결과가 없습니다" : "연결된 앱이 없습니다"}
        </p>
        <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 300, lineHeight: 1.6 }}>
          {hasSearch
            ? "다른 검색어나 카테고리를 시도해보세요"
            : "앱을 연결하면 AI가 외부 서비스에 직접 접근할 수 있어요"}
        </p>
      </div>
      {hasSearch && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl font-medium"
          style={{ background: "var(--accent)", color: "#fff", fontSize: 13 }}
        >
          전체 보기 <ChevronRight size={13} />
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
