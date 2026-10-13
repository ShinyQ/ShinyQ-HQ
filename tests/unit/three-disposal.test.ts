import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Builders of GPU resources: `new XGeometry(...)`, `new XTexture(...)`, helpers named `...Geometry(...)`, `LineBatch.build()`. */
const PRODUCER = /(Geometry|Texture)$/;

function buildsGpuResource(node: ts.Node): boolean {
  let found = false;
  const visit = (n: ts.Node): void => {
    if (found) return;
    if (ts.isNewExpression(n) && ts.isIdentifier(n.expression) && PRODUCER.test(n.expression.text)) found = true;
    else if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && PRODUCER.test(callee.text)) found = true;
      else if (ts.isPropertyAccessExpression(callee) && callee.name.text === "build") found = true;
    }
    if (!found) ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function enclosingFunction(node: ts.Node): ts.Node {
  let n: ts.Node | undefined = node.parent;
  while (n && !ts.isFunctionLike(n)) n = n.parent;
  return n ?? node.getSourceFile();
}

/** Names of `useMemo` results that build a geometry or texture and are never disposed in the same component. */
function undisposedMemos(source: string, file = "component.tsx"): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: string[] = [];
  const visit = (n: ts.Node): void => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      ts.isIdentifier(n.initializer.expression) &&
      n.initializer.expression.text === "useMemo" &&
      n.initializer.arguments.length > 0 &&
      buildsGpuResource(n.initializer.arguments[0])
    ) {
      const name = n.name.text;
      const scope = enclosingFunction(n).getText(sf);
      if (!new RegExp(`\\b${name}\\??\\.dispose\\(|\\buseDispose\\(\\s*${name}\\s*\\)`).test(scope)) missing.push(name);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return missing;
}

function components(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    // The walkable floors prototype is dev-only and never in the export.
    if (statSync(full).isDirectory()) return name === "prototype" ? [] : components(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

describe("three.js disposal lint", () => {
  it("flags a memoized geometry that is never disposed and accepts the disposed forms", () => {
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(1, 1, 1), []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => hexGeometry(2), []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => { const b = new LineBatch(); return b.build(); }, []); return g; }")).toEqual(["g"]);
    expect(undisposedMemos("function A() { const t = useMemo(() => new CanvasTexture(c), [c]); return t; }")).toEqual(["t"]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useDispose(g); return g; }")).toEqual([]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useEffect(() => () => g.dispose(), [g]); }")).toEqual([]);
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); useEffect(() => () => g?.dispose(), [g]); }")).toEqual([]);
    expect(undisposedMemos("function A() { const c = useMemo(() => new Color(), []); return c; }")).toEqual([]);
    // Another component disposing a value of the same name does not count.
    expect(undisposedMemos("function A() { const g = useMemo(() => new BoxGeometry(), []); } function B() { const g = useMemo(() => new BoxGeometry(), []); useDispose(g); }")).toEqual(["g"]);
  });

  it("finds no undisposed memoized geometry or texture in src/experience", () => {
    const offenders = components("src/experience").flatMap((file) => undisposedMemos(readFileSync(file, "utf8"), file).map((name) => `${file}: ${name}`));
    expect(offenders).toEqual([]);
  });
});
