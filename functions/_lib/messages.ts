import { citeKind, isAskCite, type AskCiteKind, type AskLocale } from "../../src/ask/protocol";

/** Canned answers (EN/ID). These never repeat the visitor's text and are never cached. */
export const MESSAGES = {
  unknown: {
    en: "That information is not available on this site. Try asking about Kurniadi's projects, work experience or writing.",
    id: "Informasi itu belum tersedia di situs ini. Coba tanyakan proyek, pengalaman kerja, atau tulisan Kurniadi.",
  },
  decline: {
    en: "This assistant can only answer questions about Kurniadi and his work. Try asking about his projects, career or skills.",
    id: "Asisten ini hanya bisa menjawab pertanyaan tentang Kurniadi dan pekerjaannya. Coba tanyakan proyek, karier, atau keahliannya.",
  },
  restricted: {
    en: "This assistant can't share client names or private details. Projects for clients are described by sector on this site.",
    id: "Asisten ini tidak bisa menyebutkan nama klien atau detail pribadi. Proyek untuk klien dijelaskan berdasarkan sektornya di situs ini.",
  },
  fallback: {
    en: "A reliable answer is not available right now. Press Cmd-K (Ctrl-K) to search the site, or browse the Work and Journey pages.",
    id: "Jawaban yang andal belum tersedia sekarang. Tekan Cmd-K (Ctrl-K) untuk mencari di situs, atau buka halaman Karya dan Perjalanan.",
  },
  private: {
    en: "This assistant only covers Kurniadi's professional work. Personal topics such as family, health, religion, politics and pay are not on this site.",
    id: "Asisten ini hanya membahas sisi profesional Kurniadi. Topik pribadi seperti keluarga, kesehatan, agama, politik, dan penghasilan tidak ada di situs ini.",
  },
  others: {
    en: "This assistant can't share opinions about specific people, employers or clients. Try asking about Kurniadi's principles or the work he did.",
    id: "Asisten ini tidak bisa membagikan pendapat tentang orang, pemberi kerja, atau klien tertentu. Coba tanyakan prinsip kerja Kurniadi atau pekerjaan yang dia lakukan.",
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
};
const CLOSEST: Record<AskLocale, string> = { en: "The closest written source is", id: "Tulisan yang paling terkait adalah" };
const NO_SOURCE_HINT: Record<AskLocale, string> = { en: "Read about his working approach on the About page.", id: "Cara kerjanya bisa dibaca di halaman Tentang." };

/**
 * The answer for a view Kurniadi never wrote down (spec section 13): says so and points to the
 * closest thing he did write (owner-written title and where it lives). Never repeats the question.
 */
export function noViewMessage(locale: AskLocale, closest?: { title: string; url: string }): string {
  const base = MESSAGES.noView[locale];
  if (!closest || !isAskCite(closest.url)) return `${base} ${NO_SOURCE_HINT[locale]}`;
  const title = closest.title.replace(/["\u201C\u201D]/g, "").trim().slice(0, 120);
  return `${base} ${CLOSEST[locale]} "${title}", ${WHERE[citeKind(closest.url)][locale]}.`;
}
