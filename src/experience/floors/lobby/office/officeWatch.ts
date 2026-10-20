import { getHQStore } from "@/store/useHQStore";
import { officeSignal, setOfficeSignal, signalFromBody } from "./officeSignal";

const IDLE_MS = 10 * 60_000;
/** Visitor input that resets the 10 min idle stop (a touch fires `pointerdown` too). */
const INPUT = ["pointerdown", "keydown", "wheel"] as const;

/** The running watch's tick, for `__hq.office.watchNow()`. */
let tickNow: (() => Promise<void>) | undefined;

/** `__hq.office.watchNow()` (Playwright): one watch tick now (its usual gates apply); resolves once its answer applied. */
export const officeWatchNow = async (): Promise<void> => tickNow?.();

/**
 * The beacon's own small poll of GET /api/office (v1, design section 5.3; the path is a literal so the main path never
 * imports the protocol module): at once, then every `every` ms while the visitor is on L1 (not riding), the tab is
 * visible, there was input in the last 10 min and the office scene's poller is not feeding the signal itself. Only the
 * newest answer applies. The signal expires on its own 60 s after its last good answer (`setOfficeSignal`); stopping
 * the watch clears it at once.
 */
export function startOfficeWatch(opts: { fetch?: (input: string, init?: RequestInit) => Promise<Response>; now?: () => number; every?: number } = {}): () => void {
  const get = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  let lastInput = now();
  let seq = 0;
  const touch = () => {
    lastInput = now();
  };
  const tick = async (): Promise<void> => {
    const s = getHQStore().getState();
    if (s.floor !== "L1" || s.ride || officeSignal.sceneFeeding || document.visibilityState === "hidden" || now() - lastInput >= IDLE_MS) return;
    const mine = ++seq;
    try {
      const res = await get("/api/office", { cache: "no-store", credentials: "omit" });
      const sig = res.status === 200 ? signalFromBody(await res.json(), now()) : null;
      if (sig && mine === seq && !officeSignal.sceneFeeding) setOfficeSignal({ ...sig, goodAt: now() });
    } catch {
      // Offline or a broken body: the signal expires 60 s after the last good answer.
    }
  };
  for (const t of INPUT) addEventListener(t, touch, { passive: true });
  tickNow = tick;
  void tick();
  const id = setInterval(tick, opts.every ?? 30_000);
  return () => {
    seq += 1;
    clearInterval(id);
    if (tickNow === tick) tickNow = undefined;
    for (const t of INPUT) removeEventListener(t, touch);
    setOfficeSignal({ asking: [], deployAt: null });
  };
}
