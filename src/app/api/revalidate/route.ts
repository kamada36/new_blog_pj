import { revalidatePath } from "next/cache";
import { verifyRevalidateSignature } from "@/lib/ai/jobs/token";

// AIジョブ(バックグラウンド関数)の完了時に、公開ページのキャッシュの再生成を依頼される。
// バックグラウンド関数は、Next.jsの外で動くため、revalidatePath を直接呼べない。
// 署名(AUTH_SECRET から計算)を確認できた依頼だけを受け付ける。
const MAX_PATHS = 20;

export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!verifyRevalidateSignature(rawBody, req.headers.get("x-revalidate-signature"))) {
    return new Response(null, { status: 404 }); // 署名のない呼び出しには、このAPIがあることも見せない
  }

  let paths: unknown;
  try {
    paths = (JSON.parse(rawBody) as { paths?: unknown }).paths;
  } catch {
    return new Response(null, { status: 400 });
  }
  type Item = { path: string; type?: "layout" | "page" };
  const valid: Item[] = (Array.isArray(paths) ? paths : [])
    .map((p): Item | null => {
      const item = typeof p === "string" ? { path: p } : (p as Partial<Item> | null);
      if (!item || typeof item.path !== "string" || !item.path.startsWith("/") || item.path.length > 1024) return null;
      return { path: item.path, type: item.type === "layout" || item.type === "page" ? item.type : undefined };
    })
    .filter((p): p is Item => p !== null)
    .slice(0, MAX_PATHS);
  for (const { path, type } of valid) {
    if (type) revalidatePath(path, type);
    else revalidatePath(path);
  }
  return Response.json({ revalidated: valid.length }, { headers: { "Cache-Control": "no-store" } });
}
