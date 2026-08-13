import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { builtinModules } from "node:module";
import { init as lexerInit, parse as lexerParse } from "es-module-lexer";

/**
 * Walk every emitted `.js` in an edge output dir and collect the imports that
 * would EVALUATE a node builtin at module load — the class of regression that
 * crashes the single-isolate bundle on a runtime with no `node:*` while every
 * Node-based test stays green. Dynamic `import("node:...")` is the sanctioned
 * lazy-fallback shape and is not collected: it only evaluates if its path
 * actually runs. es-module-lexer's static/dynamic records classify the two
 * exactly, so `node:` inside error-message strings cannot false-positive.
 */
export async function collectStaticBuiltinImports(
  edgeDir: string
): Promise<string[]> {
  await lexerInit;
  const files = (await readdir(edgeDir, { recursive: true })).filter((f) =>
    f.endsWith(".js")
  );
  if (files.length === 0) {
    throw new Error(`edge-bundle-guard: no .js bundles found in ${edgeDir}`);
  }
  const isBuiltin = (spec: string) =>
    spec.startsWith("node:") || builtinModules.includes(spec);
  const offenders: string[] = [];
  for (const f of files) {
    const code = await readFile(join(edgeDir, f), "utf8");
    const [imports] = lexerParse(code, f);
    for (const imp of imports) {
      if (!imp.n || !isBuiltin(imp.n)) continue;
      if (imp.d > -1) continue; // dynamic import(): lazy, boot-safe
      offenders.push(`${f}: ${imp.n}`);
    }
  }
  return offenders;
}
