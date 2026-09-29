export type MediaUrlRewriteOptions = {
  /** 旧WordPressのホスト名（プロトコル・www有無は問わない）。例: "old-site.example.com" */
  oldDomain: string;
  /** 新しい画像配信ドメイン。例: "https://media.resilient-cer.com" */
  newBaseUrl: string;
  /** 旧サイトでのアップロードパス接頭辞。デフォルトはWordPress標準の "/wp-content/uploads" */
  oldPathPrefix?: string;
  /** 新ドメイン側でのアップロードパス接頭辞。 */
  newPathPrefix?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 本文(HTML)・アイキャッチURL中の旧WordPress画像URLを新ドメインへ書き換える関数を生成する。
 *
 * 対応パターン:
 *   https://old-site.example.com/wp-content/uploads/2024/01/foo.jpg
 *   //old-site.example.com/wp-content/uploads/2024/01/foo.jpg (プロトコル相対)
 *   /wp-content/uploads/2024/01/foo.jpg (相対パス)
 *   www有無どちらも許容
 * → https://media.resilient-cer.com/uploads/2024/01/foo.jpg
 *
 * ファイル名・クエリ文字列以降はそのまま維持し、ドメイン+アップロードパス接頭辞のみを置換する。
 * <img src>だけでなくsrcset内の複数URLや本文中のリンクも同じ置換で一括対応できる。
 */
export function createMediaUrlRewriter(options: MediaUrlRewriteOptions) {
  const oldPathPrefix = options.oldPathPrefix ?? "/wp-content/uploads";
  const newPathPrefix = options.newPathPrefix ?? "/uploads";
  const newBase = options.newBaseUrl.replace(/\/+$/, "");
  const domainPattern = escapeRegExp(options.oldDomain.replace(/^www\./i, ""));
  const pathPattern = escapeRegExp(oldPathPrefix);

  // グループ1: プロトコル(相対含む)+ドメイン付きのケース。マッチしない場合は相対パスとして扱う。
  const pattern = new RegExp(`(?:https?:)?//(?:www\\.)?${domainPattern}${pathPattern}/|${pathPattern}/`, "gi");

  return function rewriteMediaUrls(text: string | null | undefined): string {
    if (!text) return "";
    return text.replace(pattern, `${newBase}${newPathPrefix}/`);
  };
}
