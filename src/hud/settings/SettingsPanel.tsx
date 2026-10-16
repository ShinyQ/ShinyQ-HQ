"use client";

import { useTranslations } from "next-intl";
import { useId, useSyncExternalStore } from "react";
import { AccentDot } from "@/components/AccentDot";
import { SETTINGS } from "./defs";
import { settingsByGroup, type SettingControl, type SettingDef } from "./registry";

type RowProps<K extends SettingControl["kind"]> = { def: SettingDef; control: Extract<SettingControl, { kind: K }> };

function Hint({ id, hintKey }: { id: string; hintKey?: string }) {
  const t = useTranslations("hud.settings");
  if (!hintKey) return null;
  return (
    <p id={id} className="mt-1 px-3 text-xs leading-4 text-ink-3">
      {t(hintKey)}
    </p>
  );
}

function ToggleRow({ def, control }: RowProps<"toggle">) {
  const t = useTranslations("hud.settings");
  const on = useSyncExternalStore(def.subscribe, control.get, control.get);
  const hint = useId();
  return (
    <div data-testid={`setting-${def.id}`}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={def.hintKey ? hint : undefined}
        onClick={() => control.set(!on)}
        className="hq-glow flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left text-sm text-ink"
      >
        {t(def.labelKey)}
        <span
          aria-hidden="true"
          className={`inline-flex h-6 w-10 shrink-0 items-center rounded-full border px-0.5 transition ${on ? "justify-end border-cyan/60 bg-cyan/20" : "justify-start border-glass-border"}`}
        >
          <AccentDot tone={on ? "cyan" : "line"} glow={on} size="md" />
        </span>
      </button>
      <Hint id={hint} hintKey={def.hintKey} />
    </div>
  );
}

function ChoiceRow({ def, control }: RowProps<"choice">) {
  const t = useTranslations("hud.settings");
  const value = useSyncExternalStore(def.subscribe, control.get, control.get);
  const name = useId();
  const hint = useId();
  return (
    <fieldset className="min-w-0 px-3" data-testid={`setting-${def.id}`} aria-describedby={def.hintKey ? hint : undefined}>
      <legend className="label mb-1.5 text-ink-3">{t(def.labelKey)}</legend>
      <div className="grid gap-0.5 rounded-full border border-glass-border p-0.5" style={{ gridTemplateColumns: `repeat(${control.options.length}, minmax(0, 1fr))` }}>
        {control.options.map((option) => (
          <label
            key={option.value}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full px-1.5 text-[13px] text-ink-2 transition hover:text-ink has-[:checked]:bg-cyan/15 has-[:checked]:text-cyan has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cyan"
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => control.set(option.value)} className="sr-only" />
            <span lang={def.id === "language" ? option.value : undefined}>{t(option.labelKey)}</span>
          </label>
        ))}
      </div>
      {def.hintKey && (
        <p id={hint} className="mt-1.5 text-xs leading-4 text-ink-3">
          {t(def.hintKey)}
        </p>
      )}
    </fieldset>
  );
}

function RangeRow({ def, control }: RowProps<"range">) {
  const t = useTranslations("hud.settings");
  const value = useSyncExternalStore(def.subscribe, control.get, control.get);
  const id = useId();
  const hint = useId();
  return (
    <div data-testid={`setting-${def.id}`}>
      <div className="flex min-h-11 items-center gap-3 px-3">
        <label htmlFor={id} className="shrink-0 text-sm text-ink">
          {t(def.labelKey)}
        </label>
        <input
          id={id}
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          aria-valuetext={t("percent", { value })}
          aria-describedby={def.hintKey ? hint : undefined}
          onChange={(event) => control.set(Number(event.target.value))}
          className="min-h-11 min-w-0 flex-1 accent-[var(--color-cyan)]"
        />
        <span aria-hidden="true" className="w-10 shrink-0 text-right text-xs text-ink-3 tabular-nums">
          {value}%
        </span>
      </div>
      <Hint id={hint} hintKey={def.hintKey} />
    </div>
  );
}

function Row({ def }: { def: SettingDef }) {
  const { control } = def;
  switch (control.kind) {
    case "toggle":
      return <ToggleRow def={def} control={control} />;
    case "choice":
      return <ChoiceRow def={def} control={control} />;
    case "range":
      return <RangeRow def={def} control={control} />;
  }
}

/** Renders every registered setting generically, grouped and ordered by the registry. Mounted by the menu sheet and the desktop settings sheet. */
export function SettingsPanel({ defs = SETTINGS, headingLevel = 3 }: { defs?: readonly SettingDef[]; headingLevel?: 2 | 3 }) {
  const t = useTranslations("hud.settings");
  const prefix = useId();
  const Heading = `h${headingLevel}` as "h2" | "h3";
  return (
    <div data-testid="settings-panel" className="flex flex-col gap-5">
      {settingsByGroup(defs).map(({ group, items }) => {
        const headingId = `${prefix}-${group}`;
        return (
          <section key={group} aria-labelledby={headingId} className="flex flex-col gap-2">
            <Heading id={headingId} className="label px-3 text-ink-3">
              {t(`groups.${group}`)}
            </Heading>
            {items.map((def) => (
              <Row key={def.id} def={def} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
