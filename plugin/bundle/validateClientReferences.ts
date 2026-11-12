import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ClientBuildManifestLookup } from "../config/clientBuildManifest.js";
import { SCHEME_RE } from "../config/moduleIdContract.js";

/**
 * Every client reference the server build registers must name a file the
 * browser build wrote.
 *
 * The server build bakes a client reference's id into the flight payload, and
 * the browser imports `moduleBaseURL + id`. The id normally comes from the
 * client build's manifest, but a module the manifest does not list keeps its
 * input name, which no browser file carries. That build used to finish, and
 * the page failed in the browser. This check runs once every environment is
 * built, so the client build's manifest and files are final.
 */

/** A client reference as the server build registered it. */
export type ClientReference = {
  /** The module the reference stands for: its path on disk. */
  source: string;
  /** The id baked into the flight payload. */
  id: string;
};

// Keyed by the bundler's id for the module, which is what its graph answers to.
const recorded = new Map<string, ClientReference>();

/** Called by the server build's transform for each reference it registers. */
export function recordClientReference(moduleId: string, reference: ClientReference): void {
  recorded.set(moduleId, reference);
}

/**
 * Keep only the references the server can send. The server build turns every
 * client module it is given into a reference, the browser entry and every
 * module of a package barrel included, but only one that server code imports
 * and the bundle keeps can reach a flight payload.
 */
export function keepClientReferences(isRequired: (moduleId: string) => boolean): void {
  for (const moduleId of recorded.keys()) {
    if (!isRequired(moduleId)) recorded.delete(moduleId);
  }
}

/** The references recorded so far; the record starts empty again. */
export function takeClientReferences(): ClientReference[] {
  const references = [...recorded.values()];
  recorded.clear();
  return references;
}

/**
 * Where a reference's file may sit in the browser output, or undefined for an
 * id that is not a path there: an absolute or protocol-relative URL.
 *
 * The id is `moduleBasePath` + the built file, so the file is tried with that
 * prefix removed first. A host may also serve the prefix as a directory, so
 * the id as written is tried too.
 */
export function browserFilesOfId(id: string, moduleBasePath: string): string[] | undefined {
  if (SCHEME_RE.test(id) || id.startsWith("//")) return undefined;
  const path = id.replace(/[?#].*$/, "").replace(/^\/+/, "");
  const base = moduleBasePath.replace(/^\/+|\/+$/g, "");
  return base && path.startsWith(base + "/")
    ? [path.slice(base.length + 1), path]
    : [path];
}

export type MissingClientReference = ClientReference & {
  /** The first place the file was looked for, relative to the browser output. */
  expectedFile: string;
  /** The file the client build's manifest lists for the source, if any. */
  manifestFile: string | undefined;
};

export function findMissingClientReferences({
  references,
  browserOutDir,
  moduleBasePath,
  manifest,
}: {
  references: ClientReference[];
  browserOutDir: string;
  moduleBasePath: string;
  manifest: Pick<ClientBuildManifestLookup, "fileOf">;
}): MissingClientReference[] {
  const missing: MissingClientReference[] = [];
  for (const reference of references) {
    const files = browserFilesOfId(reference.id, moduleBasePath);
    if (!files) continue;
    if (files.some((file) => existsSync(join(browserOutDir, file)))) continue;
    missing.push({
      ...reference,
      expectedFile: files[0],
      manifestFile: manifest.fileOf(reference.source),
    });
  }
  return missing;
}

export function missingClientReferencesError(
  missing: MissingClientReference[],
  {
    projectRoot,
    browserOutDir,
    manifestPath,
  }: { projectRoot: string; browserOutDir: string; manifestPath: string }
): Error {
  const fromRoot = (path: string) => relative(projectRoot, path).split(sep).join("/");
  const manifest = fromRoot(manifestPath);
  const lines = missing.map(({ source, id, expectedFile, manifestFile }) => {
    const file = fromRoot(join(browserOutDir, expectedFile));
    const why = manifestFile === undefined
      ? `${manifest} has no entry for it`
      : manifestFile === expectedFile
      ? `${manifest} lists that file, but it is not on disk`
      : `${manifest} maps it to ${manifestFile} instead`;
    return `  - ${fromRoot(source)} is referenced as ${id}, but ${file} does not exist: ${why}.`;
  });
  return new Error(
    `[vite-plugin-react-server] ${missing.length === 1 ? "A client reference has" : `${missing.length} client references have`} ` +
      `no file in the browser build, so the browser could not load ${missing.length === 1 ? "it" : "them"}:\n` +
      lines.join("\n") +
      `\nThe client build names these files and writes them before the server build runs. ` +
      `Check that the module is part of the client build and that nothing removes or renames its output.`
  );
}

/** Throw when a recorded reference has no browser file. */
export function validateClientReferences(options: {
  references: ClientReference[];
  projectRoot: string;
  browserOutDir: string;
  moduleBasePath: string;
  manifest: Pick<ClientBuildManifestLookup, "fileOf" | "path">;
}): void {
  const missing = findMissingClientReferences(options);
  if (missing.length > 0) {
    throw missingClientReferencesError(missing, {
      projectRoot: options.projectRoot,
      browserOutDir: options.browserOutDir,
      manifestPath: options.manifest.path,
    });
  }
}
