import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { createDialogEngine, IDLE_VIEW, type DialogView, type SayInput, type SayOptions, type SayResult } from "./engine";

/** The dialog slice: the engine's current view, mirrored for React. */
export interface DialogSlice {
  view: DialogView;
}

export const dialogStore = createStore<DialogSlice>(() => ({ view: IDLE_VIEW }));

/** The one Rover dialog of the 3D HUD (onboarding, floor lines, hints). */
export const dialog = createDialogEngine();
dialog.subscribe((view) => dialogStore.setState({ view }));

export const say = (input: SayInput, options?: SayOptions): Promise<SayResult> => dialog.say(input, options);
export const cancelDialog = (id: string) => dialog.cancel(id);
export const cancelAllDialogs = () => dialog.cancelAll();

export function useDialog<T>(selector: (view: DialogView) => T): T {
  return useStore(dialogStore, (state) => selector(state.view));
}
