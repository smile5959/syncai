"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Check, X, Users } from "lucide-react";
import { invitations as invitationsApi } from "@/lib/api";
import type { Invitation } from "@/types";

interface InvitationBellProps {
  onAccepted?: (teamId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function InvitationBell({ onAccepted, open: openProp, onOpenChange }: InvitationBellProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [list, setList] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null);

  const controlled = openProp !== undefined;
  const open = controlled ? openProp! : internalOpen;

  function setOpen(v: boolean) {
    if (controlled) onOpenChange?.(v);
    else setInternalOpen(v);
  }

  useEffect(() => {
    invitationsApi.list().then((r) => setList(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.top, left: rect.right + 8 });
    }
  }, [open]);

  async function handleAccept(inv: Invitation) {
    setLoading(inv.id);
    try {
      const res = await invitationsApi.accept(inv.id);
      setList((prev) => prev.filter((i) => i.id !== inv.id));
      onAccepted?.(res.data.team_id);
    } finally {
      setLoading(null);
    }
  }

  async function handleReject(inv: Invitation) {
    setLoading(inv.id);
    try {
      await invitationsApi.reject(inv.id);
      setList((prev) => prev.filter((i) => i.id !== inv.id));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <button
        onClick={(e) => {
          if (controlled) e.stopPropagation();
          setOpen(!open);
        }}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 relative"
        style={{
          color: list.length > 0 ? "var(--accent-soft)" : "var(--text-muted)",
          background: open ? "var(--accent-bg)" : "transparent",
        }}
      >
        <Bell size={17} />
        {list.length > 0 && (
          <span
            className="absolute top-1 right-1 flex items-center justify-center rounded-full text-white"
            style={{
              width: 14, height: 14, fontSize: 9, fontWeight: 700,
              background: "var(--gradient-accent)",
              boxShadow: "0 2px 6px rgba(99,102,241,0.4)",
            }}
          >
            {list.length}
          </span>
        )}
      </button>

      {open && popupPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />

          <div
            className="z-50"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: popupPos.top,
              left: popupPos.left,
              width: 296,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: 14,
              boxShadow: "var(--shadow-lg)",
              overflow: "hidden",
            }}
          >
            {/* 헤더 */}
            <div style={{
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Bell size={13} style={{ color: "var(--accent)" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>팀 초대</span>
              </div>
              {list.length > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: "var(--accent-soft)",
                  background: "var(--accent-bg)",
                  padding: "2px 8px", borderRadius: 99,
                  border: "1px solid rgba(129,140,248,0.2)",
                }}>
                  {list.length}건
                </span>
              )}
            </div>

            {list.length === 0 ? (
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                justifyContent: "center", height: 130, gap: 10,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "var(--bg-soft)",
                  border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Users size={16} style={{ color: "var(--text-faint)" }} />
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5 }}>
                  받은 초대가 없어요
                </p>
              </div>
            ) : (
              <div style={{ overflowY: "auto", maxHeight: 380 }}>
                {list.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      padding: "12px 14px",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: "var(--accent-bg)",
                        border: "1px solid rgba(129,140,248,0.2)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 14, fontWeight: 700, color: "var(--accent)",
                      }}>
                        {(inv.team_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.team_name ?? "알 수 없는 팀"}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {inv.inviter_name ?? inv.inviter_id} 님이 초대했어요
                        </p>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => handleAccept(inv)}
                        disabled={loading === inv.id}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                          gap: 5, padding: "7px 0", borderRadius: 8,
                          background: "var(--gradient-accent)",
                          boxShadow: "0 2px 8px rgba(99,102,241,0.25)",
                          border: "none", color: "white", fontSize: 12, fontWeight: 600,
                          cursor: loading === inv.id ? "not-allowed" : "pointer",
                          opacity: loading === inv.id ? 0.6 : 1,
                        }}
                      >
                        <Check size={12} />
                        수락
                      </button>
                      <button
                        onClick={() => handleReject(inv)}
                        disabled={loading === inv.id}
                        style={{
                          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
                          gap: 5, padding: "7px 0", borderRadius: 8,
                          background: "transparent",
                          border: "1px solid var(--border-strong)",
                          color: "var(--text-secondary)", fontSize: 12, fontWeight: 500,
                          cursor: loading === inv.id ? "not-allowed" : "pointer",
                          opacity: loading === inv.id ? 0.6 : 1,
                        }}
                      >
                        <X size={12} />
                        거절
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
