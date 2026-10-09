import { getContact, getRoof } from "../load";
import type { Locale } from "../schema";
import { cvPdfPath } from "@/lib/site";
import { chain, fill, messages, roomId, single } from "./shared";
import type { RoomView } from "./types";

/** RF Roof (Phase 5a): comms terminals and the CV kiosk. `RoofBody` (hud/drawer/RoofBody.tsx) renders both. */
export function buildRoofViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const roof = getRoof();
  const contact = getContact();
  const channels = [
    { title: m.common.email, meta: contact.email, href: `mailto:${contact.email}` },
    { title: "LinkedIn", href: contact.linkedin, external: true },
    { title: "GitHub", href: contact.github, external: true },
    ...(contact.huggingface ? [{ title: "Hugging Face", href: contact.huggingface, external: true }] : []),
    ...(contact.medium ? [{ title: "Medium", href: contact.medium, external: true }] : []),
  ];
  return chain([
    single({
      id: roomId("RF", "contact"),
      kind: "roof",
      title: m.hud.rooms.contact,
      subtitle: roof.availability[locale],
      accent: "blue",
      sections: [{ title: m.drawer.rooms.channels, items: channels }],
      page: "/contact",
    }),
    single({
      id: roomId("RF", "cv"),
      kind: "roof",
      title: m.hud.rooms.cv,
      subtitle: m.contact.cvIntro,
      accent: "blue",
      sections: [
        {
          title: m.drawer.rooms.downloads,
          items: [
            ...(["en", "id"] as const).map((l) => ({ title: fill(m.drawer.rooms.cvPdf, { locale: l.toUpperCase() }), href: cvPdfPath(roof.cv.fileName, l), external: true })),
            { title: m.drawer.rooms.cvPage, href: "/cv" },
          ],
        },
      ],
      page: "/cv",
    }),
  ]);
}
