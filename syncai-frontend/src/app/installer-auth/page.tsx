"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

function InstallerAuthContent() {
  const params = useSearchParams();
  const state = params.get("state") ?? "";
  const redirect = params.get("redirect") ?? "";
  const [status, setStatus] = useState<"pending" | "done" | "error">("pending");
  const [errorMsg, setErrorMsg] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!state || !redirect) {
      setStatus("error");
      setErrorMsg("state 또는 redirect 파라미터가 없습니다.");
      return;
    }

    const qs = new URLSearchParams({ state, redirect }).toString();

    axios
      .get(`${BASE}/installer/token?${qs}`, { withCredentials: true })
      .then((res) => {
        setStatus("done");
        window.location.href = res.data.redirect_url;
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          const next = encodeURIComponent(
            `/installer-auth?state=${state}&redirect=${encodeURIComponent(redirect)}`
          );
          window.location.href = `/login?next=${next}`;
        } else {
          setStatus("error");
          setErrorMsg(err.response?.data?.detail ?? "연결에 실패했습니다.");
        }
      });
  }, [state, redirect]);

  return (
    <>
      {status === "pending" && (
        <>
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
          <p style={{ margin: 0, fontSize: 15, opacity: 0.8 }}>
            PC에 SyncAI를 연결하는 중...
          </p>
        </>
      )}

      {status === "done" && (
        <p style={{ margin: 0, fontSize: 15, opacity: 0.8 }}>
          연결 완료! 인스톨러로 돌아갑니다.
        </p>
      )}

      {status === "error" && (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "#f87171",
            maxWidth: 320,
            textAlign: "center",
          }}
        >
          {errorMsg}
        </p>
      )}
    </>
  );
}

export default function InstallerAuthPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        background: "var(--gradient-bg, #0f0f0f)",
        color: "var(--text, #fff)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: "var(--gradient-accent, linear-gradient(135deg,#6366f1,#a855f7))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 8px 24px rgba(99,102,241,0.4)",
        }}
      >
        <Zap size={26} fill="white" color="white" />
      </div>

      <Suspense
        fallback={
          <div
            style={{
              width: 32,
              height: 32,
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "spin 0.7s linear infinite",
            }}
          />
        }
      >
        <InstallerAuthContent />
      </Suspense>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
