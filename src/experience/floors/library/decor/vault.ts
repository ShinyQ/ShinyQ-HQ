import { MathUtils, Matrix4 } from "three";
import { NEWSROOM } from "../concepts/newsroom";
import type { Vec2 } from "../../../types";
import type { VaultBook } from "../model";

/**
 * The L4 Study Vault scene, pure (three.js math only, Vitest runs it in node): how far each book's cover opens with the
 * rover's distance and the instance matrices of the books, their plinths and their covers. A book stands upright on the
 * plinth with its spine (local +z) toward the stop and its thickness along the arc; its cover lies on its right side as
 * seen from the stop, hinged on the spine edge, and opens by sliding out and swinging its far edge outward, so the
 * cover's glow turns toward the rover. The matrices scale a unit box whose base sits at y 0 (`BoxGeometry(1, 1, 1)`
 * lifted by 0.5).
 */

export const VAULT_SCENE = {
  /**
   * Cover fully open within this distance (u) of the rover from the book's center, shut beyond `far`, smoothstep
   * between. The stop stands `NEWSROOM.end.vault.arc` (8 u) from every book, so from the stop each cover stands half
   * open and opens fully as the rover drives up to its book; from the ring road they are shut.
   */
  near: 4,
  far: 12,
  /** Low plinth under each book (u): the books' base height. */
  plinth: 0.24,
  /** Cover: thickness, slide out from the body and turn about the spine edge (rad) when fully open. */
  cover: { t: 0.1, slide: 0.6, turn: (35 * Math.PI) / 180 },
} as const;

/** Plinth footprint along the arc and toward the stop (u); the cover's share of the book's height and depth. */
const PLINTH = { w: 2.1, d: 3.4 };
const COVER_INSET = 0.96;

/** Issuer tones of the books and their spines (the Classic shelf's dots: cyan, violet, amber). */
export const ISSUER_TONE: Readonly<Record<string, string>> = { Microsoft: "#22d3ee", GitHub: "#a78bfa", Google: "#fbbf24" };

export const issuerTone = (issuer: string): string => ISSUER_TONE[issuer] ?? "#f4f4f5";

/** 0 (shut) beyond `VAULT_SCENE.far`, 1 (open) within `VAULT_SCENE.near`, smoothstep between. */
export const coverOpen = (distance: number): number => 1 - MathUtils.smoothstep(distance, VAULT_SCENE.near, VAULT_SCENE.far);

/**
 * A book's cover at the rover's place (`x`, `z`): `coverOpen` of its distance to the book, less how much farther than
 * `NEWSROOM.end.vault.arc` the book stands from the stop (the back arc, and the wider front arc of two tiers), so every
 * cover stands half open from the stop and opens fully as the rover drives up to its book.
 */
export function bookOpen(book: Pick<VaultBook, "at">, stop: Vec2, x: number, z: number): number {
  const extra = Math.hypot(stop.x - book.at.x, stop.z - book.at.z) - NEWSROOM.end.vault.arc;
  return coverOpen(Math.hypot(x - book.at.x, z - book.at.z) - extra);
}

const LOCAL = new Matrix4();
const P = VAULT_SCENE.plinth;

/** A book's place; `rise` (the back arc's riser, 0 when absent) lifts its plinth top, body and cover. */
type BookPose = Pick<VaultBook, "at" | "facing"> & { rise?: number };

const base = (book: BookPose) => P + (book.rise ?? 0);

/** A book's frame times `local`: base at height `y` on its footprint center `at`, turned so local +z (the spine) faces `facing`. */
export const framed = (at: Vec2, facing: Vec2, y: number, out: Matrix4, local: Matrix4) =>
  out.makeRotationY(Math.atan2(facing.x, facing.z)).setPosition(at.x, y, at.z).multiply(local);

/**
 * A flat slab `w` wide and `d` deep in the book frame, its top at `top` and `t` thick (the plinth's by default): the
 * unit box laid on its side (its local z up, its y toward the back), so the holo plate's rim (sized by the instance's x
 * and y scale) follows the top face's edges.
 */
export const slabMatrix = (at: Vec2, facing: Vec2, top: number, w: number, d: number, out: Matrix4, t: number = P) =>
  framed(at, facing, top, out, LOCAL.set(w, 0, 0, 0, 0, 0, t, -t / 2, 0, -d, 0, d / 2, 0, 0, 0, 1));

/** Instance matrix of the plinth under a book: on the back arc it runs down to the floor as the book's riser. */
export function plinthMatrix(book: BookPose, out: Matrix4): Matrix4 {
  const top = base(book);
  return slabMatrix(book.at, book.facing, top, PLINTH.w, PLINTH.d, out, top);
}

/** Instance matrix of a book's body (floor-local): the unit box scaled to the book. */
export function bookMatrix(book: BookPose, out: Matrix4): Matrix4 {
  const { w, h, d } = NEWSROOM.end.vault.book;
  return framed(book.at, book.facing, base(book), out, LOCAL.makeScale(w, h, d));
}

/**
 * The cover of a `size` book framed at `at`, `facing`, `y` at `open` (0 shut, 1 open): hinged on the right side's spine
 * edge, slid out by `cover.slide` and turned by `cover.turn` (a negative yaw swings its far edge outward), both times
 * `open`.
 */
export function openCover(at: Vec2, facing: Vec2, y: number, size: { w: number; h: number; d: number }, open: number, out: Matrix4): Matrix4 {
  const { w, h, d } = size;
  const { t, slide, turn } = VAULT_SCENE.cover;
  framed(at, facing, y, out, LOCAL.makeRotationY(-turn * open).setPosition(w / 2 + slide * open, 0, d / 2));
  return out.multiply(LOCAL.makeScale(t, h * COVER_INSET, d).setPosition(t / 2, (h * (1 - COVER_INSET)) / 2, -d / 2));
}

/** Instance matrix of a vault book's cover at `open` (`openCover`). */
export const coverMatrix = (book: BookPose, open: number, out: Matrix4): Matrix4 => openCover(book.at, book.facing, base(book), NEWSROOM.end.vault.book, open, out);
