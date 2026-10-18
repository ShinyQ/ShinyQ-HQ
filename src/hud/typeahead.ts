/**
 * Keys typed between a palette shortcut and the first mount of the lazy palette chunk. MissionHud starts it on
 * open and feeds it window key presses until the palette's input has focus; the palette seeds its query (and
 * runs the top result for an Enter) from it on mount, then stops it.
 */
export interface PaletteTypeahead {
  /** What was typed so far; `submit` once Enter was pressed after some text. Safe to call during render. */
  peek(): { text: string; submit: boolean };
  /** The palette has focus: later keys go to its input. */
  stop(): void;
}

export interface TypeaheadBuffer extends PaletteTypeahead {
  start(): void;
  /** Takes a window keydown while active. Returns "escape" for Esc, true when the key was kept, else false. */
  key(event: KeyboardEvent): boolean | "escape";
}

export function createTypeahead(): TypeaheadBuffer {
  let active = false;
  let text = "";
  let submit = false;
  return {
    start() {
      active = true;
      text = "";
      submit = false;
    },
    stop() {
      active = false;
      text = "";
      submit = false;
    },
    peek: () => ({ text, submit }),
    key(event) {
      if (!active || submit || event.metaKey || event.ctrlKey || event.altKey) return false;
      if (event.key === "Escape") return "escape";
      if (event.key.length === 1) text += event.key;
      else if (event.key === "Backspace") text = text.slice(0, -1);
      else if (event.key === "Enter" && text) submit = true;
      else return false;
      event.preventDefault();
      return true;
    },
  };
}
