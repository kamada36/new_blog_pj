import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";
import { BALLOON_ICON_ALT_PREFIX, expandShortcodes, type ShortcodePreset } from "@/lib/shortcodes";

type ImgProps = { src?: string; alt?: string };

/** 改行だけの空白テキストノードを除いた、実質的な子要素だけを取り出す。 */
function significantChildren(children: ReactNode): ReactNode[] {
  return Children.toArray(children).filter((child) => !(typeof child === "string" && child.trim() === ""));
}

/** blockquoteの最初の段落が「吹き出しアイコン専用画像」だけを含む場合、そのimg要素を取り出す。 */
function extractBalloonIcon(firstChild: ReactNode): ReactElement<ImgProps> | null {
  if (!isValidElement(firstChild)) return null;
  const innerChildren = significantChildren((firstChild.props as { children?: ReactNode }).children);
  if (innerChildren.length !== 1) return null;

  const only = innerChildren[0];
  if (!isValidElement(only) || only.type !== "img") return null;

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

export function ArticleBody({
  markdown,
  shortcodes = [],
}: {
  markdown: string;
  shortcodes?: ShortcodePreset[];
}) {
  return (
    <div className="article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeHighlight]}
        components={baseComponents}
      >
        {expandShortcodes(markdown, shortcodes)}
      </ReactMarkdown>
    </div>
  );
}
