/**
 * Provisions the Cloudflare resources of "Ask the HQ" (docs/ask-runbook.md, spec section 10).
 *
 *   bun scripts/provision-ask.ts [--account <id>] [--project kurniadi] [--apply]
 *
 * Dry run by default: it only reads (list calls) and prints the plan. `--apply` creates what is
 * missing, updates a drifted AI Gateway and writes the KV namespace ID and the Turnstile site key
 * into wrangler.toml. Idempotent: run it again at any time. Uses the `cf` CLI (logged in with
 * `cf auth login`); the account comes from `--account` or CLOUDFLARE_ACCOUNT_ID.
 * Secrets are never printed: generated values and the Turnstile secret are piped straight into
 * `wrangler pages secret put`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const GATEWAY_ID = "shinyq-hq";
export const KV_TITLE = "shinyq-hq-ask";
export const TURNSTILE_NAME = "shinyq-hq-ask";
export const TURNSTILE_DOMAINS = ["kurniadi.pages.dev", "kurniadi.dev"];
export const DEFAULT_PROJECT = "kurniadi";
export const KV_PLACEHOLDER = "REPLACE_WITH_ASK_KV_NAMESPACE_ID";

/**
 * Legacy Logs keep a count, not an age. The API minimum is 10,000 logs (about 16 days at the 600/day
 * cap), so scripts/purge-ask-logs.ts enforces the 7 days. Workers Logs (accounts whose first gateway
 * is from 2026-09-24 on) expire logs by age instead.
 */
export const GATEWAY_SETTINGS = {
  cache_ttl: 604_800,
  cache_invalidate_on_update: true,
  collect_logs: true,
  log_management: 10_000,
  log_management_strategy: "DELETE_OLDEST",
  rate_limiting_interval: 86_400,
  rate_limiting_limit: 600,
  rate_limiting_technique: "fixed",
} as const;

/** Used only if the API rejects a one-day window: the same daily budget per hour. */
export const GATEWAY_RATE_FALLBACK = { rate_limiting_interval: 3_600, rate_limiting_limit: 25 } as const;

export const SECRET_NAMES = ["TURNSTILE_SECRET", "ASK_IP_SALT_SEED", "ASK_COOKIE_KEY"] as const;

