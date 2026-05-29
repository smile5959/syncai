"use client";

import { useState, useEffect } from "react";
import { Bell, Check, X } from "lucide-react";
import { invitations as invitationsApi } from "@/lib/api";
import type { Invitation } from "@/types";

interface InvitationBellProps {
  onAccepted?: (teamId: string) => void;
}

export function InvitationBell({ onAccepted }: InvitationBellProps) {
  const [list, setList] = useState<Invitation[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    invitationsApi.list().then((r) => setList(r.data)).catch(() => {});
  }, []);

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
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-9 h-9 flex items-center justify-center rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors relative"
        title="초대 알림"
      >
        <Bell size={17} />
        {list.length > 0 && (
          <span
            className="absolute top-1 right-1 bg-[var(--accent)] text-white rounded-full flex items-center justify-center"
            style={{ width: 14, height: 14, fontSize: 9, fontWeight: 700 }}
          >
            {list.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          {/* dropdown */}
          <div
            className="absolute left-12 top-0 z-50 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-[var(--shadow-lg)]"
            style={{ width: 300 }}
          >
            <div className="px-4 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
              <p className="text-[14px] font-semibold text-[var(--text-primary)]">팀 초대</p>
              {list.length > 0 && (
                <span className="text-[11px] text-[var(--text-muted)] bg-[var(--bg-elevated)] px-2 py-0.5 rounded-full">
                  {list.length}건
                </span>
              )}
            </div>

            {list.length === 0 ? (
              <div className="px-4 flex flex-col items-center justify-center" style={{ height: 160 }}>
                <p className="text-[13px] text-[var(--text-muted)]">받은 초대가 없어요</p>
              </div>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 400 }}>
                {list.map((inv) => (
                  <div
                    key={inv.id}
                    className="px-4 py-5 hover:bg-[var(--bg-hover)] transition-colors border-b border-[var(--border-subtle)] last:border-0"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-xl bg-[var(--accent-bg)] flex items-center justify-center shrink-0 text-[15px] font-bold text-[var(--accent)]">
                        {(inv.team_name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5 truncate">
                          {inv.team_name ?? "알 수 없는 팀"}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                          {inv.inviter_name ?? inv.inviter_id} 님이 초대했어요
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(inv)}
                        disabled={loading === inv.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[var(--accent)] text-white text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        <Check size={13} />
                        수락
                      </button>
                      <button
                        onClick={() => handleReject(inv)}
                        disabled={loading === inv.id}
                        className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border)] text-[var(--text-secondary)] text-[13px] font-medium hover:bg-[var(--bg-hover)] transition-colors disabled:opacity-50"
                      >
                        <X size={13} />
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
