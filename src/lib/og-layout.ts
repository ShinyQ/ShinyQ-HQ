/**
 * Pure layout rules for the build-time OG cards (no next/og, no sharp), shared by the renderer
 * (src/lib/og.tsx), the card list (src/lib/og-cards.ts), scripts/og-stills.ts and the tests.
 */
import type { Accent, Locale } from "@/content/schema";

/**
 * Committed backgrounds in public/og-assets: one still of each floor of the 3D HQ, captured by
 * `bun run og:stills` (needs WebGL once, never at build).
 */
export const OG_STILLS = ["L1", "L2", "L3", "L4", "RF"] as const;
export type OgStill = (typeof OG_STILLS)[number];

/** The owner's photo for the cards (owner decision 2026-10-13), 400x400 PNG. */
export const OG_PHOTO_PATH = "/og-assets/kurniadi-photo.png";

export function ogStillPath(still: OgStill): string {
  return `/og-assets/floor-${still}.jpg`;
}

export type OgLayout = "home" | "page" | "project" | "post";

export interface OgCard {
  layout: OgLayout;
  /** Mono uppercase label after the glowing accent dot, e.g. "L3 · AI Engineering". */
  eyebrow: string;
  /** Home: the owner's name; page: the page name; project: the pod title; post: the post title. */
  title: string;
  /** Home: the content headline; page: one summary line; project: the tagline (shown when there is no screenshot). */
  subtitle?: string;
  /** Home only: the owner's motto (`profile.subheadline`). */
  motto?: string;
  accent: Accent;
  still: OgStill;
  /** Project cover under public/media (`pod.assets[0].src`), drawn in the glowing frame. */
  shot?: string;
  /** Project key result: the big number and its label. */
  result?: { value: string; label: string };
  name: string;
  headline: string;
  /** Home only: the call-to-action chip. */
  cta?: string;
}

export const OG_FONT = {
  eyebrow: 22,
  homeName: 64,
  homeHeadline: 34,
  motto: 30,
  pageTitle: 80,
  pageSubtitle: 30,
  tagline: 26,
  resultLabel: 24,
  bylineName: 28,
  bylineHeadline: 21,
  host: 21,
} as const;

export const OG_PORTRAIT = { home: 184, byline: 56 } as const;

/** The project screenshot frame (16:10), right of the text column. */
export const OG_SHOT = { left: 676, top: 124, width: 468, height: 292 } as const;

/** Characters of the mono uppercase eyebrow that fit on one line beside the screenshot frame, or across the card. */
export const OG_EYEBROW_MAX = { shot: 36, wide: 60 } as const;

/** Primary text (name, titles, the key result) stays at least 13 px tall when the card is shown 300 px wide. */
export const LEGIBLE_PRIMARY_MIN = 52;
/** Secondary text stays at least 5 px tall at 300 px wide and fully readable at the usual 500 to 600 px. */
export const LEGIBLE_SECONDARY_MIN = 21;

export function titleSize(layout: OgLayout, title: string): number {
  if (layout === "home") return OG_FONT.homeName;
  if (layout === "page") return OG_FONT.pageTitle;
  if (layout === "post") return title.length <= 40 ? 76 : title.length <= 70 ? 64 : 56;
  return title.length <= 28 ? 60 : 52;
}

export function resultSize(value: string): number {
  if (value.length <= 6) return 112;
  if (value.length <= 10) return 88;
  if (value.length <= 15) return 64;
  return 52;
}

/** Characters the bundled fontsource "latin" subsets of Inter and JetBrains Mono can draw. */
export const OG_GLYPHS = /^[\u0020-\u00FF\u0131\u0152\u0153\u02BB\u02BC\u02C6\u02DA\u02DC\u2000-\u206F\u20AC\u2122\u2191\u2193\u2212\u2215]*$/;

/** Replaces glyphs outside the font subsets, e.g. "2 → 1" becomes "2 to 1" ("2 ke 1"). */
export function ogText(text: string, locale: Locale): string {
  return text.replace(/\s*→\s*/g, locale === "id" ? " ke " : " to ");
}

/** Shortens text on a word boundary so satori never overflows the card. */
export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

export type { Accent };
