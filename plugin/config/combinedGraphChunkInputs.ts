import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type {
  CombinedGraphChunkHashInput,
  CombinedGraphHashCharacters,
} from "./createCombinedGraphChunkHash.js";

/**
 * Strip Vite/Rollup query and virtual-null prefixes so the same on-disk module
 * yields one bag id across environments.
 */
export function stripModuleIdDecorations(id: string): string {
  let cleaned = id;
  if (cleaned.startsWith("\0")) {
    cleaned = cleaned.slice(1);
  }
  const query = cleaned.indexOf("?");
  if (query !== -1) {
    cleaned = cleaned.slice(0, query);
  }
  return cleaned;
}

/**
 * Project-relative posix id for the combined-graph bag. Absolute Vite module
 * ids and already-relative paths both land on the same string so client,
 * SSR, RSC, static and edge agree without passing env labels into the bag.
 */
export function toCanonicalModuleId(projectRoot: string, id: string): string {
  const cleaned = stripModuleIdDecorations(id).split("\\").join("/");
  const root = projectRoot.split("\\").join("/").replace(/\/+$/, "");
  if (!cleaned) {
    return cleaned;
  }
  if (isAbsolute(cleaned) || /^[A-Za-z]:\//.test(cleaned)) {
    const rel = relative(root, cleaned).split("\\").join("/");
    return rel.startsWith("..") ? cleaned : rel;
  }
  if (cleaned.startsWith(`${root}/`)) {
    return cleaned.slice(root.length + 1);
  }
  return cleaned.replace(/^\.\//, "");
}

/**
 * Read on-disk sources keyed by canonical module id. Missing files contribute
 * an empty string (same contract as {@link CombinedGraphChunkHashInput}).
 */
export function collectModuleSources(
  projectRoot: string,
  moduleIds: readonly string[],
  overrides?: Readonly<Record<string, string>>,
): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const id of moduleIds) {
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, id)) {
      sources[id] = overrides[id]!;
      continue;
    }
    try {
      const absolute = resolve(projectRoot, id);
      sources[id] = existsSync(absolute)
        ? readFileSync(absolute, "utf-8")
        : "";
    } catch {
      sources[id] = "";
    }
  }
  return sources;
}

/**
 * Minimal chunk shape shared by PreRenderedChunk and RenderedChunk for bag
 * construction. `imports` is only present after render; naming time omits it.
 */
export type ChunkGraphLike = {
  name: string;
  facadeModuleId?: string | null;
  moduleIds: readonly string[];
  imports?: readonly string[];
};

/**
 * Build the combined-graph hash input for a Rollup chunk. Module ids are
 * canonicalized; sources come from disk unless overridden (e.g. a single
 * facade source already read by the caller). Imported chunk names are the
 * raw `imports` list when present — callers that embed the hash in the
 * filename (no `[hash]` placeholder) typically pass `importedChunkNames: []`
 * to avoid circular dependence on final file names.
 */
export function buildCombinedGraphChunkHashInput(
  projectRoot: string,
  chunk: ChunkGraphLike,
  options: {
    hashCharacters?: CombinedGraphHashCharacters;
    moduleSourceOverrides?: Readonly<Record<string, string>>;
    importedChunkNames?: readonly string[];
    fingerprint?: CombinedGraphChunkHashInput["fingerprint"];
  } = {},
): CombinedGraphChunkHashInput {
  const rawIds =
    chunk.moduleIds.length > 0
      ? chunk.moduleIds
      : chunk.facadeModuleId
        ? [chunk.facadeModuleId]
        : [];
  const moduleIds = rawIds.map((id) => toCanonicalModuleId(projectRoot, id));
  const uniqueIds = [...new Set(moduleIds)];
  return {
    moduleIds: uniqueIds,
    moduleSources: collectModuleSources(
      projectRoot,
      uniqueIds,
      options.moduleSourceOverrides,
    ),
    importedChunkNames: options.importedChunkNames ?? [],
    fingerprint: options.fingerprint,
    hashCharacters: options.hashCharacters,
  };
}
