/**
 * 記事ページの広告表記(ステルスマーケティング規制への対応)。アイキャッチ画像の直下に置く。
 * サイドバー・フッターのスポンサー枠は全ページに出るため、アフィリエイトリンクの有無にかかわらず、すべての記事に表示する。
 * トップページの帯(.hero-disclaimer)と同じコーヒー色・同じ文言にして、サイト全体で表記を揃える。
 */
export function ArticleAdDisclosure() {
  return (
    <p className="article-ad-disclosure mt-3 flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[11px] leading-snug sm:text-[13px]">
      <span className="article-ad-disclosure-badge shrink-0 rounded px-1.5 py-px text-[10px] font-bold tracking-wider sm:text-[11px]">
        PR
      </span>
      <span className="text-center">
        {/* 折り返すときは語の途中で切らず、2つのまとまりの間だけで改行する */}
        <span className="inline-block">当サイトは広告収入を含む</span>
        <span className="inline-block">アフィリエイトリンクを利用しています。</span>
      </span>
    </p>
  );
}
