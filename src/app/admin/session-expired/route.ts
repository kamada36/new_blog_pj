import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { getLoginPath } from "@/lib/adminPaths";

// セッションCookieの署名は有効だが、参照先のユーザーがDBに存在しない場合に踏む経路。
// Server Component内ではCookieを削除できないため、Route Handlerで破棄してから
// ログインページ(getLoginPath)へ送り直す(でないと proxy.ts が署名有効=ログイン済みとみなして
// /admin へ跳ね返し、無限リダイレクトになる)。
export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL(getLoginPath(), request.url));
}
