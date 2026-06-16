"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Tauri의 macOS WKWebView는 window.confirm()/alert()를 구현하지 않아
 * 호출 즉시 false를 반환한다 (팝업 없이 조용히 무반응). 모든 삭제류
 * 확인창은 이 커스텀 모달을 써야 데스크탑 앱에서도 동작한다.
 */
export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((msg: string) => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setMessage(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {message && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => settle(false)}
        >
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 24,
              padding: "28px 32px",
              width: "100%",
              maxWidth: 380,
              boxShadow: "0 32px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.5, marginBottom: 24 }}>
              {message}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button variant="ghost" onClick={() => settle(false)}>
                취소
              </Button>
              <Button variant="danger" onClick={() => settle(true)}>
                확인
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** window.confirm() 대체 — Tauri/브라우저 양쪽에서 동작. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm은 ConfirmDialogProvider 안에서만 사용할 수 있습니다.");
  }
  return ctx;
}
