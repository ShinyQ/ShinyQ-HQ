"use client";

import { createElement, Suspense, useReducer, type ComponentProps } from "react";
import { ChunkFailed } from "../ChunkFailed";
import { lazyFromChunk } from "../lazyFromChunk";
import type { SettingsPanel } from "./SettingsPanel";

type PanelProps = ComponentProps<typeof SettingsPanel>;
type LoadProps = PanelProps & { onRetry: () => void };

function PanelFailed({ onRetry }: LoadProps) {
  return <ChunkFailed onRetry={onRetry} testId="settings-failed" />;
}

const lazyPanel = lazyFromChunk<LoadProps>(() => import("./SettingsPanel").then((m) => m.SettingsPanel), PanelFailed);

/**
 * The panel and its registry load when a settings sheet first opens, so they stay out of the first-frame
 * 3D path. While loading, a placeholder holds the sheet's height (no jump); a failed load shows Retry.
 */
export function LazySettingsPanel(props: PanelProps) {
  const [, retry] = useReducer((n: number) => n + 1, 0);
  return (
    <Suspense fallback={<div aria-hidden="true" data-testid="settings-loading" className="min-h-[36rem]" />}>
      {createElement(lazyPanel(), { ...props, onRetry: retry })}
    </Suspense>
  );
}
