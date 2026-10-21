"use client";

import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState, type Ref } from "react";
import { goToRoom } from "@/experience/missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { CHIP_ROW } from "../officeShell";
import { DRONES } from "./crew";
import { useOfficeFeed } from "./live";
import { chipLines, nearDropsFor, nearParts, officeView, type OfficeRoverView } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";
import { OFFICE_CHIP_COUNT, officeRuntime, useChipFar, useChipsCompact } from "./runtime";

/**
 * One chip in the row pinned under the HUD's top bar (the mock's `.tag`, in HUD tokens), over its Rover: a state dot
 * (never an edge stripe) with the agent's name (and, while it has helpers, a small drone ring with their total, "3"),
 * "<Agent> · <activity> · 3 helpers" when near, with a "+2" pill past the four drones drawn (6 helpers) (at most
 * `CHIP_ROW.max` px wide, or the row's fit `chipMaxWidth` that `OfficeWatch` writes; when space runs out the activity
 * ends in an ellipsis ("Copilot · Asking Kur…"), never dropped, and the agent's name, the helpers count and the "+2" pill
 * always stay whole; a head that still does not fit drops the word "helpers" ("Claude · Watc… · 6"), `nearParts`; one
 * line where five such chips would not fit the row), and a CI progress bar when near. Its label keeps the full text (`chipLines`: agent, activity, helpers,
 * the title or "Client project", CI progress) at any distance.
 * On phones every chip stays far and compact (`OfficeWatch`): the state dot alone in a 32 px pill. Outside the office view
 * (`officeChipMode`: reduced motion, a hand turn at the stop) every screen shows them that way. OfficeScene moves it every
 * frame (HintProbe pattern) through `officeRuntime.chips`, with its leader line (`officeRuntime.leads`: 1 px in the
 * state's colour from the chip toward its Rover's head, ending at the screen wall's top with a 10 px tick,
 * `officeRuntime.ticks`, or faded to 15% where the chip itself sits over the screens; no transition, so reduced motion
 * changes nothing). A click opens
 * the Rover's drawer the way its point-and-go target does (drive to the office stop, then open).
 */
