"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { BootCard } from "@/components/BootCard";
import { bootCoverUsed } from "@/lib/boot-first";
import { useHQStore } from "@/store/useHQStore";

const LINE_MS = 180;

/**
 * First-visit boot overlay: up to 6 terminal lines, a Boot rover button and a skip (appendix 02 section 2).
 * Same card as the SSR boot cover (BootCard). When the cover was shown, its log already played, so
 * the overlay starts with every line visible and the handoff does not restart the animation.
 */
export function BootOverlay({ name, monogram }: { name: string; monogram: string }) {
  const t = useTranslations("hud");
  const reduced = useHQStore((s) => s.reducedMotion);
  const setPhase = useHQStore((s) => s.setPhase);
  const finishIntro = useHQStore((s) => s.finishIntro);
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  const [typed, setTyped] = useState(() => (bootCoverUsed() ? lines.length : 0));
  const shown = reduced ? lines.length : typed;
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    start.current?.focus();
  }, []);

  useEffect(() => {
    if (shown >= lines.length) return;
    const id = window.setTimeout(() => setTyped((n) => n + 1), LINE_MS);
    return () => window.clearTimeout(id);
  }, [shown, lines.length]);

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
        shown={shown}
        startLabel={t("bootStart")}
        skipLabel={t("skipIntro")}
        startRef={start}
        onStart={() => setPhase("intro")}
        onSkip={finishIntro}
      />
    </div>
  );
}
