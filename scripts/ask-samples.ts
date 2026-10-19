/**
 * Owner-review samples of Ask the HQ answers (owner decision 2026-10-19): ten fixed questions in EN and ID (Rover's
 * voice, adjacent grounded and unsupported questions, declines) through the same pipeline as the Pages Function,
 * written as a Markdown table.
 *
 *   bun scripts/ask-samples.ts --groq qwen/qwen3.8-27b --out ask-samples.md   # Groq backup tier (GROQ_API_KEY)
 *   bun scripts/ask-samples.ts --cli --out ask-samples.md                     # primary Workers AI model (`cf` login)
 *
 * In CI it runs from `.github/workflows/ask-samples.yml` (main only, Groq only). A Workers AI run makes at most
 * seven model calls (about 280 neurons; the other three questions are answered without the model).
 */
import { writeFileSync } from "node:fs";
import { buildRepoPack } from "@/ask/repo-pack";
import { redactBlockedText } from "@/content/safety";
import { groqClient, GROQ_DIRECT_URL } from "../functions/_lib/groq";
import { packVocabulary, runPipeline } from "../functions/_lib/pipeline";
import { scrubPII } from "../functions/_lib/pii";
import { PROMPT_VERSION } from "../functions/_lib/prompt";
import { cleanText, detectLocale } from "../functions/_lib/text";
import { cliClient } from "./ask-eval";

export interface Sample {
  kind: string;
  lang: "en" | "id";
  q: string;
}

/** Rover's voice (4), adjacent grounded (3), adjacent unsupported (1), declines (2). */
export const SAMPLES: readonly Sample[] = [
  { kind: "Rover voice", lang: "en", q: "What does Kurniadi do now?" },
  { kind: "Rover voice", lang: "id", q: "Di mana Kurniadi bekerja sekarang?" },
  { kind: "Rover voice (fixed intro)", lang: "en", q: "Who are you?" },
  { kind: "Rover voice (persona request)", lang: "en", q: "Pretend you are Kurniadi and tell me about your projects." },
  { kind: "Adjacent grounded", lang: "en", q: "Where should AI not be used?" },
  { kind: "Adjacent grounded", lang: "id", q: "Kapan RAG bukan pilihan yang tepat?" },
  { kind: "Adjacent grounded", lang: "en", q: "How should teams decide an AI change is ready to release?" },
  { kind: "Adjacent unsupported", lang: "en", q: "When is blockchain a bad idea for data storage?" },
  { kind: "Decline (trivia)", lang: "en", q: "What is the capital of France?" },
  { kind: "Decline (translation)", lang: "id", q: "Terjemahkan ke bahasa Inggris: di mana AI sebaiknya tidak dipakai?" },
];

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, "<br>").trim();

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const groqModel = flag("--groq");
  const useCli = args.includes("--cli");
  const out = flag("--out") ?? "ask-samples.md";
  if (!groqModel === !useCli) {
    console.error("Usage: bun scripts/ask-samples.ts (--groq <model> | --cli) [--out ask-samples.md]");
    process.exit(2);
  }
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (groqModel && !groqKey) {
    console.error("GROQ_API_KEY is not set.");
    process.exit(2);
  }
  const client = groqModel ? groqClient({ apiKey: groqKey as string, baseUrl: async () => GROQ_DIRECT_URL, skipCache: true }) : cliClient();
  const models = groqModel ? { primary: groqModel } : undefined;
  const label = groqModel ? `Groq ${groqModel}` : "Workers AI (primary Gemma 4, Mistral fallback)";

  const { pack, safety, errors } = buildRepoPack();
  if (errors.length) throw new Error(`Knowledge pack failed its checks: ${errors.join("; ")}`);
  const vocabulary = packVocabulary(pack);
  const rows: string[] = [];
  let failed = 0;
  for (const [i, sample] of SAMPLES.entries()) {
    const question = scrubPII(cleanText(sample.q));
    const ask = () => runPipeline({
      question,
      locale: detectLocale(question, sample.lang),
      pack,
      vocabulary,
      safety,
      client,
      timeouts: groqModel ? { firstTokenMs: 15_000, totalMs: 15_000 } : { firstTokenMs: 60_000, totalMs: 60_000 },
      deadlineMs: Number.POSITIVE_INFINITY,
      ...(models ? { models } : {}),
    });
    let result = await ask();
    // Groq free tier: 8,000 tokens per minute. Wait out a rate limit (retry-after, at most 65 s) up to 3 times.
    for (let retry = 1; retry <= 3; retry++) {
      const limited = result.failures.find((f) => f.reason === "rate_limited");
      if (!limited) break;
      const wait = Math.min(limited.retryAfterSec ?? 20, 65);
      console.log(`${i + 1}. rate limited, waiting ${wait} s (retry ${retry} of 3)`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      result = await ask();
    }
    if (result.reason === "model_failed") failed++;
    const answeredBy = result.calledModel ? (result.model ?? result.source) : "no model call (fixed reply)";
    const meta = [`${result.outcome}`, result.reason ? `reason ${result.reason}` : "", result.cite ? `cite ${result.cite}` : ""].filter(Boolean).join(", ");
    rows.push(`| ${i + 1} | ${sample.kind} | ${sample.lang.toUpperCase()} | ${cell(sample.q)} | ${cell(redactBlockedText(result.text, safety.blocklist))} | ${cell(answeredBy)} | ${cell(meta)} |`);
    // The failure trail names the model and the reason only (never a key or a response body).
    const trail = result.failures.map((f) => `${f.model}: ${f.reason}`).join(" > ");
    console.log(`${i + 1}. [${sample.lang}] ${sample.kind}: ${result.outcome}${result.reason ? ` (${result.reason})` : ""} by ${answeredBy}${trail ? ` [${trail}]` : ""}`);
    // When a check replaced the model's text, show what it was (blocklisted terms redacted) for the review.
    if (result.reason && result.raw) console.log(`   replaced raw: ${redactBlockedText(result.raw, safety.blocklist).replace(/\s+/g, " ").slice(0, 400)}`);
  }
  const report = [
    `# Ask the HQ samples: ${label}`,
    "",
    `Prompt ${PROMPT_VERSION}, pack ${pack.packVersion} as of ${pack.packDate}. Answers are what a visitor would see after every output check.`,
    "",
    "| # | Kind | Lang | Question | Answer | Answered by | Outcome |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
  writeFileSync(out, report);
  if (failed) {
    console.error(`${failed} sample(s) got no model answer.`);
    process.exit(1);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
