import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/theme-provider";

export const metadata: Metadata = {
  title: "SyncAI — AI Coding Assistant for Teams",
  description: "채팅방에서 AI가 로컬 코드를 직접 수정합니다",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="h-full dark" suppressHydrationWarning>
      <body className="h-full antialiased">
        {/* 테마 플래시(FOUC) 방지 — React 하이드레이션 전에 실행, React render tree 밖에서 주입 */}
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('syncai-theme')||'dark';var el=document.documentElement;el.classList.remove('dark','light','oat');el.classList.add(t);}catch(e){}})();`,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
