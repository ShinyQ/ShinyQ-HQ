import type { AskLocale } from "../../src/ask/protocol";

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
} as const satisfies Record<string, Record<AskLocale, string>>;

export type CannedKind = keyof typeof MESSAGES;

export function canned(kind: CannedKind, locale: AskLocale): string {
  return MESSAGES[kind][locale];
}
