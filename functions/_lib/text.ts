/**
 * Text helpers shared by the knowledge pack builder (scripts/build-knowledge.ts, at build time)
 * and the Ask the HQ Function (at request time). Pure, no platform APIs.
 */

/** C0/C1 controls except tab and newline, zero-width characters, bidi controls and the BOM. */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;

/** NFKC, invisible and control characters removed, whitespace collapsed. Applied to every untrusted string. */
export function cleanText(text: string): string {
  return text.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}

/**
 * Model answers (gpt-oss especially) use typographic dashes. Hyphen variants and the minus sign become "-",
 * an en dash between digits closes up ("2019-2021"), and an em dash or horizontal bar becomes a comma.
 */
export function normalizeDashes(text: string): string {
  return text
    .replace(/[\u2010-\u2012\u2212]/g, "-")
    .replace(/(\d)[ \t]*\u2013[ \t]*(?=\d)/g, "$1-")
    .replace(/\u2013/g, "-")
    .replace(/(^|\n)[ \t]*[\u2014\u2015]+[ \t]*/g, "$1")
    .replace(/[ \t]*[\u2014\u2015]+[ \t]*(?=\n|$)/g, "")
    .replace(/[ \t]*,?[ \t]*[\u2014\u2015]+[ \t]*(?:,[ \t]*)?/g, ", ");
}

/** Lowercase, punctuation stripped, whitespace collapsed: the cache key form of a question. */
export function normalizeQuestion(text: string): string {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(
  (
    "the a an of and or to in on for is was were what which who whom how his he him did does do done with at by from it its be are " +
    "this that these those about tell me you your can could would should will i my we our any some has have had there their " +
    "yang dan di ke dari apa dia ia siapa bagaimana berapa saja untuk dengan itu ini ada adalah atau juga sudah pernah " +
    "kah nya beliau tentang kepada oleh pada akan bisa tolong ceritakan sebutkan jelaskan"
  ).split(" "),
);

/**
 * EN/ID synonyms folded onto one canonical term, so "kuliah", "university" and "study" all hit
 * the education chunk (benchmark q11). Keys and values are lowercase single tokens.
 */
export const SYNONYMS: Record<string, string> = {
  study: "education",
  studied: "education",
  studies: "education",
  university: "education",
  universitas: "education",
  college: "education",
  degree: "education",
  bachelor: "education",
  graduate: "education",
  graduated: "education",
  school: "education",
  kuliah: "education",
  pendidikan: "education",
  kampus: "education",
  sarjana: "education",
  lulus: "education",
  skripsi: "thesis",
  work: "career",
  works: "career",
  worked: "career",
  working: "career",
  job: "career",
  jobs: "career",
  employer: "career",
  employers: "career",
  company: "career",
  companies: "career",
  experience: "career",
  role: "career",
  roles: "career",
  kerja: "career",
  bekerja: "career",
  pekerjaan: "career",
  pengalaman: "career",
  perusahaan: "career",
  kantor: "career",
  contact: "contact",
  email: "contact",
  reach: "contact",
  hire: "contact",
  hubungi: "contact",
  menghubungi: "contact",
  kontak: "contact",
  surel: "contact",
  certification: "certification",
  certifications: "certification",
  certified: "certification",
  certificate: "certification",
  certificates: "certification",
  sertifikasi: "certification",
  sertifikat: "certification",
  project: "project",
  projects: "project",
  proyek: "project",
  projek: "project",
  built: "project",
  build: "project",
  building: "project",
  membangun: "project",
  skill: "skill",
  skills: "skill",
  stack: "skill",
  tech: "skill",
  technologies: "skill",
  keahlian: "skill",
  kemampuan: "skill",
  teknologi: "skill",
  award: "award",
  awards: "award",
  competition: "award",
  competitions: "award",
  won: "award",
  hackathon: "award",
  juara: "award",
  lomba: "award",
  kompetisi: "award",
  prestasi: "award",
  penghargaan: "award",
  post: "writing",
  posts: "writing",
  blog: "writing",
  article: "writing",
  articles: "writing",
  wrote: "writing",
  writing: "writing",
  tulisan: "writing",
  artikel: "writing",
  menulis: "writing",
  paper: "research",
  papers: "research",
  publication: "research",
  publications: "research",
  research: "research",
  penelitian: "research",
  publikasi: "research",
  riset: "research",
  now: "now",
  currently: "now",
  current: "now",
  today: "now",
  sekarang: "now",
  saat: "now",
  kini: "now",
  available: "now",
  availability: "now",
  fraud: "fraud",
  penipuan: "fraud",
  suara: "voice",
  latency: "latency",
  latensi: "latency",
  result: "results",
  results: "results",
  hasil: "results",
  impact: "results",
  dampak: "results",
  stats: "stats",
  statistics: "stats",
  contributions: "stats",
  kontribusi: "stats",
  // Questions about his views (spec section 13).
  think: "perspective",
  thinks: "perspective",
  opinion: "perspective",
  opinions: "perspective",
  view: "perspective",
  views: "perspective",
  perspectives: "perspective",
  principle: "perspective",
  principles: "perspective",
  philosophy: "perspective",
  believe: "perspective",
  believes: "perspective",
  advice: "perspective",
  stance: "perspective",
  pendapat: "perspective",
  pendapatnya: "perspective",
  pandangan: "perspective",
  pandangannya: "perspective",
  prinsip: "perspective",
  prinsipnya: "perspective",
  filosofi: "perspective",
  saran: "perspective",
  nasihat: "perspective",
  perspektif: "perspective",
  // Words visitors use for their own projects (lead intent, 2026-10-15), folded onto the pack's words.
  chatbot: "assistant",
  chatbots: "assistant",
  asisten: "assistant",
  clinic: "medical",
  clinics: "medical",
  klinik: "medical",
  hospital: "medical",
  healthcare: "medical",
  medis: "medical",
  dokumen: "documents",
  document: "documents",
  deteksi: "detection",
  pembayaran: "payment",
  payments: "payment",
  tiket: "ticketing",
  tickets: "ticketing",
  ticket: "ticketing",
  // EN/ID topic words of the answerable routes (owner decision 2026-10-24).
  politik: "policy",
  political: "policy",
  politics: "policy",
  kebijakan: "policy",
  policies: "policy",
  regulasi: "regulation",
  hobi: "hobbies",
  hobinya: "hobbies",
  hobby: "hobbies",
  umur: "age",
  usia: "age",
  introvert: "personality",
  extrovert: "personality",
  introver: "personality",
  ekstrover: "personality",
  kepribadian: "personality",
  kepribadiannya: "personality",
  reliable: "reliability",
  reliabilitas: "reliability",
  keandalan: "reliability",
  andal: "reliability",
};

/** Lowercase word tokens without stopwords. Numbers are kept (metrics, years, cert codes). */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) ?? [])
    .flatMap((word) => (word.includes("-") ? [word, ...word.split("-")] : [word]))
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

