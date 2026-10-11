"use client";

import { useTranslations } from "next-intl";
import { isAskEnabled } from "@/ask/client";
import { openAsk } from "@/hud/events";
import { useAskStatus } from "./availability";
import { loadAskChat } from "./AskDock";
import { SparkIcon } from "./icons";

/** "Ask AI" pill in the 3D HUD's top-right cluster (bottom-left is the joystick, bottom-right the view controls). */
export function AskPill({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("ask.dock");
  const status = useAskStatus();
  if (!isAskEnabled(status)) return null;
  return (
    <button
      type="button"
      onClick={() => openAsk(undefined, { source: "dock" })}
      onPointerEnter={() => void loadAskChat()}
      aria-haspopup="dialog"
      aria-label={compact ? t("launcherLabel") : undefined}
      data-testid="ask-pill"
      className="glass glass-solid inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full border-cyan/40 px-3 text-sm font-semibold text-ink shadow-[0_8px_22px_-10px_rgb(34_211_238/0.6)] transition hover:border-cyan/70 hover:text-cyan sm:px-4"
    >
      <span className="text-cyan">
        <SparkIcon />
      </span>
      <span className={compact ? "sr-only" : undefined}>{t("launcher")}</span>
    </button>
  );
}
