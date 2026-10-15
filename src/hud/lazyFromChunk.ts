import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * A getter for a React.lazy wrapper over a floor chunk export. React caches a settled lazy forever, so
 * a failed import resolves this wrapper to `fallback` and drops it: the next call builds a fresh
 * wrapper that retries the import (same pattern as `lazyFloors.tsx`). Call the getter in render.
 */
export function lazyFromChunk<P extends object>(
  load: () => Promise<ComponentType<P>>,
  fallback: ComponentType<P>,
): () => LazyExoticComponent<ComponentType<P>> {
  let wrapper: LazyExoticComponent<ComponentType<P>> | null = null;
  return () => {
    if (!wrapper) {
      const own: LazyExoticComponent<ComponentType<P>> = lazy(() =>
        load().then(
          (Component) => ({ default: Component }),
          () => {
            if (wrapper === own) wrapper = null;
            return { default: fallback };
          },
        ),
      );
      wrapper = own;
    }
    return wrapper;
  };
}
