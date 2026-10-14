// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useModalOpen } from "@/hud/dialog/useModalOpen";

function modal() {
  const el = document.createElement("div");
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  return el;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("useModalOpen", () => {
  it("is true on the first render when a modal is already open (Rover's box mounts under Cmd-K)", () => {
    const el = modal();
    document.body.append(el);
    const seen: boolean[] = [];
    renderHook(() => {
      const open = useModalOpen();
      seen.push(open);
      return open;
    });
    expect(seen).not.toContain(false);
  });

  it("follows modals opening and closing without waiting for an animation frame", async () => {
    const { result } = renderHook(() => useModalOpen());
    expect(result.current).toBe(false);
    const el = modal();
    await act(async () => {
      document.body.append(el);
      await Promise.resolve();
    });
    expect(result.current).toBe(true);
    await act(async () => {
      el.remove();
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });
});
