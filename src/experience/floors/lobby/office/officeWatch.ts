import { getHQStore } from "@/store/useHQStore";
import { officeSignal, setOfficeSignal, signalFromBody, subscribeOfficeSignal } from "./officeSignal";

/** GET /api/office (`OFFICE_PATH`, kept as a literal so the main path never imports the protocol module). */
const OFFICE_URL = "/api/office";
const KEEP_MS = 60_000;
const IDLE_MS = 10 * 60_000;
const INPUT = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/** The running watch's tick, for `__hq.office.watchNow()`. */
let active: (() => Promise<void>) | null = null;

/** `__hq.office.watchNow()` (Playwright): one watch tick now (its usual gates apply); resolves once its answer applied. */
export const officeWatchNow = (): Promise<void> => active?.() ?? Promise.resolve();

/**
 * The beacon's own small poll of GET /api/office (v1, design section 5.3): every `every` ms while the visitor is on L1
 * (not riding), the tab is visible, there was input in the last 10 min and the office scene's poller is not feeding the
 * signal itself; the tab turning visible fetches at once. Only the newest answer applies. Any signal goes dark 60 s
 * after its last good answer (the watch's or the scene's), so the beacon is never stale.
 */
export function startOfficeWatch(opts: { fetch?: (input: string, init?: RequestInit) => Promise<Response>; now?: () => number; every?: number } = {}): () => void {
  const get = opts.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
  const now = opts.now ?? Date.now;
  const every = opts.every ?? 30_000;
  const doc = typeof document === "undefined" ? null : document;
  const visible = () => !doc || doc.visibilityState !== "hidden";
  let lastInput = now();
  let seq = 0;
  let stale: ReturnType<typeof setTimeout> | undefined;
  const touch = () => {
    lastInput = now();
  };
  const expire = () => {
    clearTimeout(stale);
    if (!officeSignal.needsKurniadi && officeSignal.deployAt === null) return;
    const left = KEEP_MS - (now() - officeSignal.goodAt);
    if (left <= 0) setOfficeSignal({ asking: [], deployAt: null });
    else stale = setTimeout(expire, left);
  };
  const tick = async (): Promise<void> => {
    const s = getHQStore().getState();
    if (s.floor !== "L1" || s.ride || officeSignal.sceneFeeding || !visible() || now() - lastInput >= IDLE_MS) return;
    const mine = ++seq;
    try {
      const res = await get(OFFICE_URL, { headers: { accept: "application/json" }, credentials: "omit", cache: "no-store" });
      const sig = res.status === 200 ? signalFromBody(await res.json(), now()) : null;
      if (sig && mine === seq && !officeSignal.sceneFeeding) setOfficeSignal({ ...sig, goodAt: now() });
    } catch {
      // Offline or a broken body: `expire` clears the signal 60 s after the last good answer.
    }
  };
  const onVisible = () => {
    if (!visible()) return;
    touch();
    void tick();
  };
  const unsubscribe = subscribeOfficeSignal(expire);
  if (typeof window !== "undefined") for (const t of INPUT) window.addEventListener(t, touch, { passive: true });
  doc?.addEventListener("visibilitychange", onVisible);
  active = tick;
  expire();
  const first = setTimeout(tick, 0);
  const id = setInterval(tick, every);
  return () => {
    seq += 1;
    clearTimeout(first);
    clearTimeout(stale);
    clearInterval(id);
    unsubscribe();
    if (active === tick) active = null;
    if (typeof window !== "undefined") for (const t of INPUT) window.removeEventListener(t, touch);
    doc?.removeEventListener("visibilitychange", onVisible);
  };
}
