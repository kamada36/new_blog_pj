"use client";

import { useEffect, useState } from "react";
import { FaCheck, FaLink } from "react-icons/fa6";
import { SiHatenabookmark, SiLine, SiThreads, SiX } from "react-icons/si";

interface ShareButtonsProps {
  url?: string;
  title?: string;
}

const iconButtonClass =
  "flex h-9 w-9 shrink-0 items-center justify-center text-foreground/60 transition-colors duration-200";

export function ShareButtons({ url: urlProp, title: titleProp }: ShareButtonsProps) {
  const [url, setUrl] = useState(urlProp ?? "");
  const [title, setTitle] = useState(titleProp ?? "");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Fallback to the current page's URL/title only when the caller didn't
    // supply them — these browser globals are unavailable during SSR.
    if (!urlProp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUrl(window.location.href);
    }
    if (!titleProp) {
      setTitle(document.title);
    }
  }, [urlProp, titleProp]);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);
  const urlWithoutProtocol = url.replace(/^https?:\/\//, "");

  const links = [
    {
      key: "x",
      label: "Xでシェアする",
      href: `https://x.com/intent/post?text=${encodedTitle}&url=${encodedUrl}`,
      icon: <SiX className="h-5 w-5" />,
      hover: "hover:text-black",
    },
    {
      key: "threads",
      label: "Threadsでシェアする",
      href: `https://www.threads.net/intent/post?text=${encodedTitle}%20${encodedUrl}`,
      icon: <SiThreads className="h-5 w-5" />,
      hover: "hover:text-black",
    },
    {
      key: "line",
      label: "LINEでシェアする",
      href: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
      icon: <SiLine className="h-6 w-6" />,
      hover: "hover:text-[#06C755]",
    },
    {
      key: "hatena",
      label: "はてなブックマークに追加",
      href: `https://b.hatena.ne.jp/entry/s/${urlWithoutProtocol}`,
      icon: <SiHatenabookmark className="h-5 w-5" />,
      hover: "hover:text-[#00A4DE]",
    },
  ];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable — silently ignore
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {links.map((link) => (
        <a
          key={link.key}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
          title={link.label}
          className={`${iconButtonClass} ${link.hover}`}
        >
          {link.icon}
        </a>
      ))}
      <div className="relative">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="リンクをコピーする"
          title="リンクをコピーする"
          className={`${iconButtonClass} hover:text-accent-dark`}
        >
          {copied ? <FaCheck className="h-5 w-5" /> : <FaLink className="h-5 w-5" />}
        </button>
        {copied && (
          <span
            role="status"
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md"
          >
            コピーしました！
          </span>
        )}
      </div>
    </div>
  );
}
