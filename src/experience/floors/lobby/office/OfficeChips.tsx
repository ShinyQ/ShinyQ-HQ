"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo } from "react";
import { goToRoom } from "@/experience/missions/bridge";
import { useHQStore } from "@/store/useHQStore";
import { officeDeskRoom } from "../officeLayout";
import { useOfficeFeed } from "./live";
import { chipLines, officeView, type OfficeRoverView } from "./officeModel";
import { OFFICE_STATE_STYLE } from "./officeVisual";
import { officeRuntime, useChipFar } from "./runtime";

/**
 * One chip over a Rover (the mock's `.tag`, in HUD tokens): a state dot (never an edge stripe) with
 * "<Agent> · <activity>", then the title or "Client project" and a CI progress bar, both dropped when far.
 * On phones every chip stays far and compact (`OfficeWatch`): the state dot alone in a 32 px pill (its label keeps the
 * agent and activity), so the five chips neither overlap nor run off the screen edges or under the minimap; the
 * desk's drawer shows the task. OfficeScene moves it every frame (HintProbe pattern) through `officeRuntime.chips`. A click opens the
 * Rover's drawer the way its point-and-go target does (drive to the office stop, then open).
 */
function Chip({ rover }: { rover: OfficeRoverView }) {
  const t = useTranslations("office");
  const far = useChipFar(rover.slot);
  const compact = useHQStore((s) => far && s.device.viewport === "mobile");
  const taskId = useId();
  const line = chipLines(rover, t);
  const color = OFFICE_STATE_STYLE[rover.state].color;
  return (
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
      aria-label={t("3d.target.desk", { n: rover.slot + 1, agent: line.head })}
      aria-describedby={!far && line.task ? taskId : undefined}
      // Hidden until OfficeScene has placed it (it then writes the transform, visibility and opacity every frame).
      style={{ opacity: 0, visibility: "hidden" }}
      className="pointer-events-auto absolute top-0 left-0 flex flex-col items-center gap-1 will-change-transform"
    >
      {compact ? (
        <span className="glass glass-solid inline-flex min-h-8 items-center rounded-full" style={{ minWidth: 32, justifyContent: "center" }}>
          <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />
        </span>
      ) : (
        <span className="glass glass-solid inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-ink">
          <span aria-hidden="true" className="hq-dot hq-dot-md" style={{ color }} />
          {line.head}
        </span>
      )}
      {!far && line.task && (
        <span id={taskId} className="text-[13px] leading-5 text-ink-2" style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {line.task}
        </span>
      )}
      {!far && line.progress !== null && (
        <span aria-hidden="true" data-progress={Math.round(line.progress * 100)} style={{ display: "block", width: 110, height: 4, borderRadius: 2, background: "rgb(255 255 255 / 0.08)", overflow: "hidden" }}>
          <span style={{ display: "block", height: "100%", width: `${Math.round(line.progress * 100)}%`, background: color }} />
        </span>
      )}
    </button>
  );
}

/** The five chips; hidden on phones while a drawer (a bottom sheet) is open. Mounted by the HUD's OfficeLayer. */
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
