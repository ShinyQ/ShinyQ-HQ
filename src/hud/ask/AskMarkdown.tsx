"use client";

import { useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import { ASK_SITE_ORIGINS, siteHref } from "@/ask/links";
import { parseMarkdown, type Inline } from "@/ask/markdown";
import type { Locale } from "@/content/schema";

/**
 * An Ask answer as the safe markdown subset (src/ask/markdown.ts), rendered as React elements: text
 * is never parsed as HTML and links are allowlisted (src/ask/links.ts). Site links stay in the tab
 * (`onNavigate` closes the bottom sheet first); external links open a new tab.
 */
export function AskMarkdown({ text, locale, onNavigate, className = "" }: { text: string; locale: Locale; onNavigate?: () => void; className?: string }) {
  const t = useTranslations("ask.dock");
  const blocks = useMemo(() => parseMarkdown(text, { origins: typeof window === "undefined" ? ASK_SITE_ORIGINS : [...ASK_SITE_ORIGINS, window.location.origin] }), [text]);

  const inline = (nodes: Inline[]): ReactNode[] =>
    nodes.map((node, i) => {
      switch (node.type) {
        case "text":
          return node.text;
        case "br":
          return <br key={i} />;
        case "code":
          return (
            <code key={i} className="rounded bg-surface-2 px-1 py-px font-mono text-[0.92em] text-ink">
              {node.text}
            </code>
          );
        case "strong":
          return (
            <strong key={i} className="font-semibold text-ink">
              {inline(node.children)}
            </strong>
          );
        case "em":
          return <em key={i}>{inline(node.children)}</em>;
        case "link":
          return node.target.kind === "site" ? (
            <a key={i} href={siteHref(node.target.path, locale)} onClick={onNavigate} className="link" data-ask-link="site">
              {inline(node.children)}
            </a>
          ) : (
            <a key={i} href={node.target.href} target="_blank" rel="noopener noreferrer" className="link" data-ask-link="external">
              {inline(node.children)}
              <span aria-hidden="true"> ↗</span>
              <span className="sr-only"> ({t("newTab")})</span>
            </a>
          );
      }
    });

  return (
    <div className={`space-y-2 break-words ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "p") return <p key={i}>{inline(block.children)}</p>;
        const items = block.items.map((item, j) => <li key={j}>{inline(item)}</li>);
        return block.type === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-cyan/70">
            {items}
          </ul>
        ) : (
          <ol key={i} start={block.start} className="list-decimal space-y-1 pl-5 marker:text-ink-2">
            {items}
          </ol>
        );
      })}
    </div>
  );
}
