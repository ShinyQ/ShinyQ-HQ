/* eslint-disable @next/next/no-img-element -- satori draws plain <img> elements; next/image does not apply here */
/**
 * Build-time "neon cinematic" Open Graph images (owner request 2026-10-13: "the image needs to be
 * more wow"). Rendered by `next/og` (satori) in src/app/og/[...path], which encodes them to JPEG
 * (src/lib/og-encode.ts). Layers: a still of the real 3D HQ tower (public/og-assets), a dark scrim
 * behind the text, an accent tint, a subtle full-outline frame glow (no edge stripes, owner decision
 * 2026-10-13), the owner's photo in a neon ring, and per layout the name and motto, a page title, a
 * project screenshot in a glowing frame with its key result, or a post title.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { Accent } from "@/content/schema";
import { loadPhoto, loadShot, loadStill } from "@/lib/og-assets";
import { OG_EYEBROW_MAX, OG_FONT, OG_PORTRAIT, OG_SHOT, type OgCard, clampText, resultSize, titleSize } from "@/lib/og-layout";
import { OG_IMAGE_SIZE, SITE_URL } from "@/lib/site";

const W = OG_IMAGE_SIZE.width;
const H = OG_IMAGE_SIZE.height;

/** Appendix 05 tokens (satori cannot read Tailwind classes). */
export const OG_COLORS = {
  void: "#05050c",
  ink: "#f4f4f5",
  ink2: "#c7c7d1",
  ink3: "#9a9aa6",
  cyan: "#22d3ee",
  violet: "#a78bfa",
} as const;

export const ACCENT_HEX: Record<Accent, string> = {
  violet: "#a78bfa",
  pink: "#f472b6",
  green: "#34d399",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  blue: "#60a5fa",
  white: "#e5e7eb",
};

/** "#rrggbb" plus an alpha byte. */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0")}`;
}

export function siteHost(): string {
  return new URL(SITE_URL).host;
}

const FONT_FILES = [
  { name: "Inter", weight: 400, file: "@fontsource/inter/files/inter-latin-400-normal.woff" },
  { name: "Inter", weight: 800, file: "@fontsource/inter/files/inter-latin-800-normal.woff" },
  { name: "JetBrains Mono", weight: 500, file: "@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff" },
] as const;

let fontsPromise: Promise<{ name: string; data: Buffer; weight: 400 | 500 | 800; style: "normal" }[]> | undefined;

function loadFonts() {
  fontsPromise ??= Promise.all(
    FONT_FILES.map(async (font) => ({
      name: font.name,
      weight: font.weight,
      style: "normal" as const,
      data: await readFile(path.join(process.cwd(), "node_modules", font.file)),
    })),
  );
  return fontsPromise;
}

const FILL = { position: "absolute", left: 0, top: 0, width: W, height: H, display: "flex" } as const;

/** How far the floor still moves right behind side-text layouts, so the scene sits beside the text. */
const STILL_SHIFT = { home: 300, page: 160, project: 300, post: 0 } as const;

function backdrop(card: OgCard, still: string, accent: string) {
  const fromBelow = card.layout === "post";
  // Project cards sit on the L3 still, whose wing boards and floor names are text: the scrim keeps the
  // text column near opaque (up to the screenshot frame at x 676, or across the card without one).
  const project = card.layout === "project";
  const scrim = fromBelow
    ? "linear-gradient(0deg, rgba(5,5,12,0.97) 0%, rgba(5,5,12,0.88) 45%, rgba(5,5,12,0.35) 100%)"
    : project && !card.shot
      ? "linear-gradient(90deg, rgba(5,5,12,0.97) 0%, rgba(5,5,12,0.95) 72%, rgba(5,5,12,0.8) 88%, rgba(5,5,12,0.55) 100%)"
      : project
        ? "linear-gradient(90deg, rgba(5,5,12,0.97) 0%, rgba(5,5,12,0.95) 50%, rgba(5,5,12,0.75) 58%, rgba(5,5,12,0.3) 100%)"
        : "linear-gradient(90deg, rgba(5,5,12,0.97) 0%, rgba(5,5,12,0.9) 40%, rgba(5,5,12,0.5) 64%, rgba(5,5,12,0.12) 100%)";
  return (
    <div style={FILL}>
      <img alt="" src={still} width={W} height={H} style={{ position: "absolute", left: STILL_SHIFT[card.layout], top: 0, width: W, height: H, objectFit: "cover" }} />
      <div style={{ ...FILL, backgroundImage: scrim }} />
      <div style={{ ...FILL, backgroundImage: `radial-gradient(circle at 82% 18%, ${withAlpha(accent, 0.22)} 0%, rgba(5,5,12,0) 55%)` }} />
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          width: W - 40,
          height: H - 40,
          display: "flex",
          borderRadius: 28,
          border: `1.5px solid ${withAlpha(accent, 0.5)}`,
          boxShadow: `0 0 36px ${withAlpha(accent, 0.3)}, inset 0 0 32px ${withAlpha(accent, 0.14)}`,
        }}
      />
    </div>
  );
}

