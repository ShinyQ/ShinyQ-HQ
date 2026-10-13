// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDispose } from "@/experience/fx/useDispose";

const resource = () => ({ dispose: vi.fn() });

describe("useDispose", () => {
  it("disposes the old resource when it is replaced and the last one on unmount", () => {
    const a = resource();
    const b = resource();
    const { rerender, unmount } = renderHook(({ r }) => useDispose(r), { initialProps: { r: a } });
    expect(a.dispose).not.toHaveBeenCalled();
    rerender({ r: b });
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).not.toHaveBeenCalled();
    unmount();
    expect(b.dispose).toHaveBeenCalledTimes(1);
  });

  it("accepts a missing resource", () => {
    const { unmount } = renderHook(() => useDispose(null));
    expect(() => unmount()).not.toThrow();
  });
});
