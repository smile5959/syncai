import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/signup", "/installer-auth"];
const NEXT_INTERNAL = ["/_next", "/favicon.ico", "/api"];

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/v1";

/**
 * refresh_token cookie to call backend /auth/refresh.
 * Returns Set-Cookie header array on success, null on failure.
 */
interface RefreshResult {
  cookies: string[] | null;
  /** HTTP 상태코드. 네트워크 오류 등으로 응답 자체가 없으면 0. */
  status: number;
}

async function tryRefresh(refreshToken: string): Promise<RefreshResult> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `refresh_token=${refreshToken}`,
      },
      body: JSON.stringify({}),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { cookies: null, status: res.status };

    // getSetCookie() is supported in Next.js Edge Runtime (Next.js 13.4+)
    const getSetCookie = (
      res.headers as unknown as { getSetCookie?: () => string[] }
    ).getSetCookie;
    const cookies: string[] =
      typeof getSetCookie === "function"
        ? getSetCookie.call(res.headers)
        : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);

    return { cookies: cookies.length > 0 ? cookies : null, status: res.status };
  } catch {
    // 네트워크 오류 — status 0으로 구분
    return { cookies: null, status: 0 };
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Tauri 데스크탑 앱: 클라이언트 사이드에서 인증 처리
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes("SyncAI-Desktop")) {
    return NextResponse.next();
  }

  // Allow Next.js internal requests
  if (NEXT_INTERNAL.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (pathname.startsWith("/login")) {
      const accessToken = request.cookies.get("access_token");
      if (accessToken?.value) {
        // 토큰이 있어도 실제로 유효한지 리프레시로 검증
        const refreshToken = request.cookies.get("refresh_token");
        if (refreshToken?.value) {
          const result = await tryRefresh(refreshToken.value);
          if (result.cookies) {
            // 리프레시 성공 → 로그인된 사용자 → /rooms로
            const response = NextResponse.redirect(new URL("/rooms", request.url));
            result.cookies.forEach((c) => response.headers.append("Set-Cookie", c));
            return response;
          }
          if (result.status === 401) {
            // 명확히 만료된 세션(401) → 쿠키 삭제 후 로그인 페이지 표시
            const response = NextResponse.next();
            response.cookies.delete("access_token");
            response.cookies.delete("refresh_token");
            return response;
          }
          // 네트워크 오류(status 0) 또는 기타 서버 오류 → 쿠키 건드리지 않고 로그인 페이지 표시
          return NextResponse.next();
        }
        // refresh_token 없음 → 쿠키 삭제 후 로그인 페이지 표시
        const response = NextResponse.next();
        response.cookies.delete("access_token");
        response.cookies.delete("refresh_token");
        return response;
      }
    }
    return NextResponse.next();
  }

  // Root path: redirect based on auth state
  if (pathname === "/") {
    const token = request.cookies.get("access_token");
    if (!token?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.redirect(new URL("/rooms", request.url));
  }

  // All other paths: check access_token cookie
  const accessToken = request.cookies.get("access_token");
  if (!accessToken?.value) {
    // No access_token - try silent refresh with refresh_token
    const refreshToken = request.cookies.get("refresh_token");
    if (refreshToken?.value) {
      const result = await tryRefresh(refreshToken.value);
      if (result.cookies) {
        // Refresh succeeded - attach new cookies and continue
        const response = NextResponse.next();
        result.cookies.forEach((c) => response.headers.append("Set-Cookie", c));
        return response;
      }
      if (result.status === 0) {
        // 네트워크 오류 — 백엔드 일시 불가. refresh_token이 있으므로 통과시키고
        // 클라이언트 인터셉터가 재연결 시 처리하게 한다 (로그인 깜빡임 방지)
        return NextResponse.next();
      }
      // 401 등 명확한 인증 실패 → 로그인으로
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // refresh_token도 없음 → 로그인으로
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
