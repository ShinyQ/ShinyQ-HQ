"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { CertPreview } from "./CertPreview";
import { ISSUER_COLOR, ISSUER_LOGO, ISSUER_ORDER, featured, groupByIssuer, groupByYear, issuerGroup, shortName, sortCerts, type IssuerGroup, type ProtoCert, type ProtoStatus } from "./fixture";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (s: string) => `${MONTHS[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
const STATUS_LABEL: Record<ProtoStatus, string> = { earned: "Earned", "in-progress": "In progress", expired: "Expired" };
const STATUS_CLASS: Record<ProtoStatus, string> = { earned: "text-green", "in-progress": "text-amber", expired: "text-ink-3" };

const OpenCert = createContext<(cert: ProtoCert) => void>(() => {});

/** Every variant opens the same in-site preview instead of leaving the page. */
export function PreviewProvider({ children }: { children: ReactNode }) {
  const [cert, setCert] = useState<ProtoCert | null>(null);
  return (
    <OpenCert.Provider value={setCert}>
      {children}
      <CertPreview cert={cert} onClose={() => setCert(null)} />
    </OpenCert.Provider>
  );
}

function IssuerMark({ issuer, size = 20 }: { issuer: IssuerGroup; size?: number }) {
  const logo = ISSUER_LOGO[issuer];
  if (logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span aria-hidden="true" className="grid shrink-0 place-items-center rounded-[5px] border border-line-2 font-mono text-[10px] text-ink-2" style={{ width: size, height: size }}>
      {issuer.slice(0, 1)}
    </span>
  );
}

function StatusTag({ status }: { status: ProtoStatus }) {
  return <span className={`pv-mark pv-data ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}

/* ------------------------------------------------------------- A: gallery */

function GalleryCard({ cert }: { cert: ProtoCert }) {
  const muted = cert.status === "expired";
  const body = (
    <>
      <span className={`block pv-num leading-none ${cert.code ? "text-[26px]" : "text-[18px] text-ink-2"} ${muted ? "text-ink-3" : ""}`}>{cert.code ?? cert.issuer}</span>
      <span className={`block mt-3 line-clamp-2 text-[15px] leading-snug ${muted ? "text-ink-3" : "text-ink"}`}>{shortName(cert.name)}</span>
      <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4">
        <span className="pv-data">{ym(cert.issued)}</span>
        {cert.status !== "earned" && <StatusTag status={cert.status} />}
      </span>
    </>
  );
  const open = useContext(OpenCert);
  return (
    <button type="button" onClick={() => open(cert)} aria-haspopup="dialog" className="card flex h-full min-h-[148px] w-full flex-col p-4 text-left transition hover:border-line-2">
      {body}
    </button>
  );
}

