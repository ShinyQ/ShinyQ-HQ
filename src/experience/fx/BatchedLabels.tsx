"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, type Ref } from "react";
import { MeshBasicMaterial } from "three";
import { BatchedText, Text } from "troika-three-text";
import { applyLabel, type BatchedLabel } from "./labelProps";

/** Live access to a batch: `members[i]` is the troika Text for `labels[i]` (empty until the first commit). */
export interface BatchedLabelsHandle {
  readonly batch: BatchedText;
  readonly members: readonly Text[];
}

/**
 * All labels of a floor in one draw call (two with outlines): a troika `BatchedText` packs every member's
 * glyphs, font, color, opacity and transform (relative to this group) into one mesh. Members cannot
 * billboard on their own, so give each label a fixed `yaw`, or move members per frame through the `ref`
 * handle (set `matrixAutoUpdate = false` and write `matrix`). `toneMapped` matches the labels it replaces
 * (drei Text defaults to tone mapped). Not raycast: make clickable signs point-and-go targets (interact/registry.ts).
 */
export function BatchedLabels({
  labels,
  name = "labels",
  renderOrder,
  toneMapped = false,
  ref,
}: {
  labels: readonly BatchedLabel[];
  name?: string;
  renderOrder?: number;
  toneMapped?: boolean;
  ref?: Ref<BatchedLabelsHandle>;
}) {
  const { batch, base } = useMemo(() => {
    const base = new MeshBasicMaterial({ toneMapped, transparent: true, depthWrite: false });
    const batch = new BatchedText();
    batch.material = base;
    batch.raycast = () => undefined;
    return { batch, base };
  }, [toneMapped]);
  const members = useRef<Text[]>([]);

  useImperativeHandle(ref, () => ({ batch, get members() { return members.current; } }), [batch]);

  useEffect(() => {
    const created = labels.map((label) => {
      const text = new Text();
      applyLabel(text, label);
      batch.addText(text);
      return text;
    });
    members.current = created;
    batch.sync();
    return () => {
      members.current = [];
      for (const text of created) {
        batch.removeText(text);
        text.dispose();
      }
    };
  }, [batch, labels]);

  useEffect(
    () => () => {
      batch.dispose();
      base.dispose();
    },
    [batch, base],
  );

  return <primitive object={batch} name={name} renderOrder={renderOrder ?? 0} />;
}
