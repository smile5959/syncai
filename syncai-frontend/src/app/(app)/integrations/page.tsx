"use client";

import { useEffect, useState, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Search, CheckCircle2, Plug, PlugZap, Loader2, X } from "lucide-react";
import { integrations as integrationsApi } from "@/lib/api";
import type { ComposioApp, ComposioConnection } from "@/types";

// ─── 앱 카드 ────────────────────────────────────────────────────────────────

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
      className="flex flex-col gap-3 p-4 rounded-xl transition-colors"
      style={{
        background: "var(--bg-surface)",
        border: `1px solid ${isConnected ? "var(--accent)" : "var(--border)"}`,
        opacity: connecting ? 0.7 : 1,
      }}
    >
      {/* 로고 + 이름 */}
      <div className="flex items-center gap-3">
        {app.logo ? (
          <img
            src={app.logo}
            alt={displayName}
            className="w-9 h-9 rounded-lg object-contain flex-shrink-0"
            style={{ background: "var(--bg-hover)", padding: 4 }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-sm font-bold"
            style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>
            {displayName}
          </p>
          {app.categories?.[0] && (
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {app.categories[0]}
            </p>
          )}
        </div>
        {isConnected && (
          <CheckCircle2 size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />
        )}
      </div>

      {/* 설명 */}
      {app.description && (
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: "var(--text-muted)" }}
        >
          {app.description}
        </p>
      )}

      {/* 버튼 */}
      {isConnected ? (
        <button
          onClick={() => onDisconnect(connection!.id)}
          disabled={connecting}
          className="w-full text-xs py-1.5 rounded-lg transition-colors hover:bg-red-500/10"
          style={{ color: "var(--red, #f87171)", border: "1px solid var(--border)" }}
        >
          연결 해제
        </button>
      ) : (
        <button
          onClick={() => onConnect(app.key)}
          disabled={connecting}
          className="w-full text-xs py-1.5 rounded-lg transition-colors"
          style={{
            background: "var(--accent)",
            color: "#fff",
            opacity: connecting ? 0.6 : 1,
          }}
        >
          {connecting ? "연결 중..." : "연결하기"}
        </button>
      )}
    </div>
  );
}

// ─── 메인 페이지 (useSearchParams 사용하는 내부 컴포넌트) ────────────────────

function IntegrationsContent() {
  const searchParams = useSearchParams();

  const [apps, setApps] = useState<ComposioApp[]>([]);
  const [connections, setConnections] = useState<ComposioConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "connected">("all");
  const [connectingApp, setConnectingApp] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadConnections = useCallback(async () => {
    try {
      const res = await integrationsApi.listConnections();
      setConnections(res.data);
    } catch {
      // 조용히 실패
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [appsRes, connsRes] = await Promise.all([
          integrationsApi.listApps(),
          integrationsApi.listConnections(),
        ]);
        setApps(appsRes.data);
        setConnections(connsRes.data);
      } catch {
        showToast("앱 목록을 불러오지 못했습니다", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // OAuth 콜백 처리
  useEffect(() => {
    if (searchParams.get("connected")) {
      showToast("연결이 완료되었습니다!");
      loadConnections();
      // URL 파라미터 제거
      window.history.replaceState({}, "", "/integrations");
    }
  }, [searchParams, loadConnections]);

  const connectionMap = useMemo(() => {
    const map: Record<string, ComposioConnection> = {};
    for (const c of connections) {
      map[c.appName?.toLowerCase()] = c;
    }
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

  async function handleConnect(appName: string) {
    setConnectingApp(appName);
    try {
      const res = await integrationsApi.connect(appName);
      const redirectUrl = res.data.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
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

  return (
    <div className="flex flex-col h-full" style={{ color: "var(--text)" }}>
      {/* 헤더 */}
      <div
        className="flex-shrink-0 px-8 pt-8 pb-6"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3 mb-1">
          <PlugZap size={22} style={{ color: "var(--accent)" }} />
          <h1 className="text-xl font-semibold">연동</h1>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Notion, Figma, GitHub 등 외부 서비스를 연결하면 AI가 직접 작업합니다
        </p>

        {/* 검색 + 필터 */}
        <div className="flex items-center gap-3 mt-5">
          <div className="relative flex-1 max-w-sm">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-muted)" }}
            />
            <input
              type="text"
              placeholder="앱 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
          </div>

          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
            {(["all", "connected"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1 text-xs rounded-md transition-colors"
                style={{
                  background: filter === f ? "var(--accent)" : "transparent",
                  color: filter === f ? "#fff" : "var(--text-muted)",
                }}
              >
                {f === "all" ? "전체" : `연결됨 ${connections.length > 0 ? connections.length : ""}`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 앱 그리드 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2" style={{ color: "var(--text-muted)" }}>
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">앱 목록 불러오는 중...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: "var(--text-muted)" }}>
            <Plug size={28} />
            <p className="text-sm">
              {filter === "connected" ? "연결된 앱이 없습니다" : "검색 결과가 없습니다"}
            </p>
          </div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
            {filtered.map((app) => (
              <AppCard
                key={app.key}
                app={app}
                connection={connectionMap[app.key.toLowerCase()]}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
                connecting={connectingApp === app.key}
              />
            ))}
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm z-50"
          style={{
            background: toast.type === "error" ? "var(--red, #f87171)" : "var(--accent)",
            color: "#fff",
          }}
        >
          {toast.msg}
          <button onClick={() => setToast(null)}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── 페이지 래퍼 (Suspense for useSearchParams) ──────────────────────────────

export default function IntegrationsPage() {
  return (
    <Suspense>
      <IntegrationsContent />
    </Suspense>
  );
}
