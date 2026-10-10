import { getTranslations } from "next-intl/server";
import type { Locale } from "@/content/schema";
import { BootCard } from "./BootCard";

/**
 * SSR boot cover. Hidden unless the inline head script set `html[data-hq-boot]` (src/lib/boot-first.ts);
 * then it hides the Page View until the 3D HQ draws its first frame, and the boot overlay takes over.
 */
export async function BootCover({ locale, name, monogram }: { locale: Locale; name: string; monogram: string }) {
  const t = await getTranslations({ locale, namespace: "hud" });
  const lines = [t("bootLine1"), t("bootLine2"), t("bootLine3"), t("bootLine4", { name }), t("bootLine5"), t("bootLine6")];
  return (
    <div id="hq-boot-cover" data-testid="boot-cover" aria-hidden="true" className="hq-boot-cover">
      <BootCard
        eyebrow={t("bootEyebrow")}
        monogram={monogram}
        title={t("bootTitle")}
        lines={lines}
        shown={lines.length}
        stagger
        startLabel={t("bootStart")}
        skipLabel={t("skipIntro")}
        placeholder
      />
    </div>
  );
}
