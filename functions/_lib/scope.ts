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
 * cites the /build page. Deliberately narrow: "his portfolio" or "a live site" of a project
 * are about his work, not about this site.
 */
const SITE: RegExp[] = [
  /\bshinyq[ -]?hq\b|\bagent hq\b/i,
  /\b(?:this|the|your) (?:3d |portfolio )?(?:site|website|web ?site|web ?app|tower|hq)\b(?! (?:of|for|on|in)\b)/i,
  /\b(?:this|your) (?:ai )?(?:chat ?bot|assistant)\b/i,
  /\b(?:built|made|created|developed|coded|designed|powered|powers) (?:you|this)\b|\b(?:are|were) you (?:built|made|created|powered)\b/i,
  /\bwhat (?:ai |llm |language )?models? (?:are you|do you|powers? you)\b/i,
  /\bengine room\b|\bruang mesin\b|\b(?:secret|hidden) floor\b|\blantai (?:rahasia|tersembunyi)\b/i,
  /\b(?:situs|website|web|portofolio|chatbot|asisten|menara) ini\b/i,
  /\b(?:kamu|anda) (?:dibuat|dibangun|memakai|menggunakan|pakai)\b|\bmodel (?:ai |llm )?apa (?:yang )?(?:kamu|anda)\b/i,
];

/**
 * "ShinyQ" is Kurniadi's nickname (owner 2026-10-16): questions that use it are about him. "ShinyQ HQ"
 * (this site), URL parts ("github.com/ShinyQ/...") and handles ("@ShinyQ") keep their meaning.
 */