export interface Options {
  apply: boolean;
  account?: string;
  project: string;
  help: boolean;
}

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = {}): Options {
  const options: Options = { apply: false, account: env.CLOUDFLARE_ACCOUNT_ID || undefined, project: DEFAULT_PROJECT, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    const value = () => {
      const v = inline ?? argv[++i];
      if (!v || v.startsWith("--")) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case "--apply":
        options.apply = true;
        break;
      case "--dry-run":
        options.apply = false;
        break;
      case "--account":
        options.account = value();
        break;
      case "--project":
        options.project = value();
        break;
      case "-h":
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (options.account && !/^[0-9a-f]{32}$/.test(options.account)) throw new Error("The account ID must be 32 hex characters");
  return options;
}

export interface Gateway {
  id: string;
  [key: string]: unknown;
}
export interface Namespace {
  id: string;
  title: string;
}
export interface Widget {
  sitekey: string;
  name: string;
  domains?: string[];
  mode?: string;
}

export interface State {
  gateways: Gateway[];
  namespaces: Namespace[];
  widgets: Widget[];
  toml: string;
}

export type StepKind = "gateway" | "kv" | "turnstile" | "toml";
export interface Step {
  kind: StepKind;
  action: "create" | "update" | "ok" | "write";
  summary: string;
  /** `cf` arguments for create and update steps. */
  args?: string[];
  /** Field differences for a drifted gateway. */
  drift?: string[];
}

export function gatewayArgs(settings: Record<string, string | number | boolean> = GATEWAY_SETTINGS): string[] {
  return Object.entries(settings).flatMap(([key, value]) => [`--${key.replaceAll("_", "-")}`, String(value)]);
}

export function gatewayDrift(gateway: Gateway): string[] {
  const allowed = [GATEWAY_SETTINGS, { ...GATEWAY_SETTINGS, ...GATEWAY_RATE_FALLBACK }];
  const diff = (want: Record<string, unknown>) =>
    Object.entries(want)
      .filter(([key, value]) => gateway[key] !== value)
      .map(([key, value]) => `${key}: ${JSON.stringify(gateway[key] ?? null)} -> ${JSON.stringify(value)}`);
  const results = allowed.map(diff);
  return results.find((d) => d.length === 0) ?? results[0];
}

export function readKvId(toml: string): string | undefined {
  const block = toml.match(/\[\[kv_namespaces\]\][^[]*?binding\s*=\s*"ASK_KV"[^[]*?id\s*=\s*"([^"]*)"/);
  return block?.[1];
}

/** Replaces the `id` of the ASK_KV block in wrangler.toml. */
export function setKvNamespaceId(toml: string, id: string): string {
  if (!/^[0-9a-f]{32}$/.test(id)) throw new Error(`Not a KV namespace ID: ${id}`);
  const pattern = /(\[\[kv_namespaces\]\][^[]*?binding\s*=\s*"ASK_KV"[^[]*?id\s*=\s*")[^"]*(")/;
  if (!pattern.test(toml)) throw new Error("wrangler.toml has no [[kv_namespaces]] block with binding ASK_KV");
  return toml.replace(pattern, `$1${id}$2`);
}

export function readSiteKey(toml: string): string | undefined {
  return toml.match(/^TURNSTILE_SITE_KEY\s*=\s*"([^"]*)"/m)?.[1];
}

/** Sets the public Turnstile site key in [vars]. */
export function setTurnstileSiteKey(toml: string, sitekey: string): string {
  if (!/^[0-9A-Za-z_-]{8,64}$/.test(sitekey)) throw new Error(`Not a Turnstile site key: ${sitekey}`);
  const pattern = /^(TURNSTILE_SITE_KEY\s*=\s*")[^"]*(")/m;
  if (!pattern.test(toml)) throw new Error("wrangler.toml has no TURNSTILE_SITE_KEY variable");
  return toml.replace(pattern, `$1${sitekey}$2`);
}

export function buildPlan(state: State): Step[] {
  const steps: Step[] = [];

  const gateway = state.gateways.find((g) => g.id === GATEWAY_ID);
  if (!gateway) {
    steps.push({
      kind: "gateway",
      action: "create",
      summary: `Create AI Gateway "${GATEWAY_ID}" (cache 7 days, logs on, 10,000 logs DELETE_OLDEST, 600 requests per day)`,
      args: ["ai-gateway", "gateways", "create", "--id", GATEWAY_ID, ...gatewayArgs()],
    });
  } else {
    const drift = gatewayDrift(gateway);
    steps.push(
      drift.length
        ? {
            kind: "gateway",
            action: "update",
            summary: `Update AI Gateway "${GATEWAY_ID}" settings`,
            args: ["ai-gateway", "gateways", "update", GATEWAY_ID, ...gatewayArgs()],
            drift,
          }
        : { kind: "gateway", action: "ok", summary: `AI Gateway "${GATEWAY_ID}" exists with the expected settings` },
    );
  }

  const namespace = state.namespaces.find((n) => n.title === KV_TITLE);
  if (!namespace) {
    steps.push({ kind: "kv", action: "create", summary: `Create KV namespace "${KV_TITLE}"`, args: ["kv", "namespaces", "create", "--title", KV_TITLE] });
    steps.push({ kind: "toml", action: "write", summary: "Write the new KV namespace ID into wrangler.toml (ASK_KV)" });
  } else {
    steps.push({ kind: "kv", action: "ok", summary: `KV namespace "${KV_TITLE}" exists (${namespace.id})` });
    if (readKvId(state.toml) !== namespace.id) {
      steps.push({ kind: "toml", action: "write", summary: `Write KV namespace ID ${namespace.id} into wrangler.toml (ASK_KV)` });
    }
  }

  const widget = state.widgets.find((w) => w.name === TURNSTILE_NAME);
  if (!widget) {
    steps.push({
      kind: "turnstile",
      action: "create",
      summary: `Create Turnstile widget "${TURNSTILE_NAME}" (invisible, ${TURNSTILE_DOMAINS.join(", ")}), store its secret as TURNSTILE_SECRET`,
      args: ["turnstile", "widgets", "create", "--name", TURNSTILE_NAME, "--widget-mode", "invisible", "--domains", ...TURNSTILE_DOMAINS],
    });
    steps.push({ kind: "toml", action: "write", summary: "Write the new Turnstile site key into wrangler.toml (TURNSTILE_SITE_KEY)" });
  } else {
    const missing = TURNSTILE_DOMAINS.filter((d) => !(widget.domains ?? []).includes(d));
    steps.push(
      missing.length || widget.mode !== "invisible"
        ? {
            kind: "turnstile",
            action: "update",
            summary: `Update Turnstile widget "${TURNSTILE_NAME}" (invisible, ${TURNSTILE_DOMAINS.join(", ")})`,
            args: ["turnstile", "widgets", "update", widget.sitekey, "--name", TURNSTILE_NAME, "--widget-mode", "invisible", "--domains", ...TURNSTILE_DOMAINS],
            drift: [...missing.map((d) => `domain ${d} missing`), ...(widget.mode !== "invisible" ? [`mode ${widget.mode} -> invisible`] : [])],
          }
        : { kind: "turnstile", action: "ok", summary: `Turnstile widget "${TURNSTILE_NAME}" exists (site key ${widget.sitekey})` },
    );
    if (readSiteKey(state.toml) !== widget.sitekey) {
      steps.push({ kind: "toml", action: "write", summary: `Write Turnstile site key ${widget.sitekey} into wrangler.toml` });
    }
  }
  return steps;
}

/** Copy-paste commands for the secrets. Random values are generated in the pipe and never shown. */
export function secretCommands(project: string, sitekey?: string): string[] {
  const put = (name: string) => `bunx wrangler@4 pages secret put ${name} --project-name=${project}`;
  return [
    "# wrangler needs a login first: bunx wrangler@4 login (or CLOUDFLARE_API_TOKEN with Pages Edit)",
    sitekey
      ? `cf turnstile widgets get ${sitekey} | bun -e 'process.stdout.write(JSON.parse(await Bun.stdin.text()).secret)' | ${put("TURNSTILE_SECRET")}`
      : `# TURNSTILE_SECRET: created and stored by --apply, or copy it from Dashboard > Turnstile > ${TURNSTILE_NAME} > Settings`,
    `openssl rand -hex 32 | tr -d '\\n' | ${put("ASK_IP_SALT_SEED")}`,
    `openssl rand -hex 32 | tr -d '\\n' | ${put("ASK_COOKIE_KEY")}`,
    `bunx wrangler@4 pages secret list --project-name=${project}`,
  ];
}

export function formatPlan(steps: readonly Step[], apply: boolean): string {
  const mark = { create: "+", update: "~", ok: "=", write: ">" } as const;
  const lines = [apply ? "Plan (applying):" : "Plan (dry run, nothing changes; add --apply):"];
  for (const step of steps) {
    lines.push(`  ${mark[step.action]} ${step.summary}`);
    for (const d of step.drift ?? []) lines.push(`      ${d}`);
    if (step.args) lines.push(`      cf ${step.args.join(" ")}`);
  }
  return lines.join("\n");
}

// ---- CLI (side effects below) ----

const WRANGLER_TOML = path.join(process.cwd(), "wrangler.toml");

function cf(args: string[], account: string, stdinText?: string): { ok: boolean; json: unknown; stderr: string } {
  const run = Bun.spawnSync(["cf", ...args], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    stdin: stdinText === undefined ? "ignore" : new TextEncoder().encode(stdinText),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = run.stdout.toString();
  let json: unknown = null;
  try {
    json = out.trim() ? JSON.parse(out) : null;
  } catch {
    json = null;
  }
  return { ok: run.exitCode === 0, json, stderr: run.stderr.toString() || out };
}

function list<T>(args: string[], account: string): T[] {
  const result = cf(args, account);
  if (!result.ok) throw new Error(`cf ${args.join(" ")} failed:\n${result.stderr}`);
  const json = result.json as T[] | { result?: T[] } | null;
  return Array.isArray(json) ? json : (json?.result ?? []);
}

function pipeSecret(name: string, value: string, project: string): boolean {
  const run = Bun.spawnSync(["bunx", "wrangler@4", "pages", "secret", "put", name, `--project-name=${project}`], {
    stdin: new TextEncoder().encode(value),
    stdout: "ignore",
    stderr: "pipe",
  });
  if (run.exitCode !== 0) {
    const reason = run.stderr.toString().split(value).join("[hidden]").trim().split("\n")[0];
    console.error(`::warning::Could not store ${name} (${reason}). Run \`bunx wrangler@4 login\`, then the TURNSTILE_SECRET command below.`);
  }
  return run.exitCode === 0;
}

function main() {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2), process.env);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
  if (options.help) {
    console.log("Usage: bun scripts/provision-ask.ts [--account <id>] [--project kurniadi] [--apply]");
    return;
  }
  const account = options.account;
  if (!account) {
    console.error("Set CLOUDFLARE_ACCOUNT_ID or pass --account <id> (cf auth whoami lists your accounts).");
    process.exit(2);
  }

  let toml = readFileSync(WRANGLER_TOML, "utf8");
  const state: State = {
    gateways: list<Gateway>(["ai-gateway", "gateways", "list", "--per-page", "50"], account),
    namespaces: list<Namespace>(["kv", "namespaces", "list", "--per-page", "100"], account),
    widgets: list<Widget>(["turnstile", "widgets", "list", "--per-page", "50"], account),
    toml,
  };
  const steps = buildPlan(state);
  console.log(formatPlan(steps, options.apply));

  let sitekey = state.widgets.find((w) => w.name === TURNSTILE_NAME)?.sitekey;
  if (options.apply) {
    for (const step of steps) {
      if (!step.args) continue;
      let result = cf(step.args, account);
      if (!result.ok && step.kind === "gateway" && /rate.?limit|interval/i.test(result.stderr)) {
        console.warn("::warning::The API rejected a one-day rate-limit window; retrying with 25 requests per hour.");
        const fallback = gatewayArgs({ ...GATEWAY_SETTINGS, ...GATEWAY_RATE_FALLBACK });
        result = cf([...step.args.slice(0, step.args.indexOf("--cache-ttl")), ...fallback], account);
      }
      if (!result.ok) {
        console.error(`Failed: ${step.summary}\n${result.stderr}`);
        process.exit(1);
      }
      const json = (result.json ?? {}) as Record<string, unknown>;
      const created = (json.result as Record<string, unknown> | undefined) ?? json;
      if (step.kind === "kv" && step.action === "create") {
        toml = setKvNamespaceId(toml, String(created.id));
        state.namespaces.push({ id: String(created.id), title: KV_TITLE });
      }
      if (step.kind === "turnstile" && step.action === "create") {
        sitekey = String(created.sitekey);
        toml = setTurnstileSiteKey(toml, sitekey);
        if (typeof created.secret === "string") pipeSecret("TURNSTILE_SECRET", created.secret, options.project);
      }
      console.log(`  done: ${step.summary}`);
    }
    const namespace = state.namespaces.find((n) => n.title === KV_TITLE);
    if (namespace && readKvId(toml) !== namespace.id) toml = setKvNamespaceId(toml, namespace.id);
    if (sitekey && readSiteKey(toml) !== sitekey) toml = setTurnstileSiteKey(toml, sitekey);
    writeFileSync(WRANGLER_TOML, toml);
    console.log("  wrangler.toml updated (commit it: KV IDs and site keys are not secret).");
  }

  console.log("\nSecrets (values are generated in the pipe and never printed):");
  for (const line of secretCommands(options.project, sitekey)) console.log(`  ${line}`);
  console.log(
    "\nThen: bun run build && bunx wrangler@4 pages deploy out --project-name=" +
      options.project +
      ", smoke test, and set ASK_ENABLED = \"true\" in wrangler.toml and deploy again (docs/ask-runbook.md).",
  );
}

if (import.meta.main) main();
