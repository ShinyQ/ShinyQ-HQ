"use client";

import { isAskEnabled } from "@/ask/status";
import { loadAskChat } from "@/hud/ask/AskDock";
import { useAskStatus } from "@/hud/ask/availability";
import { openAsk } from "@/hud/events";

const preload = () => void loadAskChat();

/**
 * "Ask Rover about this project" in a case study's closing section: opens the shared Ask dock with a question about
 * the page's project (logged as entry `case`). Like the hero bar it shows until Ask the HQ is known to be off, so it
 * never appears late; it sits last in its row, so hiding it moves nothing.
 */
export function AskAboutButton({ question, label }: { question: string; label: string }) {
  const status = useAskStatus();
  if (status === null || (status !== undefined && !isAskEnabled(status))) return null;
  return (
    <button
      type="button"
      className="pv-btn pv-btn-ghost"
      data-testid="case-ask"
      aria-haspopup="dialog"
      onPointerEnter={preload}
      onFocus={preload}
      onClick={() => openAsk(question, { source: "case" })}
    >
      {label}
    </button>
  );
}
