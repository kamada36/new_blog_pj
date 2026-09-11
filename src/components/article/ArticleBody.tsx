import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import rehypeHighlight from "rehype-highlight";
import type { Components } from "react-markdown";

const components: Components = {
  blockquote({ children, ...props }) {
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

export function ArticleBody({ markdown }: { markdown: string }) {
  return (
    <div className="article-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeHighlight]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
