"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { goToRoom } from "@/experience/missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { CHIP_ROW } from "../officeShell";
import { useOfficeFeed } from "./live";
import { chipLines, officeView, type OfficeRoverView } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";
import { officeRuntime, useChipFar, useChipsCompact } from "./runtime";

/**
 * One chip in the row pinned under the HUD's top bar (the mock's `.tag`, in HUD tokens), over its Rover: a state dot
 * (never an edge stripe) with the agent's name, "<Agent> · <activity>" when near (at most `CHIP_ROW.max` px wide, or the row's
 * fit `chipMaxWidth` that `OfficeWatch` writes, a longer line ends in an ellipsis; one line where five such chips would not fit the row), and a CI progress bar when near. Its label keeps the
 * full text (`chipLines`: agent, activity, the title or "Client project", CI progress) at any distance.
 * On phones every chip stays far and compact (`OfficeWatch`): the state dot alone in a 32 px pill. Outside the office view
 * (`officeChipMode`: reduced motion, a hand turn at the stop) every screen shows them that way. OfficeScene moves it every
 * frame (HintProbe pattern) through `officeRuntime.chips`, with its leader line (`officeRuntime.leads`: 1 px in the
 * state's colour from the chip down to its Rover's head; no transition, so reduced motion changes nothing). A click opens
 * the Rover's drawer the way its point-and-go target does (drive to the office stop, then open).
 */
function Chip({ rover }: { rover: OfficeRoverView }) {
  const t = useTranslations("office");
  const far = useChipFar(rover.slot);
  const plain = useChipsCompact();
  const compact = useHQStore((s) => far && (plain || s.device.viewport === "mobile"));
  const line = chipLines(rover, t);
  const color = OFFICE_STATE_STYLE[rover.state].color;
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
        // Hidden until OfficeScene draws it (it then writes the transform, the height and the visibility).
        style={{ width: 1, height: 0, background: color, opacity: 0.6, transformOrigin: "0 0", visibility: "hidden" }}
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
            <span className="min-w-0 truncate">{far ? line.name : line.head}</span>
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

/** The five chips and their leader lines; hidden on phones while a drawer (a bottom sheet) is open. Mounted by the HUD's OfficeLayer. */
export function OfficeChips() {
  const feed = useOfficeFeed();
  const view = useMemo(() => officeView(feed), [feed]);
  const hidden = useHQStore((s) => s.phase === "room" && s.device.viewport === "mobile");
  if (hidden) return null;
  return (
    <div data-testid="office-chips">
      {view.rovers.map((rover) => (
        <Chip key={rover.slot} rover={rover} />
      ))}
    </div>
  );
}
