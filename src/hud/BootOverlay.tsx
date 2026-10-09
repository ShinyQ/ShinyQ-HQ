"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useHQStore } from "@/store/useHQStore";

const LINE_MS = 180;

/** First-visit boot overlay: up to 6 terminal lines, a Boot rover button and a skip (appendix 02 section 2). */
export function BootOverlay({ name }: { name: string }) {
  const t = useTranslations("hud");
  const reduced = useHQStore((s) => s.reducedMotion);
  const setPhase = useHQStore((s) => s.setPhase);
  const finishIntro = useHQStore((s) => s.finishIntro);
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  const [typed, setTyped] = useState(0);
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
      className="pointer-events-auto absolute inset-0 grid place-items-center bg-void/55 p-4"
      data-testid="boot"
    >
      <div className="w-full max-w-[440px] rounded-xl border border-green/40 bg-terminal-bg/95 p-5 font-mono text-[13px] leading-5 text-terminal-fg shadow-[0_0_48px_-12px_var(--color-green)]">
        <p id="hq-boot-title" className="text-ink">
          {t("bootTitle")}
        </p>
        <ol className="mt-3 min-h-[120px] space-y-0.5">
          {lines.slice(0, shown).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            ref={start}
            type="button"
            onClick={() => setPhase("intro")}
            className="inline-flex min-h-11 items-center rounded-lg bg-green px-5 font-sans font-semibold text-void transition hover:bg-green/85"
          >
            {t("bootStart")}
          </button>
          <button
            type="button"
            onClick={finishIntro}
            className="inline-flex min-h-11 items-center rounded-lg border border-green/40 px-4 font-sans text-terminal-fg transition hover:border-green"
          >
            {t("skipIntro")}
          </button>
        </div>
      </div>
    </div>
  );
}
