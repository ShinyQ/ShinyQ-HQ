"use client";

import { lazy, Suspense, type ComponentProps } from "react";

const SettingsPanel = lazy(() => import("./SettingsPanel").then((m) => ({ default: m.SettingsPanel })));

/** The panel and its registry load when a settings sheet first opens, so they stay out of the first-frame 3D path. */
export function LazySettingsPanel(props: ComponentProps<typeof SettingsPanel>) {
  return (
    <Suspense fallback={null}>
      <SettingsPanel {...props} />
    </Suspense>
  );
}
