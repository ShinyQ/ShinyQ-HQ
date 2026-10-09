/**
 * Build-time Open Graph images in the Neon Grid style (appendix 05 tokens).
 * Rendered by `next/og` (satori) in the `src/app/og/[...path]` route handler,
 * which the static export pre-renders to PNG files under `out/og/`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getProfile } from "@/content/load";
import type { Accent } from "@/content/schema";
import { OG_IMAGE_SIZE, SITE_URL } from "@/lib/site";


/** Appendix 05 color tokens (satori cannot read Tailwind classes). */
export const OG_COLORS = {
  void: "#05050c",
  vignette: "#1e1b4b",
  grid: "rgba(99, 102, 241, 0.30)",
  glass: "rgba(15, 15, 25, 0.82)",
  border: "#27272a",
  ink: "#f4f4f5",
  ink2: "#a1a1aa",
  ink3: "#8b8b94",
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

// Satori does not tile gradient backgrounds, so the floor grid is drawn as 1 px lines.
const GRID_STEP = 60;
const GRID_X = Array.from({ length: Math.floor(OG_IMAGE_SIZE.width / GRID_STEP) }, (_, i) => (i + 1) * GRID_STEP);
const GRID_Y = Array.from({ length: Math.floor(OG_IMAGE_SIZE.height / GRID_STEP) }, (_, i) => (i + 1) * GRID_STEP);

export interface OgCard {
  /** Mono uppercase line above the title, e.g. "L3 · AI Wing". */
  eyebrow: string;
  title: string;
  subtitle?: string;
  accent: Accent;
  /** Footer identity line, e.g. the localized headline. */
  footer: string;
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

/** Shortens text on a word boundary so satori never overflows the card. */
export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, "")}…`;
}

export function siteHost(): string {
  return new URL(SITE_URL).host;
}

export async function renderOgImage(card: OgCard): Promise<ImageResponse> {
  const profile = getProfile();
  const accent = ACCENT_HEX[card.accent];
  const title = clampText(card.title, 90);
  const titleSize = title.length > 60 ? 54 : title.length > 36 ? 64 : 76;
  const subtitle = card.subtitle ? clampText(card.subtitle, title.length > 36 ? 110 : 150) : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: OG_COLORS.void,
          backgroundImage: `radial-gradient(circle at 78% 18%, ${OG_COLORS.vignette} 0%, rgba(5,5,12,0) 62%)`,
          fontFamily: "Inter",
          color: OG_COLORS.ink,
        }}
      >
        {GRID_X.map((x) => (
          <div key={`x${x}`} style={{ position: "absolute", left: x, top: 0, width: 1, height: OG_IMAGE_SIZE.height, backgroundColor: OG_COLORS.grid }} />
        ))}
        {GRID_Y.map((y) => (
          <div key={`y${y}`} style={{ position: "absolute", top: y, left: 0, height: 1, width: OG_IMAGE_SIZE.width, backgroundColor: OG_COLORS.grid }} />
        ))}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, display: "flex", backgroundColor: accent }} />
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            top: 56,
            bottom: 56,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "48px 56px",
            backgroundColor: OG_COLORS.glass,
            border: `1px solid ${OG_COLORS.border}`,
            borderRadius: 24,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                fontFamily: "JetBrains Mono",
                fontSize: 22,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: accent,
              }}
            >
              <div style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: accent, marginRight: 16, display: "flex" }} />
              {card.eyebrow}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: titleSize,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: -1.5,
                color: OG_COLORS.ink,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ display: "flex", marginTop: 24, fontSize: 26, lineHeight: 1.4, color: OG_COLORS.ink2 }}>{subtitle}</div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 64,
                  height: 64,
                  borderRadius: 14,
                  border: "2px solid #22d3ee",
                  fontFamily: "JetBrains Mono",
                  fontSize: 20,
                  color: "#22d3ee",
                }}
              >
                {profile.monogram}
              </div>
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 20 }}>
                <div style={{ display: "flex", fontSize: 26, fontWeight: 800 }}>{profile.name}</div>
                <div style={{ display: "flex", fontSize: 20, color: OG_COLORS.ink3 }}>{clampText(card.footer, 70)}</div>
              </div>
            </div>
            <div style={{ display: "flex", fontFamily: "JetBrains Mono", fontSize: 20, color: OG_COLORS.ink3 }}>{siteHost()}</div>
          </div>
        </div>
      </div>
    ),
    { ...OG_IMAGE_SIZE, fonts: await loadFonts() },
  );
}
