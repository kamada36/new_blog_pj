// 「管理者としてログイン中かもしれない」ことを示す目印のCookie(値は "1" だけ。秘密の情報は入れない)。
//
// 公開ページは、誰が見ても同じHTMLをCDNにキャッシュするため、サーバー側でログイン状態を調べない。
// 代わりにブラウザ側で、この目印があるときだけ、管理者向けの表示(管理バー・閲覧数)を、保護されたAPIから取得する。
// 目印は偽装できるが、偽装しても、取得先のAPI(/admin/api/...)が本物のセッションを確認するため、何も見えない。
// 目印がない閲覧者(ほぼ全員)は、管理者向けのAPIを一切呼ばない。
//
// サーバー・クライアントの両方から使うため、Node固有APIには依存しない。

export const ADMIN_FLAG_COOKIE = "rc_admin";
export const ADMIN_FLAG_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // セッション(7日)と同じ

/** ブラウザ側: 目印のCookieがあるか。 */
export function hasAdminFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((part) => part === `${ADMIN_FLAG_COOKIE}=1`);
}

/** ブラウザ側: セッション切れなどで、目印だけが残っていた場合に消す。 */
export function clearAdminFlag(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${ADMIN_FLAG_COOKIE}=; Max-Age=0; path=/`;
}