function eyebrow(text: string, accent: string) {
  return (
    <div style={{ display: "flex", alignItems: "center", fontFamily: "JetBrains Mono", fontSize: OG_FONT.eyebrow, letterSpacing: 2, textTransform: "uppercase", color: OG_COLORS.ink2 }}>
      <div style={{ display: "flex", width: 14, height: 14, borderRadius: 7, marginRight: 14, backgroundColor: accent, boxShadow: `0 0 10px ${accent}, 0 0 24px ${withAlpha(accent, 0.6)}` }} />
      {text}
    </div>
  );
}

function portrait(src: string, size: number, ring: string) {
  const outer = size + 12;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        border: `3px solid ${ring}`,
        backgroundColor: OG_COLORS.void,
        boxShadow: `0 0 22px ${withAlpha(ring, 0.9)}, 0 0 60px ${withAlpha(OG_COLORS.violet, 0.5)}`,
      }}
    >
      <img alt="" src={src} width={size} height={size} style={{ width: size, height: size, borderRadius: size / 2 }} />
    </div>
  );
}

function hostLine() {
  return <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: OG_FONT.host, color: OG_COLORS.ink3 }}>{siteHost()}</div>;
}

function byline(card: OgCard, photo: string) {
  return (
    <div style={{ position: "absolute", left: 64, right: 64, bottom: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {portrait(photo, OG_PORTRAIT.byline, OG_COLORS.cyan)}
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 18 }}>
          <div style={{ display: "flex", fontSize: OG_FONT.bylineName, fontWeight: 800 }}>{card.name}</div>
          <div style={{ display: "flex", fontSize: OG_FONT.bylineHeadline, color: OG_COLORS.ink2 }}>{clampText(card.headline, 48)}</div>
        </div>
      </div>
      {hostLine()}
    </div>
  );
}

function homeBody(card: OgCard, photo: string, accent: string) {
  return (
    <div style={FILL}>
      <div style={{ position: "absolute", left: 64, top: 60, width: 800, display: "flex", flexDirection: "column" }}>
        {eyebrow(card.eyebrow, accent)}
        <div style={{ display: "flex", alignItems: "center", marginTop: 40 }}>
          {portrait(photo, OG_PORTRAIT.home, OG_COLORS.cyan)}
          <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, width: 660 }}>
            <div style={{ display: "flex", fontSize: OG_FONT.homeName, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1.5 }}>{card.title}</div>
            <div style={{ display: "flex", marginTop: 16, fontSize: OG_FONT.homeHeadline, fontWeight: 800, color: OG_COLORS.cyan, textShadow: `0 0 18px ${withAlpha(OG_COLORS.cyan, 0.75)}` }}>
              {clampText(card.subtitle ?? "", 60)}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 38, width: 720, fontSize: OG_FONT.motto, lineHeight: 1.35, color: OG_COLORS.ink }}>{clampText(card.motto ?? "", 110)}</div>
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {hostLine()}
        <div
          style={{
            display: "flex",
            padding: "12px 24px",
            borderRadius: 999,
            border: `1.5px solid ${withAlpha(accent, 0.85)}`,
            boxShadow: `0 0 18px ${withAlpha(accent, 0.45)}`,
            fontFamily: "JetBrains Mono",
            fontSize: OG_FONT.host,
            color: OG_COLORS.ink,
          }}
        >
          {card.cta ?? ""}
        </div>
      </div>
    </div>
  );
}

function pageBody(card: OgCard, photo: string, accent: string) {
  return (
    <div style={FILL}>
      <div style={{ position: "absolute", left: 64, top: 64, width: 820, display: "flex", flexDirection: "column" }}>
        {eyebrow(card.eyebrow, accent)}
        <div style={{ display: "flex", marginTop: 40, fontSize: titleSize("page", card.title), fontWeight: 800, lineHeight: 1.04, letterSpacing: -2, textShadow: `0 0 32px ${withAlpha(accent, 0.45)}` }}>
          {clampText(card.title, 32)}
        </div>
        {card.subtitle && <div style={{ display: "flex", marginTop: 22, width: 760, fontSize: OG_FONT.pageSubtitle, lineHeight: 1.35, color: OG_COLORS.ink2 }}>{clampText(card.subtitle, 90)}</div>}
      </div>
      {byline(card, photo)}
    </div>
  );
}

