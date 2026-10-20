import { createRollupLikeHash } from "./createRollupLikeHash.js";

/**
 * Character set for the filename suffix. Matches {@link createRollupLikeHash}.
 */
export type CombinedGraphHashCharacters = "base36" | "base64" | "hex";

/**
 * Inputs that shape a browser chunk's content-addressed name across every
 * vprs build environment. Callers must pass the same canonical module set in
 * client, SSR, RSC, static and edge — not each environment's local Rollup
 * membership — or client-reference filenames diverge.
 *
 * Sources are supplied explicitly so the helper stays filesystem-free and
 * unit-testable; wiring that reads disk lives with the naming plugins.
 */
export type CombinedGraphChunkHashInput = {
  /**
   * Module ids that belong to the chunk. Order is ignored; the helper sorts
   * them so two environments with the same set produce the same bag.
   */
  moduleIds: readonly string[];
  /**
   * Source text keyed by module id. Ids present in `moduleIds` but missing
   * here contribute an empty source (same as an empty file).
   */
  moduleSources: Readonly<Record<string, string>>;
  /**
   * Names of chunks this chunk imports. Order is ignored; sorted before hash.
   */
  importedChunkNames?: readonly string[];
  /**
   * Toolchain / output shapers that can change emitted bytes without touching
   * module sources (vite/rollup/minifier versions, defines, mode, …). Prefer a
   * stable string; objects are JSON-serialized with sorted keys.
   */
  fingerprint?: string | Readonly<Record<string, string | number | boolean | null | undefined>>;
  hashCharacters?: CombinedGraphHashCharacters;
};

/**
 * Flatten a fingerprint into a stable string. Object keys are sorted so key
 * insertion order cannot drift the hash across environments.
 */
function serializeFingerprint(
  fingerprint:
    | string
    | Readonly<Record<string, string | number | boolean | null | undefined>>
    | undefined,
): string {
  if (fingerprint == null) {
    return "";
  }
  if (typeof fingerprint === "string") {
    return fingerprint;
  }
  const keys = Object.keys(fingerprint).sort();
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const key of keys) {
    const value = fingerprint[key];
    if (value !== undefined) {
      normalized[key] = value;
    }
  }
  return JSON.stringify(normalized);
}

/**
 * Build the canonical bag string hashed into a chunk filename suffix.
 *
 * Layout is line-oriented and sectioned so a source that contains newlines
 * cannot collide with a neighbour id or with the imports/fingerprint
 * sections. Module ids and import names are sorted; env labels must not appear
 * in this bag (they are not an input).
 */
export function serializeCombinedGraphChunkBag(
  input: CombinedGraphChunkHashInput,
): string {
  const lines: string[] = ["modules"];
  const sortedIds = [...input.moduleIds].sort();
  for (const id of sortedIds) {
    const source = input.moduleSources[id] ?? "";
    lines.push(id, String(source.length), source);
  }
  lines.push("imports");
  const imports = [...(input.importedChunkNames ?? [])].sort();
  for (const name of imports) {
    lines.push(name);
  }
  lines.push("fingerprint", serializeFingerprint(input.fingerprint));
  return lines.join("\n");
}

/**
 * Content-addressed hash for a chunk from its combined module graph inputs.
 *
 * Hashes every listed module's source (not a single facade and not the chunk
 * name), plus imported chunk names and an optional toolchain fingerprint, via
 * {@link createRollupLikeHash}. Identical bags always yield identical hashes
 * regardless of which build environment asked.
 */
export function createCombinedGraphChunkHash(
  input: CombinedGraphChunkHashInput,
): string {
  return createRollupLikeHash(
    serializeCombinedGraphChunkBag(input),
    input.hashCharacters ?? "base36",
  );
}
