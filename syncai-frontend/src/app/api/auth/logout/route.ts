import { NextResponse } from "next/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

/**
 * Next.js 프록시 logout 엔드포인트.
 *
 * 쿠키가 두 도메인에 저장되는 문제를 해결:
 *  - fly.io 도메인 쿠키: 백엔드 /auth/logout 호출로 삭제
 *  - vercel 도메인 쿠키: 이 라우트가 Set-Cookie로 직접 삭제
 *
 * 클라이언트는 백엔드를 직접 호출하는 대신 이 라우트를 사용해야 한다.
 */
export async function POST(request: Request) {
  // 1. 백엔드 logout 호출 (fly.io 도메인 쿠키 삭제)
  try {
    const cookie = request.headers.get("cookie") ?? "";
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers: { cookie },
      credentials: "include",
    });
  } catch {
    // 백엔드 실패해도 vercel 쿠키는 삭제 진행
  }

  // 2. vercel 도메인 쿠키 삭제
  const isProduction = process.env.NODE_ENV === "production";
  const secure = isProduction;
  const samesite = isProduction ? "None" : "Lax";

  const cookieOptions = [
    `access_token=; Path=/; Max-Age=0; HttpOnly; ${secure ? "Secure; " : ""}SameSite=${samesite}`,
    `refresh_token=; Path=/; Max-Age=0; HttpOnly; ${secure ? "Secure; " : ""}SameSite=${samesite}`,
  ];

  const res = NextResponse.json({ ok: true });
  cookieOptions.forEach((c) => res.headers.append("Set-Cookie", c));
  return res;
}
