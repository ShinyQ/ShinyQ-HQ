"use client";

import { useEffect } from "react";

/**
 * Disposes a three.js resource built in `useMemo` when it is replaced or the component unmounts.
 * R3F disposes only what it creates from JSX (`<boxGeometry />`); a geometry, texture or material
 * passed as a prop (`geometry={g}`) or in `args` stays in `renderer.info.memory` until someone calls
 * `dispose()`, so every floor remount would leak it (perf report F7.1). Call it right after the memo.
 */
export function useDispose(resource: { dispose(): void } | null | undefined): void {
  useEffect(() => () => resource?.dispose(), [resource]);
}
