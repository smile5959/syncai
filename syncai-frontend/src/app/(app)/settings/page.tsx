"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  User as UserIcon,
  Palette,
  Shield,
  CreditCard,
  LogOut,
  Sun,
  Moon,
  Coffee,
  Check,
  Mail,
  BadgeCheck,
  Zap,
  ChevronLeft,
  Star,
  Building2,
  Rocket,
  Lock,
  Bell,
} from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { useTheme, type Theme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { users as usersApi, logoutUser } from "@/lib/api";

// ─── 탭 정의 ────────────────────────────────────────────────────────
const TABS = [
  { id: "profile",    label: "프로필",   icon: UserIcon,   desc: "내 정보" },
  { id: "appearance", label: "테마",     icon: Palette,    desc: "색상 모드" },
  { id: "plan",       label: "플랜",     icon: CreditCard, desc: "구독 관리" },
  { id: "account",    label: "계정",     icon: Shield,     desc: "보안 설정" },
] as const;
type TabId = (typeof TABS)[number]["id"];

// ─── 테마 옵션 ────────────────────────────────────────────────────────
interface ThemeCard {
  value: Theme;
  label: string;
  labelEn: string;
  icon: React.ElementType;
  desc: string;
  preview: { bg: string; surface: string; accent: string; text: string; border: string };
}

const THEME_CARDS: ThemeCard[] = [
  {
    value: "dark",
    label: "다크",
    labelEn: "Dark",
    icon: Moon,
    desc: "눈에 편한 어두운 배경",
    preview: {
      bg: "#0E0E14",
      surface: "#16161F",
      accent: "#818CF8",
      text: "#F4F4F7",
      border: "rgba(255,255,255,0.08)",
    },
  },
  {
    value: "light",
    label: "라이트",
    labelEn: "Light",
    icon: Sun,
    desc: "깔끔한 흰 배경",
    preview: {
      bg: "#FAFAFB",
      surface: "#FFFFFF",
      accent: "#6366F1",
      text: "#16161E",
      border: "rgba(15,16,28,0.08)",
    },
  },
  {
    value: "oat",
    label: "오트",
    labelEn: "Oat",
    icon: Coffee,
    desc: "따뜻한 아이보리 감성",
    preview: {
      bg: "#F7F3EC",
      surface: "#FDFAF5",
      accent: "#B87333",
      text: "#2A1C0C",
      border: "rgba(120,88,52,0.12)",
    },
  },
];

// ─── 플랜 정의 ──────────────────────────────────────────────────────
const PLANS = [
  {
    id: "free",
    name: "Free",
    nameKo: "무료",
    price: "₩0",
    period: "/월",
    current: true,
    color: "var(--accent)",
    features: [
      "팀 1개",
      "채팅방 5개",
      "Worker 슬롯 1개",
      "기본 AI 모델",
      "MCP 연결 (1개)",
    ],
    cta: "현재 플랜",
    badge: null,
  },
  {
    id: "starter",
    name: "Starter",
    nameKo: "스타터",
    price: "₩9,900",
    period: "/월",
    current: false,
    color: "#10b981",
    features: [
      "팀 3개",
      "채팅방 무제한",
      "Worker 슬롯 3개",
      "고급 AI 모델",
      "MCP 연결 무제한",
      "우선 처리",
    ],
    cta: "출시 알림 받기",
    badge: "출시 예정",
  },
  {
    id: "pro",
    name: "Pro",
    nameKo: "프로",
    price: "₩29,900",
    period: "/월",
    current: false,
    color: "#f59e0b",
    features: [
      "팀 무제한",
      "채팅방 무제한",
      "Worker 슬롯 10개",
      "최신 AI 모델 (GPT-4o 등)",
      "MCP 연결 무제한",
      "팀 분석 대시보드",
      "전용 지원",
    ],
    cta: "출시 알림 받기",
    badge: "곧 출시",
  },
];

// ─── 서브 컴포넌트: 프로필 탭 ────────────────────────────────────────
function ProfileTab({ me }: { me: { name?: string; email?: string; created_at?: string } | null }) {
  const initial = (me?.name?.slice(0, 2) ?? "??").toUpperCase();
  const memberSince = me?.created_at
    ? new Date(me.created_at).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })
    : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 프로필 헤더 카드 */}
      <div style={{
        borderRadius: 20,
        padding: "28px 28px",
        background: "var(--gradient-accent)",
        boxShadow: "var(--shadow-lg)",
        display: "flex",
        alignItems: "center",
        gap: 20,
        position: "relative",
        overflow: "hidden",
      }}>
        {/* 배경 장식 */}
        <div style={{
          position: "absolute", top: -40, right: -40,
          width: 180, height: 180, borderRadius: "50%",
          background: "rgba(255,255,255,0.07)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -50, left: 80,
          width: 120, height: 120, borderRadius: "50%",
          background: "rgba(255,255,255,0.05)",
          pointerEvents: "none",
        }} />

        <div style={{
          width: 64, height: 64,
          borderRadius: 18,
          background: "rgba(255,255,255,0.22)",
          backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white",
          fontSize: 22, fontWeight: 800,
          flexShrink: 0,
          border: "1.5px solid rgba(255,255,255,0.35)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: "white", fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
            {me?.name ?? "—"}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 5 }}>
            <Mail size={12} color="rgba(255,255,255,0.7)" />
            <p style={{ color: "rgba(255,255,255,0.75)", fontSize: 13 }}>{me?.email ?? "—"}</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.2)",
            backdropFilter: "blur(4px)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 999,
            padding: "4px 12px",
            fontSize: 12, fontWeight: 600, color: "white",
          }}>
            <BadgeCheck size={12} />
            활성 계정
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: "rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: "3px 10px",
            fontSize: 11, color: "rgba(255,255,255,0.75)",
          }}>
            <Zap size={10} fill="currentColor" />
            Beta
          </span>
        </div>
      </div>

      {/* 정보 카드 */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            계정 정보
          </p>
        </div>
        {[
          { label: "이름", value: me?.name ?? "—" },
          { label: "이메일", value: me?.email ?? "—", tag: "변경 불가" },
          { label: "가입일", value: memberSince },
          { label: "플랜", value: "Free · Beta" },
        ].map((row, i, arr) => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : undefined,
          }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>{row.label}</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {row.tag && (
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 5,
                  background: "var(--bg-soft)", color: "var(--text-faint)",
                  border: "1px solid var(--border)",
                }}>
                  {row.tag}
                </span>
              )}
              <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{row.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 알림 설정 미리보기 (coming soon) */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", overflow: "hidden", opacity: 0.6,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "var(--bg-soft)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={15} color="var(--text-muted)" />
            </div>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>알림 설정</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 1 }}>AI 작업 완료, 팀원 초대 등</p>
            </div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
            background: "var(--bg-soft)", color: "var(--text-muted)",
            border: "1px solid var(--border)",
          }}>
            준비 중
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트: 테마 탭 ──────────────────────────────────────────
function AppearanceTab({ currentTheme, onSetTheme }: { currentTheme: Theme; onSetTheme: (t: Theme) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px 14px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
            색상 테마
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
            앱 전체의 색상과 분위기를 선택하세요
          </p>
        </div>
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {THEME_CARDS.map((tc) => {
            const isActive = currentTheme === tc.value;
            const Icon = tc.icon;
            return (
              <button
                key={tc.value}
                onClick={() => onSetTheme(tc.value)}
                style={{
                  position: "relative",
                  display: "flex", flexDirection: "column", gap: 0,
                  borderRadius: 14,
                  border: isActive
                    ? "2px solid var(--accent)"
                    : "1.5px solid var(--border)",
                  background: isActive ? "var(--accent-bg)" : "var(--bg-elevated)",
                  boxShadow: isActive ? "0 0 0 3px var(--accent-glow)" : "none",
                  cursor: "pointer",
                  overflow: "hidden",
                  transition: "all 0.18s ease",
                  textAlign: "left",
                }}
              >
                {/* 테마 미리보기 */}
                <div style={{
                  padding: "14px 14px 10px",
                  background: tc.preview.bg,
                  borderBottom: `1px solid ${tc.preview.border}`,
                  display: "flex", flexDirection: "column", gap: 6,
                }}>
                  {/* 미니 앱 프레임 */}
                  <div style={{ display: "flex", gap: 5 }}>
                    {/* 사이드바 */}
                    <div style={{
                      width: 22, borderRadius: 5, overflow: "hidden",
                      background: tc.preview.surface,
                      border: `1px solid ${tc.preview.border}`,
                      display: "flex", flexDirection: "column", gap: 3, padding: 4,
                    }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: tc.preview.accent }} />
                      <div style={{ width: 14, height: 3, borderRadius: 2, background: tc.preview.border, opacity: 4 }} />
                      <div style={{ width: 14, height: 3, borderRadius: 2, background: tc.preview.border, opacity: 3 }} />
                    </div>
                    {/* 메인 영역 */}
                    <div style={{ flex: 1, borderRadius: 5, background: tc.preview.surface, border: `1px solid ${tc.preview.border}`, padding: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                      {/* 채팅 버블들 */}
                      <div style={{ alignSelf: "flex-end", width: "55%", height: 5, borderRadius: 3, background: tc.preview.accent, opacity: 0.8 }} />
                      <div style={{ width: "45%", height: 5, borderRadius: 3, background: tc.preview.border }} />
                      <div style={{ alignSelf: "flex-end", width: "38%", height: 5, borderRadius: 3, background: tc.preview.accent, opacity: 0.6 }} />
                    </div>
                  </div>
                </div>

                {/* 테마 정보 */}
                <div style={{ padding: "10px 14px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <Icon size={13} color={isActive ? "var(--accent)" : "var(--text-muted)"} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-primary)", letterSpacing: "-0.01em" }}>
                      {tc.label}
                    </span>
                    <span style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{tc.labelEn}</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>{tc.desc}</p>
                </div>

                {isActive && (
                  <span style={{
                    position: "absolute", top: 8, right: 8,
                    width: 18, height: 18, borderRadius: 999,
                    background: "var(--accent)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 2px 6px var(--accent-glow)",
                  }}>
                    <Check size={10} color="white" strokeWidth={3} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Oat 소개 카드 */}
      <div style={{
        borderRadius: 16,
        border: "1px solid rgba(184,115,51,0.22)",
        background: "rgba(184,115,51,0.05)",
        padding: "16px 20px",
        display: "flex", alignItems: "flex-start", gap: 14,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: "rgba(184,115,51,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Coffee size={16} color="#B87333" />
        </div>
        <div>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
            Oat 테마란?
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.6 }}>
            따뜻한 아이보리 배경과 구리(Copper) 계열 액센트로 구성된 테마예요.
            긴 시간 작업 시 눈의 피로를 줄이면서 다크 모드보다 밝은 환경을 원할 때 딱 좋아요.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트: 플랜 탭 ──────────────────────────────────────────
interface QuotaInfo {
  plan: string;
  ai_calls_month: number;
  ai_calls_limit: number;
  ai_calls_reset_at: string | null;
}

function PlanTab() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    usersApi.quota().then((r) => setQuota(r.data)).catch(() => {});
  }, []);

  const planLabel: Record<string, string> = { free: "무료", starter: "스타터", pro: "프로" };
  const currentPlanLabel = planLabel[quota?.plan ?? "free"] ?? "무료";
  const usagePercent = quota && quota.ai_calls_limit > 0
    ? Math.min((quota.ai_calls_month / quota.ai_calls_limit) * 100, 100)
    : 0;
  const isUnlimited = quota?.ai_calls_limit === -1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 현재 플랜 배너 */}
      <div style={{
        borderRadius: 16, padding: "18px 20px",
        background: "var(--accent-bg)",
        border: "1px solid var(--accent-dim)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: "var(--accent)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Zap size={18} color="white" fill="white" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            현재 플랜: {currentPlanLabel} · Beta
          </p>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 3 }}>
            베타 기간 동안 무료로 모든 기능을 이용할 수 있어요.
          </p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
          background: "var(--accent)", color: "white", flexShrink: 0,
        }}>
          {currentPlanLabel}
        </span>
      </div>

      {/* AI 사용량 카드 */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", padding: "18px 20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Zap size={14} color="var(--accent)" />
            <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>이번 달 AI 사용량</p>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)" }}>
            {quota
              ? isUnlimited
                ? `${quota.ai_calls_month}회 (무제한)`
                : `${quota.ai_calls_month} / ${quota.ai_calls_limit}회`
              : "—"}
          </p>
        </div>
        {!isUnlimited && quota && (
          <div style={{ background: "var(--bg-elevated)", borderRadius: 999, height: 6, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 999,
              background: usagePercent >= 90 ? "var(--status-error)" : "var(--accent)",
              width: `${usagePercent}%`,
              transition: "width 0.4s ease",
            }} />
          </div>
        )}
        {quota?.ai_calls_reset_at && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 8 }}>
            다음 리셋: {new Date(new Date(quota.ai_calls_reset_at).getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("ko-KR")}
          </p>
        )}
      </div>

      {/* 플랜 카드 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            style={{
              borderRadius: 16,
              border: plan.current
                ? "2px solid var(--accent)"
                : "1.5px solid var(--border)",
              background: "var(--bg-surface)",
              overflow: "hidden",
              display: "flex", flexDirection: "column",
              boxShadow: plan.current ? "var(--shadow-lg)" : "none",
              position: "relative",
            }}
          >
            {plan.badge && (
              <div style={{
                position: "absolute", top: 12, right: 12,
                fontSize: 9.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                background: plan.color,
                color: "white",
              }}>
                {plan.badge}
              </div>
            )}

            <div style={{ padding: "20px 18px 16px" }}>
              {/* 아이콘 + 이름 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  background: plan.current ? "var(--accent-bg)" : "var(--bg-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {plan.id === "free" && <Zap size={13} color={plan.current ? "var(--accent)" : "var(--text-muted)"} />}
                  {plan.id === "starter" && <Rocket size={13} color="#10b981" />}
                  {plan.id === "pro" && <Star size={13} color="#f59e0b" />}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>
                    {plan.nameKo}
                  </p>
                  <p style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{plan.name}</p>
                </div>
              </div>

              {/* 가격 */}
              <div style={{ marginBottom: 16 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", letterSpacing: "-0.03em" }}>
                  {plan.price}
                </span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: 2 }}>
                  {plan.period}
                </span>
              </div>

              {/* 기능 목록 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 18 }}>
                {plan.features.map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <Check size={11} color={plan.current ? "var(--accent)" : plan.color} strokeWidth={2.5} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.3 }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA 버튼 */}
              <button
                disabled={plan.current}
                style={{
                  width: "100%", padding: "9px 12px", borderRadius: 10,
                  fontSize: 12.5, fontWeight: 600,
                  border: "none", cursor: plan.current ? "default" : "pointer",
                  background: plan.current ? "var(--accent)" : "var(--bg-soft)",
                  color: plan.current ? "white" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >
                {plan.cta}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 비즈니스/엔터프라이즈 배너 */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)",
        padding: "18px 20px",
        display: "flex", alignItems: "center", gap: 14, opacity: 0.7,
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, flexShrink: 0,
          background: "var(--bg-soft)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Building2 size={18} color="var(--text-muted)" />
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>
            Enterprise · 대규모 팀
          </p>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
            커스텀 계약, 전용 인프라, SSO 지원 — 문의 주세요
          </p>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
          background: "var(--bg-soft)", color: "var(--text-muted)",
          border: "1px solid var(--border)", flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          준비 중
        </span>
      </div>
    </div>
  );
}

