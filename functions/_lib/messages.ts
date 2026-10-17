import { citeKind, isAskCite, type AskCiteKind, type AskLocale } from "../../src/ask/protocol";

/** Canned answers (EN/ID). These never repeat the visitor's text and are never cached. */
export const MESSAGES = {
  unknown: {
    en: "That information is not available on this site. Try asking about Kurniadi's projects, work experience or writing.",
    id: "Informasi itu belum tersedia di situs ini. Coba tanyakan proyek, pengalaman kerja, atau tulisan Kurniadi.",
  },
  decline: {
    en: "This assistant only answers questions about Kurniadi: his projects, skills, career, writing, availability, this site and his written views, so try asking about one of those.",
    id: "Asisten ini hanya menjawab pertanyaan tentang Kurniadi: proyek, keahlian, karier, tulisan, ketersediaan, situs ini, dan pandangan tertulisnya, jadi coba tanyakan salah satunya.",
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
    en: "This assistant only covers Kurniadi's work and the views he has written down. Personal topics such as family, relationships, health, religion, partisan politics and pay are not on this site.",
    id: "Asisten ini hanya membahas pekerjaan Kurniadi dan pandangan yang dia tuliskan. Topik pribadi seperti keluarga, hubungan, kesehatan, agama, politik partisan, dan penghasilan tidak ada di situs ini.",
  },
  others: {
    en: "This assistant can't share opinions about specific people, employers or clients. Try asking about Kurniadi's principles or the work he did.",
    id: "Asisten ini tidak bisa membagikan pendapat tentang orang, pemberi kerja, atau klien tertentu. Coba tanyakan prinsip kerja Kurniadi atau pekerjaan yang dia lakukan.",
  },
  // "What can you do?" (owner request 2026-10-15): fixed, no model call. Also the scope a decline points back to.
  capabilities: {
    en: "This assistant answers questions about Kurniadi Ahmad Wijaya: his projects, skills, career, writing and research, availability for freelance or part-time work, how this site was built, how he works, and his written views on AI, the Indonesian tech scene, technology policy and life outside work. Ask in English or Indonesian; answers come from this site's content and link to the source when there is one. It does not cover his private life, partisan politics, religion, pay or opinions about specific people, and it does not write code or answer general questions.",
    id: "Asisten ini menjawab pertanyaan tentang Kurniadi Ahmad Wijaya: proyek, keahlian, karier, tulisan dan riset, ketersediaan untuk pekerjaan freelance atau paruh waktu, cara situs ini dibuat, cara kerjanya, serta pandangan tertulisnya tentang AI, dunia teknologi Indonesia, kebijakan teknologi, dan kesehariannya di luar kerja. Pertanyaan bisa dalam bahasa Inggris atau Indonesia; jawaban berasal dari konten situs ini dan menautkan sumbernya bila ada. Asisten ini tidak membahas kehidupan pribadi, politik partisan, agama, penghasilan, atau pendapat tentang orang tertentu, dan tidak menulis kode atau menjawab pertanyaan umum.",
  },
  // Lead intent when the model's answer cannot be shown (failed checks, a fit claimed without a match, a model refusal).
  lead: {
    en: "Kurniadi takes on freelance and part-time engagements in software and AI engineering alongside his full-time role. The best next step is a short message about the project; his contact details are below.",
    id: "Kurniadi menerima engagement freelance dan paruh waktu di bidang software dan AI engineering di samping pekerjaan penuh waktunya. Langkah terbaik berikutnya adalah mengirim pesan singkat tentang proyeknya; detail kontaknya ada di bawah.",
  },
  // Lead intent that asks for a price or a rate: no numbers, contact instead.
  leadRates: {
    en: "Rates and timelines are not published on this site; they depend on the scope of the work. Kurniadi takes on freelance and part-time engagements, so the best next step is a short message about the project; his contact details are below.",
    id: "Tarif dan estimasi waktu tidak dicantumkan di situs ini karena bergantung pada lingkup pekerjaannya. Kurniadi menerima engagement freelance dan paruh waktu, jadi langkah terbaik berikutnya adalah mengirim pesan singkat tentang proyeknya; detail kontaknya ada di bawah.",
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