const NICKNAME = /(?<![\w/.@])(shiny[ -]?q)(?![ -]?hq\b)(?![\w/])(['\u2019]s)?/gi;

/** The question with his name in place of the nickname: for scope, routing and retrieval, so the nickname token never matches other chunks. */
export function resolveNickname(question: string): string {
  return question.replace(NICKNAME, (_m, _nick: string, possessive?: string) => `Kurniadi${possessive ?? ""}`);
}

/** The question for the model: his name with the visitor's own spelling beside it, so "What does ShinyQ mean?" is still asked as written. */
export function nicknameForModel(question: string): string {
  return question.replace(NICKNAME, (_m, nick: string, possessive?: string) => `Kurniadi${possessive ?? ""} (${nick})`);
}

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
  // Partisan politics: parties, candidates, elections, specific politicians and how he votes.
  ["politics", /\b(?:politics|political|politicians?|elections?|vot(?:e|ed|es|ing) for|who (?:did|does|will|would) (?:he|kurniadi) vote|ballot|president|vice president|prime minister|minister|parliament|senator|governor|mayor|left-wing|right-wing|politik|pemilu|pilpres|pilkada|presiden|wakil presiden|menteri|partai|capres|cawapres|caleg|coblos|nyoblos|golput|gubernur|bupati|wali ?kota|dpr|mpr|kabinet|oposisi|koalisi|jokowi|prabowo|gibran|anies|ganjar|megawati|sby)\b/i],
  // Contested social policy is not tech policy: declined like politics.
  ["politics", /\b(?:abortion|aborsi|death penalty|hukuman mati|lgbt\w*|same-sex|sesama jenis|immigration|imigran|gun control|capital punishment)\b/i],
  ["pay", /\b(?:salary|salaries|wages?|income|compensation|paycheck|net worth|hourly rate|day rate|rate card|gaji(?:nya)?|penghasilan(?:nya)?|pendapatan(?:nya)?|upah|bayaran|tarif(?:nya)?)\b/i],
  ["pay", /\bhow much (?:money )?(?:does|did|do|will|would) (?:he|kurniadi) (?:earn|make|charge|get paid)\b|\bberapa (?:dia |kurniadi )?dibayar\b/i],
  // Hobbies, games, books, anime, coffee shops, the gym and burnout are answerable from his lifestyle
  // perspectives since 2026-10-15 (`routedTopic`); everything else personal stays declined here.
  ["life", /\b(?:favou?rite (?:food|foods|movie|film|music|song|band|colou?r|team|drink)|makanan favorit|home address|alamat rumah|alamat lengkap|how old|umur(?:nya)?|birthday|ulang tahun|tanggal lahir|date of birth|what car|mobil apa)\b/i],
];

/** Policy words, and the tech words that make a policy question one his written views cover (AI, data, digital, jobs, developers). */
const POLICY = /\b(?:polic(?:y|ies)|regulat(?:e|es|ion|ions|ing)|legislation|laws? (?:on|for|about)|government|governments|public sector|public services?|kebijakan|regulasi|mengatur|diatur|pengaturan|undang-undang|uu|peraturan|pemerintah|pemerintahan|sektor publik|layanan publik)\b/i;
/** Work context: "regulation" in a question about his projects or clients is a work question, not policy. */
const WORK_CONTEXT = /\b(?:projects?|proyek|built|build|clients?|klien|bank|banking|perbankan|compliance|kepatuhan|industr\w*|worked|bekerja|experience|pengalaman)\b/i;
const TECH = /\b(?:ai|a\.i\.|artificial intelligence|kecerdasan buatan|data|digital|digitalisasi|tech\w*|teknologi|software|developers?|engineers?|programmers?|privacy|privasi|pdp|apis?|internet|cyber\w*|siber|startups?|jobs?|pekerjaan|lapangan kerja|tenaga kerja|automation|otomasi|llms?|models?|platforms?|interoperab\w*|sandbox(?:es)?|e-?government|spbe|open data)\b/i;

/** The personal topic a question asks about, or null. These are declined without a model call. */
export function privateTopic(question: string): PrivateTopic | null {
  const hit = PRIVATE.find(([, re]) => re.test(question))?.[0];
  if (hit) return hit;
  // Policy questions are answerable only when they are tech-adjacent (his written policy views, 2026-10-15).
  // In a question about this site, "Pengaturan" names its settings panel, not a regulation.
  const policyText = isSiteQuestion(question) ? question.replace(/\bpengaturan\b/gi, " ") : question;
  return POLICY.test(policyText) && !TECH.test(question) && !WORK_CONTEXT.test(question) ? "politics" : null;
}

/**
 * Perspective topics a question is routed to deterministically (owner decision 2026-10-15). Lifestyle
 * and tech-adjacent policy are answerable FROM HIS WRITTEN PERSPECTIVES ONLY: retrieval keeps only
 * the perspectives tagged with that topic, and an answer must follow one of them or it becomes the
 * no-view message (functions/_lib/checks.ts).
 */
export type RoutedTopic = "lifestyle" | "policy";

const LIFESTYLE: RegExp[] = [
  /\b(?:hobb(?:y|ies)|video ?games?|games? (?:does|do|did) (?:he|kurniadi|you) play|play(?:s|ing)? (?:games?|video ?games?|mobile ?games?)|gaming|gamer|anime|manga|(?:which|what|favou?rite) books?|books? (?:does|did|do|has) (?:he|kurniadi|you)|podcasts?|coffee|caf(?:e|\u00e9)s?|gym|work ?outs?|exercis\w*|sports?|take a walk|go(?:es)? for (?:a )?walks?|weekends?|outside (?:of )?work|after work|free time|spare time|days? off|burn ?out|relax\w*|fun fact|personality|typical day)\b/i,
  /\b(?:hobi(?:nya)?|main game|bermain game|game apa|anime(?:nya)?|buku apa|buku favorit|podcast|kopi|kafe|coffee shop|ngopi|nongkrong|olahraga|gym|jalan kaki|akhir pekan|di luar (?:pekerjaan|kerja)|waktu luang|bersantai|istirahat|kelelahan|fakta unik|fakta menarik|kepribadian(?:nya)?)\b/i,
];

/** Lifestyle or tech-adjacent policy question, or undefined. Call after `privateTopic` (partisan politics never gets here). */
export function routedTopic(question: string): RoutedTopic | undefined {
  if (POLICY.test(question) && TECH.test(question)) return "policy";
  if (/\b(?:ai|artificial intelligence)\b.{0,40}\b(?:jobs?|pekerjaan|lapangan kerja|tenaga kerja|workers?|pekerja)\b|\b(?:jobs?|pekerjaan|lapangan kerja)\b.{0,40}\b(?:ai|artificial intelligence)\b/i.test(question)) return "policy";
  if (LIFESTYLE.some((re) => re.test(question))) return "lifestyle";
  return undefined;
}

/**
 * "What can you do?" and its variants (EN/ID): answered with the fixed capabilities message, no
 * retrieval and no model call. Also offered as a curated pill.
 */
const CAPABILITY: RegExp[] = [
  // "Who are you?": Rover introduces itself with the same fixed text (owner decision 2026-10-19).
  /^\W*(?:(?:hi|hello|hey|halo|hai)\W+)?(?:who|what) are you\s*[?!.]*\s*$/i,
  /^\W*(?:(?:hi|halo|hai)\W+)?siapa (?:kamu|anda|kau)\s*[?!.]*\s*$/i,
  /^\W*(?:(?:hi|hello|hey|halo|hai)\W+)?(?:so\W+)?what (?:else )?(?:can|could|do) (?:you|this (?:assistant|chat ?bot|bot)) (?:do|help(?: me)? with|answer|cover)(?: for me| here)?\s*[?!.]*\s*$/i,
  /^\W*what (?:else )?(?:can|should|could) i ask(?: you| here| about)?\s*[?!.]*\s*$/i,
  /\bwhat (?:are|is) (?:your|this (?:assistant|chat ?bot|bot)'?s?) (?:capabilities|features|purpose|scope|limits?)\b/i,
  /\bwhat (?:kind|sort|type)s? of (?:questions|things) can (?:you|i)\b|^\W*how (?:can|could) (?:you|this (?:assistant|chat ?bot)) help(?: me)?\s*[?!.]*\s*$|\bwhat (?:topics|questions) (?:can|do) you\b|^\s*help\s*[?!.]*\s*$/i,
  /\b(?:apa|apa saja|apa aja) (?:yang )?(?:bisa|dapat) (?:kamu|anda|asisten ini|chatbot ini|bot ini|kau|lo|lu|saya|aku) (?:lakukan|kerjakan|bantu|jawab|tanyakan|tanya)\b/i,
  /\b(?:kamu|anda|asisten ini|chatbot ini|bot ini) bisa (?:apa|ngapain|bantu apa)\b|\bbisa (?:bantu|tanya) apa saja\b|\bapa (?:saja )?(?:yang )?bisa ditanyakan\b|\bkemampuan (?:kamu|anda|asisten ini|chatbot ini)\b|\bfungsi (?:kamu|anda|asisten ini|chatbot ini)\b/i,
];

/** A question about what this assistant can do (EN/ID). */
export function isCapabilityQuestion(question: string): boolean {
  return CAPABILITY.some((re) => re.test(question));
}

/**
 * Lead intent (owner request 2026-10-15): the visitor describes their own need or project, or asks
 * whether Kurniadi can build something or work with them. Deterministic, EN/ID. The answer names
 * matching skills and past projects and invites contact; the dock shows a contact card from the
 * dataset. The visitor's text stays untrusted data either way.
 */
const NEED_EN = String.raw`(?:need|needs|want|wants|would like|'d like|are looking for|am looking for|'m looking for|'re looking for|looking for|plan(?:ning)? to (?:build|make|launch|develop)|require|have a project|are building|am building|'m building|'re building)`;
const NEED_ID = String.raw`(?:butuh|membutuhkan|perlu|memerlukan|mencari|sedang cari|cari|ingin (?:membuat|membangun|bikin)|mau (?:membuat|membangun|bikin)|punya proyek|sedang membangun)`;
const THING_EN = String.raw`(?:apps?|application|system|platform|website|site|chat ?bot|bot|assistant|agents?|dashboard|apis?|backend|integrations?|automation|solution|developers?|engineers?|programmers?|consultant|freelancer|contractor|someone|mvp|product|tool|pipeline|model|rag|ai|software|project|crm|erp|portal|service|detection|marketplace|e-?commerce|games?|audit|migration|refactor|features?|upgrade|support|help)`;
const THING_ID = String.raw`(?:sistem|aplikasi|app|website|situs|chat ?bot|bot|asisten|agent|dashboard|api|backend|integrasi|otomasi|otomatisasi|solusi|developer|programmer|engineer|konsultan|freelancer|vendor|mvp|produk|tool|platform|model|ai|software|proyek|crm|erp|portal|layanan|deteksi|marketplace|audit|migrasi|fitur|bantuan)`;
const LEAD: RegExp[] = [
  new RegExp(String.raw`\b(?:i|we|our (?:team|company|startup|clinic|business|organi[sz]ation)|my (?:team|company|startup|clinic|business|organi[sz]ation|client))\b[^.?!]{0,20}\b${NEED_EN}\b(?! to (?:know|learn|ask|understand|see|read|find out|hear|contact|talk|reach))[^.?!]{0,50}\b${THING_EN}\b`, "i"),
  /(?<!\bhow )(?<!\bwhy )\b(?:can|could|would|will) (?:you|he|kurniadi)\b[^.?!]{0,20}\b(?:build|make|develop|create|help (?:us|me)|work (?:with|for) (?:us|me)|take on|implement|automate|integrate)\b/i,
  /\b(?:hire|hiring|contract|engage|outsourc\w*)\b[^.?!]{0,40}\b(?:him|kurniadi|you|project|app|system|platform|chatbot|website|mvp)\b/i,
  /\b(?:is he|is kurniadi|are you) (?:available|open) (?:to|for) (?:build|help|work on|a project|projects|my|our)\b/i,
  new RegExp(String.raw`\b(?:saya|kami|kita|aku|perusahaan (?:saya|kami)|tim (?:saya|kami)|klinik (?:saya|kami)|usaha (?:saya|kami)|startup (?:saya|kami))\b[^.?!]{0,30}\b${NEED_ID}\b[^.?!]{0,50}\b${THING_ID}\b`, "i"),
  /(?<!\b(?:bagaimana|gimana|mengapa|kenapa) )\b(?:bisa|bisakah|dapatkah|apakah (?:dia|kurniadi|kamu|anda) bisa|apa (?:dia|kurniadi) bisa)\b[^.?!]{0,25}\b(?:buatkan|membuatkan|bikinin|bantu (?:kami|saya)|kerja sama|bekerja sama dengan (?:kami|saya)|mengerjakan proyek)\b/i,
  /\b(?:jasa (?:pembuatan|developer|programmer|pengembangan)|cari developer|mencari developer|cari programmer|butuh developer|butuh programmer|sewa developer|merekrut (?:dia|kurniadi))\b/i,
];

/** A visitor describing their own need or project (EN/ID). "How" and "why" questions about how he would build something are not leads (lookbehinds). */
export function isLeadQuestion(question: string): boolean {
  return LEAD.some((re) => re.test(question));
}

/**
 * General-assistant requests that are out of scope however they are phrased (owner rule 2026-10-15):
 * writing code, essays, poems or homework, tutorials, translations and recommendations for the
 * visitor. A lead question is let through (the prompt and output checks keep it from becoming
 * free consulting); everything else gets the scoped decline without a model call.
 */
const WRITE_OBJECT = String.raw`(?:code|function|script|program|query|sql|regex|snippet|essay|poem|poems|story|stories|limerick|song|lyrics|letter|cover letter|homework|assignment|article|tweet|caption|joke|jokes)`;
/** Writing work for the visitor, and attempts to turn this assistant into a general chatbot: always declined. */
const WRITING: RegExp[] = [
  /\b(?:you are|you're|act as|pretend to be|from now on,? you|kamu sekarang|anggap (?:kamu|dirimu)|berperanlah sebagai|jadilah)\b[^.?!]{0,40}\b(?:general[- ]purpose|general (?:assistant|chatbot|ai)|chatgpt|gpt|dan|unrestricted|jailbroken|no (?:rules|limits|restrictions)|without (?:rules|limits|restrictions)|tanpa (?:aturan|batas))\b/i,
  new RegExp(String.raw`^\W*(?:(?:hey|hi|ok|okay)\W+)?(?:(?:kurniadi|rover|bot|assistant)\W+)?(?:please |pls |now |can you |could you |would you |you must )?(?:write|generate|give|create|draft|compose|make|code)\b(?: me| us)?(?: an?| the| some| my)? (?:[\w-]+ ){0,3}${WRITE_OBJECT}\b`, "i"),
  /\b(?:write|generate|create|draft|compose) (?:me |us )?(?:an?|some|the) (?:[\w-]+ ){0,3}(?:code|function|script|program|query|essay|poem|story|limerick|song|lyrics|cover letter|homework|joke)\b/i,
  /^\W*(?:tolong |coba |bisa |bisakah )?(?:buatkan|buatin|bikinin|tuliskan|tulisin|tulis|kerjakan)\b(?: saya| aku)?(?: sebuah| satu)? (?:[\w-]+ ){0,3}(?:kode|program|script|skrip|query|fungsi|puisi|pantun|cerita|esai|essay|lagu|surat|artikel|caption|lelucon|tugas|pr)\b/i,
  /\b(?:do|solve|finish|answer|help (?:me )?with) (?:my|our|this) (?:homework|assignment|exam|quiz|essay|skripsi|tugas)\b|\b(?:homework|assignment|pr saya|tugas (?:saya|kuliah|sekolah)|skripsi saya|soal ujian|jawab soal)\b/i,
];
/** Translations, tutorials and recommendations for the visitor: declined unless the question is about Kurniadi. */
const TUTORIAL: RegExp[] = [
  /\b(?:translate|terjemahkan|terjemahin|artikan)\b/i,
  /\b(?:teach me|explain to me|give me a tutorial|tutorial (?:on|for)|step[- ]by[- ]step|ajari|ajarin|ajarkan|jelaskan (?:ke|kepada) saya)\b/i,
  /\bhow (?:do|can|should) i (?:learn|install|code|program|build|make|fix|deploy|train|write|become|set up|configure|use)\b|^\W*how to (?:learn|install|code|program|build|make|fix|deploy|train|write|become|set up|configure|use)\b/i,
  /\b(?:bagaimana|gimana) cara (?:saya |aku )?(?:belajar|install|instal|membuat|bikin|ngoding|coding|memperbaiki|deploy|melatih|menulis|menjadi|jadi)\b/i,
  /^\W*(?:what is|what are|what's|explain|define|apa itu|jelaskan) (?:an? |the )?(?:[\w-]+ ){0,3}(?:in (?:machine learning|ai|programming|python|javascript|general)|algorithm|transformer|neural network|blockchain|kubernetes|docker|recursion|big o)\b/i,
  /\b(?:recommend|suggest)(?:ation)?s?\b[^.?!]{0,30}\b(?:me|for me|i should|to me)\b|\bwhat (?:anime|game|games|book|books|show|movie|podcast|routine|workout|laptop|phone|course|framework|language) should i\b|\b(?:give me|need) (?:a |some )?(?:gym|workout|diet|study|training) (?:routine|plan|program)\b/i,
  /\b(?:rekomendasi(?:kan)?|sarankan|saranin)\b[^.?!]{0,30}\b(?:untuk saya|buat saya|untukku|buatku|ke saya|untuk aku|buat aku|dong)\b|\b(?:anime|game|buku|film|laptop|hp|kursus|framework|bahasa pemrograman|rutinitas gym) apa yang (?:harus|sebaiknya|bagus) (?:saya|aku|ku)\b/i,
];
/** The question is about Kurniadi or this site, so a "how" or "explain" pattern is not a general tutorial. */
const ABOUT_HIM = /\b(?:kurniadi|he|him|his|himself|dia|beliau|shinyq|this site|situs ini)\b|\w+nya\b/i;
/** Indonesian adverbs that end in "-nya" without meaning "his" ("sebaiknya", "biasanya"). */
const NYA_ADVERBS = /\b(?:sebaik|seharus|biasa|akhir|sebenar|misal|contoh|lain|selanjut|umum|terutama)nya\b/gi;
/** The question is about Kurniadi or this site ("LLM-nya" is his; "sebaiknya" is an adverb). */
const aboutHim = (question: string) => ABOUT_HIM.test(question.replace(NYA_ADVERBS, " "));

/** A request for general-assistant work (code, essays, homework, tutorials, translations, recommendations for the visitor). */
export function isGeneralAssistantRequest(question: string): boolean {
  if (WRITING.some((re) => re.test(question))) return true;
  return TUTORIAL.some((re) => re.test(question)) && !aboutHim(question);
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

/**
 * Requests that Rover speak as Kurniadi or anyone else, or take on another persona (owner decision 2026-10-19:
 * Rover answers as itself and refers to Kurniadi in the third person). Declined before any model call.
 */
const PERSONA: RegExp[] = [
  /\b(?:pretend|act|role-?play|speak(?:ing)?|answer|respond|reply|talk|write)\b[^.?!]{0,25}\b(?:as|to be|like)\s+(?:if\s+(?:you\s+(?:were|are)\s+)?)?(?:kurniadi|shinyq|him(?:self)?|his (?:twin|clone|double|digital twin|boss|manager)|someone else|another (?:person|ai|assistant|bot|chatbot|character))\b/i,
  /\b(?:you are|you're|you will be|you'll be|become)\s+(?:now\s+)?(?:kurniadi|shinyq|kurniadi'?s (?:twin|clone|double|digital twin|ai twin))\b|\bact as (?:his|kurniadi'?s) (?:digital |ai )?(?:twin|clone|double)\b/i,
  // An instruction (sentence start or "please", "and", "now", "then"), so "Does he write in the first person?" is not one.
  /(?:^\W*|[.?!,:;]\s*|\b(?:please|and|now|then)\s+)(?:answer|reply|respond|speak|talk|write)\b[^.?!]{0,25}\bin (?:the )?first[- ]person\b/i,
  /\b(?:jawab|bicara|berbicara|menjawab|bertindak|berperan)(?:lah)? (?:sebagai|seperti|seolah(?:-olah)?(?: kamu)?) (?:kurniadi|shinyq|dia|beliau|orang lain)\b/i,
  /\b(?:pura-pura|berpura-pura|anggap(?:lah)? (?:kamu|dirimu|kau)|kamu (?:sekarang )?(?:adalah|jadi|menjadi))\s+(?:jadi |menjadi |adalah |sebagai )?(?:kurniadi|shinyq)\b/i,
  /\bpakai kata (?:saya|aku)\b|\bsebagai orang pertama\b/i,
];

/** A request to speak as Kurniadi or anyone else, or to take another persona (EN/ID). */
export function isPersonaRequest(question: string): boolean {
  return PERSONA.some((re) => re.test(question));
}

/** Attempts to override or replace the rules. A determiner is required, so "Does he ignore rules?" is not one. */
const OVERRIDE: RegExp[] = [
  /\b(?:ignore|forget|disregard|override|bypass)\s+(?:all\s+|any\s+|of\s+)?(?:your|the|these|those|previous|prior|earlier|above|system|its|rover'?s)\s+(?:[\w-]+\s+){0,2}(?:rules?|instructions?|guidelines?|prompts?|restrictions?|constraints?|polic(?:y|ies))\b/i,
  /\b(?:new|updated) (?:system )?(?:rules?|instructions?|system (?:message|prompt))\b|^\W*system\s*:/i,
  /\b(?:abaikan|lupakan|hiraukan|langgar)\s+(?:semua\s+|seluruh\s+)?(?:aturan|instruksi|perintah|batasan|prompt)\b/i,
];

/** An attempt to override, replace or drop the assistant's rules (EN/ID). */
export function isRuleOverride(question: string): boolean {
  return OVERRIDE.some((re) => re.test(question));
}

/** A practice or judgment frame ("when not to", "risks", "is it worth", "better than"), EN/ID. */
const ADJACENT_FRAME: RegExp[] = [
  /\b(?:when|where|why)\b[^.?!]{0,40}\b(?:should(?:n't)?|not|never|avoid|fails?|breaks?|go(?:es)? wrong|bad idea|good idea|worth it|overkill|make sense|the right (?:choice|tool))\b/i,
  /\b(?:should(?:n't| not)?|is it (?:a )?(?:good|bad|smart|wise) idea to|is it worth|does it make sense to)\b[^.?!]{0,40}\b(?:use|using|build|adopt|deploy|ship|trust|replace|automate|fine-?tun\w*|rely)\b/i,
  /\b(?:risks?|pitfalls?|trade-?offs?|lessons?|mistakes?|failure modes?|anti-?patterns?|best practices?|downsides?|limitations?|red flags?)\b/i,
  /\bhow (?:should|do|can|would) (?:teams?|companies|engineers?|organi[sz]ations?|enterprises?|banks?|startups?|developers?|we|one)\b[^.?!]{0,30}\b(?:decide|evaluate|measure|test|monitor|ship|release|trust|choose|govern|review|validate|know|report|handle)\b/i,
  /\bwhat makes\b[^.?!]{0,30}\b(?:good|trustworthy|reliable|safe|production[- ]ready|successful)\b/i,
  /\b(?:better than|worse than|versus|vs\.?)(?!\w)|\b(?:overhyped|over-hyped|underrated)\b/i,
  /\b(?:kapan|di ?mana|mengapa|kenapa)\b[^.?!]{0,40}\b(?:sebaiknya|seharusnya|tidak|bukan|jangan|gagal|ide buruk|ide bagus|layak|cocok|tepat)\b/i,
  /\b(?:sebaiknya|seharusnya|apakah layak|apakah perlu|perlukah|haruskah)\b[^.?!]{0,40}\b(?:pakai|memakai|menggunakan|membangun|mengadopsi|dipakai|digunakan|mempercayai|mengganti|menggantikan)\b/i,
  /\b(?:risiko|jebakan|kesalahan(?: umum)?|pelajaran|praktik terbaik|kekurangan|keterbatasan|tanda bahaya)\b/i,
  /\bbagaimana (?:tim|perusahaan|engineer|organisasi|bank|startup|developer|kita)\b[^.?!]{0,30}\b(?:memutuskan|mengevaluasi|mengukur|menguji|memantau|merilis|memilih|menilai|memvalidasi)\b/i,
  /\bapa yang membuat\b[^.?!]{0,30}\b(?:bagus|terpercaya|andal|aman|siap produksi)\b|\b(?:lebih baik (?:dari|daripada)|dibanding(?:kan)?)\b/i,
];
/** Domain words of his work: an adjacent question must be about one of them. */
const ADJACENT_DOMAIN =
  /\b(?:ai|a\.i\.|artificial intelligence|kecerdasan buatan|llms?|genai|generative|rag|retrieval|embeddings?|vector|agents?|agentic|copilot|chat ?bots?|assistants?|models?|machine learning|ml|deep learning|nlp|fine-?tun\w*|prompts?|evaluation|evals?|evaluasi|testing|tests?|pengujian|production|produksi|observability|monitoring|shadow mode|fraud|data|software|code review|specs?|spesifikasi|cloud|azure|apis?|microservices?|automation|otomasi|engineering|deploy\w*|releases?|rilis)\b/i;

/**
 * A related professional question that is not strictly about Kurniadi (owner decision 2026-10-19), such as "Where
 * should AI not be used?": answered only from his work in CONTEXT, with a cited source, else the no-view reply.
 * Questions about him or this site, leads and routed topics keep their own routes; definitions and tutorials have no
 * judgment frame and stay with rule 3 and `isGeneralAssistantRequest`.
 */
export function isAdjacentQuestion(question: string): boolean {
  if (aboutHim(question) || /-nya\b/i.test(question) || isSiteQuestion(question) || isLeadQuestion(question) || routedTopic(question)) return false;
  return ADJACENT_DOMAIN.test(question) && ADJACENT_FRAME.some((re) => re.test(question));
}
