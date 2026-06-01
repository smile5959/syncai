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
  ChevronRight,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { users as usersApi } from "@/lib/api";

// ── 탭 정의 ──────────────────────────────────────────
const TABS = [
  { id: "profile", label: "프로필", icon: <UserIcon size={15} /> },
  { id: "appearance", label: "테마", icon: <Palette size={15} /> },
  { id: "account", label: "계정", icon: <Shield size={15} /> },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ── 테마 옵션 ─────────────────────────────────────────
const THEME_OPTIONS = [
  {
    value: "light",
    label: "라이트",
    icon: <Sun size={20} />,
    desc: "밝은 배경",
  },
  {
    value: "dark",
    label: "다크",
    icon: <Moon size={20} />,
    desc: "어두운 배경",
  },
  {
    value: "system",
    label: "시스템",
    icon: <Monitor size={20} />,
    desc: "OS 설정 따름",
  },
] as const;

// ── 프로필 탭 ─────────────────────────────────────────
function ProfileTab({ me }: { me: { name?: string; email?: string } | null }) {
  return (
    <div className="flex flex-col gap-5">
      {/* 프로필 배너 */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ background: "var(--gradient-accent-soft)", border: "1px solid var(--border)" }}
      >
        {/* 배경 장식 */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 20%, var(--accent) 0%, transparent 50%), radial-gradient(circle at 20% 80%, var(--accent-violet) 0%, transparent 50%)",
          }}
        />
        <div className="relative flex items-center gap-5 px-6 py-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-[22px] font-bold shrink-0"
            style={{
              background: "var(--gradient-accent)",
              boxShadow: "0 6px 20px rgba(99,102,241,0.4)",
            }}
          >
            {me?.name?.slice(0, 1).toUpperCase() ?? "?"}
          </div>
          <div>
            <p className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>
              {me?.name ?? "—"}
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <Mail size={12} style={{ color: "var(--text-muted)" }} />
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {me?.email ?? "—"}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1 mt-2 text-[11px] font-medium px-2 py-0.5 rounded-full"
              style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
            >
              <BadgeCheck size={11} />
              활성 계정
            </span>
          </div>
        </div>
      </div>

      {/* 필드 */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            계정 정보
          </p>
        </div>
        {[
          { label: "이름", value: me?.name ?? "—", sub: undefined },
          { label: "이메일", value: me?.email ?? "—", sub: "이메일은 변경할 수 없습니다" },
        ].map((row, i, arr) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : undefined }}
          >
            <div>
              <p className="text-[12px] font-medium mb-0.5" style={{ color: "var(--text-muted)" }}>
                {row.label}
              </p>
              <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
                {row.value}
              </p>
              {row.sub && (
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {row.sub}
                </p>
              )}
            </div>
            <ChevronRight size={14} style={{ color: "var(--text-muted)", opacity: 0.4 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 테마 탭 ───────────────────────────────────────────
function AppearanceTab({
  currentTheme,
  onToggle,
}: {
  currentTheme: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            색상 모드
          </p>
        </div>
        <div className="p-5">
          <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
            앱의 색상 모드를 선택하세요. 시스템 모드는 준비 중입니다.
          </p>
          <div className="flex gap-3">
            {THEME_OPTIONS.map((opt) => {
              const isActive = currentTheme === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    if (opt.value === "system") return;
                    if (opt.value !== currentTheme) onToggle();
                  }}
                  disabled={opt.value === "system"}
                  className="flex-1 flex flex-col items-center gap-2.5 py-5 rounded-xl transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden"
                  style={{
                    border: `1.5px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                    background: isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                    boxShadow: isActive ? "var(--shadow-glow)" : "none",
                  }}
                >
                  {isActive && (
                    <span
                      className="absolute top-2 right-2 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: "var(--accent)" }}
                    >
                      <Check size={9} color="white" />
                    </span>
                  )}
                  <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>
                    {opt.icon}
                  </span>
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }}
                  >
                    {opt.label}
                  </span>
                  <span
                    className="text-[11px]"
                    style={{ color: isActive ? "var(--accent-text)" : "var(--text-muted)" }}
                  >
                    {opt.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 계정 탭 ───────────────────────────────────────────
function AccountTab({
  me,
  onLogout,
}: {
  me: { name?: string; email?: string } | null;
  onLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            로그인 세션
          </p>
        </div>
        <div className="p-5 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--accent-bg)" }}
          >
            <BadgeCheck size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
              현재 로그인 중
            </p>
            <p className="text-[12px] truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
              {me?.email}
            </p>
          </div>
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: "rgba(34,197,94,0.12)", color: "var(--green)" }}
          >
            활성
          </span>
        </div>
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            위험 구역
          </p>
        </div>
        <div className="p-5">
          <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
            로그아웃하면 현재 세션이 종료됩니다.
          </p>
          <Button variant="danger" onClick={onLogout} className="w-full h-10">
            <LogOut size={15} />
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

  return (
    <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            설정
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
            계정 및 앱 환경을 관리하세요
          </p>
        </div>

        {/* 2컬럼 레이아웃 */}
        <div className="flex gap-5 items-start">
          {/* 좌측 탭 네비게이션 */}
          <nav
            className="w-44 shrink-0 rounded-2xl overflow-hidden sticky top-6"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-left transition-all duration-150"
                  style={{
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    borderLeft: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                  }}
                >
                  {tab.icon}
                  <span className="text-[13px] font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 우측 콘텐츠 */}
          <div className="flex-1 min-w-0">
            {activeTab === "profile" && <ProfileTab me={me} />}
            {activeTab === "appearance" && (
              <AppearanceTab currentTheme={theme} onToggle={toggle} />
            )}
            {activeTab === "account" && <AccountTab me={me} onLogout={handleLogout} />}
          </div>
        </div>

        {/* 푸터 */}
        <p className="text-center text-[12px] mt-10" style={{ color: "var(--text-muted)" }}>
          SyncAI ·{" "}
          <a
            href="mailto:support@syncai.dev"
            className="underline underline-offset-2 hover:opacity-80"
          >
            support@syncai.dev
          </a>
        </p>
      </div>
    </main>
  );
}
