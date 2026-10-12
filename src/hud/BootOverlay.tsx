"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { BootCard } from "@/components/BootCard";
import { bootCoverUsed } from "@/lib/boot-first";
import { useHQStore } from "@/store/useHQStore";

const LINE_MS = 180;

/**
 * Boot overlay, once per browser session: up to 6 terminal lines and a Boot rover button (appendix
 * 02 section 2). Nothing skips it (owner decision): Boot rover starts the intro only once the log
 * has typed out, at the same pace with reduced motion (revealing lines is not motion). Same card as
 * the SSR boot cover (BootCard); when the cover was shown, its log already played, so the overlay
 * starts with every line visible and the handoff does not restart the animation.
 */
export function BootOverlay({ name, monogram }: { name: string; monogram: string }) {
  const t = useTranslations("hud");
  const setPhase = useHQStore((s) => s.setPhase);
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  const [typed, setTyped] = useState(() => (bootCoverUsed() ? lines.length : 0));
  const ready = typed >= lines.length;
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    start.current?.focus();
  }, []);

  useEffect(() => {
    if (ready) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), LINE_MS);
    return () => window.clearTimeout(id);
  }, [typed, ready]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hq-boot-title"
      className="hq-boot-backdrop pointer-events-auto absolute inset-0 grid place-items-center p-4"
      data-testid="boot"
    >
      <BootCard
        eyebrow={t("bootEyebrow")}
        monogram={monogram}
        title={t("bootTitle")}
        titleId="hq-boot-title"
        lines={lines}
        shown={typed}
        startLabel={t("bootStart")}
        startDisabled={!ready}
        startRef={start}
        onStart={() => {
          if (ready) setPhase("intro");
        }}
      />
    </div>
  );
}
