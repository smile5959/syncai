"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Palette,
  Shield,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Check,
  Mail,
  BadgeCheck,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { users as usersApi } from "@/lib/api";

const TABS = [
  { id: "profile", label: "프로필", icon: UserIcon },
  { id: "appearance", label: "테마", icon: Palette },
  { id: "account", label: "계정", icon: Shield },
] as const;
type TabId = (typeof TABS)[number]["id"];

const THEME_OPTIONS = [
  { value: "light", label: "라이트", icon: Sun, desc: "밝은 배경" },
  { value: "dark", label: "다크", icon: Moon, desc: "어두운 배경" },
  { value: "system", label: "시스템", icon: Monitor, desc: "OS 따름", disabled: true },
] as const;

// ── 프로필 탭 ─────────────────────────────────────────
function ProfileTab({ me }: { me: { name?: string; email?: string } | null }) {
  return (
    <div className="space-y-3">
      {/* 프로필 카드 */}
      <div
        className="rounded-2xl p-px"
        style={{ background: "var(--gradient-accent)" }}
      >
        <div
          className="rounded-[15px] px-5 py-5 flex items-center gap-4"
          style={{ background: "var(--bg-surface)" }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
            style={{
              background: "var(--gradient-accent)",
              boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
            }}
          >
            {me?.name?.slice(0, 1).toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
              {me?.name ?? "—"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Mail size={11} style={{ color: "var(--text-muted)" }} />
              <p className="text-[12px] truncate" style={{ color: "var(--text-muted)" }}>
                {me?.email ?? "—"}
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", color: "var(--green)" }}
          >
            <BadgeCheck size={11} />
            활성
          </span>
        </div>
      </div>

      {/* 정보 테이블 */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
        }}
      >
        {[
          { label: "이름", value: me?.name ?? "—" },
          { label: "이메일", value: me?.email ?? "—", note: "변경 불가" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between px-5 py-3.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{row.label}</p>
            <div className="flex items-center gap-2">
              {row.note && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded"
                  style={{ background: "var(--bg-soft)", color: "var(--text-faint)" }}
                >
                  {row.note}
                </span>
              )}
              <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {row.value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 테마 탭 ───────────────────────────────────────────
function AppearanceTab({ currentTheme, onToggle }: { currentTheme: string; onToggle: () => void }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="px-5 pt-5 pb-4">
        <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>색상 모드</p>
        <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>앱의 색상 테마를 선택하세요</p>
      </div>
      <div className="px-5 pb-5 grid grid-cols-3 gap-2.5">
        {THEME_OPTIONS.map((opt) => {
          const isActive = currentTheme === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => {
                if (opt.disabled) return;
                if (opt.value !== currentTheme) onToggle();
              }}
              disabled={opt.disabled}
              className="relative flex flex-col items-center gap-2 py-4 rounded-xl transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed"
              style={{
                border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                background: isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                boxShadow: isActive ? "0 0 0 1px var(--accent), 0 4px 16px var(--accent-glow)" : "none",
              }}
            >
              <Icon
                size={18}
                style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
              />
              <span
                className="text-[12px] font-medium"
                style={{ color: isActive ? "var(--accent)" : "var(--text-soft)" }}
              >
                {opt.label}
              </span>
              {isActive && (
                <span
                  className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: "var(--accent)" }}
                >
                  <Check size={9} color="white" strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 계정 탭 ───────────────────────────────────────────
function AccountTab({ me, onLogout }: { me: { name?: string; email?: string } | null; onLogout: () => void }) {
  return (
    <div className="space-y-3">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3.5 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-bg)" }}
          >
            <BadgeCheck size={16} style={{ color: "var(--accent)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>현재 로그인 중</p>
            <p className="text-[12px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{me?.email}</p>
          </div>
          <span
            className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", color: "var(--green)" }}
          >
            활성
          </span>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12px] mb-3" style={{ color: "var(--text-muted)" }}>
            로그아웃하면 현재 세션이 종료됩니다.
          </p>
          <Button variant="danger" onClick={onLogout} size="sm" className="gap-1.5">
            <LogOut size={13} />
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ───────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggle } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  useEffect(() => {
    if (!me) {
      usersApi.me().then((r) => setUser(r.data)).catch(console.error);
    }
  }, [me, setUser]);

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    logout();
    router.push("/login");
  }

  const activeTabData = TABS.find((t) => t.id === activeTab)!;

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="mb-7">
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
            설정
          </h1>
          <p className="text-[13px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            계정 및 앱 환경 관리
          </p>
        </div>

        <div className="flex gap-4 items-start">
          {/* 좌측 탭 */}
          <nav
            className="w-40 shrink-0 rounded-2xl overflow-hidden"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors duration-100"
                  style={{
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                  }}
                >
                  <Icon size={14} />
                  <span className="text-[13px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 우측 콘텐츠 */}
          <div className="flex-1 min-w-0">
            {/* 섹션 타이틀 */}
            <p className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-faint)" }}>
              {activeTabData.label}
            </p>
            {activeTab === "profile" && <ProfileTab me={me} />}
            {activeTab === "appearance" && <AppearanceTab currentTheme={theme} onToggle={toggle} />}
            {activeTab === "account" && <AccountTab me={me} onLogout={handleLogout} />}
          </div>
        </div>

        <p className="text-center text-[11px] mt-10" style={{ color: "var(--text-faint)" }}>
          SyncAI ·{" "}
          <a href="mailto:support@syncai.dev" className="hover:underline">
            support@syncai.dev
          </a>
        </p>
      </div>
    </main>
  );
}
