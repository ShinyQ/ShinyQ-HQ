import { findBlocked } from "./checks";

/**
 * Scope heuristics for questions about Kurniadi's views (spec section 13). Questions about his
 * written professional perspective are in scope; personal topics and opinions about specific
 * people, employers or clients are declined here, before any model call, like harmful.ts (T15).
 * The prompt and every output check still apply to what passes. Bilingual and deterministic.
 */

const PERSPECTIVE: RegExp[] = [
  /\b(?:think|thinks|thought|opinions?|views?|perspectives?|principles?|philosophy|believes?|advice|advise|stance|preferences?|prefers?)\b/i,
  /\b(?:take on|what would (?:he|kurniadi)|in his (?:own )?words|coding style|working style|way of working|favou?rite (?:tools?|languages?|stack|frameworks?|editor))\b/i,
  /\bhow (?:does|would) (?:he|kurniadi) (?:approach|decide|handle|choose)\b/i,
  // "cara kerja" is left out on purpose: "Bagaimana cara kerja <project>?" asks how a system works.
  /\b(?:pendapat(?:nya)?|pandangan(?:nya)?|prinsip(?:nya)?|filosofi|saran(?:nya)?|nasihat|perspektif|menurut(?:nya)?|lebih suka|gaya kerja)\b/i,
  /\bbagaimana (?:dia|kurniadi) (?:memutuskan|menyikapi|memilih|mendekati)\b/i,
];

/** A question about Kurniadi's views, principles, preferences or advice (EN/ID). */
export function isPerspectiveQuestion(question: string): boolean {
  return PERSPECTIVE.some((re) => re.test(question));
}

/**
 * Questions about this site itself (ShinyQ HQ): its stack, 3D engine, hosting, the assistant and how
 * it was made (owner request 2026-10-15). They always retrieve the `site-build` chunk, and an answer
 * cites the public repository. Deliberately narrow: "his portfolio" or "a live site" of a project
 * are about his work, not about this site.
 */
const SITE: RegExp[] = [
  /\bshinyq[ -]?hq\b|\bagent hq\b/i,
  /\b(?:this|the|your) (?:3d |portfolio )?(?:site|website|web ?site|web ?app|tower|hq)\b(?! (?:of|for|on|in)\b)/i,
  /\b(?:this|your) (?:ai )?(?:chat ?bot|assistant)\b/i,
  /\b(?:built|made|created|developed|coded|designed|powered|powers) (?:you|this)\b|\b(?:are|were) you (?:built|made|created|powered)\b/i,
  /\bwhat (?:ai |llm |language )?models? (?:are you|do you|powers? you)\b/i,
  /\b(?:situs|website|web|portofolio|chatbot|asisten|menara) ini\b/i,
  /\b(?:kamu|anda) (?:dibuat|dibangun|memakai|menggunakan|pakai)\b|\bmodel (?:ai |llm )?apa (?:yang )?(?:kamu|anda)\b/i,
];

/** A question about this site or its assistant (EN/ID): how it was built, its stack, hosting or model. */
export function isSiteQuestion(question: string): boolean {
  return SITE.some((re) => re.test(question));
}

export type PrivateTopic = "family" | "health" | "religion" | "politics" | "pay" | "life";

const PRIVATE: [PrivateTopic, RegExp][] = [
  ["family", /\b(?:married|marriage|wife|husband|girlfriend|boyfriend|spouse|dating|divorced?|pacar(?:nya)?|istri(?:nya)?|suami(?:nya)?|menikah|nikah|cerai|keluarga(?:nya)?|anak(?:-anak)?nya|orang ?tua(?:nya)?)\b/i],
  ["family", /\b(?:his|kurniadi'?s) (?:kids|children|son|daughter|parents|mother|father|mom|dad|family|siblings?|brother|sister)\b/i],
  ["health", /\b(?:illness|sick|disease|diagnos\w*|disabilit\w*|mental health|depress\w*|anxiety|penyakit|kesehatan mental|disabilitas)\b|(?<!rumah )\bsakit\b/i],
  ["health", /\b(?:his|kurniadi'?s|dia|kurniadi)\b.{0,25}\b(?:health|kesehatan)\b/i],
  ["religion", /\b(?:religion|religious|pray(?:s|ing)?|church|mosque|muslim|christian|catholic|hindu|buddhist|atheist|islam|agama(?:nya)?|ibadah|sholat|shalat|salat|gereja|masjid|kristen|katolik|buddha|ateis|tuhan)\b/i],
  ["politics", /\b(?:politics|political|politician|elections?|vot(?:e|ed|es|ing) for|president|politik|pemilu|pilpres|presiden|partai|capres|coblos)\b/i],
  ["pay", /\b(?:salary|salaries|wages?|income|compensation|paycheck|net worth|hourly rate|day rate|rate card|gaji(?:nya)?|penghasilan(?:nya)?|pendapatan(?:nya)?|upah|bayaran|tarif(?:nya)?)\b/i],
  ["pay", /\bhow much (?:money )?(?:does|did|do|will|would) (?:he|kurniadi) (?:earn|make|charge|get paid)\b|\bberapa (?:dia |kurniadi )?dibayar\b/i],
  ["life", /\b(?:favou?rite (?:food|foods|movie|film|music|song|band|colou?r|sport|team|anime|game|drink)|makanan favorit|hobb(?:y|ies)|hobi(?:nya)?|home address|alamat rumah|alamat lengkap|how old|umur(?:nya)?|birthday|ulang tahun|tanggal lahir|date of birth|what car|mobil apa)\b/i],
];

/** The personal topic a question asks about, or null. These are declined without a model call. */
export function privateTopic(question: string): PrivateTopic | null {
  return PRIVATE.find(([, re]) => re.test(question))?.[0] ?? null;
}

const OPINION = /\b(?:think|thinks|thought|opinions?|views?|feels?|honest(?:ly)?|rate|likes?|liked|hates?|pendapat(?:nya)?|pandangan(?:nya)?|menurut(?:nya)?|pikir|suka|nilai|kesan(?:nya)?)\b/i;
const PEOPLE =
  /\b(?:his|your|kurniadi'?s) (?:(?:former|ex|old|current) )?(?:boss|manager|managers|colleagues?|co-?workers?|team ?mates?|lead|cto|ceo|clients?|customers?|employers?)\b|\bex-?(?:boss|employer|colleague)s?\b|\b(?:the|that|this) (?:\w+ )?(?:client|customer)\b|\b(?:atasan|bos|manajer|rekan kerja|klien|pelanggan|kantor lama)nya\b/i;

/** Names an org goes by in a question: the name before any parenthesis, plus a leading acronym ("MNC Group" also as "MNC"). */
export function orgAliases(orgs: readonly string[]): string[] {
  return [
    ...new Set(
      orgs.flatMap((org) => {
        const base = org.split(" (")[0].trim();
        const first = base.split(" ")[0];
        return /^[A-Z]{3,}$/.test(first) && first !== base ? [base, first] : [base];
      }),
    ),
  ];
}

/**
 * An opinion question about a specific person, employer, school or client (his manager, "Jenius",
 * "the bank client"). Kurniadi publishes no such opinions. The safety blocklist is never consulted
 * here (S6): a decline that fired only for blocklisted names would tell a visitor which guessed
 * names are on the list. Other names go to the model, and the output checks replace any answer
 * that names a blocklisted term.
 */
export function opinionAboutOthers(question: string, orgs: readonly string[]): boolean {
  if (!OPINION.test(question)) return false;
  return PEOPLE.test(question) || findBlocked(question, orgAliases(orgs)).length > 0;
}
