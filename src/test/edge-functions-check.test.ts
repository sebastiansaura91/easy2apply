import { describe, expect, it } from "vitest";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/**
 * The Deno edge functions live outside tsconfig, so `tsc --noEmit` and the vite
 * build never look at them — which is exactly how a renamed helper left three
 * stale `normalize(...)` calls in ats-check and took the deployed scan down with
 * "normalize is not defined". This guard runs the TypeScript checker over every
 * function and fails the suite on undefined identifiers and syntax errors.
 *
 * URL imports (deno.land, esm.sh) can't resolve here — module-resolution errors
 * are expected and ignored. What we keep: TS1xxx (syntax), TS2304/TS2552/TS2551
 * (cannot find name / typo suggestions) for anything that isn't a known Deno global.
 */

const ROOT = join(__dirname, "..", "..", "supabase", "functions");
const DENO_GLOBALS = new Set(["Deno", "EdgeRuntime"]);
// Names that only exist in modules the checker cannot resolve (URL imports):
// their import succeeds syntactically, so the identifier IS declared — no entry needed.

function functionFiles(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync(ROOT, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const idx = join(ROOT, dir.name, "index.ts");
    if (existsSync(idx)) out.push(idx);
    if (dir.name === "_shared") {
      for (const f of readdirSync(join(ROOT, dir.name))) {
        if (f.endsWith(".ts")) out.push(join(ROOT, dir.name, f));
      }
    }
  }
  return out;
}

describe("edge functions type-sanity (the check tsc never runs)", () => {
  it("no syntax errors and no undefined identifiers in any function", () => {
    const files = functionFiles();
    expect(files.length).toBeGreaterThan(10);
    const program = ts.createProgram(files, {
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      allowImportingTsExtensions: true,
      skipLibCheck: true,
      strict: false,
    });
    const problems: string[] = [];
    for (const file of program.getSourceFiles()) {
      if (!file.fileName.includes("supabase")) continue;
      const diags = [
        ...program.getSyntacticDiagnostics(file),
        ...program.getSemanticDiagnostics(file),
      ];
      for (const d of diags) {
        const isSyntax = d.code < 2000;
        const isMissingName = d.code === 2304 || d.code === 2552 || d.code === 2551;
        if (!isSyntax && !isMissingName) continue; // unresolved URL imports etc. are fine here
        const msg = ts.flattenDiagnosticMessageText(d.messageText, " ");
        if (isMissingName && [...DENO_GLOBALS].some(g => msg.includes(`'${g}'`))) continue;
        const pos = d.start !== undefined ? file.getLineAndCharacterOfPosition(d.start) : { line: 0, character: 0 };
        problems.push(`${file.fileName.split(/[\\/]/).slice(-2).join("/")}:${pos.line + 1} TS${d.code} ${msg}`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
