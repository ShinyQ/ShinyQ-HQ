"use client";

import { useEffect, useState, type ReactNode } from "react";

/** "On this page" links with scroll-spy; without IntersectionObserver they stay plain anchors. */
export function CaseToc({ items, label, children }: { items: readonly { id: string; label: string }[]; label: string; children?: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
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

  return (
    <nav aria-label={label} className="pv-toc">
      <p className="pv-data mb-3">{label}</p>
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
