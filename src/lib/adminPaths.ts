// 管理画面のログイン入口のURL。
//
// 環境変数 ADMIN_LOGIN_PATH(例: /enter-xxxxxxxx)を設定すると、ログインページはそのURLでだけ開き、
// 標準の /admin/login と、未ログインでの /admin 以下へのアクセスは、404(存在しないページ)になる。
// 未設定(または不正な値)のときは、従来どおり /admin/login を入口にする。
// 値はコード(GitHub)に書かず、環境変数だけで持つ。
//
// next.config.ts(ビルド時のrewrites)にも、同じ判定を複製している。変えるときは両方を揃えること。
// Edge/Nodeのどちらでも動くよう、Node固有APIには依存しない。

export const DEFAULT_LOGIN_PATH = "/admin/login";

// 1階層のみ。短すぎる文字列は推測されやすいため受け付けない。
const SECRET_PATH_PATTERN = /^\/[A-Za-z0-9][A-Za-z0-9_-]{7,}$/;

export function getLoginPath(): string {
  const raw = process.env.ADMIN_LOGIN_PATH?.trim();
  if (!raw) return DEFAULT_LOGIN_PATH;
  const normalized = `/${raw.replace(/^\/+|\/+$/g, "")}`;
  return SECRET_PATH_PATTERN.test(normalized) ? normalized : DEFAULT_LOGIN_PATH;
}

/** 入口を、標準の /admin/login から移しているか。 */
export function isLoginPathHidden(): boolean {
  return getLoginPath() !== DEFAULT_LOGIN_PATH;
}
