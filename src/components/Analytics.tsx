import { CF_BEACON_TOKEN } from "@/lib/site";

/**
 * Cloudflare Web Analytics beacon (cookieless, no consent banner needed).
 * Rendered only when NEXT_PUBLIC_CF_BEACON_TOKEN is set at build time.
 * `spa: true` records History API navigations, so room URLs count as views.
 */
export function Analytics({ token = CF_BEACON_TOKEN }: { token?: string }) {
  if (!token) return null;
  return (
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token, spa: true })}
    />
  );
}
