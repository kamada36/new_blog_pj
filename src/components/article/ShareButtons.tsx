"use client";

import { useState } from "react";

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const links = [
    {
      label: "X",
      href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
    },
    {
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    },
    {
      label: "LINE",
      href: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
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
    <div className="flex flex-wrap items-center gap-2">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent hover:text-accent-dark"
        >
          {link.label}
        </a>
      ))}
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-full border border-border px-4 py-2 text-xs font-semibold hover:border-accent hover:text-accent-dark"
      >
        {copied ? "コピーしました" : "リンクをコピー"}
      </button>
    </div>
  );
}
