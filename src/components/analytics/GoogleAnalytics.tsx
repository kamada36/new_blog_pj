import Script from "next/script";

// 現行WordPressサイトで使っているGoogleアナリティクス4(GA4)の計測タグ。移行でアクセス解析が途切れないよう、
// 同じ測定IDで計測を続ける。環境変数 NEXT_PUBLIC_GA_ID で変更でき、空文字にすると計測しない。
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-WMC11VJDZN";

/** 本番ドメイン(NEXT_PUBLIC_SITE_URL のホスト)。wwwの有無は両方を本番として扱う。 */
function productionHosts(): string[] {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "").hostname;
    return [host, host.startsWith("www.") ? host.slice(4) : `www.${host}`];
  } catch {
    return [];
  }
}

/**
 * GA4を読み込む。ただし本番ドメインで開かれたときだけ計測を始める
 * (切り替え前の仮のデプロイ先・プレビュー・ローカル開発のアクセスで、本番の数値を汚さないため)。
 * ホストの判定はブラウザ側で行う。サイト側のページ(/admin 以外)のレイアウトにだけ置くので、管理画面は計測しない。
 * 計測用スクリプトの読み込みは遅らせる(下記)。ページ遷移(クライアント側のルーティング)は、GA4の拡張計測が履歴の変更を検知して page_view を送る。
 */
export function GoogleAnalytics() {
  const hosts = productionHosts();
  if (!GA_ID || hosts.length === 0) return null;

  return (
    <Script id="google-analytics" strategy="afterInteractive">
      {`(function () {
  if (${JSON.stringify(hosts)}.indexOf(location.hostname) === -1) return;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  gtag("js", new Date());
  gtag("config", ${JSON.stringify(GA_ID)});
  // 計測用のスクリプト(約190KB)は、表示を妨げないよう、読み込みを遅らせる。最初の操作(スクロール・タップ・キー入力)、
  // または、ページの読み込み完了から5秒後の、どちらか早い方で読み込む。上の gtag() の呼び出しは、読み込み前でも
  // dataLayer に溜まり、読み込み後にまとめて送られる。
  var started = false;
  var events = ["pointerdown", "keydown", "scroll", "touchstart"];
  function start() {
    if (started) return;
    started = true;
    events.forEach(function (name) { window.removeEventListener(name, start); });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=${GA_ID}";
    document.head.appendChild(s);
  }
  events.forEach(function (name) { window.addEventListener(name, start, { passive: true }); });
  function afterLoad() { setTimeout(start, 5000); }
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad);
})();`}
    </Script>
  );
}
