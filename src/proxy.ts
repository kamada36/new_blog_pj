import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "rc_session";

async function hasValidSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return false;

  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  // trailingSlash: true のため、環境(Netlify など)によってパスが末尾「/」付きで渡る。
  // 揃えないとログインページを判定できず、未ログイン時に /admin/login へ転送し続けるループになる。
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const isLoginPage = pathname === "/admin/login";
  const authenticated = await hasValidSession(request);

  if (isLoginPage) {
    if (authenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (!authenticated) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
