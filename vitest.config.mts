import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
    benchmark: { include: ["tests/bench/**/*.bench.ts"] },
    environment: "node",
    server: {
      deps: {
        // These packages ship a CommonJS main (no exports map) that does require("three"). Externalized, Node loads that
        // build, so three is required (three.cjs, require(esm)) while the ESM graph imports it, and Node 24 can throw
        // "Cannot require() ES Module ... not yet fully loaded" on a cold cache (a lazy floor chunk then falls back,
        // tests/hud/DrawerHost.test.tsx). Inlined, Vite resolves their ESM builds and three loads once, as ESM.
        inline: [/^@react-three\//, /^troika-/],
      },
    },
  },
});
