"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { ExperienceData, GpuTier } from "../../types";

const CertsWorld = dynamic(() => import("./CertsWorld"), { ssr: false });

/** Mounts the 3D wall over the page when the query asks for it: ?view=3d&n=7|30&tier=lite|full. */
function CertsDev({ data, sets }: { data: ExperienceData; sets: Record<"live" | "fixture", ExperienceData["certifications"]> }) {
  const t = useTranslations("certs");
  const tHome = useTranslations("home");
  const [q] = useState(() => new URLSearchParams(window.location.search));
  if (q.get("view") !== "3d") return null;
  const certs = q.get("n") === "30" ? sets.fixture : sets.live;
  const tier: GpuTier = q.get("tier") === "full" ? "full" : "lite";
  const labels = { title: tHome("certsTitle"), all: t("wall.all"), other: t("wall.other"), inProgress: t("status.in-progress"), expired: t("status.expired") };
  return <CertsWorld data={data} certs={certs} labels={labels} tier={tier} mobile={window.innerWidth < 768} />;
}

export const CertsDevLoader = dynamic(() => Promise.resolve(CertsDev), { ssr: false });
