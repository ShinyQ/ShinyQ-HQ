import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    // No `Host:` line: it was a Yandex-only extension that Google and Bing ignore.
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
