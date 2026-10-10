/**
 * Weekly live facts (spec section 6.2): GitHub contributions and public repos, Hugging Face models
 * and downloads, and whether each certification credential URL still resolves.
 *
 *   bun scripts/refresh-facts.ts [--dry-run] [--date YYYY-MM-DD]
 *
 * Writes content/generated/dynamic-facts.json (validated by DynamicFactsSchema) only when a value
 * changed, and only then bumps `asOf`. Numbers, dates, booleans and IDs only: no third-party text
 * is ever copied (threat T2). In GitHub Actions it sets the step outputs `changed` and `as_of`.
 * GitHub GraphQL needs a token: GITHUB_TOKEN, or `gh auth token` locally.
 * Hugging Face `downloads` is the API's rolling 30-day count.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DynamicFactsSchema, type DynamicFacts } from "../src/content/dynamic-facts";

export const FACTS_FILE = path.join(process.cwd(), "content", "generated", "dynamic-facts.json");
const CONTENT_FILE = path.join(process.cwd(), "content", "site-content.json");

/** A refreshed count that falls below this share of the previous one is treated as a fetch problem. */
export const MAX_DROP = 0.5;

export const CONTRIBUTIONS_QUERY = `query($login: String!) {
  user(login: $login) { contributionsCollection { contributionCalendar { totalContributions } } }
}`;

/** "https://github.com/ShinyQ" -> "ShinyQ". */
export function loginFromUrl(url: string | undefined, host: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== host) return undefined;
    const login = parsed.pathname.split("/").filter(Boolean)[0];
    return login && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login) ? login : undefined;
  } catch {
    return undefined;
  }
}

function nonNegativeInt(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) throw new Error(`Unexpected ${what}: ${JSON.stringify(value)}`);
  return value;
}

export function parseContributions(json: unknown): number {
  const data = json as { data?: { user?: { contributionsCollection?: { contributionCalendar?: { totalContributions?: unknown } } } }; errors?: { message?: string }[] };
  if (data.errors?.length) throw new Error(`GitHub GraphQL: ${data.errors.map((e) => e.message).join("; ")}`);
  return nonNegativeInt(data.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions, "contribution total");
}

export function parsePublicRepos(json: unknown): number {
  return nonNegativeInt((json as { public_repos?: unknown }).public_repos, "public_repos");
}

export function parseHfModels(json: unknown): { models: number; downloads: number } {
  if (!Array.isArray(json)) throw new Error("Hugging Face: expected an array of models");
  const downloads = json.reduce((sum: number, model: { downloads?: unknown }) => sum + (typeof model.downloads === "number" && model.downloads >= 0 ? Math.floor(model.downloads) : 0), 0);
  return { models: json.length, downloads };
}

/** 2xx and 3xx count as reachable (redirects are not followed). */
export function isReachable(status: number): boolean {
  return status >= 200 && status < 400;
}

export interface Fetched {
  github?: { login: string; contributionsLastYear?: number; publicRepos?: number };
  huggingface?: { user: string; models?: number; downloads?: number };
  credentials?: { id: string; reachable: boolean }[];
}

function guard(next: number | undefined, prev: number | undefined, label: string, warn: (message: string) => void): number | undefined {
  if (next === undefined) return prev;
  if (prev !== undefined && prev > 0 && next < prev * MAX_DROP) {
    warn(`${label} fell from ${prev} to ${next}; keeping ${prev} (check the token scope or the API).`);
    return prev;
  }
  return next;
}

/**
 * Merges fresh values into the previous facts. A failed fetch (undefined) keeps the previous value;
 * a suspicious drop keeps it too. `asOf` changes only when a value changed.
 */
export function mergeFacts(prev: DynamicFacts | undefined, fetched: Fetched, today: string, warn: (message: string) => void = () => {}): { facts: DynamicFacts; changed: boolean } {
  const next: Omit<DynamicFacts, "asOf"> = {};
  const gh = fetched.github;
  if (gh) {
    const contributionsLastYear = guard(gh.contributionsLastYear, prev?.github?.contributionsLastYear, "GitHub contributions", warn);
    const publicRepos = guard(gh.publicRepos, prev?.github?.publicRepos, "GitHub public repos", warn);
    if (contributionsLastYear !== undefined && publicRepos !== undefined) next.github = { login: gh.login, contributionsLastYear, publicRepos };
  } else if (prev?.github) next.github = prev.github;

  const hf = fetched.huggingface;
  if (hf) {
    const models = guard(hf.models, prev?.huggingface?.models, "Hugging Face models", warn);
    const downloads = hf.downloads ?? prev?.huggingface?.downloads;
    if (models !== undefined && downloads !== undefined) next.huggingface = { user: hf.user, models, downloads };
  } else if (prev?.huggingface) next.huggingface = prev.huggingface;

  if (fetched.credentials?.length) next.credentials = [...fetched.credentials].sort((a, b) => a.id.localeCompare(b.id));
  else if (prev?.credentials) next.credentials = prev.credentials;

  const changed = !prev || JSON.stringify(stripAsOf(prev)) !== JSON.stringify(next);
  const facts = DynamicFactsSchema.parse({ asOf: changed ? today : prev.asOf, ...next });
  return { facts, changed };
}

