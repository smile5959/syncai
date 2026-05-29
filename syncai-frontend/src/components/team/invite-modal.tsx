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
        className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-7 w-full max-w-sm shadow-[var(--shadow-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <UserPlus size={15} className="text-white" />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)]">
              팀원 초대
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Description */}
        <p className="text-[13px] text-[var(--text-muted)] mb-5 leading-relaxed">
          초대할 팀원의 이메일을 입력하세요.
          <br />
          <span className="text-[var(--text-secondary)]">SyncAI에 가입된 계정만 초대할 수 있어요.</span>
        </p>

        {/* Input */}
        <Input
          label="이메일"
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); setSuccess(false); }}
          onKeyDown={(e) => e.key === "Enter" && handleInvite()}
          autoFocus
        />

        {/* Error */}
        {error && (
          <p className="text-[12px] text-red-400 mt-2.5 px-1">{error}</p>
        )}

        {/* Success */}
        {success && (
          <div className="flex items-center gap-2 mt-2.5 px-1">
            <Check size={13} className="text-emerald-400" />
            <p className="text-[12px] text-emerald-400">초대 완료! 팀원이 추가됐어요.</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2.5 mt-5">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            닫기
          </Button>
          <Button
            variant="primary"
            className="flex-1"
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
