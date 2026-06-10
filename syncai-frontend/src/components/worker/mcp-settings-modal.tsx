"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X, Plus, Folder, Trash2, RefreshCw, Server, Users,
  Zap, Check, Download, Pencil, Cpu, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mcpConfigs as mcpApi, workers as workersApi } from "@/lib/api";
import { createMcpWS } from "@/lib/ws";
import type { McpConfig, McpConfigWithTeam, Worker } from "@/types";

interface McpSettingsModalProps {
  teamId: string;
  onClose: () => void;
  onWorkerUpdate?: (worker: Worker) => void;
}

type Tab = "my" | "team" | "workers";

const NAV_ITEMS = [
  { key: "my"      as Tab, label: "내 MCP",      icon: Server, desc: "PC 연결 관리" },
  { key: "team"    as Tab, label: "팀 공유",      icon: Users,  desc: "팀원 공개 설정" },
  { key: "workers" as Tab, label: "Worker 슬롯",  icon: Cpu,    desc: "AI 작업 슬롯" },
];

// ─── Toggle 컴포넌트 ─────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        position: "relative", width: 46, height: 26, borderRadius: 13,
        border: `1px solid ${checked ? "var(--accent)" : "var(--border)"}`,
        cursor: disabled ? "not-allowed" : "pointer",
        background: checked ? "var(--accent)" : "var(--bg-hover)",
        transition: "background 0.22s ease, border-color 0.22s ease",
        flexShrink: 0, opacity: disabled ? 0.5 : 1, outline: "none",
      }}
    >
      <div style={{
        position: "absolute", top: 3, left: checked ? 22 : 3,
        width: 18, height: 18, borderRadius: "50%",
        background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.35)",
        transition: "left 0.22s ease",
      }} />
    </button>
  );
}

