import { homedir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { relayPaths } from "../../tools/office-relay/src/store";

describe("relayPaths", () => {
  it("falls back to the OS home when HOME is missing or empty, never the working directory", () => {
    for (const env of [{}, { HOME: "" }]) {
      const paths = relayPaths(env);
      expect(paths.home).toBe(path.join(homedir(), ".office-relay"));
      expect(paths.pause).toBe(path.join(homedir(), ".office-pause"));
      expect(path.isAbsolute(paths.log)).toBe(true);
    }
  });

  it("uses HOME and OFFICE_RELAY_HOME when set", () => {
    expect(relayPaths({ HOME: "/h" })).toMatchObject({ home: "/h/.office-relay", pause: "/h/.office-pause", log: "/h/.office-relay/relay.log" });
    expect(relayPaths({ HOME: "/h", OFFICE_RELAY_HOME: "/r" })).toMatchObject({ home: "/r", pause: "/h/.office-pause", config: "/r/config.json" });
  });
});
