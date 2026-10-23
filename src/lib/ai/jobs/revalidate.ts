import { signRevalidateBody } from "./token";

// バックグラウンド関数が記録した revalidatePath の呼び出し(netlify/shims/next-cache.ts)を、
// ジョブの完了時に、Next.js側の /api/revalidate へ依頼する。Next.jsの中(ローカルの inline 実行)では、
// 本物の revalidatePath が直接呼ばれるため、何も記録されず、この関数は何もしない。
type Pending = { path: string; type?: "layout" | "page" };

/** 依頼先として許可するオリジン: 本番ドメイン(www有無)と、Netlifyのデプロイ用ドメイン(*.netlify.app)。 */
export function isAllowedRevalidateOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname.endsWith(".netlify.app")) return true;
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname.replace(/^www\./, "");
    return url.hostname === site || url.hostname === `www.${site}`;
  } catch {
    return false;
  }
}

export async function notifyRevalidation(origin: string | undefined): Promise<void> {
  const store = globalThis as { __pendingRevalidations?: Pending[] };
  const pending = store.__pendingRevalidations;
  store.__pendingRevalidations = [];
  if (!pending?.length || !origin || !isAllowedRevalidateOrigin(origin)) return;

  // 公開ページの更新だけを依頼する(/admin 以下は、Next.js側で毎回描画されるため不要)
  const seen = new Set<string>();
  const paths = pending
    .filter((p) => !p.path.startsWith("/admin"))
    .filter((p) => {
      const key = `${p.path}|${p.type ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (paths.length === 0) return;

  const body = JSON.stringify({ paths });
  try {
    const res = await fetch(`${origin}/api/revalidate/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-revalidate-signature": signRevalidateBody(body) },
      body,
    });
    if (!res.ok) console.warn(`[ai-job] 公開ページの更新依頼が失敗しました(HTTP ${res.status})。最長5分後に反映されます。`);
  } catch (error) {
    console.warn("[ai-job] 公開ページの更新依頼に失敗しました。最長5分後に反映されます:", (error as Error).message);
  }
}
