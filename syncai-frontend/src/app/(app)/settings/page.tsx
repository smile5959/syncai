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

interface ThemeOption {
  value: string;
  label: string;
  icon: React.ElementType;
  desc: string;
  disabled?: boolean;
}
const THEME_OPTIONS: ThemeOption[] = [
  { value: "light", label: "라이트", icon: Sun, desc: "밝은 배경" },
  { value: "dark", label: "다크", icon: Moon, desc: "어두운 배경" },
  { value: "system", label: "시스템", icon: Monitor, desc: "준비 중", disabled: true },
];

function ProfileTab({ me }: { me: { name?: string; email?: string } | null }) {
  const initial = me?.name?.slice(0, 1).toUpperCase() ?? "?";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 프로필 헤더 카드 */}
      <div style={{
        borderRadius: 16,
        padding: "20px 20px",
        background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-violet) 100%)",
        boxShadow: "0 8px 32px rgba(99,102,241,0.3)",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}>
        <div style={{
          width: 52, height: 52,
          borderRadius: 14,
          background: "rgba(255,255,255,0.25)",
          backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white",
          fontSize: 22,
          fontWeight: 700,
          flexShrink: 0,
          border: "1.5px solid rgba(255,255,255,0.35)",
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "white", fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{me?.name ?? "—"}</p>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4 }}>
            <Mail size={11} color="rgba(255,255,255,0.7)" />
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{me?.email ?? "—"}</p>
          </div>
        </div>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          background: "rgba(255,255,255,0.2)",
          backdropFilter: "blur(4px)",
          border: "1px solid rgba(255,255,255,0.3)",
          borderRadius: 999,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 600,
          color: "white",
          flexShrink: 0,
        }}>
          <BadgeCheck size={11} />
          활성
        </span>
      </div>

      {/* 정보 */}
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        {[
          { label: "이름", value: me?.name ?? "—" },
          { label: "이메일", value: me?.email ?? "—", note: "변경 불가" },
        ].map((row, i, arr) => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "13px 18px",
            borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : undefined,
          }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{row.label}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {row.note && (
                <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 6px", borderRadius: 4, background: "var(--bg-soft)", color: "var(--text-faint)" }}>
                  {row.note}
                </span>
              )}
              <p style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>{row.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppearanceTab({ currentTheme, onToggle }: { currentTheme: string; onToggle: () => void }) {
  return (
    <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>색상 모드</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>앱의 색상 테마를 선택하세요</p>
      </div>
      <div style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {THEME_OPTIONS.map((opt) => {
          const isActive = currentTheme === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              onClick={() => { if (!opt.disabled && opt.value !== currentTheme) onToggle(); }}
              disabled={opt.disabled}
              style={{
                position: "relative",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                padding: "16px 8px",
                borderRadius: 12,
                border: isActive ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                background: isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                boxShadow: isActive ? "0 0 0 3px var(--accent-glow), 0 4px 16px var(--accent-glow)" : "none",
                cursor: opt.disabled ? "not-allowed" : "pointer",
                opacity: opt.disabled ? 0.4 : 1,
                transition: "all 0.15s",
              }}
            >
              <Icon size={20} color={isActive ? "var(--accent)" : "var(--text-muted)"} />
              <span style={{ fontSize: 12, fontWeight: 600, color: isActive ? "var(--accent)" : "var(--text-soft)" }}>{opt.label}</span>
              <span style={{ fontSize: 10.5, color: isActive ? "var(--accent-text)" : "var(--text-faint)" }}>{opt.desc}</span>
              {isActive && (
                <span style={{
                  position: "absolute", top: 8, right: 8,
                  width: 16, height: 16, borderRadius: 999,
                  background: "var(--accent)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
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

function AccountTab({ me, onLogout }: { me: { name?: string; email?: string } | null; onLogout: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid var(--border)", background: "var(--bg-surface)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--accent-bg)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BadgeCheck size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>현재 로그인 중</p>
            <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me?.email}</p>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: "rgba(34,197,94,0.12)", color: "var(--green)", flexShrink: 0 }}>
            활성
          </span>
        </div>
        <div style={{ padding: "14px 18px" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>로그아웃하면 현재 세션이 종료됩니다.</p>
          <Button variant="danger" onClick={onLogout} size="sm">
            <LogOut size={13} />
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
}

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
    } catch { /* ignore */ }
    logout();
    router.push("/login");
  }

  return (
    <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
        {/* 헤더 */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.3px", color: "var(--text)" }}>설정</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>계정 및 앱 환경 관리</p>
        </div>

        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* 좌측 탭 */}
          <nav style={{
            width: 152, flexShrink: 0,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
          }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    width: "100%",
                    display: "flex", alignItems: "center", gap: 9,
                    padding: "10px 14px",
                    textAlign: "left",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    color: isActive ? "var(--accent)" : "var(--text-muted)",
                    borderLeft: `2px solid ${isActive ? "var(--accent)" : "transparent"}`,
                    cursor: "pointer",
                    transition: "all 0.1s",
                    border: "none",
                    borderLeftStyle: "solid",
                    borderLeftWidth: 2,
                    borderLeftColor: isActive ? "var(--accent)" : "transparent",
                  }}
                >
                  <Icon size={14} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 우측 콘텐츠 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-faint)", marginBottom: 10 }}>
              {TABS.find((t) => t.id === activeTab)?.label}
            </p>
            {activeTab === "profile" && <ProfileTab me={me} />}
            {activeTab === "appearance" && <AppearanceTab currentTheme={theme} onToggle={toggle} />}
            {activeTab === "account" && <AccountTab me={me} onLogout={handleLogout} />}
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-faint)", marginTop: 40 }}>
          SyncAI &middot; <a href="mailto:support@syncai.dev" style={{ textDecoration: "underline" }}>support@syncai.dev</a>
        </p>
      </div>
    </main>
  );
}
