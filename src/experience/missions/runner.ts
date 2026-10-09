import type { DrawerTab, Mission, MissionStep, RoomId } from "@/content/schema";
import type { MissionHost, MissionStatus, StepContext } from "./host";
import { floorOf, type RoomInfo } from "./rooms";
import { pickSurprise } from "./surprise";

export interface MissionState {
  missionId: string | null;
  /** Index of the current (or last) step. */
  step: number;
  stepCount: number;
  status: MissionStatus;
}

export interface MissionRunnerOptions {
  host: MissionHost;
  missions: readonly Mission[];
  /** Room catalog, used by the `surprise` step. */
  rooms: readonly RoomInfo[];
  /** Rooms already seen (store `visited` in 3D, recent rooms on the static tier). */
  visited?: () => readonly RoomId[];
  random?: () => number;
}

export interface MissionRunner {
  readonly state: MissionState;
  /** Runs a catalog mission. Resolves with the final status; rejects only for an unknown id. */
  start(missionId: string): Promise<MissionStatus>;
  /** Elevator, drive and open for any room (palette results, "see the case study" links). */
  goTo(room: RoomId, tab?: DrawerTab): Promise<MissionStatus>;
  /** Runs an ad hoc step list under a synthetic id. */
  runSteps(id: string, steps: readonly MissionStep[]): Promise<MissionStatus>;
  /** Stops the running mission (manual input, Esc). No-op when nothing runs. */
  cancel(): void;
  subscribe(listener: (state: MissionState) => void): () => void;
}

const IDLE: MissionState = { missionId: null, step: 0, stepCount: 0, status: "idle" };
const ABORTED = Symbol("aborted");

type ConcreteStep = Exclude<MissionStep, { kind: "surprise" }>;

function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(ABORTED);
    const onAbort = () => reject(ABORTED);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function roomSteps(room: RoomId, tab?: DrawerTab): ConcreteStep[] {
  return [
    { kind: "elevator", floor: floorOf(room) },
    { kind: "drive", to: room },
    tab ? { kind: "open", room, tab } : { kind: "open", room },
  ];
}

/**
 * Deterministic mission runner (spec appendix 02 section 3). Pure TypeScript: the world is reached
 * only through the injected `MissionHost`, so it runs the same against the static pages, the 3D
 * scene or a test double.
 */
export function createMissionRunner({ host, missions, rooms, visited = () => [], random = Math.random }: MissionRunnerOptions): MissionRunner {
  let state: MissionState = IDLE;
  let active: { id: string; controller: AbortController } | null = null;
  const listeners = new Set<(state: MissionState) => void>();

  const set = (next: MissionState) => {
    state = next;
    for (const listener of listeners) listener(state);
  };

  const expand = (steps: readonly MissionStep[]): ConcreteStep[] =>
    steps.flatMap((step) => {
      if (step.kind !== "surprise") return [step];
      const room = pickSurprise(rooms, visited(), random);
      return room ? roomSteps(room.id) : [];
    });

  const exec = (step: ConcreteStep, ctx: StepContext): Promise<void> => {
    switch (step.kind) {
      case "elevator":
        return host.elevator(step.floor, ctx);
      case "drive":
        return host.driveTo(step.to, ctx);
      case "open":
        return host.openRoom(step.room, step.tab, ctx);
      case "say":
        return host.say(step.text, step.ms, ctx);
      case "palette":
        return host.openPalette(step.filter, ctx);
    }
  };

  const cancel = () => {
    if (!active) return;
    const { id, controller } = active;
    active = null;
    controller.abort();
    set({ ...state, status: "cancelled" });
    host.finish?.("cancelled", id);
  };

  const runSteps = async (id: string, input: readonly MissionStep[]): Promise<MissionStatus> => {
    cancel();
    const steps = expand(input);
    const run = { id, controller: new AbortController() };
    active = run;
    const ctx: StepContext = { signal: run.controller.signal, missionId: id };
    const stepCount = steps.length;

    for (let i = 0; i < steps.length; i++) {
      if (active !== run) return "cancelled";
      set({ missionId: id, step: i, stepCount, status: "running" });
      try {
        await abortable(exec(steps[i], ctx), ctx.signal);
      } catch {
        // Aborted by cancel(), or the host failed: either way the mission ends here.
        if (active === run) cancel();
        return "cancelled";
      }
    }
    if (active !== run) return "cancelled";
    active = null;
    set({ missionId: id, step: Math.max(0, stepCount - 1), stepCount, status: "done" });
    host.finish?.("done", id);
    return "done";
  };

  return {
    get state() {
      return state;
    },
    start(missionId) {
      const mission = missions.find((m) => m.id === missionId);
      if (!mission) return Promise.reject(new Error(`Unknown mission "${missionId}"`));
      return runSteps(mission.id, mission.steps);
    },
    goTo(room, tab) {
      return runSteps(`goto:${room}`, roomSteps(room, tab));
    },
    runSteps,
    cancel,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
