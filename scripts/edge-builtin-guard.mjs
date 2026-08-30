// Shared assertion for edge-bake gates: dist/server-edge must carry no
// statically-evaluated node builtin imports — a fetch runtime's validator
// rejects them at deploy while every Node-based check stays green.
// Usage: node scripts/edge-builtin-guard.mjs <path-to-dist/server-edge>
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { builtinModules } from "node:module";
import { init, parse } from "es-module-lexer";

const edgeDir = process.argv[2];
if (!edgeDir) {
  console.error("usage: node scripts/edge-builtin-guard.mjs <edge-dir>");
  process.exit(2);
}
await init;
const files = (await readdir(edgeDir, { recursive: true })).filter((f) =>
  f.endsWith(".js")
);
if (files.length === 0) {
  console.error(`✗ no .js bundles found in ${edgeDir}`);
  process.exit(1);
}
const isBuiltin = (spec) =>
  spec.startsWith("node:") || builtinModules.includes(spec);
const offenders = [];
for (const f of files) {
  const code = await readFile(join(edgeDir, f), "utf8");
  const [imports] = parse(code, f);
  for (const imp of imports) {
    if (!imp.n || !isBuiltin(imp.n)) continue;
    if (imp.d > -1) continue; // dynamic import(): lazy, boot-safe
    offenders.push(`${f}: ${imp.n}`);
  }
}
if (offenders.length > 0) {
  console.error(
    "✗ statically-evaluated node builtins in the edge bake " +
      "(a fetch runtime's validator rejects this at deploy):\n  " +
      offenders.join("\n  ")
  );
  process.exit(1);
}
console.log("✓ dist/server-edge is free of static node builtin imports");
