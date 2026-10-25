import type { PostRef, Track } from "./schema";

/**
 * L4 reader tracks (owner decision 2026-10-25): each post sits on exactly one track; a track lists its lead
 * first (the owner's pick, else the newest), then the rest newest first. Built at build time: the 3D payload
 * and, later, the Classic Writing page read it. Pure.
 */
export interface TrackEntry {
  slug: string;
  posts: string[];
}

export function buildTrackIndex(library: { tracks: readonly Track[]; posts: readonly Pick<PostRef, "slug" | "date" | "track">[] }): TrackEntry[] {
  const newest = [...library.posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
  return library.tracks.map((track) => {
    const posts = newest.filter((p) => p.track === track.slug).map((p) => p.slug);
    const lead = track.lead && posts.includes(track.lead) ? track.lead : posts[0];
    return { slug: track.slug, posts: lead ? [lead, ...posts.filter((s) => s !== lead)] : [] };
  });
}
