import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { BootCard, bootQuickLinks, type BootWho } from "./BootCard";

/**
 * SSR boot cover. Hidden unless the inline head script set `html[data-hq-boot]` (src/lib/boot-first.ts);
 * then it hides the Page View until the 3D HQ draws its first frame, and the boot overlay takes over.
 * It names the owner at first paint and offers the Page View (a real link, works before any JS).
 */
export async function BootCover({ locale, who }: { locale: Locale; who: BootWho }) {
  const t = await getTranslations({ locale, namespace: "hud" });
  const tc = await getTranslations({ locale, namespace: "common" });
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name: who.name }), t("bootLine5"), t("bootLine6")];
  return (
    <div id="hq-boot-cover" data-testid="boot-cover" className="hq-boot-cover">
      <BootCard
        eyebrow={t("bootEyebrow")}
        title={t("bootTitle")}
        lines={lines}
        shown={lines.length}
        stagger
        startLabel={t("bootStart")}
        placeholder
        who={who}
        pageView={{ href: "?view=classic", label: t("pageView"), hint: t("pageViewHint") }}
        quick={bootQuickLinks(locale, tc("viewCv"), t("bootContact"))}
      />
    </div>
  );
}
