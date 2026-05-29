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
async function tryRefresh(refreshToken: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `refresh_token=${refreshToken}`,
      },
      body: JSON.stringify({}),
    });
    if (!res.ok) return null;

    // getSetCookie() is supported in Next.js Edge Runtime (Next.js 13.4+)
    const getSetCookie = (
      res.headers as unknown as { getSetCookie?: () => string[] }
    ).getSetCookie;
    const cookies: string[] =
      typeof getSetCookie === "function"
        ? getSetCookie.call(res.headers)
        : ([res.headers.get("set-cookie")].filter(Boolean) as string[]);

    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
          const newCookies = await tryRefresh(refreshToken.value);
          if (newCookies) {
            // 리프레시 성공 → 로그인된 사용자 → /rooms로
            const response = NextResponse.redirect(new URL("/rooms", request.url));
            newCookies.forEach((c) => response.headers.append("Set-Cookie", c));
            return response;
          }
        }
        // 토큰 있지만 리프레시 실패 → 만료된 세션 → 쿠키 지우고 로그인 페이지 표시
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
      const newCookies = await tryRefresh(refreshToken.value);
      if (newCookies) {
        // Refresh succeeded - attach new cookies and continue
        const response = NextResponse.next();
        newCookies.forEach((c) => response.headers.append("Set-Cookie", c));
        return response;
      }
    }
    // No refresh_token or refresh failed - redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
