"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useReducer, useRef, useSyncExternalStore } from "react";
import { AccentDot } from "@/components/AccentDot";
import { Kbd } from "../Kbd";
import { MenuControls } from "../menu/MenuControls";
import { SETTINGS } from "./defs";
import { settingsByGroup, type SettingControl, type SettingDef } from "./registry";

type RowProps<K extends SettingControl["kind"]> = { def: SettingDef; control: Extract<SettingControl, { kind: K }> };

/** One row of a group card: the label and its one-line note on the left, the control on the right. */
const ROW = "flex min-h-14 items-center gap-4 px-4 py-2.5 transition-colors hover:bg-surface-2";

/** Label and note; the label names the control (`htmlFor`), so a tap on the text works the control too. */
function RowText({ def, labelId, hintId, htmlFor }: { def: SettingDef; labelId: string; hintId: string; htmlFor: string }) {
  const t = useTranslations("hud.settings");
  return (
    <div className="min-w-0 flex-1">
      <label id={labelId} htmlFor={htmlFor} className="block cursor-pointer text-sm leading-5 text-ink">
        {t(def.labelKey)}
      </label>
      {def.hintKey && (
        <p id={hintId} className="mt-0.5 text-xs leading-4 text-ink-3">
          {t(def.hintKey)}
          {def.hintKbd && <Kbd className="ml-1.5">{def.hintKbd}</Kbd>}
        </p>
      )}
    </div>
  );
}

function ToggleRow({ def, control }: RowProps<"toggle">) {
  const on = useSyncExternalStore(def.subscribe, control.get, control.get);
  const id = useId();
  return (
    <div className={ROW} data-testid={`setting-${def.id}`}>
      <RowText def={def} labelId={`${id}-label`} hintId={`${id}-hint`} htmlFor={id} />
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${id}-label`}
        aria-describedby={def.hintKey ? `${id}-hint` : undefined}
        onClick={() => control.set(!on)}
        className="-mr-1 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full"
      >
        <span
          aria-hidden="true"
          className={`inline-flex h-6 w-10 items-center rounded-full border px-0.5 transition ${on ? "justify-end border-cyan/60 bg-cyan/20" : "justify-start border-line-2 bg-void/40"}`}
        >
          <AccentDot tone={on ? "cyan" : "line"} glow={on} size="md" />
        </span>
      </button>
    </div>
  );
}

function ChoiceRow({ def, control }: RowProps<"choice">) {
  const t = useTranslations("hud.settings");
  const value = useSyncExternalStore(def.subscribe, control.get, control.get);
  const name = useId();
  const hint = useId();
  const row = useRef<HTMLFieldSetElement>(null);
  // A passive effect, so it runs after the sheet's own initial focus (the Modal's layout effect).
  useEffect(() => {
    if (def.takeFocus?.()) row.current?.querySelector<HTMLInputElement>("input:checked")?.focus({ preventScroll: true });
  }, [def]);
  return (
    <fieldset ref={row} className="min-w-0 px-4 py-3" data-testid={`setting-${def.id}`} aria-describedby={def.hintKey ? hint : undefined}>
      <legend className="float-left w-full text-sm leading-5 text-ink">{t(def.labelKey)}</legend>
      {def.hintKey && (
        <p id={hint} className="clear-left pt-0.5 text-xs leading-4 text-ink-3">
          {t(def.hintKey)}
          {def.hintKbd && <Kbd className="ml-1.5">{def.hintKbd}</Kbd>}
        </p>
      )}
      <div
        className="clear-left mt-2.5 grid gap-0.5 rounded-full border border-line-2 bg-void/40 p-0.5"
        style={{ gridTemplateColumns: `repeat(${control.options.length}, minmax(0, 1fr))` }}
      >
        {control.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] text-ink-2 transition hover:text-ink has-[:checked]:bg-cyan/15 has-[:checked]:text-cyan has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => control.set(option.value)} className="sr-only" />
            <span lang={def.id === "language" ? option.value : undefined}>{t(option.labelKey)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function RangeRow({ def, control }: RowProps<"range">) {
  const t = useTranslations("hud.settings");
  const value = useSyncExternalStore(def.subscribe, control.get, control.get);
  const id = useId();
  return (
    <div className="px-4 py-3" data-testid={`setting-${def.id}`}>
      <div className="flex items-baseline justify-between gap-3">
        <RowText def={def} labelId={`${id}-label`} hintId={`${id}-hint`} htmlFor={id} />
        <span aria-hidden="true" className="shrink-0 text-xs text-ink-2 tabular-nums">
          {value}%
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        aria-valuetext={t("percent", { value })}
        aria-describedby={def.hintKey ? `${id}-hint` : undefined}
        onChange={(event) => control.set(Number(event.target.value))}
        className="block min-h-11 w-full accent-[var(--color-cyan)]"
      />
    </div>
  );
}

function ReplayIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
    </svg>
  );
}

function ActionRow({ def, control, onClose }: RowProps<"action"> & { onClose?: () => void }) {
  const id = useId();
  return (
    <div className={ROW} data-testid={`setting-${def.id}`}>
      <RowText def={def} labelId={`${id}-label`} hintId={`${id}-hint`} htmlFor={id} />
      <button
        id={id}
        type="button"
        aria-labelledby={`${id}-label`}
        aria-describedby={def.hintKey ? `${id}-hint` : undefined}
        onClick={() => {
          if (control.closesPanel) onClose?.();
          control.run();
        }}
        className="hq-glow -mr-1 grid size-11 shrink-0 place-items-center rounded-full border border-line-2 bg-void/40 text-cyan hover:bg-cyan/10"
      >
        <ReplayIcon />
      </button>
    </div>
  );
}

function Row({ def, onClose }: { def: SettingDef; onClose?: () => void }) {
  const { control } = def;
  switch (control.kind) {
    case "toggle":
      return <ToggleRow def={def} control={control} />;
    case "choice":
      return <ChoiceRow def={def} control={control} />;
    case "range":
      return <RangeRow def={def} control={control} />;
    case "action":
      return <ActionRow def={def} control={control} onClose={onClose} />;
  }
}

/** Renders every registered setting generically, grouped and ordered by the registry. Mounted by the menu sheet and the desktop settings sheet. */
/** `controls`: the Corners menu's Controls action is expanded, so the controls card leads the panel. */
export function SettingsPanel({
  defs = SETTINGS,
  headingLevel = 3,
  onClose,
  controls,
}: {
  defs?: readonly SettingDef[];
  headingLevel?: 2 | 3;
  onClose?: () => void;
  controls?: boolean;
}) {
  const t = useTranslations("hud.settings");
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  // Rows with `available` can appear or vanish while the sheet is open (the 3D HUD mounts late).
  useEffect(() => {
    const stops = defs.filter((d) => d.available).map((d) => d.subscribe(refresh));
    return () => stops.forEach((stop) => stop());
  }, [defs]);
  const prefix = useId();
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <div data-testid="settings-panel" className="flex flex-col gap-6 px-3">
      {controls && <MenuControls />}
      {settingsByGroup(defs).map(({ group, items }) => {
        const headingId = `${prefix}-${group}`;
        return (
          <section key={group} aria-labelledby={headingId}>
            <Heading id={headingId} className="label mb-2 px-1 text-ink-3">
              {t(`groups.${group}`)}
            </Heading>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {items.map((def) => (
                <Row key={def.id} def={def} onClose={onClose} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
