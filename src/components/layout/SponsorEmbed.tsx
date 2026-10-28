"use client";

import { useEffect, useRef } from "react";

/**
 * ASP(アフィリエイトサービスプロバイダー)から発行された埋め込みHTMLをそのまま描画する。
 *
 * 注意: 広告素材はスポンサーとの規約でサイズ・見た目の改変が禁止されていることが多いため、
 * この上位要素・自身ともに width/height/object-fit/transform 等の見た目を変えるCSSは
 * 一切当てないこと。innerHTML経由で挿入したscriptタグはブラウザの仕様上そのままでは
 * 実行されないため、要素を作り直して差し替えている。
 */
export function SponsorEmbed({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let injected = false;
    const inject = () => {
      if (injected) return;
      injected = true;
      container.innerHTML = html;

      const scripts = Array.from(container.querySelectorAll("script"));
      for (const oldScript of scripts) {
        const newScript = document.createElement("script");
        for (const attr of Array.from(oldScript.attributes)) {
          newScript.setAttribute(attr.name, attr.value);
        }
        newScript.text = oldScript.text;
        oldScript.replaceWith(newScript);
      }
    };

    // 広告の読み込み(画像やスクリプトで数百KB)は、画面の近くまでスクロールされてから始める。
    // 最初の表示を重くしないためで、広告素材そのものには手を加えない。余裕(600px)を持たせるので、
    // 見える前に差し込まれ、読み込みで表示がずれることもない。IntersectionObserverが無い古い環境では、すぐに差し込む。
    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") {
      inject();
    } else {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            observer?.disconnect();
            inject();
          }
        },
        { rootMargin: "600px 0px" }
      );
      observer.observe(container);
    }

    return () => {
      observer?.disconnect();
      container.innerHTML = "";
    };
  }, [html]);

  return <div ref={containerRef} />;
}
