import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { DEFAULT_LOGIN_PATH, getLoginPath, isLoginPathHidden } from "@/lib/adminPaths";
import { ADMIN_FLAG_COOKIE, ADMIN_FLAG_MAX_AGE_SECONDS } from "@/lib/adminFlag";

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

/**
 * 存在しないページと同じ404を返す。(サイトの通常の404ページへ内部で振り向ける。)
 * 管理画面があること自体を、ログインしていない訪問者やボットに見せないために使う。
 */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/page-not-found-xyz/", request.url));
}

/**
 * ログイン済みの管理者のレスポンスに、公開ページ向けの目印Cookie(rc_admin)を付ける。
 * この目印が導入される前にログインしたセッションも、管理画面を開けば目印が付く(再ログイン不要)。
 */
function withAdminFlag(request: NextRequest, response: NextResponse) {
  if (request.cookies.get(ADMIN_FLAG_COOKIE)?.value !== "1") {
    response.cookies.set(ADMIN_FLAG_COOKIE, "1", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ADMIN_FLAG_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export async function proxy(request: NextRequest) {
  // trailingSlash: true のため、環境(Netlify など)によってパスが末尾「/」付きで渡る。
  // 揃えないとログインページを判定できず、未ログイン時に /admin/login へ転送し続けるループになる。
  const pathname = request.nextUrl.pathname.replace(/\/+$/, "") || "/";
  const isDefaultLoginPage = pathname === DEFAULT_LOGIN_PATH;
  const hidden = isLoginPathHidden();

  // ログイン入口を秘密のURLへ移している場合、標準の /admin/login は存在しないものとして扱う
  // (秘密のURL自体は、next.config.ts の rewrites で /admin/login の画面に振り向けていて、このproxyは通らない)
  if (hidden && isDefaultLoginPage) return notFound(request);

  const authenticated = await hasValidSession(request);

  if (isDefaultLoginPage) {
    if (authenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (authenticated) return withAdminFlag(request, NextResponse.next());

  if (hidden) {
    // セッションのCookieが無い訪問者(通常の閲覧者・ボット)には、管理画面があることも見せない。
    if (!request.cookies.get(SESSION_COOKIE)?.value) return notFound(request);
    // Cookieはあるが無効(期限切れなど): 画面からの通信(API)には401を返し、画面にはログインを促す
    if (pathname.startsWith("/admin/api/")) {
      return Response.json({ error: "セッションが切れました。ログインし直してください。" }, { status: 401 });
    }
  }

  const loginUrl = new URL(getLoginPath(), request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
