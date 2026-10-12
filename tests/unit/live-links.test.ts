import { describe, expect, it } from "vitest";
import { isPublicLiveUrl, liveUrlProblem, PUBLIC_LIVE_HOSTS } from "@/content/live-links";

describe("public live links (R4-J)", () => {
  it("allows exactly the two public MII Microsoft sites", () => {
    expect([...PUBLIC_LIVE_HOSTS].sort()).toEqual(["mii-microsoft-ai.azurewebsites.net", "mii-microsoft.azurewebsites.net"]);
  });

  it.each(["https://mii-microsoft.azurewebsites.net", "https://mii-microsoft-ai.azurewebsites.net/"])("accepts the site root %s", (url) => {
    expect(liveUrlProblem(url)).toBeNull();
    expect(isPublicLiveUrl(url)).toBe(true);
  });

  it.each([
    ["http://mii-microsoft.azurewebsites.net", "https"],
    ["https://vendor-portal.azurewebsites.net", "PUBLIC_LIVE_HOSTS"],
    ["https://mii-microsoft.azurewebsites.net.evil.example", "PUBLIC_LIVE_HOSTS"],
    ["https://mii-microsoft-ai.azurewebsites.net/dashboard", "site root"],
    ["https://mii-microsoft.azurewebsites.net/?ref=hq", "site root"],
    ["https://mii-microsoft.azurewebsites.net/#top", "site root"],
    ["https://visitor@mii-microsoft.azurewebsites.net", "credentials"],
    ["https://mii-microsoft.azurewebsites.net:8443", "credentials"],
    ["mii-microsoft.azurewebsites.net", "absolute URL"],
  ])("rejects %s", (url, reason) => {
    expect(liveUrlProblem(url)).toContain(reason);
    expect(isPublicLiveUrl(url)).toBe(false);
  });
});