// ─── macOS 설치 명령어 컴포넌트 ─────────────────────────────────────────────
function MacInstallCommand({ installShUrl, token }: { installShUrl: string; token: string }) {
  const [copied, setCopied] = useState(false);
  const cmd = `curl -fsSL "${installShUrl}" | bash -s -- --token=${token}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 10, padding: "8px 12px", overflow: "hidden",
      }}>
        <code style={{
          flex: 1, fontSize: 11.5, color: "var(--text-primary)",
          fontFamily: "monospace", overflowX: "auto", whiteSpace: "nowrap",
          userSelect: "all",
        }}>{cmd}</code>
        <button
          onClick={() => { navigator.clipboard.writeText(cmd).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
          style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5,
            padding: "5px 12px", borderRadius: 8,
            background: copied ? "rgba(34,197,94,0.15)" : "var(--accent)",
            color: copied ? "#4ade80" : "white",
            fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
            transition: "all 0.15s",
          }}
        >
          {copied ? <Check size={11} /> : <Download size={11} />}
          {copied ? "복사됨" : "복사"}
        </button>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
        터미널(Terminal.app)에 붙여넣고 실행하세요. Python 3.10+가 필요합니다.
      </p>
    </div>
  );
}

// ─── 재시도 버튼 ────────────────────────────────────────────────────────────
type PostCreateState = { online: boolean; token: string; configId: string; name: string; downloadUrl?: string; installShUrl?: string; downloadUrlError?: boolean };

function RetryButton({ token, setPostCreate, mcpApi: api }: {
  token: string;
  setPostCreate: React.Dispatch<React.SetStateAction<PostCreateState | null>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpApi: any;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>다운로드 URL을 불러오지 못했습니다.</span>
      <button
        onClick={async () => {
          try {
            const dlRes = await api.getDownloadUrl(token);
            setPostCreate((prev) => prev ? {
              ...prev,
              downloadUrl: dlRes.data.download_url,
              installShUrl: dlRes.data.install_sh_url,
              downloadUrlError: false,
            } : prev);
          } catch { /* 무시 */ }
        }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "6px 14px", borderRadius: 9,
          background: "var(--accent)", color: "white",
          fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer",
        }}
      >
        <RefreshCw size={11} />
        재시도
      </button>
    </div>
  );
}

// ─── 메인 모달 ───────────────────────────────────────────────────────────────
export function McpSettingsModal({ teamId, onClose, onWorkerUpdate }: McpSettingsModalProps) {
  const [tab, setTab] = useState<Tab>("my");
  const mouseDownOnBackdrop = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(14px)" }}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onMouseUp={(e) => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(740px, calc(100vw - 32px))",
          maxHeight: "min(680px, calc(100vh - 32px))",
          display: "flex", flexDirection: "column",
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: 24, overflow: "hidden",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: "22px 28px 18px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: "var(--gradient-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px var(--accent-glow)",
            }}>
              <Zap size={20} color="white" fill="white" />
            </div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.025em", lineHeight: 1 }}>
                MCP 설정
              </h2>
              <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4 }}>
                PC 연결 · 팀 공유 · Worker 슬롯
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)",
            }}
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={17} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* Left Nav */}
          <nav style={{
            width: 180, borderRight: "1px solid var(--border-subtle)",
            padding: "14px 10px", display: "flex", flexDirection: "column", gap: 2, flexShrink: 0,
          }}>
            {NAV_ITEMS.map(({ key, label, icon: Icon, desc }) => {
              const active = tab === key;
              return (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  style={{
                    width: "100%", padding: "11px 12px", borderRadius: 12, border: "none",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                    textAlign: "left",
                    background: active ? "var(--accent-bg)" : "transparent",
                    transition: "background 0.15s ease",
                  }}
                  className={active ? "" : "hover:bg-[var(--bg-hover)]"}
                >
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: active ? "var(--accent)" : "var(--bg-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s ease",
                    boxShadow: active ? "0 2px 10px var(--accent-glow)" : "none",
                  }}>
                    <Icon size={15} color={active ? "white" : "var(--text-muted)"} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: 13.5, fontWeight: 600, letterSpacing: "-0.01em",
                      color: active ? "var(--accent)" : "var(--text-secondary)", lineHeight: 1.2,
                    }}>
                      {label}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{desc}</p>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Right Content */}
          <div style={{ flex: 1, overflowY: "auto", minWidth: 0 }}>
            {tab === "my"      && <MyMcpTab />}
            {tab === "team"    && <TeamVisibilityTab teamId={teamId} />}
            {tab === "workers" && <WorkerSlotsTab teamId={teamId} onWorkerUpdate={onWorkerUpdate} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 내 MCP 탭 ───────────────────────────────────────────────────────────────
function MyMcpTab() {
  const [configs, setConfigs] = useState<McpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 등록 후 상태
  const [postCreate, setPostCreate] = useState<{
    online: boolean;
    token: string;
    configId: string;
    name: string;
    downloadUrl?: string;
    installShUrl?: string;
    downloadUrlError?: boolean;
  } | null>(null);

  // macOS 여부 감지 (클라이언트에서만)
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  // 인라인 편집 상태
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const [folderPickingId, setFolderPickingId] = useState<string | null>(null);
  const [folderFallbackId, setFolderFallbackId] = useState<string | null>(null);
  const [folderFallbackValue, setFolderFallbackValue] = useState("");
  const [folderFallbackSaving, setFolderFallbackSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await mcpApi.listMine();
      setConfigs(res.data ?? []);
    } catch { /* 무시 */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  // WS 실시간 연결 상태 갱신
  useEffect(() => {
    const ws = createMcpWS(load);
    const unsubscribe = ws.on((event) => {
      if (event.type === "mcp_connected" || event.type === "mcp_status") {
        load();
        setPostCreate(null);
      }
    });
    return () => { unsubscribe(); ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 새 MCP 등록 ──────────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newName.trim()) { setError("이름을 입력해주세요."); return; }
    setError("");
    setSaving(true);
    try {
      const res = await mcpApi.create({ name: newName.trim() });
      const { mcp_config, token, online } = res.data;
      setConfigs((prev) => [...prev, mcp_config]);
      setCreating(false);
      setNewName("");

      if (online) {
        setPostCreate({ online: true, token, configId: mcp_config.id, name: mcp_config.name });
      } else {
        try {
          const dlRes = await mcpApi.getDownloadUrl(token);
          setPostCreate({
            online: false, token,
            configId: mcp_config.id, name: mcp_config.name,
            downloadUrl: dlRes.data.download_url,
            installShUrl: dlRes.data.install_sh_url,
          });
        } catch {
          setPostCreate({ online: false, token, configId: mcp_config.id, name: mcp_config.name, downloadUrlError: true });
        }
      }
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "등록 실패";
      setError(msg);
    } finally { setSaving(false); }
  }

  // ── 이름 변경 ────────────────────────────────────────────────────────────
  async function handleRename(c: McpConfig) {
    if (!renameValue.trim() || renameValue === c.name) { setRenamingId(null); return; }
    setRenameSaving(true);
    try {
      const res = await mcpApi.rename(c.id, renameValue.trim());
      setConfigs((prev) => prev.map((x) => x.id === c.id ? res.data : x));
      setRenamingId(null);
    } catch { /* 무시 */ }
    finally { setRenameSaving(false); }
  }

  // ── 경로 변경 (WS 이벤트) ────────────────────────────────────────────────
  async function handleFolderPick(c: McpConfig) {
    setFolderPickingId(c.id);
    try {
      await mcpApi.requestFolderPick(c.id);
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setFolderFallbackId(c.id);
        setFolderFallbackValue(c.base_dir ?? "");
      }
    } finally {
      setFolderPickingId(null);
    }
  }

  // ── 경로 직접 입력 저장 (오프라인 fallback) ──────────────────────────────
  async function handleFolderFallbackSave(c: McpConfig) {
    if (!folderFallbackValue.trim()) return;
    setFolderFallbackSaving(true);
    try {
      const res = await mcpApi.update(c.id, { base_dir: folderFallbackValue.trim() });
      setConfigs((prev) => prev.map((x) => x.id === c.id ? res.data : x));
      setFolderFallbackId(null);
    } catch { /* 무시 */ }
    finally { setFolderFallbackSaving(false); }
  }

  // ── 삭제 ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" MCP를 삭제할까요?`)) return;
    setDeletingId(id);
    try {
      await mcpApi.delete(id);
      setConfigs((prev) => prev.filter((c) => c.id !== id));
    } catch { /* 무시 */ }
    finally { setDeletingId(null); }
  }

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* 등록 후 안내 배너 */}
      {postCreate && (
        <div style={{
          background: postCreate.online ? "rgba(34,197,94,0.07)" : "rgba(99,102,241,0.07)",
          border: `1px solid ${postCreate.online ? "rgba(34,197,94,0.22)" : "rgba(99,102,241,0.25)"}`,
          borderRadius: 14, padding: "16px 18px",
          display: "flex", alignItems: "flex-start", gap: 12,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: postCreate.online ? "rgba(34,197,94,0.15)" : "rgba(99,102,241,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {postCreate.online
              ? <Check size={15} color="#4ade80" />
              : <Download size={14} color="var(--accent)" />}
          </div>
          <div style={{ flex: 1 }}>
            {postCreate.online ? (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: "#4ade80", marginBottom: 4 }}>
                  PC에서 폴더 선택 팝업이 열립니다
                </p>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
                  MCP 서버가 이미 연결되어 있어요. PC 화면에서 AI가 접근할 폴더를 선택해주세요.
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
                  {postCreate.name} — {isMac ? "터미널에서 설치하세요" : "설치 파일을 다운로드하세요"}
                </p>
                <p style={{ fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6, marginBottom: 10 }}>
                  PC에 MCP 서버가 없습니다. {isMac ? "아래 명령어를 터미널에 붙여넣으면 자동으로 설치됩니다." : "설치 파일을 실행하면 자동으로 연결됩니다."}
                </p>
                {isMac ? (
                  /* ── macOS: curl 명령어 복사 ── */
                  postCreate.installShUrl ? (
                    <MacInstallCommand
                      installShUrl={postCreate.installShUrl}
                      token={postCreate.token}
                    />
                  ) : postCreate.downloadUrlError ? (
                    <RetryButton token={postCreate.token} setPostCreate={setPostCreate} mcpApi={mcpApi} />
                  ) : (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>설치 URL 불러오는 중...</span>
                  )
                ) : (
                  /* ── Windows: .exe 다운로드 ── */
                  postCreate.downloadUrl ? (
                    <a
                      href={postCreate.downloadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 7,
                        padding: "8px 18px", borderRadius: 10,
                        background: "var(--accent)", color: "white",
                        fontSize: 13, fontWeight: 600, textDecoration: "none",
                        boxShadow: "0 2px 10px var(--accent-glow)",
                      }}
                    >
                      <Download size={13} />
                      SyncAI-MCP-Setup.exe 다운로드
                    </a>
                  ) : postCreate.downloadUrlError ? (
                    <RetryButton token={postCreate.token} setPostCreate={setPostCreate} mcpApi={mcpApi} />
                  ) : null
                )}
              </>
            )}
          </div>
          <button
            onClick={() => setPostCreate(null)}
            style={{ color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer", padding: 4, fontSize: 12 }}
          >✕</button>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>내 PC</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>AI가 접근할 PC를 연결하세요</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={load} disabled={loading} title="새로고침"
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
            }}
            className="hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: creating ? "var(--bg-elevated)" : "var(--accent)",
              color: creating ? "var(--text-secondary)" : "white",
              fontSize: 13.5, fontWeight: 600, transition: "all 0.15s ease",
              boxShadow: creating ? "none" : "0 2px 10px var(--accent-glow)",
            }}
          >
            <Plus size={14} />새 MCP
          </button>
        </div>
      </div>

      {/* 신규 등록 폼 */}
      {creating && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 16, padding: "20px 22px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>새 MCP 등록</p>
          <Input
            label="이름"
            placeholder="예: 내 맥북, 서버 PC"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            등록 후 MCP 서버가 이미 연결된 경우 PC에서 폴더 선택 팝업이 자동으로 열립니다.
            연결되지 않은 경우 설치 파일 다운로드 버튼이 표시됩니다.
          </p>
          {error && (
            <p style={{
              fontSize: 12, color: "var(--red)", lineHeight: 1.6,
              background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 10, padding: "10px 14px",
            }}>
              {error}
            </p>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => { setCreating(false); setError(""); }}>취소</Button>
            <Button variant="primary" style={{ flex: 1 }} onClick={handleCreate} loading={saving} disabled={!newName.trim()}>
              등록하기
            </Button>
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading && configs.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</div>
      ) : configs.length === 0 ? (
        <div style={{
          padding: "52px 24px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Server size={26} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>연결된 PC가 없어요</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              새 MCP를 등록하고 PC에 설치 파일을 실행하면 자동으로 연결됩니다
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 12, border: "none", cursor: "pointer",
              background: "var(--accent)", color: "white",
              fontSize: 13.5, fontWeight: 600,
              boxShadow: "0 2px 12px var(--accent-glow)",
            }}
          >
            <Plus size={15} />
            새 MCP 등록
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {configs.map((c) => {
            const online = c.is_online;
            const isRenaming = renamingId === c.id;
            const isFolderFallback = folderFallbackId === c.id;

            return (
              <div key={c.id} style={{
                background: "var(--bg-elevated)",
                border: `1px solid ${online ? "rgba(74,222,128,0.18)" : "var(--border)"}`,
                borderRadius: 16, padding: "16px 18px",
                display: "flex", flexDirection: "column", gap: 10,
                transition: "border-color 0.2s ease",
              }}>
                {/* 카드 상단 행 */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  {/* 아이콘 */}
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    background: online ? "rgba(34,197,94,0.1)" : "var(--bg-hover)",
                    border: `1px solid ${online ? "rgba(74,222,128,0.22)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: online ? "0 0 14px rgba(74,222,128,0.12)" : "none",
                  }}>
                    <Server size={19} color={online ? "#4ade80" : "var(--text-muted)"} />
                  </div>

                  {/* 정보 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 이름 행 */}
                    {isRenaming ? (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(c);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          style={{ fontSize: 13.5, height: 32, padding: "0 10px" }}
                          autoComplete="off"
                        />
                        <Button
                          variant="primary"
                          style={{ height: 32, fontSize: 12, padding: "0 12px", flexShrink: 0 }}
                          onClick={() => handleRename(c)}
                          loading={renameSaving}
                          disabled={!renameValue.trim()}
                        >저장</Button>
                        <button
                          onClick={() => setRenamingId(null)}
                          style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                        >취소</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.name}
                        </p>
                        <span style={{
                          flexShrink: 0, fontSize: 11, fontWeight: 600,
                          padding: "2px 9px", borderRadius: 6,
                          background: online ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.1)",
                          color: online ? "#4ade80" : "#fbbf24",
                          border: `1px solid ${online ? "rgba(74,222,128,0.25)" : "rgba(245,158,11,0.2)"}`,
                        }}>
                          {online ? "● 온라인" : "◎ 오프라인"}
                        </span>
                      </div>
                    )}

                    {/* 폴더 경로 */}
                    {c.base_dir && !isFolderFallback && (
                      <p style={{ fontSize: 11.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📁 {c.base_dir}
                      </p>
                    )}
                    {!c.base_dir && !online && !isFolderFallback && (
                      <p style={{ fontSize: 11.5, color: "#fbbf24" }}>
                        폴더 미설정 — MCP 서버 실행 후 경로 변경으로 설정하세요
                      </p>
                    )}
                  </div>

                  {/* 액션 버튼 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {/* 경로 변경 */}
                    <button
                      onClick={() => handleFolderPick(c)}
                      disabled={folderPickingId === c.id}
                      title="경로 변경"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 11px", borderRadius: 9,
                        border: "1px solid var(--border)", background: "var(--bg-surface)",
                        cursor: "pointer", fontSize: 12, color: "var(--text-secondary)",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:text-[var(--text-primary)] hover:border-[var(--accent-dim)] disabled:opacity-40"
                    >
                      {folderPickingId === c.id
                        ? <RefreshCw size={11} className="animate-spin" />
                        : <Folder size={11} />}
                      경로
                    </button>

                    {/* 이름 변경 */}
                    <button
                      onClick={() => {
                        if (isRenaming) { setRenamingId(null); }
                        else { setRenamingId(c.id); setRenameValue(c.name); }
                      }}
                      title="이름 변경"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "6px 11px", borderRadius: 9,
                        border: "1px solid var(--border)", background: "var(--bg-surface)",
                        cursor: "pointer", fontSize: 12, color: "var(--text-secondary)",
                        transition: "all 0.15s ease",
                      }}
                      className="hover:text-[var(--text-primary)] hover:border-[var(--accent-dim)]"
                    >
                      <Pencil size={11} />
                      이름
                    </button>

                    {/* 삭제 */}
                    <button
                      onClick={() => handleDelete(c.id, c.name)}
                      disabled={deletingId === c.id}
                      title="삭제"
                      style={{
                        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)",
                      }}
                      className="hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* 경로 직접 입력 fallback (MCP 서버 오프라인 시) */}
                {isFolderFallback && (
                  <div style={{
                    borderTop: "1px solid var(--border-subtle)", paddingTop: 12,
                    display: "flex", flexDirection: "column", gap: 8,
                  }}>
                    <p style={{ fontSize: 12, color: "#fbbf24" }}>
                      ⚠️ MCP 서버가 오프라인입니다. 경로를 직접 입력해 주세요.
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Input
                        placeholder="예: C:\Users\me\project"
                        value={folderFallbackValue}
                        onChange={(e) => setFolderFallbackValue(e.target.value)}
                        className="flex-1 font-mono"
                        autoComplete="off"
                        onKeyDown={(e) => { if (e.key === "Enter") handleFolderFallbackSave(c); if (e.key === "Escape") setFolderFallbackId(null); }}
                      />
                      <Button
                        variant="primary"
                        style={{ flexShrink: 0, fontSize: 12.5, padding: "0 14px" }}
                        onClick={() => handleFolderFallbackSave(c)}
                        loading={folderFallbackSaving}
                        disabled={!folderFallbackValue.trim()}
                      >
                        저장
                      </Button>
                      <button
                        onClick={() => setFolderFallbackId(null)}
                        style={{ fontSize: 12, color: "var(--text-muted)", background: "none", border: "none", cursor: "pointer" }}
                      >취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 팀 공유 설정 탭 ─────────────────────────────────────────────────────────
function TeamVisibilityTab({ teamId }: { teamId: string }) {
  const [configs, setConfigs] = useState<McpConfig[]>([]);
  const [teamConfigs, setTeamConfigs] = useState<McpConfigWithTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [mineRes, teamRes] = await Promise.all([
        mcpApi.listMine(),
        mcpApi.listForTeam(teamId),
      ]);
      setConfigs(mineRes.data ?? []);
      setTeamConfigs(teamRes.data ?? []);
    } catch { /* 무시 */ }
    finally { setLoading(false); }
  }

  useEffect(() => { if (teamId) load(); }, [teamId]);

  function isPublicForTeam(configId: string): boolean {
    return teamConfigs.some((tc) => tc.id === configId && tc.is_public);
  }

  async function toggle(configId: string, currentPublic: boolean) {
    setTogglingId(configId);
    try {
      await mcpApi.setTeamVisibility(configId, teamId, !currentPublic);
      await load();
    } catch { /* 무시 */ }
    finally { setTogglingId(null); }
  }

  const publicConfigs = teamConfigs.filter((tc) => tc.is_public);

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>팀 공유 설정</p>
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.6 }}>
          공개된 MCP는 팀원이{" "}
          <code style={{ color: "var(--accent)", fontFamily: "monospace" }}>/ai</code>
          {" "}명령에 사용할 수 있어요.
        </p>
      </div>

      {publicConfigs.length > 0 && (
        <div style={{
          background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)",
          borderRadius: 14, padding: "16px 18px",
        }}>
          <p style={{ fontSize: 12.5, fontWeight: 600, color: "#4ade80", marginBottom: 10 }}>
            이 팀에 공개된 MCP {publicConfigs.length}개
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {publicConfigs.map((tc) => (
              <span key={tc.id} style={{
                fontSize: 12, padding: "4px 10px", borderRadius: 8, fontWeight: 500,
                background: "rgba(34,197,94,0.12)", color: "#4ade80",
                border: "1px solid rgba(74,222,128,0.22)",
              }}>
                @{tc.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</div>
      ) : configs.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.7 }}>
          등록된 MCP가 없어요.<br />
          <span style={{ fontSize: 12 }}>먼저 &quot;내 MCP&quot; 탭에서 MCP를 등록해주세요.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {configs.map((c) => {
            const pub = isPublicForTeam(c.id);
            const toggling = togglingId === c.id;
            return (
              <div key={c.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "var(--bg-elevated)",
                border: `1px solid ${pub ? "rgba(74,222,128,0.18)" : "var(--border)"}`,
                borderRadius: 16, padding: "16px 18px",
                transition: "border-color 0.2s ease",
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  background: pub ? "rgba(34,197,94,0.1)" : "var(--bg-hover)",
                  border: `1px solid ${pub ? "rgba(74,222,128,0.22)" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: pub ? "0 0 12px rgba(74,222,128,0.1)" : "none",
                }}>
                  <Server size={17} color={pub ? "#4ade80" : "var(--text-muted)"} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </p>
                  {c.base_dir && (
                    <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      📁 {c.base_dir}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: c.is_online ? "#4ade80" : "var(--text-muted)", marginTop: 2 }}>
                    {c.is_online ? "● 온라인" : "◎ 오프라인"}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, color: pub ? "#4ade80" : "var(--text-muted)" }}>
                    {pub ? "공개" : "비공개"}
                  </span>
                  <Toggle checked={pub} onChange={() => toggle(c.id, pub)} disabled={toggling} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Worker 슬롯 탭 ──────────────────────────────────────────────────────────
const WORKER_MODELS = [
  { id: "google/gemma-4-31b-it:free",   label: "Gemma 4 31B",      badge: "무료" },
  { id: "google/gemma-4-31b-it",        label: "Gemma 4 31B",      badge: "유료" },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash", badge: "유료" },
  { id: "google/gemini-3.5-flash",      label: "Gemini 3.5 Flash", badge: "유료" },
  { id: "openai/gpt-4o",                label: "GPT-4o",           badge: "유료" },
  { id: "openai/gpt-4o-mini",           label: "GPT-4o Mini",      badge: "유료" },
  { id: "anthropic/claude-sonnet-4",    label: "Claude Sonnet 4",  badge: "유료" },
  { id: "anthropic/claude-haiku-4-5",   label: "Claude Haiku 4.5", badge: "유료" },
];

function WorkerSlotsTab({ teamId, onWorkerUpdate }: { teamId: string; onWorkerUpdate?: (worker: Worker) => void }) {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [modelOpenId, setModelOpenId] = useState<string | null>(null);
  const [updatingModelId, setUpdatingModelId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await workersApi.list(teamId);
      setWorkers(res.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  useEffect(() => { if (teamId) load(); }, [teamId]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const res = await workersApi.create(teamId, newName.trim());
      setWorkers((prev) => [...prev, res.data]);
      setCreating(false);
      setNewName("");
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  async function handleDelete(workerId: string, name: string) {
    if (!confirm(`"${name}" Worker를 삭제할까요?`)) return;
    setDeletingId(workerId);
    try {
      await workersApi.delete(teamId, workerId);
      setWorkers((prev) => prev.filter((w) => w.id !== workerId));
    } catch { /* ignore */ }
    finally { setDeletingId(null); }
  }

  async function handleModelChange(workerId: string, model: string) {
    setUpdatingModelId(workerId);
    setModelOpenId(null);
    try {
      const res = await workersApi.updateModel(teamId, workerId, model);
      setWorkers((prev) => prev.map((w) => w.id === workerId ? res.data : w));
      onWorkerUpdate?.(res.data);  // 오른쪽 워커 패널 즉시 반영
    } catch { /* ignore */ }
    finally { setUpdatingModelId(null); }
  }

  const idleCount = workers.filter((w) => w.status === "idle").length;
  const busyCount = workers.filter((w) => w.status === "busy").length;

  return (
    <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.015em" }}>Worker 슬롯</p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 3 }}>AI 작업을 병렬로 처리하는 슬롯</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {workers.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              {idleCount > 0 && (
                <span style={{
                  fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                  background: "rgba(34,197,94,0.1)", color: "#4ade80",
                  border: "1px solid rgba(74,222,128,0.2)",
                }}>
                  {idleCount} 대기
                </span>
              )}
              {busyCount > 0 && (
                <span style={{
                  fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                  background: "rgba(99,102,241,0.1)", color: "var(--accent)",
                  border: "1px solid rgba(99,102,241,0.2)",
                }}>
                  {busyCount} 작업중
                </span>
              )}
            </div>
          )}
          <button
            onClick={load} disabled={loading} title="새로고침"
            style={{
              width: 36, height: 36, borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "var(--bg-elevated)", border: "1px solid var(--border)",
              cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
            }}
            className="hover:text-[var(--text-primary)] transition-colors disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setCreating((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
              background: creating ? "var(--bg-elevated)" : "var(--accent)",
              color: creating ? "var(--text-secondary)" : "white",
              fontSize: 13.5, fontWeight: 600, transition: "all 0.15s ease",
              boxShadow: creating ? "none" : "0 2px 10px var(--accent-glow)",
            }}
          >
            <Plus size={14} />추가
          </button>
        </div>
      </div>

      {creating && (
        <div style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 16, padding: "20px 22px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>Worker 추가</p>
          <Input
            label="이름"
            placeholder="예: Worker 1, 메인 워커"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoComplete="off"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <Button variant="ghost" style={{ flex: 1 }} onClick={() => { setCreating(false); setNewName(""); }}>취소</Button>
            <Button variant="primary" style={{ flex: 1 }} onClick={handleCreate} loading={saving} disabled={!newName.trim()}>
              추가하기
            </Button>
          </div>
        </div>
      )}

      {loading && workers.length === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</div>
      ) : workers.length === 0 ? (
        <div style={{
          padding: "52px 24px", textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "var(--bg-elevated)", border: "1px solid var(--border)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Cpu size={26} style={{ color: "var(--text-muted)", opacity: 0.6 }} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 6 }}>Worker가 없어요</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
              Worker를 추가하면 AI 작업을 병렬로 처리할 수 있어요
            </p>
          </div>
          <button
            onClick={() => setCreating(true)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 22px", borderRadius: 12, border: "none", cursor: "pointer",
              background: "var(--accent)", color: "white",
              fontSize: 13.5, fontWeight: 600,
              boxShadow: "0 2px 12px var(--accent-glow)",
            }}
          >
            <Plus size={15} />
            Worker 추가
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {workers.map((w) => {
            const busy = w.status === "busy";
            const currentModel = WORKER_MODELS.find((m) => m.id === w.model) ?? WORKER_MODELS[0];
            const isModelOpen = modelOpenId === w.id;
            return (
              <div key={w.id} style={{ position: "relative" }}>
                <div style={{
                  background: "var(--bg-elevated)",
                  border: `1px solid ${busy ? "rgba(99,102,241,0.22)" : "rgba(74,222,128,0.15)"}`,
                  borderRadius: 16, padding: "16px 18px",
                  display: "flex", alignItems: "center", gap: 14,
                  transition: "border-color 0.2s ease",
                }}>
                  <div style={{
                    width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                    background: busy ? "rgba(99,102,241,0.12)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${busy ? "rgba(99,102,241,0.25)" : "rgba(74,222,128,0.2)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: busy ? "0 0 14px rgba(99,102,241,0.15)" : "0 0 14px rgba(74,222,128,0.1)",
                  }}>
                    <Cpu size={19} color={busy ? "var(--accent)" : "#4ade80"} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {w.name}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <span style={{
                        display: "inline-block",
                        fontSize: 11, fontWeight: 600,
                        padding: "2px 9px", borderRadius: 6,
                        background: busy ? "rgba(99,102,241,0.1)" : "rgba(34,197,94,0.1)",
                        color: busy ? "var(--accent)" : "#4ade80",
                        border: `1px solid ${busy ? "rgba(99,102,241,0.2)" : "rgba(74,222,128,0.2)"}`,
                      }}>
                        {busy ? "⚡ 작업중" : "● 대기중"}
                      </span>
                      {/* 모델 선택 버튼 */}
                      <button
                        onClick={() => setModelOpenId(isModelOpen ? null : w.id)}
                        disabled={updatingModelId === w.id}
                        style={{
                          display: "flex", alignItems: "center", gap: 4,
                          padding: "2px 8px", borderRadius: 6,
                          border: "1px solid var(--border)",
                          background: "var(--bg-base)",
                          cursor: "pointer", fontSize: 11,
                          color: "var(--text-secondary)", fontWeight: 500,
                        }}
                      >
                        {updatingModelId === w.id ? "저장중..." : currentModel.label}
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(w.id, w.name)}
                    disabled={deletingId === w.id || busy}
                    title={busy ? "작업 중에는 삭제할 수 없어요" : "삭제"}
                    style={{
                      width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "transparent", border: "none",
                      cursor: busy ? "not-allowed" : "pointer",
                      color: "var(--text-muted)",
                    }}
                    className="hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                {/* 모델 드롭다운 */}
                {isModelOpen && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    borderRadius: 12, overflow: "hidden",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                    zIndex: 100, minWidth: 220,
                  }}>
                    {WORKER_MODELS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => handleModelChange(w.id, m.id)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 10, padding: "10px 14px",
                          background: m.id === w.model ? "var(--bg-hover)" : "transparent",
                          border: "none", cursor: "pointer", textAlign: "left",
                        }}
                      >
                        <span style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: m.id === w.model ? 600 : 400 }}>
                          {m.label}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 600,
                          color: m.badge === "무료" ? "#22c55e" : "var(--text-muted)",
                          background: m.badge === "무료" ? "rgba(34,197,94,0.12)" : "var(--bg-base)",
                          borderRadius: 4, padding: "2px 6px",
                        }}>
                          {m.badge}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
