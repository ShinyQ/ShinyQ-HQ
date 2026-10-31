"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, Object3D, PlaneGeometry, type Group, type InstancedMesh } from "three";
import { phoneCamera } from "@/lib/viewport";
import { getHQStore, useHQStore, type TopicPick } from "@/store/useHQStore";
import { FloatingSigns } from "../../../fx/FloatingSign";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import { sceneProbes } from "../../../fx/probes";
import { signPlate, wrapSign, type SignSpec } from "../../../fx/signLayout";
import { useDispose } from "../../../fx/useDispose";
import { useUniformTime } from "../../../fx/useUniformTime";
import { FONTS } from "../../../tower/primitives";
import type { GpuTier, LibraryData, LibraryTopic } from "../../../types";
import { LineBatch } from "../../labs/lines";
import { NEWSROOM } from "../concepts/newsroom";
import type { LibraryLayout } from "../model";
import { setCursor } from "./common";
import { useEndSignPlacement } from "./useEndSignPlacement";
import { issuerTone } from "./vault";
import { CONSTELLATION, constellationSpin, orbitAt, orbSlots, topicLinks, topicPickOf, type OrbSlot } from "../topics";

const NO_RAYCAST = () => null;
/** Orb colors, cycling (neon accents of the site). */
const ORB_TONES = ["#22d3ee", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#60a5fa"] as const;
/** Orb brightness: the picked orb, the others while a topic is picked, every orb otherwise. */
const ORB_LEVEL = { on: 2.2, off: 0.35, idle: 1 } as const;
/** Full-tier halo around each orb (a second, larger and dimmer dot). */
const HALO = { scale: 2.4, level: 0.3 } as const;
const PEDESTAL = { radius: 1.25, color: "#67e8f9" } as const;
const MONUMENT_COLOR = "#fbbf24";
/**
 * Study Vault spines: from the book's center to just in front of its spine face (u); their middle stands 3.1 u up,
 * every other one `SPINE_STAGGER` higher (the arc's outer neighbors close up on screen), 8 characters a line.
 */
const SPINE_AHEAD = NEWSROOM.end.vault.book.d / 2 + 0.6;
const SPINE_STAGGER = 0.5;
/** The "Study Vault" sign: its height (u) over the middle of the arc (`yTiers` over two tiers) and how far behind the books. */
const VAULT_TITLE = { y: 5.9, yTiers: 9.6, behind: 1.2, phone: 0.6 };
/** The pedestal column as a placement obstacle: no topic label shows over it. */
export const PEDESTAL_OBSTACLE = [{ x: 0, z: 0, r: 1.25, h: 2.6 }] as const;
const LINK_COLOR = "#a5f3fc";
const COUNT_FONT = 0.62;
/** Bottom of the monument's plate column (u above the floor). */
const MONUMENT_BASE = 0.7;

export const orbTone = (i: number) => ORB_TONES[i % ORB_TONES.length];

export interface EndPlazaLabels {
  /** "N pieces on X". */
  pieces: (count: number, topic: string) => string;
  /** Monument lines: the two numbers with their names and the source line ("Google Scholar · as of Oct 2026"); null without metrics. */
  monument: { citations: string; citationsLabel: string; hIndex: string; hIndexLabel: string; source: string } | null;
  /** "Study Vault" (`hud.interact.studyVault`): the sign over the vault's books. */
  vault: string;
}


/** What each end-plaza sign is, for the screen-space placement (`placeLabels`). */
export interface EndSignMeta {
  /** `guide`: a Study Vault book's spine; `vault`: the "Study Vault" sign over the books. */
  kind: "topic" | "count" | "monument" | "guide" | "vault";
  /** Topic slug (topic labels), study guide slug (spines). */
  slug?: string;
  /** Piece count (topic labels): bigger topics win a contested spot. */
  count?: number;
  /** The picked topic's label: always shown. */
  picked?: boolean;
}

/** Topic label type size, and the picked topic's; on a portrait phone (camera class `mobile`) `phone` and `phonePicked`. */
const LABEL = { font: 0.34, picked: 0.44, phone: 0.5, phonePicked: 0.6 } as const;
/**
 * Study Vault spines: type size and middle height; on a portrait phone a larger size, with the spines standing alternately
 * low and high (`phoneY`) so the wider plates of neighbouring books clear each other.
 */
/**
 * `tiers`, `phoneTiers`: with two tiers the spines take four heights in file order (front low, back low, front high,
 * back high), so no two of any four neighbors share one: on screen, any four neighbors stand closer than a plate is
 * wide. On a phone (its camera lower over two tiers) the back row's two float over the back books.
 */
const SPINE = { font: 0.36, y: 3.1, phone: 0.68, phoneY: [2.0, 4.6], tiers: [2.4, 4.0, 3.4, 5.0], phoneTiers: [0.4, 5.2, 3.4, 8.0] } as const;
/** Gap between the monument's stacked plates (u). */
const MONUMENT_GAP = 0.5;

/** Stacks plates bottom up from `base` (plate middles), `gap` apart. */
function stackColumn(specs: readonly Omit<SignSpec, "y">[], base: number): SignSpec[] {
  let y = base;
  return [...specs].reverse().map((spec) => {
    const { h } = signPlate(spec);
    const out = { ...spec, y: y + h / 2 };
    y += h + MONUMENT_GAP;
    return out;
  }).reverse();
}

/**
 * Every sign of the end plaza in one `FloatingSigns` group (two draw calls), with what each one is: the
 * topic labels riding the orbit above their orbs (the picked one larger, the others dimmed), "N pieces
 * on X" high above the cloud while a topic is picked, the monument's plates stacked in one column (so
 * they never cross from any camera yaw) and, with the Study Vault, each book's
 * spine (in its issuer's tone, just in front of the spine face; staggered on phones, `SPINE`) and the "Study Vault" sign over the arc.
 * Positions are relative to the plaza center. Which of them show each frame is decided on screen (`placeLabels`). `phone`
 * (camera class `mobile`): the topic names and the spines take their portrait phone sizes (the phone reading rule).
 */
export function endPlazaSigns(layout: LibraryLayout, topics: readonly LibraryTopic[], slots: readonly OrbSlot[], labels: EndPlazaLabels, pick: TopicPick | null, phone = false): { signs: SignSpec[]; meta: EndSignMeta[] } {
  const end = layout.end!;
  const signs: SignSpec[] = [];
  const meta: EndSignMeta[] = [];
  slots.forEach((slot, i) => {
    const picked = pick?.slug === topics[i].slug;
    signs.push({
      text: topics[i].label,
      x: slot.x,
      y: slot.y + slot.size + CONSTELLATION.labelLift,
      z: slot.z,
      color: pick && !picked ? "#8b8b94" : orbTone(i),
      fontSize: phone ? (picked ? LABEL.phonePicked : LABEL.phone) : picked ? LABEL.picked : LABEL.font,
      font: FONTS.monoBold,
      opacity: pick && !picked ? 0.6 : 1,
      orbit: true,
    });
    meta.push({ kind: "topic", slug: topics[i].slug, count: topics[i].count, picked });
  });
  if (pick) {
    const i = topics.findIndex((t) => t.slug === pick.slug);
    signs.push({ text: wrapSign(labels.pieces(pick.count, pick.name), 26), x: 0, y: CONSTELLATION.countY, z: 0, color: i >= 0 ? orbTone(i) : "#f4f4f5", fontSize: COUNT_FONT, font: FONTS.monoBold });
    meta.push({ kind: "count" });
  }
  const m = end.monument;
  if (m && labels.monument) {
    const L = labels.monument;
    const x = m.center.x - end.center.x;
    // Just in front of the monument's plaza face.
    const z = m.center.z - end.center.z + (m.rect.maxZ - m.rect.minZ) / 2 + 0.45;
    const plate = (text: string, color: string, fontSize: number) => ({ text, x, z, color, fontSize, font: FONTS.monoBold });
    const column = stackColumn(
      [
        plate(L.citations, MONUMENT_COLOR, 0.7),
        plate(L.citationsLabel.toUpperCase(), "#f4f4f5", 0.32),
        plate(L.hIndex, MONUMENT_COLOR, 0.7),
        plate(L.hIndexLabel.toUpperCase(), "#f4f4f5", 0.32),
        plate(L.source, "#c4b5fd", 0.28),
      ],
      MONUMENT_BASE,
    );
    for (const spec of column) {
      signs.push(spec);
      meta.push({ kind: "monument" });
    }
  }
  const vault = end.vault;
  if (vault) {
    const { books, stop } = vault;
    books.forEach((book, i) => {
      signs.push({
        text: wrapSign(book.spine, 8),
        x: book.at.x + book.facing.x * SPINE_AHEAD - end.center.x,
        y: vault.tiers === 2 ? (phone ? SPINE.phoneTiers : SPINE.tiers)[i % 4] : phone ? SPINE.phoneY[i % 2] : SPINE.y + (i % 2) * SPINE_STAGGER,
        z: book.at.z + book.facing.z * SPINE_AHEAD - end.center.z,
        color: issuerTone(book.issuer),
        fontSize: phone ? SPINE.phone : SPINE.font,
        font: FONTS.monoBold,
      });
      meta.push({ kind: "guide", slug: book.slug });
    });
    // Over the middle of the arc, a little behind the books (away from the stop, which is the arc's center).
    const mid = books.reduce((m, b) => ({ x: m.x + b.at.x / books.length, z: m.z + b.at.z / books.length }), { x: 0, z: 0 });
    const back = (vault.tiers - 1) * NEWSROOM.end.vault.rowGap;
    const k = 1 + (VAULT_TITLE.behind + back) / vault.arc;
    signs.push({ text: labels.vault.toUpperCase(), x: stop.x + (mid.x - stop.x) * k - end.center.x, y: vault.tiers === 2 ? VAULT_TITLE.yTiers : VAULT_TITLE.y, z: stop.z + (mid.z - stop.z) * k - end.center.z, color: "#e0f2fe", fontSize: phone ? VAULT_TITLE.phone : 0.5, font: FONTS.monoBold });
    meta.push({ kind: "vault" });
  }
  return { signs, meta };
}

/**
 * The L4 end plaza (owner request 2026-10-14): the Topic Constellation (a glowing pedestal with every
 * writing topic as an orb slowly orbiting above it, lines between topics that share a station, the topic
 * names riding along) and the research-metrics monument on the north rim. A
 * click on an orb picks its topic (again clears it); the pedestal itself is a point-and-go target
 * (interact/registry.ts). Draw calls: columns 1, orbs 1, links 1 (full), signs 2. Shared holo program;
 * lite drops the halos and the links; reduced motion holds the orbit and the pulse.
 */
export function EndPlaza({ layout, library, tier, reducedMotion, labels }: { layout: LibraryLayout; library: LibraryData; tier: GpuTier; reducedMotion: boolean; labels: EndPlazaLabels }) {
  const end = layout.end!;
  const full = tier === "full";
  const topics = library.topics;
  const pick = useHQStore((s) => s.topics.topic);
  const slots = useMemo(() => orbSlots(topics), [topics]);
  const n = Math.max(1, slots.length);
  const angle = useRef(0);
  const orbs = useRef<InstancedMesh>(null);
  const links = useRef<Group>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const probe = useMemo(() => slots.map((s) => ({ slug: s.slug, x: 0, y: s.y, z: 0 })), [slots]);
  useEffect(
    () => () => {
      sceneProbes.topics.orbs = [];
    },
    [],
  );

  // Pedestal and monument: one instanced column mesh (holo `core`, a hex prism).
  const columnGeo = useMemo(() => new CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0), []);
  useDispose(columnGeo);
  const columnMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor("#ffffff", 2, tier), opacity: full ? 0.9 : 0.75 }), [tier, full]);
  useDispose(columnMat);
  const columns = useMemo(() => {
    const list: { x: number; z: number; sx: number; h: number; sz: number; color: string }[] = [{ x: 0, z: 0, sx: PEDESTAL.radius, h: CONSTELLATION.pedestal, sz: PEDESTAL.radius, color: PEDESTAL.color }];
    const m = end.monument;
    if (m) list.push({ x: m.center.x - end.center.x, z: m.center.z - end.center.z, sx: (m.rect.maxX - m.rect.minX) / 2, h: NEWSROOM.end.monument.h, sz: (m.rect.maxZ - m.rect.minZ) / 2, color: MONUMENT_COLOR });
    const matrices = new Float32Array(list.length * 16);
    const colors = new Float32Array(list.length * 3);
    const o = new Object3D();
    list.forEach((c, i) => {
      o.position.set(c.x, 0, c.z);
      o.scale.set(c.sx, c.h, c.sz);
      o.updateMatrix();
      o.matrix.toArray(matrices, i * 16);
      new Color(c.color).toArray(colors, i * 3);
    });
    return { count: list.length, matrices, colors };
  }, [end]);

  // Orbs (holo `dot` quads turned to the camera every frame); halos on the full tier.
  const orbGeo = useMemo(() => new PlaneGeometry(2, 2), []);
  useDispose(orbGeo);
  const orbMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.dot, color: neonColor("#ffffff", 1.8, tier), opacity: 1, params: [reducedMotion ? 0 : 1, 0.55, 0, 0] }), [tier, reducedMotion]);
  useDispose(orbMat);
  const materials = useMemo(() => [columnMat, orbMat], [columnMat, orbMat]);
  useUniformTime(materials);
  const orbCount = full ? n * 2 : n;
  const orbColors = useMemo(() => new Float32Array(orbCount * 3).fill(1), [orbCount]);
  useEffect(() => {
    const m = orbs.current;
    if (!m?.instanceColor) return;
    const c = new Color();
    slots.forEach((slot, i) => {
      const level = !pick ? ORB_LEVEL.idle : pick.slug === slot.slug ? ORB_LEVEL.on : ORB_LEVEL.off;
      m.setColorAt(i, c.set(orbTone(i)).multiplyScalar(level));
      if (full) m.setColorAt(n + i, c.set(orbTone(i)).multiplyScalar(level * HALO.level));
    });
    m.instanceColor.needsUpdate = true;
  }, [slots, pick, full, n, orbCount]);

  // Links between topics that share a station (full tier), in orbit-local coordinates.
  const linkGeo = useMemo(() => {
    if (!full) return null;
    const batch = new LineBatch();
    for (const [a, b] of topicLinks(topics)) {
      const p = slots[a];
      const q = slots[b];
      if (p && q) batch.segment([p.x, p.y, p.z, q.x, q.y, q.z], LINK_COLOR);
    }
    return batch.build();
  }, [full, topics, slots]);
  useDispose(linkGeo);
  const linkColor = useMemo(() => neonColor(LINK_COLOR, 1, tier), [tier]);

  useFrame(({ camera }, dt) => {
    const m = orbs.current;
    if (!m) return;
    angle.current += constellationSpin(reducedMotion) * Math.min(dt, 0.1);
    slots.forEach((slot, i) => {
      const at = orbitAt(slot, angle.current);
      dummy.position.set(at.x, slot.y, at.z);
      dummy.quaternion.copy(camera.quaternion);
      dummy.scale.setScalar(slot.size);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (full) {
        dummy.scale.setScalar(slot.size * HALO.scale);
        dummy.updateMatrix();
        m.setMatrixAt(n + i, dummy.matrix);
      }
    });
    m.instanceMatrix.needsUpdate = true;
    if (links.current) links.current.rotation.y = angle.current;
    sceneProbes.topics.orbit = angle.current;
    probe.forEach((p, i) => {
      const at = orbitAt(slots[i], angle.current);
      p.x = end.center.x + at.x;
      p.z = end.center.z + at.z;
    });
    sceneProbes.topics.orbs = probe;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const topic = topics[e.instanceId % n];
    if (!topic) return;
    const store = getHQStore().getState();
    if (store.topics.topic?.slug === topic.slug) store.clearTopic();
    else store.selectTopic(topicPickOf(topic));
  };

  const phone = useHQStore((s) => phoneCamera(s.device.camera));
  const { signs, meta } = useMemo(() => endPlazaSigns(layout, topics, slots, labels, pick, phone), [layout, topics, slots, labels, pick, phone]);
  const hovered = useRef<string | null>(null);
  const root = useRef<Group>(null);
  const visibility = useEndSignPlacement({ signs, meta, group: root, angle, hovered, reducedMotion, obstacles: PEDESTAL_OBSTACLE, vault: end.vault });
  useEffect(() => {
    sceneProbes.topics.monument = end.monument && labels.monument ? [labels.monument.citations, labels.monument.hIndex, labels.monument.source] : null;
  }, [end.monument, labels.monument]);

  return (
    <group ref={root} name="library-end" position={[end.center.x, 0, end.center.z]}>
      <instancedMesh key={`columns-${columns.count}`} name="library-end-columns" args={[columnGeo, columnMat, columns.count]} raycast={NO_RAYCAST}>
        <instancedBufferAttribute attach="instanceMatrix" args={[columns.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[columns.colors, 3]} />
      </instancedMesh>
      {slots.length > 0 && (
        <instancedMesh
          key={`orbs-${orbCount}`}
          ref={orbs}
          name="library-topic-orbs"
          args={[orbGeo, orbMat, orbCount]}
          frustumCulled={false}
          onClick={onClick}
          onPointerOver={(e) => {
            setCursor("pointer");
            // A hovered orb's label wins a contested spot (the rest show by priority).
            hovered.current = e.instanceId === undefined ? null : (topics[e.instanceId % n]?.slug ?? null);
          }}
          onPointerOut={() => {
            setCursor("");
            hovered.current = null;
          }}
        >
          <instancedBufferAttribute attach="instanceColor" args={[orbColors, 3]} />
        </instancedMesh>
      )}
      {linkGeo && (
        <group ref={links}>
          <lineSegments geometry={linkGeo} raycast={NO_RAYCAST}>
            {/* One color, no vertex colors: the plain line program the neighbour floors already compile (programs within baseline). */}
            <lineBasicMaterial color={linkColor} transparent opacity={0.3} toneMapped={false} />
          </lineSegments>
        </group>
      )}
      <FloatingSigns signs={signs} name="library-end-signs" tier={tier} orbit={angle} visibility={visibility} />
    </group>
  );
}