// ─── 서브 컴포넌트: 계정 탭 ──────────────────────────────────────────
function AccountTab({ me, onLogout }: { me: { name?: string; email?: string } | null; onLogout: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 현재 세션 */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            현재 세션
          </p>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <BadgeCheck size={18} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {me?.name ?? "사용자"}
            </p>
            <p style={{ fontSize: 12.5, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {me?.email}
            </p>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999,
            background: "rgba(34,197,94,0.12)", color: "var(--green)", flexShrink: 0,
            border: "1px solid var(--status-online-border)",
          }}>
            로그인 중
          </span>
        </div>
      </div>

      {/* 보안 (coming soon) */}
      <div style={{
        borderRadius: 16, border: "1px solid var(--border)",
        background: "var(--bg-surface)", overflow: "hidden", opacity: 0.6,
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>
            보안
          </p>
        </div>
        {[
          { label: "비밀번호 변경", desc: "현재 비밀번호를 변경해요" },
          { label: "2단계 인증", desc: "계정 보안을 강화해요" },
        ].map((item, i) => (
          <div key={item.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 20px",
            borderBottom: i === 0 ? "1px solid var(--border)" : undefined,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Lock size={14} color="var(--text-muted)" />
              <div>
                <p style={{ fontSize: 13.5, fontWeight: 500, color: "var(--text-primary)" }}>{item.label}</p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{item.desc}</p>
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
              background: "var(--bg-soft)", color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}>
              준비 중
            </span>
          </div>
        ))}
      </div>

      {/* 위험 구역 */}
      <div style={{
        borderRadius: 16,
        border: "1px solid var(--status-error-border)",
        background: "var(--bg-surface)", overflow: "hidden",
      }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--status-error-border)" }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--status-error)" }}>
            위험 구역
          </p>
        </div>
        <div style={{ padding: "18px 20px" }}>
          <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
            로그아웃하면 현재 기기의 세션이 종료됩니다.
            자동 로그인이 꺼져 있으면 다시 로그인해야 해요.
          </p>
          <Button variant="danger" onClick={onLogout} size="sm">
            <LogOut size={13} />
            로그아웃
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  useEffect(() => {
    if (!me) {
      usersApi.me().then((r) => setUser(r.data)).catch(console.error);
    }
  }, [me, setUser]);

  async function handleLogout() {
    logout();
    await logoutUser();
    router.replace("/login");
  }

  const activeTabInfo = TABS.find((t) => t.id === activeTab)!;

  return (
    <main style={{ flex: 1, overflowY: "auto", background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 28px 60px" }}>

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <button
            onClick={() => router.back()}
            style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: "var(--bg-surface)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: "var(--text-muted)",
            }}
            className="hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.03em", color: "var(--text-primary)", lineHeight: 1 }}>
              설정
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>계정 및 앱 환경 관리</p>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {/* 좌측 탭 네비 */}
          <nav style={{
            width: 176, flexShrink: 0,
            borderRadius: 16,
            border: "1px solid var(--border)",
            background: "var(--bg-surface)",
            overflow: "hidden",
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
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "12px 16px",
                    textAlign: "left",
                    background: isActive ? "var(--accent-bg)" : "transparent",
                    borderLeft: `3px solid ${isActive ? "var(--accent)" : "transparent"}`,
                    cursor: "pointer",
                    border: "none",
                    borderLeftStyle: "solid",
                    borderLeftWidth: 3,
                    borderLeftColor: isActive ? "var(--accent)" : "transparent",
                    transition: "all 0.12s",
                  }}
                  className={isActive ? "" : "hover:bg-[var(--bg-hover)]"}
                >
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: isActive ? "var(--accent)" : "var(--bg-elevated)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.12s",
                  }}>
                    <Icon size={13} color={isActive ? "white" : "var(--text-muted)"} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{
                      fontSize: 13, fontWeight: 600, letterSpacing: "-0.01em",
                      color: isActive ? "var(--accent)" : "var(--text-secondary)",
                      lineHeight: 1.2,
                    }}>
                      {tab.label}
                    </p>
                    <p style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 1 }}>{tab.desc}</p>
                  </div>
                </button>
              );
            })}

            <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
            <div style={{ padding: "10px 14px 12px" }}>
              <p style={{ fontSize: 10, color: "var(--text-faint)", lineHeight: 1.6 }}>
                SyncAI Beta
              </p>
              <p style={{ fontSize: 10, color: "var(--text-faint)" }}>
                <a href="mailto:support@syncai.dev" style={{ textDecoration: "underline", color: "inherit" }}>
                  support@syncai.dev
                </a>
              </p>
            </div>
          </nav>

          {/* 우측 컨텐츠 */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 탭 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: "var(--accent-bg)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <activeTabInfo.icon size={13} color="var(--accent)" />
              </div>
              <div>
                <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {activeTabInfo.label}
                </p>
                <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>{activeTabInfo.desc}</p>
              </div>
            </div>

            {activeTab === "profile"    && <ProfileTab me={me} />}
            {activeTab === "appearance" && <AppearanceTab currentTheme={theme} onSetTheme={setTheme} />}
            {activeTab === "plan"       && <PlanTab />}
            {activeTab === "account"    && <AccountTab me={me} onLogout={handleLogout} />}
          </div>
        </div>
      </div>
    </main>
  );
}
