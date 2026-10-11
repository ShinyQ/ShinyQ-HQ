import type { Publication } from "./schema";

/**
 * Paper preview modal data and citation formats. Pure and client-safe (type-only schema import):
 * the server builds a `PaperPreview` per paper (`buildPaperPreview` in `papers.ts`) and the modal
 * only renders it.
 */
export interface PaperCitations {
  apa: string;
  ieee: string;
  bibtex: string;
}

export interface PaperPreview {
  id: string;
  title: string;
  /** Localized kind label ("Paper", "Skripsi"). */
  kind: string;
  authors: string[];
  /** The owner's name, highlighted in the author list. */
  self: string;
  venue?: string;
  publisher?: string;
  year: number;
  /** Localized publication date (full date, month or year). */
  date: string;
  /** English abstract (owner decision: abstracts stay in English). */
  abstract?: string;
  /** Localized one-line summary, shown when there is no abstract. */
  summary?: string;
  doi?: string;
  /** DOI resolver or the publisher page. */
  url?: string;
  pdf?: string;
  code?: string;
  /** Google Scholar search for the exact title. */
  scholar: string;
  /** Localized citation count line with its source and date. */
  citationCount?: string;
  citations: PaperCitations;
}

/** Google Scholar search URL for the exact title (no per-paper Scholar IDs in the dataset). */
export function scholarSearchUrl(title: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${title}"`)}`;
}

interface NameParts {
  family: string;
  given: string[];
}

/** "Kurniadi Ahmad Wijaya" to family "Wijaya", given ["Kurniadi", "Ahmad"]. */
export function splitName(name: string): NameParts {
  const parts = name.trim().split(/\s+/);
  return { family: parts[parts.length - 1], given: parts.slice(0, -1) };
}

const initials = (given: readonly string[]) => given.map((g) => `${g[0].toUpperCase()}.`).join(" ");

function apaName(name: string): string {
  const { family, given } = splitName(name);
  return given.length ? `${family}, ${initials(given)}` : family;
}

function ieeeName(name: string): string {
  const { family, given } = splitName(name);
  return given.length ? `${initials(given)} ${family}` : family;
}

function joinList(items: readonly string[], conjunction: string, serialComma: boolean): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]}${serialComma && conjunction === "&" ? "," : ""} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

type EntryType = "inproceedings" | "article" | "thesis";

/** Conference papers cite as proceedings, theses as theses, everything else as articles. */
export function entryType(pub: Pick<Publication, "kind" | "venue">): EntryType {
  if (pub.kind === "thesis") return "thesis";
  return /conference|proceedings|symposium|workshop/i.test(pub.venue ?? "") && !/^eproceedings/i.test(pub.venue ?? "") ? "inproceedings" : "article";
}

const end = (text: string) => (/[.?!]$/.test(text) ? text : `${text}.`);
const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** APA 7 reference as plain text (titles kept in their published case). */
export function apaCitation(pub: Publication, self: string): string {
  const authors = pub.authors ?? [self];
  const names = joinList(authors.map(apaName), "&", true);
  const type = entryType(pub);
  const parts = [`${names} (${pub.year}).`, end(pub.title)];
  if (type === "inproceedings") parts.push(end(`In ${pub.venue}${pub.pages ? ` (pp. ${pub.pages})` : ""}`));
  else if (type === "thesis") parts.push(end(`[Bachelor's thesis, ${pub.venue ?? pub.publisher}]`));
  else if (pub.venue) parts.push(end(`${pub.venue}${pub.pages ? `, ${pub.pages}` : ""}`));
  if (pub.publisher && type !== "thesis" && pub.publisher !== pub.venue) parts.push(end(pub.publisher));
  const link = pub.doi ? doiUrl(pub.doi) : pub.url;
  if (link) parts.push(link);
  return parts.join(" ");
}

/** IEEE reference as plain text. */
export function ieeeCitation(pub: Publication, self: string): string {
  const authors = (pub.authors ?? [self]).map(ieeeName);
  const names = authors.length > 2 ? `${authors.slice(0, -1).join(", ")}, and ${authors[authors.length - 1]}` : authors.join(" and ");
  const type = entryType(pub);
  const where =
    type === "inproceedings"
      ? `in Proc. ${pub.venue}`
      : type === "thesis"
        ? `B.Sc. thesis, ${pub.venue ?? pub.publisher}`
        : (pub.venue ?? pub.publisher ?? "");
  const tail = [where, String(pub.year), pub.pages ? `pp. ${pub.pages}` : "", pub.doi ? `doi: ${pub.doi}` : ""].filter(Boolean).join(", ");
  return `${names}, "${pub.title}," ${end(tail)}`;
}

/** Stable BibTeX key: first author's family name, year and first title word ("fattahila2021indonesian"). */
export function bibtexKey(pub: Publication, self: string): string {
  const first = splitName((pub.authors ?? [self])[0]).family;
  const word = pub.title.split(/\s+/).find((w) => w.length > 3) ?? pub.title;
  const clean = (s: string) => s.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${clean(first)}${pub.year}${clean(word)}`;
}

const bibValue = (value: string) => `{${value.replace(/[{}]/g, "")}}`;

/** BibTeX entry; acronyms in the title are braced so styles keep their case. */
export function bibtexCitation(pub: Publication, self: string): string {
  const type = entryType(pub);
  const title = pub.title.replace(/\b([A-Z][A-Za-z]*[A-Z][A-Za-z0-9-]*)\b/g, "{$1}");
  const fields: [string, string | undefined][] = [
    ["title", `{${title}}`],
    ["author", bibValue((pub.authors ?? [self]).map((n) => {
      const { family, given } = splitName(n);
      return given.length ? `${family}, ${given.join(" ")}` : family;
    }).join(" and "))],
    [type === "inproceedings" ? "booktitle" : type === "thesis" ? "school" : "journal", pub.venue ? bibValue(pub.venue) : undefined],
    ["type", type === "thesis" ? "{Bachelor's thesis}" : undefined],
    ["publisher", pub.publisher && type !== "thesis" ? bibValue(pub.publisher) : undefined],
    ["year", `{${pub.year}}`],
    ["pages", pub.pages ? bibValue(pub.pages.replace("-", "--")) : undefined],
    ["doi", pub.doi ? bibValue(pub.doi) : undefined],
    ["url", !pub.doi && pub.url ? bibValue(pub.url) : undefined],
  ];
  const body = fields.filter((f): f is [string, string] => Boolean(f[1])).map(([k, v]) => `  ${k} = ${v}`);
  return `@${type}{${bibtexKey(pub, self)},\n${body.join(",\n")}\n}`;
}

export function citationsFor(pub: Publication, self: string): PaperCitations {
  return { apa: apaCitation(pub, self), ieee: ieeeCitation(pub, self), bibtex: bibtexCitation(pub, self) };
}
