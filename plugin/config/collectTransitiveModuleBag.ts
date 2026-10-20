import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { initSync, parse as parseImports } from "es-module-lexer";
import {
  collectModuleSources,
  toCanonicalModuleId,
} from "./combinedGraphChunkInputs.js";

/** Extensions tried when resolving a relative import to a first-party file. */
const RESOLVE_EXTENSIONS = [
  "",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
] as const;

const INDEX_EXTENSIONS = [
  "/index.tsx",
  "/index.ts",
  "/index.jsx",
  "/index.js",
  "/index.mjs",
] as const;

let lexerReady = false;

function ensureLexer(): void {
  if (!lexerReady) {
    initSync();
    lexerReady = true;
  }
}

/**
 * Whether `spec` is a relative first-party import we should follow into the
 * combined-graph bag. Bare package names, `node:`, URLs, and absolute paths
 * outside the project are excluded — those are not content-addressed by vprs
 * naming (and would break cross-machine agreement).
 */
export function isRelativeFirstPartySpec(spec: string): boolean {
  return (
    spec.startsWith("./") ||
    spec.startsWith("../") ||
    // Project-absolute `/src/...` is uncommon in sources but treat as relative
    // to project root when it has no scheme.
    (spec.startsWith("/") && !spec.startsWith("//") && !/^[a-z]+:/i.test(spec))
  );
}

/**
 * Resolve a relative import specifier to an on-disk file under `projectRoot`,
 * or `null` when nothing matches.
 */
export function resolveFirstPartyImport(
  projectRoot: string,
  fromCanonicalId: string,
  spec: string,
): string | null {
  const cleaned = spec.split("?")[0]?.split("#")[0] ?? spec;
  if (!cleaned || cleaned.includes("node_modules")) {
    return null;
  }

  let candidateBase: string;
  if (cleaned.startsWith("/")) {
    candidateBase = resolve(projectRoot, cleaned.slice(1));
  } else {
    const fromDir = dirname(resolve(projectRoot, fromCanonicalId));
    candidateBase = resolve(fromDir, cleaned);
  }

  const tryPath = (absolute: string): string | null => {
    // `existsSync` is true for directories; `./helper` must not bind the
    // `helper/` folder (empty "source") and skip `helper/index.js`.
    try {
      if (!statSync(absolute).isFile()) return null;
    } catch {
      return null;
    }
    const canonical = toCanonicalModuleId(projectRoot, absolute);
    if (
      !canonical ||
      canonical.startsWith("..") ||
      canonical.includes("node_modules")
    ) {
      return null;
    }
    return canonical;
  };

  for (const ext of RESOLVE_EXTENSIONS) {
    const hit = tryPath(candidateBase + ext);
    if (hit) return hit;
  }
  for (const indexExt of INDEX_EXTENSIONS) {
    const hit = tryPath(candidateBase + indexExt);
    if (hit) return hit;
  }
  return null;
}

/**
 * Extract relative import/export specifiers from module source via
 * es-module-lexer (static string specs only).
 */
export function listRelativeImportSpecs(source: string): string[] {
  ensureLexer();
  try {
    const [imports] = parseImports(source);
    const specs: string[] = [];
    for (const item of imports) {
      if (item.n && isRelativeFirstPartySpec(item.n)) {
        specs.push(item.n);
      }
    }
    return specs;
  } catch {
    return [];
  }
}

export type TransitiveModuleBag = {
  moduleIds: string[];
  moduleSources: Record<string, string>;
};

/**
 * Walk relative first-party imports from one or more roots and collect every
 * reachable on-disk source. Used as the combined-graph bag for chunk naming
 * and client-reference ids so:
 *
 * - bundled deps (preserveModules: false) change the facade hash when they
 *   change;
 * - separate-chunk deps (preserveModules: true) also change the importer
 *   hash when they change — without putting final hashed filenames into the
 *   bag (which would be circular).
 *
 * Order is sorted for stability. Cycles are ignored. Missing files contribute
 * an empty source only when listed via `sourceOverrides`.
 */
export function collectTransitiveModuleBag(
  projectRoot: string,
  rootIds: readonly string[],
  options: {
    sourceOverrides?: Readonly<Record<string, string>>;
  } = {},
): TransitiveModuleBag {
  const overrides = options.sourceOverrides ?? {};
  const visited = new Set<string>();
  const queue: string[] = [];

  for (const raw of rootIds) {
    const id = toCanonicalModuleId(projectRoot, raw);
    if (id && !visited.has(id)) {
      visited.add(id);
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const id = queue.pop()!;
    let source = "";
    if (Object.prototype.hasOwnProperty.call(overrides, id)) {
      source = overrides[id]!;
    } else {
      try {
        const absolute = resolve(projectRoot, id);
        if (existsSync(absolute)) {
          source = readFileSync(absolute, "utf-8");
        }
      } catch {
        source = "";
      }
    }
    if (!source) continue;

    for (const spec of listRelativeImportSpecs(source)) {
      const resolved = resolveFirstPartyImport(projectRoot, id, spec);
      if (resolved && !visited.has(resolved)) {
        visited.add(resolved);
        queue.push(resolved);
      }
    }
  }

  const moduleIds = [...visited].sort();
  return {
    moduleIds,
    moduleSources: collectModuleSources(projectRoot, moduleIds, overrides),
  };
}

/**
 * Convenience: transitive bag from a single entry, with an optional override
 * for that entry's source (transformer / unit tests).
 */
export function collectTransitiveModuleBagFromEntry(
  projectRoot: string,
  entryId: string,
  entrySource?: string,
): TransitiveModuleBag {
  const canonical = toCanonicalModuleId(projectRoot, entryId);
  const overrides =
    entrySource != null ? { [canonical]: entrySource } : undefined;
  return collectTransitiveModuleBag(projectRoot, [canonical], {
    sourceOverrides: overrides,
  });
}