function Chip({ rover }: { rover: OfficeRoverView }) {
  const t = useTranslations("office");
  const far = useChipFar(rover.slot);
  const plain = useChipsCompact();
  const compact = useHQStore((s) => far && (plain || s.device.viewport === "mobile"));
  const line = chipLines(rover, t);
  const more = rover.helpers > DRONES.max ? rover.helpers - DRONES.max : 0;
  const color = OFFICE_STATE_STYLE[rover.state].color;
  // A near head that overflows even with its activity cut down to its least width drops the word "helpers", measured again
  // before paint; new text or a far turn starts whole again. A head with nothing left to drop is not measured again.
  const last = nearDropsFor(line);
  const key = `${far}|${line.head}|${more}`;
  const [fit, setFit] = useState({ key, drop: 0 });
  const drop = fit.key === key ? fit.drop : 0;
  const head = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = head.current;
    if (!far && el && drop < last && el.scrollWidth > el.clientWidth) setFit({ key, drop: drop + 1 });
  }, [far, key, drop, last]);
  return (
    <>
      <span
        ref={(el) => {
          officeRuntime.leads[rover.slot] = el;
        }}
        aria-hidden="true"
        data-testid="office-chip-lead"
        data-slot={rover.slot}
        className="pointer-events-none absolute top-0 left-0"
        // Hidden until OfficeScene draws it (it then writes the transform, the height, the opacity and the visibility).
        style={{ width: 1, height: 0, background: color, opacity: 0.6, transformOrigin: "0 0", visibility: "hidden" }}
      />
      <span
        ref={(el) => {
          officeRuntime.ticks[rover.slot] = el;
        }}
        aria-hidden="true"
        data-testid="office-chip-tick"
        data-slot={rover.slot}
        className="pointer-events-none absolute top-0 left-0"
        style={{ width: 10, height: 2, background: color, opacity: 0.6, visibility: "hidden" }}
      />
      <button
        ref={(el) => {
          officeRuntime.chips[rover.slot] = el;
        }}
        type="button"
        onClick={() => goToRoom(officeDeskRoom(rover.slot))}
        data-testid="office-chip"
        data-slot={rover.slot}
        data-state={rover.state}
        data-far={far ? "true" : "false"}
        data-compact={compact ? "true" : "false"}
        aria-label={line.label}
        // Hidden until OfficeScene has placed it (it then writes the transform, visibility and opacity every frame).
        style={{ opacity: 0, visibility: "hidden", maxWidth: CHIP_ROW.max }}
        className="pointer-events-auto absolute top-0 left-0 flex flex-col items-center gap-1 will-change-transform"
      >
        {compact ? (
          <span className="glass glass-solid inline-flex min-h-8 items-center rounded-full" style={{ minWidth: 32, justifyContent: "center" }}>
            <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />
          </span>
        ) : (
          <span className="glass glass-solid inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink" style={{ maxWidth: "100%" }}>
            <span aria-hidden="true" className="hq-dot hq-dot-md shrink-0" style={{ color }} />
            {far ? (
              <span className="min-w-0 truncate">{line.name}</span>
            ) : (
              <NearHead parts={nearParts(line, rover.helpers, drop)} drop={drop} ref={head} />
            )}
            {line.helpers && far && (
              <span aria-hidden="true" data-testid="office-chip-helpers" className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-2">
                <span className="hq-dot hq-dot-md" style={{ background: "transparent", border: "1.5px solid currentColor" }} />
                {rover.helpers}
              </span>
            )}
            {/* Tight padding and gap (2 px under the chip's), so "Claude · 6 helpers" and its pill fit a 176 px chip. */}
            {more > 0 && !far && (
              <span aria-hidden="true" data-testid="office-chip-more" className="shrink-0 rounded-full border border-glass-border text-xs text-ink-2" style={{ marginLeft: -2, paddingInline: 3 }}>
                {`+${more}`}
              </span>
            )}
          </span>
        )}
        {!far && line.progress !== null && (
          <span aria-hidden="true" data-progress={Math.round(line.progress * 100)} style={{ display: "block", alignSelf: "stretch", margin: "0 10px", height: 4, borderRadius: 2, background: "rgb(255 255 255 / 0.08)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", width: `${Math.round(line.progress * 100)}%`, background: color }} />
          </span>
        )}
      </button>
    </>
  );
}

/**
 * A near chip's head: the name and the helpers never shrink; the activity between them shrinks first and ends in an
 * ellipsis (at least `3.5em` of it beside the helpers, so a few letters always show). `white-space: pre` keeps the " · "
 * separators' spaces at the parts' edges.
 */
function NearHead({ parts, drop, ref }: { parts: ReturnType<typeof nearParts>; drop: number; ref: Ref<HTMLSpanElement> }) {
  return (
    <span ref={ref} data-testid="office-chip-head" data-drop={drop} className="flex min-w-0 overflow-hidden whitespace-pre">
      <span data-testid="office-chip-name" className="shrink-0">
        {parts.name}
      </span>
      {parts.activity && (
        <span data-testid="office-chip-activity" className="min-w-0 overflow-hidden text-ellipsis" style={{ minWidth: parts.helpers ? "3.5em" : 0 }}>
          {` · ${parts.activity}`}
        </span>
      )}
      {parts.helpers && <span className="shrink-0">{` · ${parts.helpers}`}</span>}
    </span>
  );
}

/**
 * The front row's five chips (`OFFICE_CHIP_COUNT`) and their leader lines; hidden on phones while a drawer (a bottom
 * sheet) is open. Mounted by the HUD's OfficeLayer.
 */
export function OfficeChips() {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  const hidden = useHQStore((s) => s.phase === "room" && s.device.viewport === "mobile");
  if (hidden) return null;
  return (
    <div data-testid="office-chips">
      {view.rovers.slice(0, OFFICE_CHIP_COUNT).map((rover) => (
        <Chip key={rover.slot} rover={rover} />
      ))}
    </div>
  );
}
