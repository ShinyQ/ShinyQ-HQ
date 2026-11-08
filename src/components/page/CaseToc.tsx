"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Nearest sticky ancestor's `top` (px): where the contents sit once stuck. */
function stuckTop(el: HTMLElement): number {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.position === "sticky") return parseFloat(style.top) || 0;
  }
  return el.getBoundingClientRect().top;
}

/**
 * "On this page" links with scroll-spy (case study chapters, post headings); without IntersectionObserver they stay
 * plain anchors. `avoid` hides the desktop rail while wide figures cross its sticky band; focus keeps it visible.
 */
type CaseTocProps = {
  items: readonly { id: string; label: string }[];
  label: string;
  countLabel: string;
  avoid?: string;
  children?: ReactNode;
};

export function CaseToc({ items, label, countLabel, avoid, children }: CaseTocProps) {
  const [active, setActive] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const ids = items.map((item) => item.id).join(" ");

  // The current item is the last target whose top is above 40% of the viewport. The observer (targets entering or
  // leaving the top 40%) only says when to look again, so a fast jump past a short heading still lands on it.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = ids.split(" ").flatMap((id) => document.getElementById(id) ?? []);
    const pick = () => {
      const line = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const target of targets) if (target.getBoundingClientRect().top <= line) current = target.id;
      setActive(current);
    };
    const observer = new IntersectionObserver(pick, { rootMargin: "0px 0px -60% 0px" });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [ids]);

  useEffect(() => {
    const list = nav.current;
    const targets = avoid ? [...document.querySelectorAll(avoid)] : [];
    if (!list || targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    const desktop = window.matchMedia("(min-width: 80rem)");
    let observer: IntersectionObserver | null = null;
    const crossing = new Set<Element>();
    const watch = () => {
      observer?.disconnect();
      crossing.clear();
      setCovered(false);
      if (!desktop.matches) return;
      const top = stuckTop(list);
      const bottom = Math.max(0, window.innerHeight - top - list.offsetHeight);
      observer = new IntersectionObserver(
        (entries) => {
          const left = list.getBoundingClientRect().left;
          for (const entry of entries) {
            if (entry.isIntersecting && entry.boundingClientRect.right > left) crossing.add(entry.target);
            else crossing.delete(entry.target);
          }
          setCovered(crossing.size > 0);
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px` },
      );
      for (const target of targets) observer.observe(target);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(watch);
    watch();
    resize?.observe(list);
    desktop.addEventListener("change", watch);
    window.addEventListener("resize", watch);
    return () => {
      desktop.removeEventListener("change", watch);
      window.removeEventListener("resize", watch);
      resize?.disconnect();
      observer?.disconnect();
    };
  }, [avoid, ids]);

  const links = (
    <ol>
      {items.map((item, index) => (
        <li key={item.id}>
          <a href={`#${item.id}`} aria-current={active === item.id ? "true" : undefined}>
            <span className="pv-toc-number" aria-hidden="true">{index + 1}</span>
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav ref={nav} aria-label={label} className="pv-toc" data-covered={covered ? "" : undefined}>
      <div className="pv-toc-wide">
        <div className="pv-toc-head">
          <p className="pv-meta">{label}</p>
          <span className="pv-toc-count">{countLabel}</span>
        </div>
        <div className="pv-toc-list">{links}</div>
      </div>
      <details className="pv-toc-disclosure">
        <summary>
          {label}
          <span className="pv-toc-count">{countLabel}</span>
        </summary>
        <div className="pv-toc-list">{links}</div>
      </details>
      {children}
    </nav>
  );
}
