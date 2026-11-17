import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { IconMug } from "@/components/icons/CafeIcons";
import { BALLOON_ICON_ALT_PREFIX, expandShortcodes, type ShortcodePreset } from "@/lib/shortcodes";
import { hasMyLinkBox, parseMyLinkBoxId } from "@/lib/myLinkBox";
import { isAffiliateUrl } from "@/lib/affiliateLinks";
import { MyLinkBoxLoader } from "./MyLinkBoxLoader";

type ImgProps = { src?: string; alt?: string };

/** 本文の画像の実寸(サーバー側で調べたもの)。URLをキーにする。ここにある画像だけ、next/imageで変換して配信する。 */
export type ImageSizes = Record<string, { width: number; height: number }>;

/** 本文の「リンクだけの段落」を、ブログカードで表示するための記事情報(loadLinkCards が作る)。本文のhrefをキーにする。 */
export type LinkCards = Record<string, { title: string; imageUrl: string | null }>;

// 本文の幅(2カラムのとき約700px、それ以外は画面幅)。変換する画像の大きさの候補を選ぶ目安。
const BODY_IMAGE_SIZES = "(min-width: 1024px) 700px, 100vw";

/** 改行だけの空白テキストノードを除いた、実質的な子要素だけを取り出す。 */
function significantChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => !(typeof child === "string" && child.trim() === ""));
}

/**
 * 段落の中身が「アフィリエイトのリンク(バナー・テキスト)だけ」なら、描画する子要素を返す(そうでなければnull)。
 * ASPの計測URLへのリンクと、それに続く計測用の1x1画像(リンクの外の画像)だけで構成された段落が対象で、
 * 文章の途中にあるリンクは対象外。計測用の画像は、読み込みは残したまま、段落に余計な空白行を作らないよう包んで目立たなくする。
 */
function affiliateParagraphParts(parts: ReactNode[]): ReactNode[] | null {
  let hasAffiliateLink = false;
  const result: ReactNode[] = [];
  for (const part of parts) {
    if (!isValidElement(part)) return null;
    const props = part.props as { href?: unknown; src?: unknown };
    if (typeof props.href === "string") {
      if (!isAffiliateUrl(props.href)) return null;
      hasAffiliateLink = true;
      result.push(part);
    } else if (typeof props.src === "string") {
      result.push(
        <span key={part.key} className="article-affiliate-pixel">
          {part}
        </span>
      );
    } else if (part.type === "br") {
      result.push(part);
    } else {
      return null;
    }
  }
  return hasAffiliateLink ? result : null;
}

/** blockquoteの最初の段落が「吹き出しアイコン専用画像」だけを含む場合、そのimg要素を取り出す。 */
function extractBalloonIcon(firstChild: ReactNode): ReactElement<ImgProps> | null {
  if (!isValidElement(firstChild)) return null;
  const innerChildren = significantChildren((firstChild.props as { children?: ReactNode }).children);
  if (innerChildren.length !== 1) return null;

  // 本文の画像を差し替えると、要素の種類が "img" ではなくなるため、種類ではなく、alt の目印で判定する
  const only = innerChildren[0];
  if (!isValidElement(only)) return null;

  const alt = (only.props as ImgProps).alt;
  if (typeof alt !== "string" || !alt.startsWith(BALLOON_ICON_ALT_PREFIX)) return null;

  return only as ReactElement<ImgProps>;
}