/** Tokens plus their canonical synonyms (for queries and chunk keywords). */
export function expandTokens(tokens: readonly string[]): string[] {
  const out = [...tokens];
  for (const token of tokens) {
    const canonical = SYNONYMS[token];
    if (canonical && canonical !== token) out.push(canonical);
  }
  return out;
}

const ID_HINTS = new Set(
  "yang dan dia apa siapa bagaimana berapa saja untuk dengan itu ini ada adalah saya kamu anda nya kah apakah dimana di mana kapan sekarang pernah sudah bekerja kerja proyek pengalaman tolong ceritakan sebutkan jelaskan hubungi kuliah pendidikan sertifikasi".split(
    " ",
  ),
);

/** Language of a question: "id" when it reads as Indonesian, else the UI locale. */
export function detectLocale(text: string, fallback: "en" | "id"): "en" | "id" {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length === 0) return fallback;
  const hits = words.filter((w) => ID_HINTS.has(w)).length;
  if (hits >= 2 || (words.length <= 4 && hits >= 1)) return "id";
  const enHits = words.filter((w) => ["what", "who", "where", "when", "how", "does", "did", "is", "the", "his", "he"].includes(w)).length;
  if (enHits >= 1) return "en";
  return fallback;
}

/** Sentences that read like instructions to a model: dropped from pack text and refused in perspectives (T2). */
const INSTRUCTION_LIKE = [
  /\bignore\b[^.]{0,40}\b(previous|prior|above|earlier)\b[^.]{0,20}\b(instructions?|rules?|prompts?)\b/i,
  /(^|\s)(system|assistant|developer)\s*:/i,
  /\byou are (now )?(an?|the) (ai|assistant|model|chatbot|llm)\b/i,
  /\b(abaikan|lupakan)\b[^.]{0,40}\b(instruksi|aturan|perintah)\b/i,
];

export function isInstructionLike(sentence: string): boolean {
  return INSTRUCTION_LIKE.some((re) => re.test(sentence));
}
