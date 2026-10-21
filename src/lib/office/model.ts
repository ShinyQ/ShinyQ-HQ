import { OFFICE_DESKS, type OfficeDesk, type OfficeState } from "./protocol";

/**
 * Shared Agent Office model (pure: no React, no three), used by the 3D office on L1 and the Classic home card,
 * so both count, title and color a desk the same way.
 */
export interface OfficeCounts {
  active: number;
  thinking: number;
  waiting: number;
  asleep: number;
}

const GROUP: Record<OfficeState, keyof OfficeCounts> = {
  working: "active",
  reviewing: "active",
  testing: "active",
  done: "active",
  failed: "active",
  thinking: "thinking",
  ci: "waiting",
  input: "waiting",
  asleep: "asleep",
};

/** Desks per group; slots without a session (up to `slots`) count as asleep. */
export function officeCounts(desks: readonly OfficeDesk[], slots: number = OFFICE_DESKS): OfficeCounts {
  const counts: OfficeCounts = { active: 0, thinking: 0, waiting: 0, asleep: 0 };
  for (const desk of desks) counts[GROUP[desk.state]] += 1;
  counts.asleep += Math.max(0, slots - desks.length);
  return counts;
}

/**
 * A snapshot read with `seats` desks (slots 0 to `seats - 1`): desks on later seats count in `extra`, the way snapshots
 * v1 and v2 fold the back row, so they neither vanish nor break a five-desk view. The same object when nothing folds.
 */
export function withSeats<T extends { desks: readonly OfficeDesk[]; extra: number }>(snap: T, seats: number = OFFICE_DESKS): T {
  const back = snap.desks.reduce((n, d) => n + (d.slot >= seats ? 1 : 0), 0);
  return back === 0 ? snap : { ...snap, desks: snap.desks.filter((d) => d.slot < seats), extra: snap.extra + back };
}

/** The task title when the snapshot carries one (allowlisted public repositories only), else null: the UI shows "Client project". */
export function deskTitle(desk: OfficeDesk): string | null {
  return desk.title ? desk.title : null;
}

/** State colors (owner design D5): palette tokens where one matches (cyan, amber, violet, pink, green, blue), else the mock's teal, red and grey. */
export const STATE_TONE: Record<OfficeState, string> = {
  working: "#22d3ee",
  thinking: "#fbbf24",
  reviewing: "#2dd4bf",
  testing: "#60a5fa",
  ci: "#a78bfa",
  input: "#f472b6",
  done: "#34d399",
  failed: "#f87171",
  asleep: "#7c84a8",
};

const UNITS = {
  en: { now: "just now", min: "min", h: "h", d: "d", tag: "en-US" },
  id: { now: "baru saja", min: "mnt", h: "j", d: "hr", tag: "id-ID" },
} as const;

/** Short time since `ms` (epoch ms): "just now", "3 min", "2 h", "3 d" / "baru saja", "3 mnt", "2 j", "3 hr". */
export function sinceLabel(ms: number, locale: "en" | "id", now: number): string {
  const u = UNITS[locale];
  const minutes = Math.floor(Math.max(0, now - ms) / 60_000);
  if (minutes < 1) return u.now;
  const n = new Intl.NumberFormat(u.tag);
  if (minutes < 60) return `${n.format(minutes)} ${u.min}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${n.format(hours)} ${u.h}`;
  return `${n.format(Math.floor(hours / 24))} ${u.d}`;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** The repository page for an allowlisted public repository ("owner/name"), checked again on the client. */
export function safeRepoUrl(repo: string | null): string | null {
  if (!repo || !REPO.test(repo) || repo.split("/").some((part) => /^\.+$/.test(part))) return null;
  return `https://github.com/${repo}`;
}

/** A GitHub feed link, only when it is an https URL on github.com. */
export function safeGithubUrl(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "github.com" ? u.href : null;
  } catch {
    return null;
  }
}
