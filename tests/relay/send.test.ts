import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { endpointOf, readIngestKey, signBody } from "../../tools/office-relay/src/send";
import { DEFAULT_CONFIG } from "../../tools/office-relay/src/store";

// Next.js types make NODE_ENV required in ProcessEnv.
const env = (vars: Record<string, string>): NodeJS.ProcessEnv => ({ NODE_ENV: "test", ...vars });

describe("endpointOf", () => {
  it("keeps the config endpoint for any override that is not plain http on 127.0.0.1 with a port", () => {
    for (const override of ["http://127.0.0.1.evil.com:80/", "http://user@evil.com/", "https://127.0.0.1:8787/", "http://localhost:8787/", "http://evil.example/", "HTTP://127.0.0.1:80/"]) {
      expect(endpointOf(DEFAULT_CONFIG, env({ OFFICE_RELAY_ENDPOINT: override }))).toBe(DEFAULT_CONFIG.endpoint);
    }
    expect(endpointOf(DEFAULT_CONFIG, env({}))).toBe(DEFAULT_CONFIG.endpoint);
  });

  it("accepts a local 127.0.0.1 test endpoint", () => {
    expect(endpointOf(DEFAULT_CONFIG, env({ OFFICE_RELAY_ENDPOINT: "http://127.0.0.1:8787/x" }))).toBe("http://127.0.0.1:8787/x");
  });
});

describe("signBody", () => {
  it("is the sha256= prefixed HMAC-SHA256 hex of the exact body", () => {
    const body = '{"v":1,"agent":"claude"}';
    expect(signBody(body, "secret")).toBe(`sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`);
    expect(signBody(body, "secret")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });
});

describe("readIngestKey", () => {
  it("returns OFFICE_RELAY_KEY when set", () => {
    expect(readIngestKey(env({ OFFICE_RELAY_KEY: "test-key" }))).toBe("test-key");
  });
});
