import { citeKind, isAskCite, type AskCiteKind, type AskLocale } from "../../src/ask/protocol";

/** Canned answers (EN/ID), in Rover's voice where they speak for the assistant (2026-10-19). These never repeat the visitor's text and are never cached. */
export const MESSAGES = {
  unknown: {
    en: "I don't have that information on this site. Try asking about Kurniadi's projects, work experience or writing.",
    id: "Informasi itu belum tersedia di situs ini. Coba tanyakan proyek, pengalaman kerja, atau tulisan Kurniadi.",
  },
  decline: {
    en: "I only answer questions about Kurniadi: his projects, skills, career, writing, availability, this site and his written views, plus what his work shows on related engineering questions. Try asking about one of those.",
    id: "Saya hanya menjawab pertanyaan tentang Kurniadi: proyek, keahlian, karier, tulisan, ketersediaan, situs ini, dan pandangan tertulisnya, serta pelajaran dari karyanya untuk pertanyaan engineering terkait. Coba tanyakan salah satunya.",
  },
  restricted: {
    en: "I can't share client names or private details. Projects for clients are described by sector on this site.",
    id: "Saya tidak bisa menyebutkan nama klien atau detail pribadi. Proyek untuk klien dijelaskan berdasarkan sektornya di situs ini.",
  },
  fallback: {
    en: "A reliable answer is not available right now. Search with Cmd-K or Ctrl-K, or browse the Work and Journey pages.",
    id: "Jawaban yang bisa diandalkan belum tersedia saat ini. Cari lewat Cmd-K atau Ctrl-K, atau buka halaman Karya dan Perjalanan.",
  },
  private: {
    en: "I only cover Kurniadi's work and the views he has written down. Personal topics such as family, relationships, health, religion, partisan politics and pay are not on this site.",
    id: "Saya hanya membahas pekerjaan Kurniadi dan pandangan yang dia tuliskan. Topik pribadi seperti keluarga, hubungan, kesehatan, agama, politik partisan, dan penghasilan tidak ada di situs ini.",
  },
  others: {
    en: "I can't share opinions about specific people, employers or clients. Try asking about Kurniadi's principles or the work he did.",
    id: "Saya tidak bisa membagikan pendapat tentang orang, pemberi kerja, atau klien tertentu. Coba tanyakan prinsip kerja Kurniadi atau pekerjaan yang dia lakukan.",
  },
  // "What can you do?" (owner request 2026-10-15) and "Who are you?": fixed, no model call, Rover introduces itself (2026-10-19). Also the scope a decline points back to.
  capabilities: {
    en: "I'm Rover, the guide robot of ShinyQ HQ, and I answer questions about Kurniadi Ahmad Wijaya's projects, skills, career, writing, availability, this site and his written views, in English or Indonesian, with links to the source on this site. I don't cover his private life, partisan politics, religion, pay or opinions about other people, and I don't write code or answer general questions.",
    id: "Saya Rover, robot pemandu ShinyQ HQ, dan saya menjawab pertanyaan tentang proyek, keahlian, karier, tulisan, ketersediaan, dan pandangan tertulis Kurniadi Ahmad Wijaya serta situs ini, dalam bahasa Inggris atau Indonesia, dengan tautan ke sumbernya di situs ini. Saya tidak membahas kehidupan pribadi, politik partisan, agama, penghasilan, atau pendapat tentang orang lain, dan tidak menulis kode atau menjawab pertanyaan umum.",
  },
  // Lead intent when the model's answer cannot be shown (failed checks, a fit claimed without a match, a model refusal).
  lead: {
    en: "Kurniadi considers freelance and part-time software and AI engineering projects alongside his full-time role, subject to capacity. Send a short message describing the project to discuss fit; his contact details are below.",
    id: "Kurniadi mempertimbangkan proyek freelance dan pekerjaan paruh waktu di bidang software dan AI engineering sesuai kapasitas di luar pekerjaan penuh waktu. Kirim pesan singkat tentang proyeknya untuk membahas kecocokan; detail kontaknya ada di bawah.",
  },
  // Lead intent that asks for a price or a rate: no numbers, contact instead.
  leadRates: {
    en: "Rates and timelines are not published on this site; they depend on scope and available capacity alongside Kurniadi's full-time role. Send a short message describing the freelance or part-time project to discuss it; his contact details are below.",
    id: "Tarif dan estimasi waktu tidak dicantumkan di situs ini. Keduanya bergantung pada lingkup pekerjaan dan kapasitas di luar pekerjaan penuh waktu Kurniadi. Kirim pesan singkat tentang proyek freelance atau paruh waktunya untuk dibahas; detail kontaknya ada di bawah.",
  },
  // A request to speak as Kurniadi or anyone else, or to take another persona (owner decision 2026-10-19).
  persona: {
    en: "I'm Rover, so I can't speak for Kurniadi or take on another persona; I only talk about him in the third person. Ask about his work and I'll answer from this site.",
    id: "Saya Rover, jadi saya tidak bisa berbicara mewakili Kurniadi atau berperan sebagai orang lain; saya hanya membahasnya sebagai orang ketiga. Tanyakan tentang karyanya dan saya jawab dari isi situs ini.",
  },
  noView: {
    en: "Kurniadi hasn't shared a written view on that on this site.",
    id: "Kurniadi belum membagikan pandangan tertulis tentang hal itu di situs ini.",
  },
} as const satisfies Record<string, Record<AskLocale, string>>;

export type CannedKind = keyof typeof MESSAGES;

export function canned(kind: CannedKind, locale: AskLocale): string {
  return MESSAGES[kind][locale];
}

const WHERE: Record<AskCiteKind, Record<AskLocale, string>> = {
  how: { en: "on the About page", id: "di halaman Tentang" },
  blog: { en: "on his blog", id: "di blognya" },
  project: { en: "in a project case study", id: "di studi kasus proyek" },
  library: { en: "on the Writing page", id: "di halaman Tulisan" },
  build: { en: "on the How this site was built page", id: "di halaman Cara situs ini dibuat" },
  repo: { en: "in the site's public repository", id: "di repositori publik situs ini" },
};
const CLOSEST: Record<AskLocale, string> = { en: "The closest written source is", id: "Tulisan yang paling terkait adalah" };
/** No relevant written source (owner decision 2026-10-19): suggest topics Rover covers instead of naming an unrelated title. */
const NO_SOURCE_HINT: Record<AskLocale, string> = {
  en: "Try asking about his AI projects, how he takes AI to production, or his career.",
  id: "Coba tanyakan proyek AI-nya, cara dia membawa AI ke produksi, atau kariernya.",
};

/**
 * The answer for a view Kurniadi never wrote down (spec section 13): says so and points to the closest thing he did
 * write when it is about the question's topic (`relevantClosest`), else suggests topics. Never repeats the question.
 */
export function noViewMessage(locale: AskLocale, closest?: { title: string; url: string }): string {
  const base = MESSAGES.noView[locale];
  if (!closest || !isAskCite(closest.url)) return `${base} ${NO_SOURCE_HINT[locale]}`;
  const title = closest.title.replace(/["\u201C\u201D]/g, "").trim().slice(0, 120);
  return `${base} ${CLOSEST[locale]} "${title}", ${WHERE[citeKind(closest.url)][locale]}.`;
}
