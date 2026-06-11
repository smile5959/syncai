"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Zap, Mail, Lock, ArrowRight, User, Eye, EyeOff,
  Code2, MessageSquare, Sparkles, Sun, Moon,
} from "lucide-react";
import { auth, users as usersApi, saveTokens } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { useTheme } from "@/components/providers/theme-provider";

/* ────────────────────────────────────────
   Field Input 서브 컴포넌트
──────────────────────────────────────── */
interface FieldInputProps {
  label: string;
  icon: React.ReactNode;
  rightIcon?: React.ReactNode;
  extra?: React.ReactNode;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
}

function FieldInput({
  label, icon, rightIcon, extra,
  type = "text", placeholder, value, onChange, required,
}: FieldInputProps) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: "block", fontSize: 12.5, fontWeight: 500,
        color: "var(--text-soft)", marginBottom: 7, letterSpacing: "-0.005em",
      }}>
        {label}
      </label>
      <div
        className="field-wrap"
        style={{
          position: "relative", display: "flex", alignItems: "center",
          background: "var(--bg-soft)", border: "1px solid transparent",
          borderRadius: 12, transition: "all 0.18s ease",
        }}
      >
        <span style={{ paddingLeft: 14, color: "var(--text-muted)", display: "inline-flex", flexShrink: 0 }}>
          {icon}
        </span>
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          style={{
            flex: 1, appearance: "none", border: 0, background: "transparent",
            padding: "13px 14px", fontSize: 14, color: "var(--text)",
            outline: "none", width: "100%",
          }}
        />
        {rightIcon}
      </div>
      {extra}
    </div>
  );
}

