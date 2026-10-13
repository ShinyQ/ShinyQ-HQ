/**
 * Recovery after a WebGL context loss or a crash in the 3D view (main spec 4.6, perf report F7.5):
 * one automatic remount on a fresh canvas, then the static page with a "Retry 3D" button. A manual
 * retry that fails goes straight back to the static page, so nothing loops. Pure state, plus
 * `whenVisible` (iOS drops the contexts of background tabs; remounting while hidden would fail again).
 */
export type RecoveryStatus = "ok" | "retrying" | "failed";

export interface Recovery {
  failures: number;
  status: RecoveryStatus;
}

export const AUTO_RETRIES = 1;
export const RECOVERY_START: Recovery = { failures: 0, status: "ok" };

/** A crash report. While a retry or the static page is already showing, a second report of the same crash is ignored. */
export function afterFailure(r: Recovery): Recovery {
  if (r.status !== "ok") return r;
  const failures = r.failures + 1;
  return { failures, status: failures <= AUTO_RETRIES ? "retrying" : "failed" };
}

/** The visitor pressed "Retry 3D": one more mount; if it fails, back to the static page at once. */
export function manualRetry(r: Recovery): Recovery {
  return { failures: Math.max(r.failures, AUTO_RETRIES), status: "retrying" };
}

/** The remount happened. */
export function settled(r: Recovery): Recovery {
  return r.status === "retrying" ? { ...r, status: "ok" } : r;
}

export interface VisibilitySource {
  hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Runs `run` on the next task once the tab is visible (at once if it is). Returns a cancel function. */
export function whenVisible(run: () => void, doc: VisibilitySource = document): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const go = () => {
    timer = setTimeout(run, 0);
  };
  const onVisible = () => {
    if (doc.hidden) return;
    doc.removeEventListener("visibilitychange", onVisible);
    go();
  };
  if (doc.hidden) doc.addEventListener("visibilitychange", onVisible);
  else go();
  return () => {
    doc.removeEventListener("visibilitychange", onVisible);
    if (timer !== undefined) clearTimeout(timer);
  };
}
