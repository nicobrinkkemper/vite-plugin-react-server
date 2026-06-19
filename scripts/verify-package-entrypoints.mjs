import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directFields = ["main", "module", "types"];

const targets = [];
for (const field of directFields) {
  if (typeof pkg[field] === "string") {
    targets.push([field, pkg[field]]);
  }
}

function collectExports(value, label) {
  if (typeof value === "string") {
    targets.push([label, value]);
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    collectExports(child, `${label}.${key}`);
  }
}

collectExports(pkg.exports, "exports");

const packed = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json", "."], {
    cwd: root,
    encoding: "utf8",
  }),
)[0];
const packedFiles = new Set(packed.files.map((file) => file.path));

const missing = [];
for (const [label, target] of targets) {
  if (target.includes("*") || target.startsWith("#")) {
    continue;
  }
  const relative = target.replace(/^\.\//, "");
  const path = join(root, relative);
  if (!existsSync(path)) {
    missing.push(`${label}: ${target} is missing from the build output`);
    continue;
  }
  if (!packedFiles.has(relative)) {
    missing.push(`${label}: ${target} is not included by npm pack`);
  }
}

if (missing.length > 0) {
  throw new Error(`Package entrypoint verification failed:\n${missing.join("\n")}`);
}

console.log(`Verified ${targets.length} package entrypoint targets.`);
