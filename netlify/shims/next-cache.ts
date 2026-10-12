// バックグラウンド関数(Next.jsの外)では、next/cache の revalidatePath は使えない(リクエストの文脈が無く例外になる)。
// 公開ページはキャッシュされない動的ページで、管理画面の一覧も毎回読み込み直されるため、何もしなくて問題ない。
export function revalidatePath(): void {}
export function revalidateTag(): void {}