function projectBody(card: OgCard, photo: string, accent: string, shot: string | undefined) {
  const width = shot ? 580 : 860;
  const result = card.result;
  return (
    <div style={FILL}>
      <div style={{ position: "absolute", left: 64, top: 60, width, display: "flex", flexDirection: "column" }}>
        {eyebrow(clampText(card.eyebrow, shot ? OG_EYEBROW_MAX.shot : OG_EYEBROW_MAX.wide), accent)}
        <div style={{ display: "flex", marginTop: 22, fontSize: titleSize("project", card.title), fontWeight: 800, lineHeight: 1.06, letterSpacing: -1 }}>{clampText(card.title, shot ? 56 : 80)}</div>
        {!shot && card.subtitle && <div style={{ display: "flex", marginTop: 14, fontSize: OG_FONT.tagline, lineHeight: 1.35, color: OG_COLORS.ink2 }}>{clampText(card.subtitle, 120)}</div>}
        {result && (
          <div style={{ display: "flex", marginTop: 28, fontSize: resultSize(result.value), fontWeight: 800, letterSpacing: -1, color: accent, textShadow: `0 0 28px ${withAlpha(accent, 0.85)}` }}>{result.value}</div>
        )}
        {result && <div style={{ display: "flex", marginTop: 6, width: width - 40, fontSize: OG_FONT.resultLabel, lineHeight: 1.3, color: OG_COLORS.ink2 }}>{clampText(result.label, 80)}</div>}
      </div>
      {shot && (
        <div
          style={{
            position: "absolute",
            left: OG_SHOT.left,
            top: OG_SHOT.top,
            width: OG_SHOT.width,
            height: OG_SHOT.height,
            display: "flex",
            borderRadius: 18,
            border: `2px solid ${accent}`,
            boxShadow: `0 0 0 6px ${withAlpha(accent, 0.12)}, 0 0 48px ${withAlpha(accent, 0.6)}, 0 24px 64px rgba(0,0,0,0.6)`,
            overflow: "hidden",
          }}
        >
          <img alt="" src={shot} width={OG_SHOT.width - 4} height={OG_SHOT.height - 4} style={{ width: OG_SHOT.width - 4, height: OG_SHOT.height - 4, objectFit: "cover" }} />
        </div>
      )}
      {shot && (
        <div
          style={{
            position: "absolute",
            left: OG_SHOT.left,
            top: OG_SHOT.top + OG_SHOT.height + 8,
            width: OG_SHOT.width,
            height: 70,
            display: "flex",
            backgroundImage: `radial-gradient(ellipse at 50% 0%, ${withAlpha(accent, 0.35)} 0%, rgba(5,5,12,0) 70%)`,
          }}
        />
      )}
      {byline(card, photo)}
    </div>
  );
}

function postBody(card: OgCard, photo: string, accent: string) {
  return (
    <div style={FILL}>
      <div style={{ position: "absolute", left: 64, top: 64, display: "flex" }}>{eyebrow(card.eyebrow, accent)}</div>
      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 156,
          width: 1040,
          display: "flex",
          fontSize: titleSize("post", card.title),
          fontWeight: 800,
          lineHeight: 1.06,
          letterSpacing: -1.5,
          textShadow: "0 2px 24px rgba(0,0,0,0.85)",
        }}
      >
        {clampText(card.title, 96)}
      </div>
      {byline(card, photo)}
    </div>
  );
}

export async function renderOgImage(card: OgCard): Promise<ImageResponse> {
  const accent = ACCENT_HEX[card.accent];
  const [still, photo, shot, fonts] = await Promise.all([
    loadStill(card.still),
    loadPhoto(card.layout === "home" ? OG_PORTRAIT.home : OG_PORTRAIT.byline),
    card.layout === "project" && card.shot ? loadShot(card.shot, OG_SHOT.width, OG_SHOT.height) : Promise.resolve(undefined),
    loadFonts(),
  ]);
  const body =
    card.layout === "home"
      ? homeBody(card, photo, accent)
      : card.layout === "page"
        ? pageBody(card, photo, accent)
        : card.layout === "project"
          ? projectBody(card, photo, accent, shot)
          : postBody(card, photo, accent);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", backgroundColor: OG_COLORS.void, fontFamily: "Inter", color: OG_COLORS.ink }}>
        {backdrop(card, still, accent)}
        {body}
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts },
  );
}
