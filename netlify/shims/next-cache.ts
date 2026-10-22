// バックグラウンド関数(Next.jsの外)では、next/cache の revalidatePath は使えない(リクエストの文脈が無く例外になる)。
// そのため、呼び出しをその場で捨てずに記録しておき、ジョブの完了時に、Next.js側の /api/revalidate へ
// まとめて依頼する(src/lib/ai/jobs/revalidate.ts)。公開ページはキャッシュ(ISR)されているため、
// この依頼がないと、AIで生成・リライトした記事が、公開ページに反映されるまで最長5分かかる。
type Pending = { path: string; type?: "layout" | "page" };
const store = globalThis as { __pendingRevalidations?: Pending[] };

export function revalidatePath(path: string, type?: "layout" | "page"): void {
  (store.__pendingRevalidations ??= []).push({ path, type });
}
export function revalidateTag(): void {}
