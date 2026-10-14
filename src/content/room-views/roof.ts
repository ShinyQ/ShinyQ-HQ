import { getContact, getProfile, getRoof } from "../load";
import type { Locale } from "../schema";
import { cvPdfPath } from "@/lib/cv";
import { chain, linkLogo, messages, roomId, single } from "./shared";
import type { RoomLinkItem, RoomView } from "./types";

/** Email first, then every published channel (new tab) with its logo. Shared with the Highlights Hall contact station. */
export function contactItems(locale: Locale): RoomLinkItem[] {
  const m = messages(locale);
  const contact = getContact();
  return [
    { title: m.common.email, meta: contact.email, href: `mailto:${contact.email}` },
    { ...linkLogo("LinkedIn"), title: "LinkedIn", href: contact.linkedin, external: true },
    { ...linkLogo("GitHub"), title: "GitHub", href: contact.github, external: true },
    ...(contact.huggingface ? [{ ...linkLogo("Hugging Face"), title: "Hugging Face", href: contact.huggingface, external: true }] : []),
    ...(contact.medium ? [{ ...linkLogo("Medium"), title: "Medium", href: contact.medium, external: true }] : []),
    ...(contact.googleScholar ? [{ ...linkLogo("Google Scholar"), title: "Google Scholar", href: contact.googleScholar, external: true }] : []),
    ...(contact.ieeeXplore ? [{ ...linkLogo("IEEE Xplore"), title: "IEEE Xplore", href: contact.ieeeXplore, external: true }] : []),
  ];
}

/** The CV PDF (download) and the /cv page. */
export function cvItems(locale: Locale): RoomLinkItem[] {
  const m = messages(locale);
  return [
    { title: m.drawer.rooms.cvPdf, href: cvPdfPath(getRoof().cv.fileName), external: true },
    { title: m.drawer.rooms.cvPage, href: "/cv" },
  ];
}

/** RF roof deck: the comms station and the CV kiosk. `RoofBody` (hud/drawer/RoofBody.tsx) renders both. */
export function buildRoofViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const roof = getRoof();
  const profile = getProfile();
  return chain([
    single({
      id: roomId("RF", "contact"),
      kind: "roof",
      title: m.hud.rooms.contact,
      subtitle: roof.availability[locale],
      meta: [profile.location[locale], profile.timezone],
      accent: "blue",
      sections: [{ title: m.drawer.rooms.channels, items: contactItems(locale) }],
      page: "/contact",
    }),
    single({
      id: roomId("RF", "cv"),
      kind: "roof",
      title: m.hud.rooms.cv,
      subtitle: m.contact.cvIntro,
      accent: "blue",
      sections: [{ title: m.drawer.rooms.downloads, items: cvItems(locale) }],
      page: "/cv",
    }),
  ]);
}
