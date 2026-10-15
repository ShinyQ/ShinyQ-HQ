// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lazyFromChunk } from "@/hud/lazyFromChunk";

const Real = () => <p>real body</p>;
const Fallback = () => <p>fallback body</p>;

function show(Component: ReturnType<ReturnType<typeof lazyFromChunk>>) {
  return render(
    <Suspense fallback={<p>loading</p>}>
      <Component />
    </Suspense>,
  );
}

afterEach(cleanup);

describe("lazyFromChunk", () => {
  it("renders the loaded component and reuses one wrapper while the import works", async () => {
    const get = lazyFromChunk(() => Promise.resolve(Real), Fallback);
    const first = get();
    expect(get()).toBe(first);
    show(first);
    expect(await screen.findByText("real body")).toBeInTheDocument();
  });

  it("shows the fallback once, then hands out a fresh wrapper that retries the import", async () => {
    const load = vi.fn<() => Promise<typeof Real>>().mockRejectedValueOnce(new Error("chunk failed")).mockResolvedValue(Real);
    const get = lazyFromChunk(load, Fallback);

    const failed = get();
    show(failed);
    expect(await screen.findByText("fallback body")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    const retry = get();
    expect(retry).not.toBe(failed);
    cleanup();
    show(retry);
    expect(await screen.findByText("real body")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
    expect(get()).toBe(retry);
  });
});
