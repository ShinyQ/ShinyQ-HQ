import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Dev-only pages (`page.dev.tsx`, for example the walkable floors prototype) exist under `next dev`
 * or with HQ_DEV_PAGES=1; production exports never include them.
 */
const devPages = process.env.NODE_ENV !== "production" || process.env.HQ_DEV_PAGES === "1";

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: devPages ? ["dev.tsx", "tsx", "ts", "jsx", "js"] : ["tsx", "ts", "jsx", "js"],
  // AGENTS.md is maintained by hand (see "Next.js version notes" there).
  agentRules: false,
  images: { unoptimized: true },
  experimental: {
    globalNotFound: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        // CSS modules (the study guide reader's styles) skip Tailwind and keep Next's scoped class names.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
