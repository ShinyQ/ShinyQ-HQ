/** What a shell command is doing, from its first words only (evaluated locally; the command never leaves the machine). */
export type CommandKind = "test" | "ci" | "build" | "git" | "read" | "shell";

const ENV = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SKIP = new Set(["cd", "export", "env", "time", "sudo", "nohup", "pushd", "source", "."]);
const READERS = new Set(["rg", "grep", "cat", "sed", "head", "tail", "ls", "find", "wc", "tree", "less", "awk", "jq", "fd", "stat"]);

/** The first three words of the first segment that runs a program (skips `cd x &&`, `export`, `FOO=bar`). */
function headWords(command: string): string[] {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length > 0 && ENV.test(words[0])) words.shift();
    if (words.length === 0 || SKIP.has(words[0])) continue;
    return words.slice(0, 3).map((w) => w.replace(/^["']|["']$/g, ""));
  }
  return [];
}

export function commandKind(command: string): CommandKind {
  const [a = "", b = "", c = ""] = headWords(command);
  const runner = a === "bunx" || a === "npx" || a === "pnpx" ? b : a;
  if (a === "gh" && ((b === "pr" && c === "checks") || (b === "run" && (c === "watch" || c === "view")))) return "ci";
  if (runner === "vitest" || runner === "playwright" || runner === "jest" || a === "pytest" || (a === "python" && b === "-m" && c === "pytest")) return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn" || a === "go" || a === "cargo" || a === "dotnet") && b === "test") return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn") && b === "run" && /^(test|e2e|verify)/.test(c)) return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn") && b === "run" && /^(build|typecheck|lint)/.test(c)) return "build";
  if (runner === "tsc" || runner === "eslint" || runner === "next" || ((a === "docker" || a === "go" || a === "cargo" || a === "dotnet") && b === "build")) return "build";
  if (a === "git") return b === "diff" || b === "log" || b === "show" || b === "status" || b === "blame" ? "read" : "git";
  if (a === "gh" && b === "pr") return "git";
  if (READERS.has(a)) return "read";
  return "shell";
}