export function GalleryVariant({ certs }: { certs: ProtoCert[] }) {
  const groups = groupByIssuer(certs);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const LIMIT = 6;
  return (
    <div className="grid gap-10">
      <p className="pv-small">
        {certs.length} certifications from {groups.length} issuers
      </p>
      {groups.map(({ issuer, certs: list }) => {
        const shown = open[issuer] ? list : list.slice(0, LIMIT);
        return (
          <section key={issuer} aria-labelledby={`issuer-${issuer}`}>
            <header className="mb-4 flex items-center gap-3 border-b border-line pb-3">
              <IssuerMark issuer={issuer} size={24} />
              <h3 id={`issuer-${issuer}`} className="pv-h3">
                {issuer}
              </h3>
              <span className="chip-count ml-auto">{list.length}</span>
            </header>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {shown.map((cert) => (
                <li key={cert.id}>
                  <GalleryCard cert={cert} />
                </li>
              ))}
            </ul>
            {list.length > LIMIT && (
              <button type="button" className="pv-go mt-4 min-h-11" aria-expanded={Boolean(open[issuer])} onClick={() => setOpen((o) => ({ ...o, [issuer]: !o[issuer] }))}>
                {open[issuer] ? "Show fewer" : `Show all ${list.length} ${issuer}`}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ B: timeline */

function CompactBadge({ cert }: { cert: ProtoCert }) {
  const group = issuerGroup(cert.issuer);
  const inner = (
    <>
      <IssuerMark issuer={group} size={16} />
      {cert.code && <span className="shrink-0 font-mono text-[12px] font-bold whitespace-nowrap text-ink">{cert.code}</span>}
      <span className={`min-w-0 truncate ${cert.status === "expired" ? "text-ink-3 line-through decoration-ink-3/60" : "text-ink-2"}`}>{shortName(cert.name)}</span>
      {cert.status === "in-progress" && <span className="size-1.5 shrink-0 rounded-full bg-amber" aria-label="In progress" />}
    </>
  );
  const open = useContext(OpenCert);
  return (
    <button type="button" onClick={() => open(cert)} aria-haspopup="dialog" title={cert.name} className="flex min-h-11 max-w-full min-w-0 items-center gap-2 rounded-[10px] border border-line bg-surface px-3 text-left text-[13px] transition hover:border-line-2">
      {inner}
    </button>
  );
}

export function TimelineVariant({ certs }: { certs: ProtoCert[] }) {
  const years = groupByYear(certs);
  return (
    <ol className="relative grid grid-cols-[minmax(0,1fr)] gap-0 border-l border-line pl-6 md:pl-0 md:border-l-0">
      {years.map(({ year, certs: list }) => (
        <li key={year} className="relative grid grid-cols-[minmax(0,1fr)] gap-3 border-b border-line py-5 md:grid-cols-[96px_minmax(0,1fr)] md:gap-6">
          <span aria-hidden="true" className="absolute top-7 -left-[29px] size-2 rounded-full bg-cyan md:hidden" />
          <div className="flex items-baseline gap-3 md:block">
            <h3 className="pv-num text-[28px] leading-none">{year}</h3>
            <p className="pv-data md:mt-2">{list.length} certs</p>
          </div>
          <ul className="flex min-w-0 flex-wrap gap-2">
            {list.map((cert) => (
              <li key={cert.id} className="max-w-full">
                <CompactBadge cert={cert} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/* ---------------------------------------------------- C: featured + grid */

function FeaturedCard({ cert, compact }: { cert: ProtoCert; compact: boolean }) {
  const group = issuerGroup(cert.issuer);
  const open = useContext(OpenCert);
  return (
    <button type="button" onClick={() => open(cert)} aria-haspopup="dialog" className={`card relative flex w-full flex-col overflow-hidden text-left ${compact ? "min-h-[150px] p-3" : "min-h-[210px] p-5"} transition hover:bg-surface-2`} style={{ borderColor: `${ISSUER_COLOR[group]}55` }}>
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5" style={{ background: ISSUER_COLOR[group] }} />
      <span className="flex items-center gap-2">
        <IssuerMark issuer={group} size={20} />
        {!compact && <span className="pv-data">{cert.issuer}</span>}
      </span>
      <span className={`block pv-num leading-none ${compact ? "mt-3 text-[24px]" : "mt-4 text-[40px]"}`}>{cert.code}</span>
      <span className={`mt-3 leading-snug text-ink ${compact ? "line-clamp-3 text-[12px]" : "text-[15px]"}`}>{shortName(cert.name)}</span>
      <span className="mt-auto flex items-center justify-between pt-4">
        <span className="pv-data">{ym(cert.issued)}</span>
        {!compact && <span className="text-sm text-ink-2">Details</span>}
      </span>
    </button>
  );
}

export function FeaturedVariant({ certs, compact = false }: { certs: ProtoCert[]; compact?: boolean }) {
  const top = featured(certs);
  const rest = sortCerts(certs.filter((x) => !top.includes(x)));
  const [issuer, setIssuer] = useState<IssuerGroup | "all">("all");
  const [status, setStatus] = useState<ProtoStatus | "all">("all");
  const [q, setQ] = useState("");
  const counts = Object.fromEntries(ISSUER_ORDER.map((g) => [g, rest.filter((x) => issuerGroup(x.issuer) === g).length]));
  const shown = rest.filter(
    (x) =>
      (issuer === "all" || issuerGroup(x.issuer) === issuer) &&
      (status === "all" || x.status === status) &&
      (!q || `${x.code ?? ""} ${x.name} ${x.issuer}`.toLowerCase().includes(q.toLowerCase())),
  );
  const many = rest.length > 8;
  const open = useContext(OpenCert);
  return (
    <div className="grid gap-8">
      <ul className={`grid gap-3 ${compact ? "grid-cols-3" : "md:grid-cols-3"}`}>
        {top.map((cert) => (
          <li key={cert.id}>
            <FeaturedCard cert={cert} compact={compact} />
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <div>
          {many && (
            <div className="mb-4 grid gap-3">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Issuer">
                <button type="button" className="chip" aria-pressed={issuer === "all"} onClick={() => setIssuer("all")}>
                  All <span className="chip-count">{rest.length}</span>
                </button>
                {ISSUER_ORDER.filter((g) => counts[g]).map((g) => (
                  <button key={g} type="button" className="chip" aria-pressed={issuer === g} onClick={() => setIssuer(g)}>
                    <IssuerMark issuer={g} size={14} />
                    {g} <span className="chip-count">{counts[g]}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search code or name"
                  aria-label="Search certifications"
                  className="min-h-9 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-[13px] text-ink placeholder:text-ink-3"
                />
                <select className="pv-select" value={status} onChange={(e) => setStatus(e.target.value as ProtoStatus | "all")} aria-label="Status">
                  <option value="all">Any status</option>
                  <option value="earned">Earned</option>
                  <option value="in-progress">In progress</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              <p className="pv-data" aria-live="polite">
                Showing {shown.length} of {rest.length}
              </p>
            </div>
          )}
          <ul className={compact ? "grid" : "grid gap-x-6 sm:grid-cols-2"}>
            {shown.map((cert) => (
              <li key={cert.id} className="relative grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 border-b border-line py-2.5 hover:bg-surface">
                <span className={`truncate font-mono text-[13px] font-bold ${cert.status === "expired" ? "text-ink-3" : "text-ink"}`}>{cert.code ?? cert.issuer.split(" ")[0]}</span>
                <span className="min-w-0">
                  <button type="button" onClick={() => open(cert)} aria-haspopup="dialog" className="pv-stretch block w-full truncate text-left text-[14px] text-ink-2" title={cert.name}>
                    {shortName(cert.name)}
                  </button>
                  <span className="pv-data flex items-center gap-2">
                    <IssuerMark issuer={issuerGroup(cert.issuer)} size={12} /> {ym(cert.issued)}
                    {cert.status !== "earned" && <StatusTag status={cert.status} />}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
