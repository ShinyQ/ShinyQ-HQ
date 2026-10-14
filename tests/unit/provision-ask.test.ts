import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildPlan,
  formatPlan,
  GATEWAY_ID,
  GATEWAY_SETTINGS,
  gatewayArgs,
  gatewayDrift,
  KV_PLACEHOLDER,
  KV_TITLE,
  parseArgs,
  readKvId,
  readSiteKey,
  secretCommands,
  setKvNamespaceId,
  setTurnstileSiteKey,
  TURNSTILE_DOMAINS,
  TURNSTILE_NAME,
  type State,
} from "../../scripts/provision-ask";
import { buildPurgeUrl, purgeCutoff } from "../../scripts/purge-ask-logs";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const KV_ID = "fedcba9876543210fedcba9876543210";
const toml = readFileSync("wrangler.toml", "utf8");
const placeholderToml = toml.replace(/(binding = "ASK_KV"\nid = ")[^"]*/, `$1${KV_PLACEHOLDER}`).replace(/^TURNSTILE_SITE_KEY = "[^"]*"/m, 'TURNSTILE_SITE_KEY = ""');
const empty: State = { gateways: [], namespaces: [], widgets: [], toml: placeholderToml };

describe("parseArgs", () => {
  it("defaults to a dry run on the kurniadi project with the env account", () => {
    expect(parseArgs([], { CLOUDFLARE_ACCOUNT_ID: ACCOUNT })).toEqual({ apply: false, account: ACCOUNT, project: "kurniadi", help: false });
  });

  it("reads flags in both forms", () => {
    expect(parseArgs(["--apply", "--account", ACCOUNT, "--project=preview"])).toMatchObject({ apply: true, account: ACCOUNT, project: "preview" });
    expect(parseArgs(["--apply", "--dry-run"]).apply).toBe(false);
  });

  it("rejects unknown flags, missing values and malformed accounts", () => {
    expect(() => parseArgs(["--force"])).toThrow(/Unknown/);
    expect(() => parseArgs(["--account"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--account", "abc"])).toThrow(/32 hex/);
  });
});

describe("wrangler.toml", () => {
  it("is free of secrets and sets the kill switch explicitly", () => {
    expect(toml).toMatch(/^ASK_ENABLED = "(true|false)"$/m);
    expect(toml).not.toMatch(/^\s*(TURNSTILE_SECRET|ASK_IP_SALT_SEED|ASK_COOKIE_KEY)\s*=/m);
    expect(toml).toMatch(/^pages_build_output_dir = "out"$/m);
  });

  it("replaces the ASK_KV namespace ID and nothing else", () => {
    const next = setKvNamespaceId(toml, KV_ID);
    expect(readKvId(next)).toBe(KV_ID);
    expect(next.replace(KV_ID, "X")).toBe(toml.replace(readKvId(toml)!, "X"));
    expect(() => setKvNamespaceId(toml, "not-an-id")).toThrow();
    expect(() => setKvNamespaceId("[vars]\n", KV_ID)).toThrow(/ASK_KV/);
  });

  it("sets the public Turnstile site key", () => {
    const next = setTurnstileSiteKey(toml, "0x4AAAAAAAabcdefGHIJ");
    expect(readSiteKey(next)).toBe("0x4AAAAAAAabcdefGHIJ");
    expect(() => setTurnstileSiteKey(toml, "bad key!")).toThrow();
  });
});

describe("buildPlan", () => {
  it("creates everything on an empty account", () => {
    const steps = buildPlan(empty);
    expect(steps.filter((s) => s.action === "create").map((s) => s.kind)).toEqual(["gateway", "kv", "turnstile"]);
    const gateway = steps.find((s) => s.kind === "gateway")!;
    expect(gateway.args).toEqual(expect.arrayContaining(["--id", GATEWAY_ID, "--cache-ttl", "604800", "--rate-limiting-limit", "600", "--log-management-strategy", "DELETE_OLDEST"]));
    expect(gateway.args!.join(" ")).not.toMatch(/spend|unified|logpush/);
    const turnstile = steps.find((s) => s.kind === "turnstile")!;
    expect(turnstile.args).toEqual(expect.arrayContaining(["--widget-mode", "invisible", ...TURNSTILE_DOMAINS]));
    expect(formatPlan(steps, false)).toMatch(/dry run/);
  });

  it("is idempotent once the resources exist and wrangler.toml holds their IDs", () => {
    const state: State = {
      gateways: [{ id: GATEWAY_ID, ...GATEWAY_SETTINGS }],
      namespaces: [{ id: KV_ID, title: KV_TITLE }],
      widgets: [{ sitekey: "0x4AAAAAAAabcdefGHIJ", name: TURNSTILE_NAME, domains: TURNSTILE_DOMAINS, mode: "invisible" }],
      toml: setTurnstileSiteKey(setKvNamespaceId(toml, KV_ID), "0x4AAAAAAAabcdefGHIJ"),
    };
    expect(buildPlan(state).every((s) => s.action === "ok")).toBe(true);
  });

  it("writes known IDs into wrangler.toml and updates a drifted gateway", () => {
    const steps = buildPlan({ ...empty, gateways: [{ id: GATEWAY_ID, ...GATEWAY_SETTINGS, cache_ttl: 60 }], namespaces: [{ id: KV_ID, title: KV_TITLE }] });
    const gateway = steps.find((s) => s.kind === "gateway")!;
    expect(gateway.action).toBe("update");
    expect(gateway.drift).toEqual(["cache_ttl: 60 -> 604800"]);
    expect(steps.some((s) => s.kind === "toml" && s.summary.includes(KV_ID))).toBe(true);
  });

  it("accepts the hourly rate-limit fallback as no drift", () => {
    expect(gatewayDrift({ id: GATEWAY_ID, ...GATEWAY_SETTINGS, rate_limiting_interval: 3600, rate_limiting_limit: 25 })).toEqual([]);
  });

  it("maps settings to cf flags", () => {
    expect(gatewayArgs({ cache_ttl: 1, collect_logs: true })).toEqual(["--cache-ttl", "1", "--collect-logs", "true"]);
  });
});

describe("secretCommands", () => {
  it("pipes generated values without printing them", () => {
    const lines = secretCommands("kurniadi", "0x4AAAAAAAabcdefGHIJ");
    expect(lines.join("\n")).toMatch(/openssl rand -hex 32 \| tr -d '\\n' \| bunx wrangler pages secret put ASK_IP_SALT_SEED --project-name=kurniadi/);
    expect(lines.join("\n")).toMatch(/ASK_COOKIE_KEY/);
    expect(lines[1]).toMatch(/cf turnstile widgets get 0x4AAAAAAAabcdefGHIJ .*TURNSTILE_SECRET/);
    expect(lines.join("\n")).not.toMatch(/echo/);
  });
});

describe("purge-ask-logs", () => {
  it("computes the cutoff and the filtered DELETE URL", () => {
    const cutoff = purgeCutoff(new Date("2026-10-11T00:00:00Z"), 7);
    expect(cutoff).toBe("2026-10-04T00:00:00.000Z");
    const url = new URL(buildPurgeUrl(ACCOUNT, "shinyq-hq", cutoff));
    expect(url.pathname).toBe(`/client/v4/accounts/${ACCOUNT}/ai-gateway/gateways/shinyq-hq/logs`);
    expect(JSON.parse(url.searchParams.get("filters")!)).toEqual([{ key: "created_at", operator: "lt", value: [cutoff] }]);
    expect(() => purgeCutoff(new Date(), 0)).toThrow();
  });
});
