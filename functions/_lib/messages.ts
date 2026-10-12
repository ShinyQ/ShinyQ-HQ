import { citeKind, isAskCite, type AskCiteKind, type AskLocale } from "../../src/ask/protocol";

/** Canned answers (EN/ID). These never repeat the visitor's text and are never cached. */
export const MESSAGES = {
  unknown: {
    en: "I don't have that information on this site. You can ask about Kurniadi's projects, roles, skills or writing.",
    id: "Saya tidak memiliki informasi itu di situs ini. Kamu bisa bertanya tentang proyek, peran, keahlian, atau tulisan Kurniadi.",
  },
  decline: {
    en: "I can only answer questions about Kurniadi and his work. Try asking about his projects, career or skills.",
    id: "Saya hanya bisa menjawab pertanyaan tentang Kurniadi dan pekerjaannya. Coba tanyakan proyek, karier, atau keahliannya.",
  },
  restricted: {
    en: "I can't share client names or private details. Projects for clients are described by sector on this site.",
    id: "Saya tidak bisa menyebutkan nama klien atau detail pribadi. Proyek untuk klien dijelaskan berdasarkan sektornya di situs ini.",
  },
  fallback: {
    en: "I can't answer that reliably right now. Press Cmd-K (Ctrl-K) to search the site, or browse the Work and Journey pages.",
    id: "Saya belum bisa menjawab itu dengan andal sekarang. Tekan Cmd-K (Ctrl-K) untuk mencari di situs, atau buka halaman Work dan Journey.",
  },
  private: {
    en: "I only cover Kurniadi's professional side. Personal topics such as family, health, religion, politics and pay are not on this site.",
    id: "Saya hanya membahas sisi profesional Kurniadi. Topik pribadi seperti keluarga, kesehatan, agama, politik, dan penghasilan tidak ada di situs ini.",
  },
  others: {
    en: "I can't share opinions about specific people, employers or clients. You can ask about Kurniadi's principles or the work he did.",
    id: "Saya tidak bisa membagikan pendapat tentang orang, pemberi kerja, atau klien tertentu. Kamu bisa bertanya tentang prinsip kerja Kurniadi atau pekerjaan yang dia lakukan.",
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
  perspective: { en: "in Perspectives on the About page", id: "di bagian Perspektif pada halaman About" },
  how: { en: "on the About page", id: "di halaman About" },
  blog: { en: "on his blog", id: "di blognya" },
  library: { en: "in the Library", id: "di halaman Library" },
};
const CLOSEST: Record<AskLocale, string> = { en: "The closest thing he wrote is", id: "Tulisan terdekat darinya adalah" };
const NO_SOURCE_HINT: Record<AskLocale, string> = { en: "You can read how he works on the About page.", id: "Kamu bisa membaca cara kerjanya di halaman About." };

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
