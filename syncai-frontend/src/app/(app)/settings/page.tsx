"use client";

import { useEffect } from "react";
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

// ---

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl border p-6"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border)",
      }}
    >
      <div className="flex items-center gap-2.5 mb-5">
        <span
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
        >
          {icon}
        </span>
        <h2
          className="text-[15px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

// ---

function FieldRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div
      className="flex items-center justify-between py-3 border-b last:border-b-0"
      style={{ borderColor: "var(--border)" }}
    >
      <div>
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        <p className="text-[15px] font-medium mt-0.5" style={{ color: "var(--text-primary)" }}>
          {value}
        </p>
        {sub && (
          <p className="text-[12px] mt-0.5" style={{ color: "var(--text-muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ---

const THEME_OPTIONS = [
  { value: "light", label: "라이트", icon: <Sun size={16} /> },
  { value: "dark", label: "다크", icon: <Moon size={16} /> },
  { value: "system", label: "시스템", icon: <Monitor size={16} /> },
] as const;

// ---

export default function SettingsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const { theme, toggle } = useTheme();

  // 현재 테마 값 (toggle은 dark↔light 전환이므로 그냥 theme 값 사용)
  const currentTheme = theme;

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
    <main
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* 헤더 */}
        <div className="mb-8">
          <h1
            className="text-[24px] font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            설정
          </h1>
          <p className="text-[14px] mt-1" style={{ color: "var(--text-muted)" }}>
            계정 및 앱 환경을 관리하세요
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {/* -- 프로필 ----------------------------------- */}
          <Section icon={<UserIcon size={16} />} title="프로필">
            {/* 아바타 */}
            <div className="flex items-center gap-4 mb-5">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-[20px] font-bold shrink-0"
                style={{
                  background: "var(--gradient-accent)",
                  boxShadow: "0 4px 12px rgba(99,102,241,0.3)",
                }}
              >
                {me?.name?.slice(0, 1).toUpperCase() ?? "?"}
              </div>
              <div>
                <p
                  className="text-[16px] font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {me?.name ?? "—"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Mail size={12} style={{ color: "var(--text-muted)" }} />
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {me?.email ?? "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }}>
              <FieldRow label="이름" value={me?.name ?? "—"} />
              <FieldRow
                label="이메일"
                value={me?.email ?? "—"}
                sub="이메일은 변경할 수 없습니다"
              />
            </div>
          </Section>

          {/* -- 테마 ------------------------------------- */}
          <Section icon={<Palette size={16} />} title="테마">
            <p className="text-[13px] mb-4" style={{ color: "var(--text-muted)" }}>
              앱의 색상 모드를 선택하세요
            </p>
            <div className="flex gap-3">
              {THEME_OPTIONS.map((opt) => {
                const isActive = currentTheme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      if (opt.value === "system") return; // system은 추후 지원
                      if (opt.value !== currentTheme) toggle();
                    }}
                    disabled={opt.value === "system"}
                    className="flex-1 flex flex-col items-center gap-2 py-4 rounded-xl border transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      borderColor: isActive ? "var(--accent)" : "var(--border)",
                      background: isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                    }}
                  >
                    <span
                      style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                    >
                      {opt.icon}
                    </span>
                    <span
                      className="text-[13px] font-medium"
                      style={{ color: isActive ? "var(--accent)" : "var(--text-secondary)" }}
                    >
                      {opt.label}
                    </span>
                    {isActive && (
                      <Check size={12} style={{ color: "var(--accent)" }} />
                    )}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* -- 계정 ------------------------------------- */}
          <Section icon={<Shield size={16} />} title="계정">
            <div
              className="rounded-xl border overflow-hidden mb-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div
                className="flex items-center gap-2.5 px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <BadgeCheck size={15} style={{ color: "var(--accent)" }} />
                <span className="text-[14px]" style={{ color: "var(--text-primary)" }}>
                  로그인 상태
                </span>
                <span
                  className="ml-auto text-[12px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: "var(--accent-bg)", color: "var(--accent)" }}
                >
                  활성
                </span>
              </div>
              <div className="px-4 py-3">
                <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {me?.email}으로 로그인되어 있습니다
                </p>
              </div>
            </div>

            <Button
              variant="danger"
              onClick={handleLogout}
              className="w-full h-10"
            >
              <LogOut size={15} />
              로그아웃
            </Button>
          </Section>
        </div>

        {/* 푸터 */}
        <p
          className="text-center text-[12px] mt-8"
          style={{ color: "var(--text-muted)" }}
        >
          SyncAI · 문의:{" "}
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