/* ────────────────────────────────────────
   메인 컴포넌트
──────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  // `next` param: after login, redirect there instead of /rooms
  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : null;
  const nextUrl = searchParams?.get("next") ?? "";
  const setUser = useAuthStore((s) => s.setUser);
  const setTeam = useAuthStore((s) => s.setTeam);
  const logoutStore = useAuthStore((s) => s.logout);
  const { theme, toggle } = useTheme();

  const user = useAuthStore((s) => s.user);

  // Tauri 앱: 이미 로그인된 경우 /rooms로
  useEffect(() => {
    if (user) router.replace("/rooms");
  }, [user]);

  const [registered, setRegistered] = useState(false);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 입력값 바꾸면 에러 지움 (submit 시작 시 지우지 않음)
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (error) setError("");
  };
  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (error) setError("");
  };

  const pwStrength = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password) && /[0-9]/.test(password)) s++;
    return Math.min(s, 3);
  })();

  const strengthColor = ["", "#F59E0B", "#EAB308", "#14B8A6"][pwStrength];
  const strengthLabel = ["더 길게 입력해주세요", "약함", "보통", "강력함 ✓"][pwStrength];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // 프론트(Vercel)와 백엔드(Fly.io)가 다른 도메인이라
      // 백엔드 set-cookie가 Vercel Edge proxy에서 보이지 않음.
      // 로그인 응답 body의 토큰을 현재 도메인 쿠키로 직접 설정.
      const setAuthCookies = (token: string, refreshToken: string) => {
        const isSecure = location.protocol === "https:";
        const opts = `path=/;${isSecure ? " Secure;" : ""} SameSite=Lax`;
        document.cookie = `access_token=${token}; ${opts}`;
        if (refreshToken) document.cookie = `refresh_token=${refreshToken}; ${opts}`;
      };

      if (tab === "signup") {
        await auth.signup(email, password, name);
        setRegistered(true);
        setTab("login");
        setEmail("");
        setPassword("");
        setName("");
        return;
      }
      const res = await auth.login(email, password);
      // 이전 유저 데이터(팀 등) 초기화 후 새 유저 세팅
      logoutStore();
      setUser(res.data.user);
      setAuthCookies(res.data.token, res.data.refresh_token);
      saveTokens(res.data.token, res.data.refresh_token);
      if (nextUrl) {
        router.push(nextUrl);
        return;
      }
      const loginTeams = res.data.teams ?? (await usersApi.myTeams()).data.teams;
      if (loginTeams.length > 0) setTeam(loginTeams[0]);
      router.push("/rooms");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string; error?: { message?: string } } } })
          ?.response?.data?.detail ??
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ??
        "로그인에 실패했어요.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex" style={{ background: "var(--gradient-bg)" }}>

      {/* ── 왼쪽 브랜드 패널 ── */}
      <div
        className="hidden lg:flex flex-col justify-between relative overflow-hidden"
        style={{
          flex: "1.1",
          padding: "56px 64px",
          background: `
            radial-gradient(ellipse 80% 60% at 20% 0%, rgba(168, 85, 247, 0.16), transparent 60%),
            radial-gradient(ellipse 70% 50% at 80% 100%, rgba(99, 102, 241, 0.18), transparent 60%),
            var(--bg-soft)
          `,
          borderRight: "1px solid var(--border-strong)",
        }}
      >
        {/* 그리드 오버레이 */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(ellipse 60% 80% at 50% 50%, black 30%, transparent 80%)",
          opacity: 0.5,
        }} />

        {/* 콘텐츠 */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* 로고 행 */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 56 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 11,
              background: "var(--gradient-accent)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "white",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}>
              <Zap size={18} fill="white" />
            </div>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
              SyncAI
            </span>
          </div>

          {/* 헤드라인 */}
          <h2 style={{
            fontSize: 40, fontWeight: 700, letterSpacing: "-0.03em",
            lineHeight: 1.15, margin: "0 0 18px", color: "var(--text)",
          }}>
            AI가{" "}
            <span style={{
              background: "var(--gradient-accent)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}>
              코드를 직접
            </span>
            <br />
            고쳐드립니다
          </h2>
          <p style={{
            fontSize: 15, color: "var(--text-soft)", lineHeight: 1.6,
            maxWidth: 380, margin: 0,
          }}>
            채팅으로 요청하면, 팀 레포지토리에 PR이 올라옵니다.
            AI 페어 프로그래머와 함께 빠르게 빌드하세요.
          </p>

          {/* 기능 목록 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 36 }}>
            {[
              { icon: <Code2 size={14} />, title: "실시간 코드 수정", desc: "자연어로 요청하면 PR로 도착" },
              { icon: <MessageSquare size={14} />, title: "팀 협업", desc: "채팅방에서 함께 디자인하고 리뷰" },
              { icon: <Sparkles size={14} />, title: "맥락 이해", desc: "레포 전체를 읽고 의도에 맞게 수정" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, color: "var(--text-soft)", fontSize: 13.5 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                  background: "var(--accent-bg)", color: "var(--accent-text)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}>
                  {f.icon}
                </span>
                <span>
                  <b style={{ color: "var(--text)", fontWeight: 600 }}>{f.title}</b>
                  {" — "}{f.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 패널 푸터 */}
        <div style={{
          color: "var(--text-muted)", fontSize: 12,
          display: "flex", gap: 16, alignItems: "center",
          position: "relative", zIndex: 1,
        }}>
          <span>© 2026 SyncAI</span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-faint)", flexShrink: 0 }} />
          <span>Beta</span>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-faint)", flexShrink: 0 }} />
          <span>v0.4.2</span>
        </div>
      </div>

      {/* ── 오른쪽 폼 패널 ── */}
      <div
        className="flex flex-col items-center justify-center relative"
        style={{ flex: 1, minWidth: 0, padding: 24 }}
      >
        {/* 테마 토글 */}
        <button
          onClick={toggle}
          title={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          style={{
            position: "absolute", top: 20, right: 20,
            width: 36, height: 36, borderRadius: "50%",
            background: "var(--bg-soft)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-soft)", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.18s ease",
          }}
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* 카드 */}
        <div style={{
          width: "100%", maxWidth: 420,
          background: "color-mix(in srgb, var(--bg-elev) 90%, transparent)",
          backdropFilter: "blur(24px) saturate(140%)",
          WebkitBackdropFilter: "blur(24px) saturate(140%)",
          border: "1px solid var(--border-strong)",
          borderRadius: 24,
          padding: "40px 36px 32px",
          boxShadow: "var(--shadow-lg)",
        }}>

          {/* 카드 헤더 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, marginBottom: 28 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16,
              background: "var(--gradient-accent)",
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              color: "white",
              boxShadow: "0 8px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
            }}>
              <Zap size={24} fill="white" />
            </div>
            <div style={{ textAlign: "center" }}>
              <h1 style={{
                margin: 0, fontSize: 24, fontWeight: 700,
                letterSpacing: "-0.02em", color: "var(--text)",
              }}>
                {tab === "login" ? "다시 만나서 반가워요" : "함께 시작해볼까요"}
              </h1>
              <p style={{ marginTop: 6, fontSize: 14, color: "var(--text-muted)" }}>
                {tab === "login"
                  ? "SyncAI 계정으로 로그인하세요"
                  : "30초만에 SyncAI를 시작할 수 있어요"}
              </p>
            </div>
          </div>

          {/* 탭 */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            background: "var(--bg-soft)", borderRadius: 12,
            padding: 4, gap: 2, marginBottom: 22,
          }}>
            {(["login", "signup"] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(""); setRegistered(false); }}
                style={{
                  appearance: "none", border: 0, cursor: "pointer",
                  padding: "9px 12px", borderRadius: 9,
                  fontSize: 13.5, fontWeight: 500,
                  color: tab === t ? "var(--text)" : "var(--text-muted)",
                  background: tab === t ? "var(--bg-elev)" : "transparent",
                  boxShadow: tab === t ? "var(--shadow-sm)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {t === "login" ? "로그인" : "회원가입"}
              </button>
            ))}
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit}>
            {tab === "signup" && (
              <FieldInput
                label="이름"
                icon={<User size={16} />}
                type="text"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <FieldInput
              label="이메일"
              icon={<Mail size={16} />}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={handleEmailChange}
              required
            />
            <FieldInput
              label="비밀번호"
              icon={<Lock size={16} />}
              type={showPw ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={handlePasswordChange}
              required
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{
                    padding: "0 12px", color: "var(--text-muted)",
                    background: "transparent", border: 0, cursor: "pointer",
                    display: "inline-flex", alignItems: "center",
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
              extra={
                tab === "signup" && password ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, fontSize: 11.5 }}>
                    <span style={{ color: "var(--text-muted)" }}>{strengthLabel}</span>
                    <div style={{ display: "flex", gap: 3 }}>
                      {[1, 2, 3].map((i) => (
                        <span key={i} style={{
                          width: 18, height: 3, borderRadius: 2,
                          background: pwStrength >= i ? strengthColor : "var(--border-strong)",
                          transition: "background 0.2s ease",
                          display: "inline-block",
                        }} />
                      ))}
                    </div>
                  </div>
                ) : null
              }
            />

            {tab === "login" && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4, marginBottom: 16 }}>
                <a href="#" style={{
                  fontSize: 12.5, color: "var(--accent-text)",
                  textDecoration: "none", fontWeight: 500,
                  transition: "opacity 0.15s ease",
                }}>
                  비밀번호 찾기
                </a>
              </div>
            )}

            {registered && tab === "login" && (
              <div style={{
                marginBottom: 14, padding: "9px 12px", borderRadius: 10,
                background: "rgba(20, 184, 166, 0.08)",
                border: "1px solid rgba(20, 184, 166, 0.25)",
                fontSize: 12.5, color: "#14B8A6", textAlign: "center",
              }}>
                회원가입이 완료됐어요! 로그인해주세요 🎉
              </div>
            )}

            {error && (
              <div style={{
                marginBottom: 14, padding: "9px 12px", borderRadius: 10,
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                fontSize: 12.5, color: "var(--red)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <span style={{ flex: 1, textAlign: "center" }}>{error}</span>
                <button
                  type="button"
                  onClick={() => setError("")}
                  style={{
                    background: "transparent", border: 0, cursor: "pointer",
                    color: "var(--red)", opacity: 0.6, flexShrink: 0,
                    padding: 0, lineHeight: 1, fontSize: 16,
                  }}
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
            )}

            {/* 제출 버튼 */}
            <button
              type="submit"
              disabled={loading}
              className="btn-gradient"
              style={{
                width: "100%", padding: "14px 16px", borderRadius: 12,
                color: "white", fontSize: 14.5, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                border: 0,
              }}
            >
              {loading ? (
                <span style={{
                  width: 16, height: 16,
                  border: "2px solid rgba(255,255,255,0.4)",
                  borderTopColor: "white", borderRadius: "50%",
                  display: "inline-block", animation: "spin 0.7s linear infinite",
                }} />
              ) : (
                <>
                  {tab === "login" ? "로그인" : "계정 만들기"}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* 카드 푸터 */}
          <div style={{ marginTop: 20, textAlign: "center", fontSize: 12.5, color: "var(--text-muted)" }}>
            {tab === "login" ? (
              <>
                아직 계정이 없으신가요?{" "}
                <a href="#"
                  style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}
                  onClick={(e) => { e.preventDefault(); setTab("signup"); setError(""); }}>
                  회원가입
                </a>
              </>
            ) : (
              <>
                이미 계정이 있으신가요?{" "}
                <a href="#"
                  style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 500 }}
                  onClick={(e) => { e.preventDefault(); setTab("login"); setError(""); }}>
                  로그인
                </a>
              </>
            )}
            <div style={{ marginTop: 8 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 11px", borderRadius: 999,
                background: "var(--accent-bg)", color: "var(--accent-text)",
                fontSize: 11.5, fontWeight: 500,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
                Beta · 무료 사용 중
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
