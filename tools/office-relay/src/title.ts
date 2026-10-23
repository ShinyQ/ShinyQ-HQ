import { OFFICE_TITLE_MAX } from "../../../src/lib/office/protocol";

const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "trunk"]);

/**
 * A readable task title from a branch name: the last path part, separators to spaces, first letter upper case
 * (`feat/intro-orbit-reveal` becomes "Intro orbit reveal"). Null for default branches or nothing left.
 */
export function branchTitle(branch: string): string | null {
  if (DEFAULT_BRANCHES.has(branch)) return null;
  const last = branch.split("/").filter(Boolean).at(-1) ?? "";
  const words = last
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .slice(0, OFFICE_TITLE_MAX)
    .trim();
  if (!words) return null;
  return words[0].toUpperCase() + words.slice(1);
}
