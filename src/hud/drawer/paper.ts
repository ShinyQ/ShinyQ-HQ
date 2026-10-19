import type { Locale } from "@/content/schema";
import { openPaper } from "../events";
import { loadRoomView } from "./data";

/**
 * Opens the paper preview modal (`PaperDialog` in DialogHost) for research item `id` from anywhere, for
 * example a paper hologram on L4. The preview comes from the L4 drawer file (`/data/rooms/{locale}-L4.json`,
 * room `L4:research`), so the 3D chunk never carries abstracts or citations. Resolves false when the
 * item is unknown or the data failed to load.
 */
export async function openPaperFor(locale: Locale, id: string): Promise<boolean> {
  try {
    const view = await loadRoomView(locale, "L4:research");
    const item = view?.research?.items.find((i) => i.id === id);
    if (!item) return false;
    openPaper(item.preview);
    return true;
  } catch {
    return false;
  }
}
