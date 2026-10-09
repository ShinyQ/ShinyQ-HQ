import en from "../../../messages/en.json";
import id from "../../../messages/id.json";
import type { Asset, Locale, RoomId } from "../schema";
import type { RoomImage, RoomStackItem, RoomView } from "./types";

export type Messages = typeof en;

export function messages(locale: Locale): Messages {
  return locale === "en" ? en : id;
}

/** Fills `{name}` placeholders in a message. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? `{${key}}`);
}

export function stackItems(names: readonly string[]): RoomStackItem[] {
  return names.map((name) => ({ name }));
}

export function galleryOf(assets: readonly Asset[], locale: Locale): RoomImage[] {
  return assets.map((a) => ({ src: a.src, alt: a.alt[locale], width: a.width, height: a.height }));
}

/** Links a list of views as a prev/next sequence (the drawer's arrows). */
export function chain(views: RoomView[]): RoomView[] {
  views.forEach((view, i) => {
    view.prev = i > 0 ? views[i - 1].id : undefined;
    view.next = i < views.length - 1 ? views[i + 1].id : undefined;
  });
  return views;
}

/** Defaults for a single-pane room. */
export function single(view: Pick<RoomView, "id" | "kind" | "title" | "accent"> & Partial<RoomView>): RoomView {
  const floor = view.id.slice(0, view.id.indexOf(":")) as RoomView["floor"];
  return {
    floor,
    code: view.id,
    meta: [],
    badges: [],
    variant: "single",
    sections: [],
    metrics: [],
    stack: [],
    gallery: [],
    hologram: false,
    tabs: [],
    ...view,
  };
}

export const roomId = (floor: string, slug: string) => `${floor}:${slug}` as RoomId;
