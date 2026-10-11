"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { SectionSplit } from "@/components/page/Layout";
import type { ExperienceData, GpuTier } from "../../types";
import { protoCerts } from "./fixture";
import { FeaturedVariant, GalleryVariant, PreviewProvider, TimelineVariant } from "./PageVariants";
import type { Variant } from "./World3D";

const CertsWorld = dynamic(() => import("./World3D"), { ssr: false });

const TITLES: Record<Variant, string> = { a: "A: Badge gallery by issuer", b: "B: Timeline strip by year", c: "C: Featured + filterable grid" };

interface Params {
  v: Variant;
  n: number;
  view: "page" | "3d";
  tier: GpuTier;
  clean: boolean;
  still: boolean;
}

function read(): Params {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("v");
  return {
    v: v === "b" || v === "c" ? v : "a",
    n: Math.max(1, Math.min(30, Number(q.get("n")) || 30)),
    view: q.get("view") === "3d" ? "3d" : "page",
    tier: q.get("tier") === "full" ? "full" : "lite",
    clean: q.get("clean") === "1",
    still: q.get("still") === "1",
  };
}

/** Dev-only certification layout prototype: ?v=a|b|c&n=7|30&view=page|3d&tier=lite|full&clean=1. */
export function CertsProto({ data }: { data: ExperienceData }) {
  const [p, setP] = useState<Params | null>(null);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setP(read());
    setMobile(window.innerWidth < 768);
  }, []);
  if (!p) return null;
  const certs = protoCerts(p.n);
  if (p.view === "3d") return <CertsWorld data={data} certs={certs} variant={p.v} tier={p.tier} mobile={mobile} still={p.still} />;
  return (
    <div data-testid="certs-page">
      {!p.clean && (
        <p className="pv-wrap pv-data pt-6 text-amber">
          Prototype {TITLES[p.v]} · {certs.length} certifications
        </p>
      )}
      <SectionSplit id="certifications" title="Certifications" intro={p.clean ? undefined : TITLES[p.v]}>
        <PreviewProvider>
          {p.v === "a" && <GalleryVariant certs={certs} />}
          {p.v === "b" && <TimelineVariant certs={certs} />}
          {p.v === "c" && <FeaturedVariant certs={certs} />}
        </PreviewProvider>
      </SectionSplit>
    </div>
  );
}
