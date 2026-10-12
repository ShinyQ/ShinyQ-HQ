"use client";

import { useEffect, useMemo } from "react";
import { MeshBasicMaterial } from "three";
import { BatchedText, Text } from "troika-three-text";
import { applyLabel, type BatchedLabel } from "./labelProps";

/**
 * All labels of a floor in one draw call: a troika `BatchedText` packs every member's glyphs, font,
 * color and transform (relative to this group) into one mesh. Members cannot billboard, so give each
 * label a fixed `yaw` toward where it is read from. Not raycast: make clickable signs point-and-go targets (interact/registry.ts).
 */
export function BatchedLabels({ labels, name = "labels", renderOrder }: { labels: readonly BatchedLabel[]; name?: string; renderOrder?: number }) {
  const { batch, base } = useMemo(() => {
    const base = new MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false });
    const batch = new BatchedText();
    batch.material = base;
    batch.raycast = () => undefined;
    return { batch, base };
  }, []);

  useEffect(() => {
    const members = labels.map((label) => {
      const text = new Text();
      applyLabel(text, label);
      batch.addText(text);
      return text;
    });
    batch.sync();
    return () => {
      for (const text of members) {
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
