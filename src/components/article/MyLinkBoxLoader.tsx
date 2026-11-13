"use client";

import { useEffect } from "react";
import { MYLINKBOX_SCRIPT_SRC } from "@/lib/myLinkBox";

/**
 * バリューコマースの MyLinkBox 用スクリプト(mylinkbox.js)を、ウィジェットが画面の近くに来てから1回だけ読み込む。
 * 最初の表示を重くしないためで(GAやスポンサー枠と同じ方針)、MyLinkBoxを使う記事にだけ置く。
 *
 * このスクリプトは読み込み後、1秒ごとにページ内の [data-vc_mylinkbox_id] を探し直して商品カードに差し替える。
 * そのため、サイト内の別の記事へ移動した(ページ全体の再読み込みがない)後も、再度読み込む必要はなく、
 * 読み込み済みなら何もしない。移動時に取り除くと、定期的な走査まで止まるので、取り除かない。
 */
export function MyLinkBoxLoader() {
  useEffect(() => {
    const alreadyLoaded = () => document.querySelector(`script[src="${MYLINKBOX_SCRIPT_SRC}"]`) !== null;
    if (alreadyLoaded()) return;

    const load = () => {
      if (alreadyLoaded()) return;
      const script = document.createElement("script");
      script.src = MYLINKBOX_SCRIPT_SRC;
      script.async = true;
      document.body.appendChild(script);
    };

    const firstWidget = document.querySelector("[data-vc_mylinkbox_id]");
    if (!firstWidget || typeof IntersectionObserver === "undefined") {
      load();
      return;
    }

    // 余裕(600px)を持たせるので、見える前に読み込みが始まる
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(firstWidget);
    return () => observer.disconnect();
  }, []);

  return null;
}
