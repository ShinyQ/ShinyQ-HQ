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
 * "On this page" links with scroll-spy; without IntersectionObserver they stay plain anchors. `avoid` (a selector, the
 * posts' wide figures) hides the list while a matching element crosses the band it is stuck in, so a wide figure is
 * never drawn under it; focus inside the list keeps it shown (CSS).
 */
export function CaseToc({ items, label, avoid, children }: { items: readonly { id: string; label: string }[]; label: string; avoid?: string; children?: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const id of ids.split(" ")) {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    }
    return () => observer.disconnect();
  }, [ids]);

  useEffect(() => {
    const list = nav.current;
    const targets = avoid ? [...document.querySelectorAll(avoid)] : [];
    if (!list || targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver | null = null;
    const crossing = new Set<Element>();
    const watch = () => {
      observer?.disconnect();
      crossing.clear();
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
    const rewatch = () => {
      setCovered(false);
      watch();
    };
    watch();
    window.addEventListener("resize", rewatch);
    return () => {
      window.removeEventListener("resize", rewatch);
      observer?.disconnect();
    };
  }, [avoid]);

  return (
    <nav ref={nav} aria-label={label} className="pv-toc" data-covered={covered ? "" : undefined}>
      <p className="pv-meta mb-3 px-3">{label}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} aria-current={active === item.id ? "true" : undefined}>
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      {children}
    </nav>
  );
}