const baseComponents: Components = {
  blockquote({ children, ...props }) {
    const [firstChild, ...restChildren] = significantChildren(children);
    const icon = extractBalloonIcon(firstChild);

    if (icon) {
      const position = icon.props.alt === `${BALLOON_ICON_ALT_PREFIX}r` ? "right" : "left";
      return (
        <div className={`article-balloon article-balloon-${position}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 本文内の他の画像と同様、最適化を通さない素のimgで統一 */}
          <img src={icon.props.src} alt="" className="article-balloon-icon" />
          <div className="article-balloon-text">{restChildren}</div>
        </div>
      );
    }

    return (
      <blockquote className="article-callout" {...props}>
        {children}
      </blockquote>
    );
  },
  table({ children, ...props }) {
    return (
      <div className="article-table-wrap">
        <table {...props}>{children}</table>
      </div>
    );
  },
  a({ children, ...props }) {
    return (
      <a {...props} target={props.href?.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

/** 内部記事へのブログカード(アイキャッチをサムネイルにした、記事への大きなリンク)。 */
function LinkCard({ href, card }: { href: string; card: LinkCards[string] }) {
  return (
    <Link href={href} className="article-linkcard">
      <span className="article-linkcard-thumb">
        {card.imageUrl ? (
          <Image src={card.imageUrl} alt="" fill sizes="(max-width: 640px) 112px, 200px" className="object-cover" />
        ) : (
          <IconMug className="h-8 w-8 text-accent/50" />
        )}
      </span>
      <span className="article-linkcard-body">
        <span className="article-linkcard-label">あわせて読みたい</span>
        <span className="article-linkcard-title">{card.title}</span>
      </span>
    </Link>
  );
}

export function ArticleBody({
  markdown,
  shortcodes = [],
  imageSizes,
  linkCards,
}: {
  markdown: string;
  shortcodes?: ShortcodePreset[];
  /** サーバー側で調べた画像の実寸(loadImageSizes)。渡した画像だけ変換して配信する。省略時は、すべて元の画像をそのまま表示 */
  imageSizes?: ImageSizes;
  /** サーバー側で調べた、内部記事リンクのカード情報(loadLinkCards)。渡したリンクだけ、リンクだけの段落をカードで表示する。省略時は通常のリンク */
  linkCards?: LinkCards;
}) {
  const components: Components = {
    ...baseComponents,
    ...(imageSizes && {
      img({ src, alt }) {
        const size = typeof src === "string" ? imageSizes[src] : undefined;
        if (typeof src === "string" && size) {
          // 実寸を渡すので、読み込み前から場所が確保され、レイアウトがずれない。小さい画像が、引き伸ばされることもない。
          // 表示サイズの目安(sizes)は、実寸より大きくしない: 150pxのアイコンのような小さい画像で、本文の幅(700px)に
          // 合わせた大きい候補を選ばせない(引き伸ばされて重く・ぼやけるのを防ぐ)。
          const sizes = size.width < 700 ? `(max-width: ${size.width}px) 100vw, ${size.width}px` : BODY_IMAGE_SIZES;
          return <Image src={src} alt={alt ?? ""} width={size.width} height={size.height} sizes={sizes} />;
        }
        // eslint-disable-next-line @next/next/no-img-element -- 外部サイトの画像など、最適化できないものは素のimgで表示する
        return <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} />;
      },
    }),
    p({ children }) {
      const parts = significantChildren(children);

      // [vc-mylinkbox id="..."] だけの段落は、バリューコマースの商品リンクの置き場所にする(中身は mylinkbox.js が差し込む)
      if (parts.length > 0 && parts.every((part) => typeof part === "string")) {
        const widgetId = parseMyLinkBoxId(parts.join(""));
        if (widgetId) return <div className="article-mylinkbox" data-vc_mylinkbox_id={widgetId} />;
      }

      // アフィリエイトのバナー・テキストリンクだけの段落は、記事の中央に寄せて表示する(.article-affiliate)
      const affiliateParts = affiliateParagraphParts(parts);
      if (affiliateParts) return <p className="article-affiliate">{affiliateParts}</p>;

      // 段落の中身がリンク1つだけで、それが記事のカード情報を持つなら、カードに置き換える
      if (linkCards) {
        const [only, ...others] = parts;
        if (only && others.length === 0 && isValidElement(only)) {
          const href = (only.props as { href?: unknown }).href;
          const card = typeof href === "string" ? linkCards[href] : undefined;
          if (card) return <LinkCard href={href as string} card={card} />;
        }
      }
      return <p>{children}</p>;
    },
  };
  return (
    <div className="article-body">
      {hasMyLinkBox(markdown) && <MyLinkBoxLoader />}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeHighlight]}
        components={components}
      >
        {expandShortcodes(markdown, shortcodes)}
      </ReactMarkdown>
    </div>
  );
}
