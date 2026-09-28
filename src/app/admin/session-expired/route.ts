import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

// セッションCookieの署名は有効だが、参照先のユーザーがDBに存在しない場合に踏む経路。
// Server Component内ではCookieを削除できないため、Route Handlerで破棄してから
// /admin/login へ送り直す(でないと proxy.ts が署名有効=ログイン済みとみなして
// /admin へ跳ね返し、無限リダイレクトになる)。
export async function GET(request: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/admin/login", request.url));
}
