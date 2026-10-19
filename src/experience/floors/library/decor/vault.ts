import { Matrix4, Quaternion, Vector3 } from "three";
import { NEWSROOM } from "../concepts/newsroom";
import type { VaultBook } from "../model";

/**
 * The L4 Study Vault scene, pure (three.js math only, Vitest runs it in node): how far each book's cover opens with the
 * rover's distance and the instance matrices of the books and their covers. A book stands upright on the plinth with
 * its spine (local +z) toward the stop and its thickness along the arc; its cover lies on its right side as seen from
 * the stop, hinged on the spine edge, and opens by sliding out and swinging its far edge outward, so the cover's glow
 * turns toward the rover. The matrices scale a unit box whose base sits at y 0 (`BoxGeometry(1, 1, 1)` lifted by 0.5).
 */

export const VAULT_SCENE = {
  /**
   * Cover fully open within this distance (u) of the rover from the book's center, shut beyond `far`, smoothstep
   * between. The stop stands `NEWSROOM.end.vault.arc` (8 u) from every book, so from the stop each cover stands half
   * open and opens fully as the rover drives up to its book; from the ring road they are shut.
   */
  near: 4,
  far: 12,
  /** Low plinth under each book (u): the books' base height; its footprint along the arc and toward the stop. */
  plinth: 0.24,
  plinthSize: { w: 2.1, d: 3.4 },
  /** Cover: thickness, slide out from the body and turn about the spine edge (rad) when fully open, and its inset (height and depth share). */
  cover: { t: 0.1, slide: 0.6, turn: (35 * Math.PI) / 180, inset: 0.96 },
  /** How fast a cover moves toward its target (share of the full travel per second); reduced motion snaps. */
  rate: 1.6,
  /** Spine sign: height of its middle above the floor (u), how far in front of the spine face (u), type size and wrap width (characters). */
  spine: { y: 3.1, ahead: 0.6, font: 0.36, wrap: 8 },
  /** The "Study Vault" sign: height above the floor (u) and type size; it floats over the middle of the arc, this far behind the books. */
  title: { y: 5.9, font: 0.5, behind: 1.2 },
} as const;

/** Issuer tones of the books and their spines (the Classic shelf's dots: cyan, violet, amber). */
export const ISSUER_TONE: Readonly<Record<string, string>> = { Microsoft: "#22d3ee", GitHub: "#a78bfa", Google: "#fbbf24" };
const NEUTRAL_TONE = "#f4f4f5";

export const issuerTone = (issuer: string): string => ISSUER_TONE[issuer] ?? NEUTRAL_TONE;

/** 0 (shut) beyond `VAULT_SCENE.far`, 1 (open) within `VAULT_SCENE.near`, smoothstep between. */
export function coverOpen(distance: number): number {
  const { near, far } = VAULT_SCENE;
  const k = Math.min(1, Math.max(0, (far - distance) / (far - near)));
  return k * k * (3 - 2 * k);
}

const UP = new Vector3(0, 1, 0);
const P = new Vector3();
const Q = new Quaternion();
const S = new Vector3();
const LOCAL = new Matrix4();

type BookPose = Pick<VaultBook, "at" | "facing">;

/** The book's frame: on the plinth at its footprint center, turned so local +z (the spine) faces the stop. */
function bookFrame(book: BookPose, out: Matrix4): Matrix4 {
  Q.setFromAxisAngle(UP, Math.atan2(book.facing.x, book.facing.z));
  return out.compose(P.set(book.at.x, VAULT_SCENE.plinth, book.at.z), Q, S.set(1, 1, 1));
}

/**
 * Instance matrix of the plinth under a book: the unit box laid on its side (its local z up), so the holo plate's rim
 * (sized by the instance's x and y scale) follows the top face's edges.
 */
export function plinthMatrix(book: BookPose, out: Matrix4): Matrix4 {
  const { w, d } = VAULT_SCENE.plinthSize;
  bookFrame(book, out);
  out.multiply(LOCAL.makeTranslation(0, -VAULT_SCENE.plinth, 0));
  out.multiply(LOCAL.makeRotationX(-Math.PI / 2));
  out.multiply(LOCAL.makeScale(w, d, VAULT_SCENE.plinth));
  return out.multiply(LOCAL.makeTranslation(0, -0.5, 0.5));
}

/** Instance matrix of a book's body (floor-local): the unit box scaled to the book. */
export function bookMatrix(book: BookPose, out: Matrix4): Matrix4 {
  const { w, h, d } = NEWSROOM.end.vault.book;
  bookFrame(book, out);
  return out.multiply(LOCAL.makeScale(w, h, d));
}

/**
 * Instance matrix of a book's cover at `open` (0 shut, 1 open): hinged on the right side's spine edge, slid out by
 * `cover.slide` and turned by `cover.turn` (its far edge outward), both times `open`.
 */
export function coverMatrix(book: BookPose, open: number, out: Matrix4): Matrix4 {
  const { w, h, d } = NEWSROOM.end.vault.book;
  const { t, slide, turn, inset } = VAULT_SCENE.cover;
  bookFrame(book, out);
  // To the hinge (the cover's inner front edge), slid out.
  out.multiply(LOCAL.makeTranslation(w / 2 + slide * open, 0, d / 2));
  // A negative yaw swings the far (-z) edge toward +x.
  out.multiply(LOCAL.makeRotationY(-turn * open));
  out.multiply(LOCAL.makeTranslation(t / 2, (h * (1 - inset)) / 2, -d / 2));
  return out.multiply(LOCAL.makeScale(t, h * inset, d));
}
