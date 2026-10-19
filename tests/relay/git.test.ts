import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRemote, readGit } from "../../tools/office-relay/src/git";
import { sessionHash } from "../../tools/office-relay/src/session";
import { branchTitle } from "../../tools/office-relay/src/title";

function repoAt(remote: string, head: string) {
  const root = mkdtempSync(path.join(tmpdir(), "relay-git-"));
  mkdirSync(path.join(root, ".git"));
  mkdirSync(path.join(root, "src", "deep"), { recursive: true });
  writeFileSync(path.join(root, ".git", "HEAD"), head);
  writeFileSync(path.join(root, ".git", "config"), `[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://github.com/other/thing.git\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
  return root;
}

describe("readGit", () => {
  it("reads the origin repository and branch from a subdirectory", () => {
    const root = repoAt("git@github.com:ShinyQ/ShinyQ-HQ.git", "ref: refs/heads/feat/intro-orbit-reveal\n");
    expect(readGit(path.join(root, "src", "deep"))).toEqual({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal" });
  });

  it("follows a worktree's .git file to the common config", () => {
    const main = repoAt("https://github.com/ShinyQ/ShinyQ-HQ", "ref: refs/heads/main\n");
    const gitDir = path.join(main, ".git", "worktrees", "wt");
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/office\n");
    writeFileSync(path.join(gitDir, "commondir"), "../..\n");
    const wt = mkdtempSync(path.join(tmpdir(), "relay-wt-"));
    writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
    expect(readGit(wt)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/office" });
  });

  it("returns the repository without a branch when HEAD is detached, and null outside a repository", () => {
    const root = repoAt("https://github.com/ShinyQ/ShinyQ-HQ.git", "4f1c0de4f1c0de4f1c0de4f1c0de4f1c0de4f1c0\n");
    expect(readGit(root)).toEqual({ repo: "ShinyQ/ShinyQ-HQ" });
    expect(readGit(mkdtempSync(path.join(tmpdir(), "relay-none-")))).toBeNull();
  });

  it("parses GitHub remotes only", () => {
    expect(parseRemote("git@github.com:ShinyQ/ShinyQ-HQ.git")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("https://github.com/ShinyQ/ShinyQ-HQ")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("ssh://git@github.com/ShinyQ/ShinyQ-HQ.git")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("https://dev.azure.com/org/project/_git/repo")).toBeNull();
  });
});

describe("branchTitle", () => {
  it.each([
    ["feat/intro-orbit-reveal", "Intro orbit reveal"],
    ["fix/glass_shader-NaN", "Glass shader NaN"],
    ["copilot/fix-123", "Fix 123"],
    ["main", null],
    ["master", null],
    ["feat/<script>", "Script"],
    ["feat/---", null],
  ])("%s", (branch, title) => {
    expect(branchTitle(branch)).toBe(title);
  });
});

describe("sessionHash", () => {
  it("is stable, salted, per agent and not the raw id", () => {
    const a = sessionHash("copilot", "raw-session-123", "salt-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionHash("copilot", "raw-session-123", "salt-1")).toBe(a);
    expect(sessionHash("copilot", "raw-session-123", "salt-2")).not.toBe(a);
    expect(sessionHash("claude", "raw-session-123", "salt-1")).not.toBe(a);
    expect(a).not.toContain("raw");
  });
});
