"use client";

import { useState } from "react";
import { UserPlus, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { teams as teamsApi } from "@/lib/api";

interface InviteModalProps {
  teamId: string;
  onClose: () => void;
}

export function InviteModal({ teamId, onClose }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await teamsApi.invite(teamId, email.trim());
      setSuccess(true);
      setEmail("");
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) setError("가입되지 않은 이메일이에요. 먼저 회원가입이 필요해요.");
      else if (status === 409) setError("이미 팀 멤버예요.");
      else setError("초대에 실패했어요. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 24,
          padding: "32px 36px",
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "var(--accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 4px 16px var(--accent-glow)",
            }}>
              <UserPlus size={22} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                팀원 초대
              </h3>
              <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 5, lineHeight: 1.5 }}>
                SyncAI에 가입된 계정만 초대할 수 있어요
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--text-muted)", marginTop: 2,
            }}
            className="hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Input */}
        <Input
          label="이메일 주소"
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(false); }}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          autoFocus
        />

        {/* Error */}
        {error && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            marginTop: 12, padding: "10px 14px",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10,
          }}>
            <p style={{ fontSize: 13, color: "#f87171", lineHeight: 1.5 }}>{error}</p>
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            marginTop: 12, padding: "10px 14px",
            background: "rgba(34,197,94,0.08)", border: "1px solid rgba(74,222,128,0.2)",
            borderRadius: 10,
          }}>
            <Check size={15} style={{ color: "#4ade80", flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "#4ade80" }}>초대 완료! 팀원에게 초대 링크가 전송됐어요.</p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <Button
            variant="ghost"
            style={{ flex: 1, height: 46, fontSize: 14, borderRadius: 12 }}
            onClick={onClose}
          >
            닫기
          </Button>
          <Button
            variant="primary"
            style={{ flex: 2, height: 46, fontSize: 14, borderRadius: 12, fontWeight: 600 }}
            onClick={handleInvite}
            loading={loading}
            disabled={!email.trim()}
          >
            초대하기
          </Button>
        </div>
      </div>
    </div>
  );
}
