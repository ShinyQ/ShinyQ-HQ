/** The first argument of the call whose "(" sits at `open`, or null when the parentheses never balance. */
function firstArgument(text: string, open: number): string | null {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth += 1;
    else if (c === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(open + 1, i);
    } else if (c === "," && depth === 1) return text.slice(open + 1, i);
  }
  return null;
}

const GUARDED = /^(max|clamp|abs|exp|exp2)\s*\(/;
const NUMBER = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

/**
 * Bases of GLSL `pow()` calls in `text` that are not non-negative by construction. A base is safe when it is a
 * positive number literal, a `max(`, `clamp(`, `abs(` or `exp(` call, or a variable assigned from one of those
 * in the same source. `Math.pow` and other member calls (JS) are skipped.
 */
export function unsafeShaderPows(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?<![\w.$])pow\s*\(/g)) {
    const base = firstArgument(text, m.index + m[0].length - 1)?.trim();
    // Prose such as "pow()" in a comment has no argument.
    if (!base) continue;
    if (NUMBER.test(base) || GUARDED.test(base)) continue;
    if (/^[A-Za-z_]\w*$/.test(base) && new RegExp(`\\b${base}\\s*=\\s*(max|clamp|abs|exp|exp2)\\s*\\(`).test(text)) continue;
    out.push(base);
  }
  return out;
}
