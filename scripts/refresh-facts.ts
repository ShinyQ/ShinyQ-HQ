/**
 * Weekly live facts (spec section 6.2): GitHub contributions (the total and the daily calendar of
 * the last year) and public repos, Hugging Face models and downloads, and whether each
 * certification credential URL still resolves.
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
import { ContributionCalendarSchema, DynamicFactsSchema, type DynamicFacts } from "../src/content/dynamic-facts";
import { calendarTotal, type ContributionCalendar } from "../src/lib/contributions";

export const FACTS_FILE = path.join(process.cwd(), "content", "generated", "dynamic-facts.json");
const CONTENT_FILE = path.join(process.cwd(), "content", "site-content.json");

/** A refreshed count that falls below this share of the previous one is treated as a fetch problem. */
export const MAX_DROP = 0.5;

export const CONTRIBUTIONS_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount contributionLevel } } }
    }
  }
}`;

/** GitHub's ContributionLevel enum, in level order 0 to 4. */
const GITHUB_LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

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

interface CalendarPayload {
  data?: { user?: { contributionsCollection?: { contributionCalendar?: { totalContributions?: unknown; weeks?: unknown } } } };
  errors?: { message?: string }[];
}

function calendarOf(json: unknown) {
  const data = json as CalendarPayload;
  if (data.errors?.length) throw new Error(`GitHub GraphQL: ${data.errors.map((e) => e.message).join("; ")}`);
  return data.data?.user?.contributionsCollection?.contributionCalendar;
}

export function parseContributions(json: unknown): number {
  return nonNegativeInt(calendarOf(json)?.totalContributions, "contribution total");
}

const plusDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * The daily calendar in its compact form: the first date, one level digit and one count per day.
 * Throws on an unknown level, a missing or repeated day, or counts that do not add up to the total.
 */
export function parseCalendar(json: unknown): ContributionCalendar {
  const calendar = calendarOf(json);
  const total = nonNegativeInt(calendar?.totalContributions, "contribution total");
  if (!Array.isArray(calendar?.weeks)) throw new Error("GitHub calendar: expected weeks");
  const days = (calendar.weeks as { contributionDays?: unknown }[]).flatMap((w) => (Array.isArray(w?.contributionDays) ? w.contributionDays : [])) as {
    date?: unknown;
    contributionCount?: unknown;
    contributionLevel?: unknown;
  }[];
  if (days.length === 0) throw new Error("GitHub calendar: no days");
  let levels = "";
  const counts: number[] = [];
  let expected = typeof days[0].date === "string" ? days[0].date : "";
  for (const day of days) {
    if (day.date !== expected) throw new Error(`GitHub calendar: expected date ${expected}, got ${JSON.stringify(day.date)}`);
    const level = GITHUB_LEVELS.indexOf(day.contributionLevel as string);
    if (level < 0) throw new Error(`GitHub calendar: unknown level ${JSON.stringify(day.contributionLevel)}`);
    levels += level;
    counts.push(nonNegativeInt(day.contributionCount, "contribution count"));
    expected = plusDay(expected);
  }
  const parsed = ContributionCalendarSchema.parse({ start: days[0].date, levels, counts });
  if (calendarTotal(parsed) !== total) throw new Error(`GitHub calendar: days add up to ${calendarTotal(parsed)}, not ${total}`);
  return parsed;
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
  github?: { login: string; contributionsLastYear?: number; publicRepos?: number; calendar?: ContributionCalendar };
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
 * a suspicious drop keeps it too. The contribution total and the calendar travel together, so the
 * calendar always adds up to the total: a missing or rejected calendar keeps the previous pair.
 * `asOf` changes only when a value changed.
 */
export function mergeFacts(prev: DynamicFacts | undefined, fetched: Fetched, today: string, warn: (message: string) => void = () => {}): { facts: DynamicFacts; changed: boolean } {
  const next: Omit<DynamicFacts, "asOf"> = {};
  const gh = fetched.github;
  if (gh) {
    let contributionsLastYear = guard(gh.contributionsLastYear, prev?.github?.contributionsLastYear, "GitHub contributions", warn);
    const publicRepos = guard(gh.publicRepos, prev?.github?.publicRepos, "GitHub public repos", warn);
    let calendar = gh.calendar && calendarTotal(gh.calendar) === contributionsLastYear ? gh.calendar : undefined;
    const prevGh = prev?.github;
    if (!calendar && prevGh?.calendar) {
      if (contributionsLastYear !== prevGh.contributionsLastYear) warn(`GitHub contribution calendar missing; keeping the previous total ${prevGh.contributionsLastYear} with its calendar.`);
      calendar = prevGh.calendar;
      contributionsLastYear = prevGh.contributionsLastYear;
    }
    if (contributionsLastYear !== undefined && publicRepos !== undefined) {
      next.github = { login: gh.login, contributionsLastYear, publicRepos, ...(calendar && { calendar }) };
    }
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

/** Two-space JSON with one credential per line and the calendar counts on one line, the committed format. */
export function serializeFacts(facts: DynamicFacts): string {
  const json = JSON.stringify(facts, null, 2)
    .replace(/\{\n\s+("id": "[^"]+"),\n\s+("reachable": (?:true|false))\n\s+\}/g, "{ $1, $2 }")
    .replace(/"counts": \[([\d,\s]*)\]/, (_, list: string) => `"counts": [${list.replace(/\s+/g, "")}]`);
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
    const contributions = token
      ? await attempt("GitHub contributions", async () =>
          getJson("https://api.github.com/graphql", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ query: CONTRIBUTIONS_QUERY, variables: { login: ghLogin } }),
          }),
        )
      : (console.log("::warning::No GITHUB_TOKEN; GitHub contributions keep the previous value."), undefined);
    fetched.github = {
      login: ghLogin,
      contributionsLastYear: contributions === undefined ? undefined : await attempt("GitHub contributions", async () => parseContributions(contributions)),
      calendar: contributions === undefined ? undefined : await attempt("GitHub contribution calendar", async () => parseCalendar(contributions)),
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
