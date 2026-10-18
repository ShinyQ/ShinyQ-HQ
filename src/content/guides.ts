/**
 * Pure study guide helpers shared by the Classic shelf, the CertDialog, the L4 Study Vault and the reader.
 * No zod, React or three imports, so client bundles and Vitest can use them.
 */

export interface GuideDomainView {
  label: string;
  weight: readonly [number, number];
  weightLabel: string;
}

/** Serializable, locale-resolved study guide. */
export interface GuideView {
  slug: string;
  certId: string;
  code: string | null;
  spine: string;
  issuer: string;
  title: string;
  summary: string;
  edition: string;
  editionLabel: string;
  file: string;
  pages: number;
  bytes: number;
  sizeLabel: string;
  version: string;
  cover: string;
  /** The Pages Function URL, versioned so a new PDF never reuses a cached one. */
  url: string;
  downloadUrl: string;
  domains: GuideDomainView[];
}

export const GUIDE_SLUG = /^[a-z0-9-]{2,40}$/;

export const guideUrl = (slug: string, version: string) => `/api/guides/${slug}?v=${version}`;
export const guideDownloadUrl = (slug: string, version: string) => `${guideUrl(slug, version)}&download=1`;

/** localStorage key for the last page read in a guide. */
export const GUIDE_PAGE_KEY = (slug: string) => `hq:guide:${slug}`;

/** "25-30%" for a range, "~30%" when the exam guide gives one number. */
export function weightLabel([min, max]: readonly [number, number]): string {
  return min === max ? `~${min}%` : `${min}-${max}%`;
}

/** 4448335 -> "4.4 MB" (decimal megabytes, one decimal). */
export function sizeLabel(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
