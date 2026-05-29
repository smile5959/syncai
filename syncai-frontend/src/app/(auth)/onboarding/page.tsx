"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Users, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { teams as teamsApi } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function OnboardingPage() {
  const router = useRouter();
  const setTeam = useAuthStore((s) => s.setTeam);
  const [teamName, setTeamName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!teamName.trim()) return;
    setError("");
    setLoading(true);
    try {
      const res = await teamsApi.create(teamName.trim());
      setTeam(res.data);
      router.push("/rooms");
    } catch {
      setError("팀 생성에 실패했어요. 다시 시도해주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-[var(--bg-base)] relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[800px] h-[400px] rounded-full opacity-10 blur-[120px] pointer-events-none"
        style={{ background: "var(--accent)" }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Header */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center shadow-[0_0_24px_var(--accent-glow)]">
              <Zap size={20} className="text-white" fill="white" />
            </div>
            <span className="text-lg font-bold text-[var(--text-primary)]">SyncAI</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            팀을 만들어볼까요?
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            팀을 만들면 채팅방에서 AI와 함께<br />코드를 수정할 수 있어요
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#14161f] border border-[#2a2d42] rounded-2xl p-6 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
          {/* Features */}
          <div className="flex flex-col gap-2.5 mb-6">
            {[
              { icon: Users, text: "팀원을 초대하고 함께 작업" },
              { icon: Zap, text: "AI가 로컬 코드를 직접 수정" },
              { icon: Sparkles, text: "모바일에서도 원격으로 제어" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[var(--bg-elevated)]">
                <div className="w-6 h-6 rounded-md bg-[var(--accent-glow)] flex items-center justify-center shrink-0">
                  <Icon size={13} className="text-[var(--accent)]" />
                </div>
                <span className="text-sm text-[var(--text-secondary)]">{text}</span>
              </div>
            ))}
          </div>

          <div className="h-px bg-[var(--border-subtle)] mb-5" />

          <Input
            label="팀 이름"
            placeholder="예: 우리 팀, Frontend Team..."
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            autoFocus
          />

          {error && (
            <p className="text-xs text-[var(--red)] mt-2 bg-red-500/5 border border-red-500/10 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <Button
            variant="primary"
            className="w-full mt-4 h-11"
            onClick={handleCreate}
            loading={loading}
            disabled={!teamName.trim()}
          >
            팀 만들기
            <ArrowRight size={15} />
          </Button>
        </div>

        <p className="text-center text-xs text-[var(--text-muted)] mt-4">
          나중에 설정에서 팀원을 추가할 수 있어요
        </p>
      </div>
    </div>
  );
}