function stripAsOf(facts: DynamicFacts): Omit<DynamicFacts, "asOf"> {
  return { github: facts.github, huggingface: facts.huggingface, credentials: facts.credentials };
}

/** Two-space JSON with one credential per line, the committed format. */
export function serializeFacts(facts: DynamicFacts): string {
  const json = JSON.stringify(facts, null, 2).replace(/\{\n\s+("id": "[^"]+"),\n\s+("reachable": (?:true|false))\n\s+\}/g, "{ $1, $2 }");
  return `${json}\n`;
}

/** Today in WIB (the owner's time zone), YYYY-MM-DD. */
export function todayWib(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// ---- CLI (network below) ----

const UA = "shinyq-hq-refresh-facts (+https://github.com/ShinyQ/ShinyQ-HQ)";

function githubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  const run = Bun.spawnSync(["gh", "auth", "token"], { stdout: "pipe", stderr: "ignore" });
  return run.exitCode === 0 ? run.stdout.toString().trim() || undefined : undefined;
}

async function getJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url.split("?")[0]}: HTTP ${response.status}`);
  return response.json();
}

async function attempt<T>(label: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (error) {
    console.log(`::warning::${label} failed: ${(error as Error).message}. Keeping the previous value.`);
    return undefined;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const today = args.includes("--date") ? args[args.indexOf("--date") + 1] : todayWib();

  const content = JSON.parse(readFileSync(CONTENT_FILE, "utf8")) as {
    floors: { roof: { contact: { github?: string; huggingface?: string } } };
    certifications: { id: string; credentialUrl?: string }[];
  };
  const prevRaw = JSON.parse(readFileSync(FACTS_FILE, "utf8"));
  const prev = DynamicFactsSchema.parse(prevRaw);
  const fetched: Fetched = {};

  const ghLogin = loginFromUrl(content.floors.roof.contact.github, "github.com");
  if (ghLogin) {
    const token = githubToken();
    fetched.github = {
      login: ghLogin,
      contributionsLastYear: token
        ? await attempt("GitHub contributions", async () =>
            parseContributions(
              await getJson("https://api.github.com/graphql", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login: ghLogin } }),
              }),
            ),
          )
        : (console.log("::warning::No GITHUB_TOKEN; GitHub contributions keep the previous value."), undefined),
      publicRepos: await attempt("GitHub public repos", async () =>
        parsePublicRepos(await getJson(`https://api.github.com/users/${ghLogin}`, token ? { headers: { Authorization: `Bearer ${token}` } } : {})),
      ),
    };
  }

  const hfUser = loginFromUrl(content.floors.roof.contact.huggingface, "huggingface.co");
  if (hfUser) {
    const hf = await attempt("Hugging Face models", async () => parseHfModels(await getJson(`https://huggingface.co/api/models?author=${encodeURIComponent(hfUser)}&limit=1000`)));
    fetched.huggingface = { user: hfUser, models: hf?.models, downloads: hf?.downloads };
  }

  fetched.credentials = await Promise.all(
    content.certifications
      .filter((c) => c.credentialUrl)
      .map(async (c) => {
        let reachable = false;
        try {
          const response = await fetch(c.credentialUrl!, { redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
          reachable = isReachable(response.status);
        } catch {
          reachable = false;
        }
        if (!reachable) console.log(`::warning::Credential URL of ${c.id} is not reachable.`);
        return { id: c.id, reachable };
      }),
  );

  const { facts, changed } = mergeFacts(prev, fetched, today, (message) => console.log(`::warning::${message}`));
  console.log(serializeFacts(facts));
  console.log(changed ? `Changed: asOf ${facts.asOf}.` : "No change.");

  if (!dryRun && changed) writeFileSync(FACTS_FILE, serializeFacts(facts));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed && !dryRun}\nas_of=${facts.asOf}\n`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.log(`::error::${(error as Error).message}`);
    process.exit(1);
  });
}
