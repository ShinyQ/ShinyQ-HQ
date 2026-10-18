import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The two file reads git data needs (injectable for tests). */
export interface FsLike {
  read(file: string): string | null;
  isDir(file: string): boolean;
}

export const nodeFs: FsLike = {
  read(file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  },
  isDir(file) {
    try {
      return statSync(file).isDirectory();
    } catch {
      return false;
    }
  },
};

export interface GitInfo {
  repo: string;
  branch?: string;
}

/** `owner/name` of a GitHub remote URL (https, ssh or scp form), or null for any other host. */
export function parseRemote(url: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

function findGitDir(cwd: string, fs: FsLike): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const dotGit = path.join(dir, ".git");
    if (fs.isDir(dotGit)) return dotGit;
    const pointer = fs.read(dotGit);
    const target = pointer ? /^gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim() : undefined;
    if (target) return path.resolve(dir, target);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function originUrl(config: string): string | null {
  const section = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(config)?.[1] ?? "";
  return /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
}

/**
 * The origin repository and branch of the directory an agent works in, read from `.git` files only (never by
 * running git), worktrees included. Null outside a GitHub repository.
 */
export function readGit(cwd: string, fs: FsLike = nodeFs): GitInfo | null {
  const gitDir = findGitDir(cwd, fs);
  if (!gitDir) return null;
  const common = fs.read(path.join(gitDir, "commondir"))?.trim();
  const commonDir = common ? path.resolve(gitDir, common) : gitDir;
  const url = originUrl(fs.read(path.join(commonDir, "config")) ?? "");
  const repo = url ? parseRemote(url) : null;
  if (!repo) return null;
  const branch = /^ref:\s*refs\/heads\/(\S+)/.exec(fs.read(path.join(gitDir, "HEAD")) ?? "")?.[1];
  return branch ? { repo, branch } : { repo };
}
