import { readFile } from "node:fs/promises";
import type { Rollup } from "vite";
import {
  analyzeModule,
  sourceHasTopLevelClientDirective,
} from "react-server-loader/directives";

/**
 * A dependency's `"use client"` module that server code imports gets a file
 * of its own in the browser build (and in the ssr build, under the same name).
 *
 * The server build turns such a module into a client reference, and the
 * browser loads a reference by its own file. Left alone, the browser build
 * either inlines the module into the chunk of a first-party client module
 * that also imports it, or, when no client module does, never sees it. Both
 * leave the reference without a file.
 *
 * The client build runs before the server build, so what server code imports
 * is read from source: the names that first-party modules which are not
 * client modules import from a package. Each name is followed through the
 * package's re-exports to the module that holds it, and that module is hosted
 * when it carries the directive. This is the module the server build keeps
 * once it has dropped the exports nobody imports.
 */

/** Package specifier to the names imported from it; `*` is the namespace. */
export type DependencyImports = Record<string, string[]>;

// `import <clause> from "<specifier>"`, type-only imports left out.
const IMPORT = /\bimport\s+(?!type\b)([\w$\s{},*]+?)\s+from\s*["']([^"']+)["']/g;
// No relative or absolute path, no scheme or virtual prefix.
const BARE_SPECIFIER = /^[\w@][^:\0]*$/;

/** The names a module's source imports from packages. */
export function dependencyImportsOf(source: string): DependencyImports {
  const imports: DependencyImports = {};
  for (const [, clause, specifier] of source.matchAll(IMPORT)) {
    if (!BARE_SPECIFIER.test(specifier)) continue;
    const names = (imports[specifier] ??= []);
    const braces = clause.match(/\{([^}]*)\}/);
    const outside = clause.replace(/\{[^}]*\}/, "").trim().replace(/,$/, "").trim();
    if (outside.startsWith("*")) names.push("*");
    else if (outside) names.push("default");
    for (const part of braces?.[1].split(",") ?? []) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name && !name.startsWith("type ")) names.push(name);
    }
  }
  return imports;
}

type Node = {
  type: string;
  source?: { value: string } | null;
  exported?: { name?: string; value?: string } | null;
  specifiers?: Array<{
    type: string;
    local: { name: string };
    exported?: { name?: string; value?: string };
    imported?: { name?: string; value?: string };
  }>;
};

const nameOf = (id?: { name?: string; value?: string } | null) => id?.name ?? id?.value;

export async function hostDependencyClientModules(
  context: Rollup.PluginContext,
  imports: Record<string, { importer: string; names: string[] }>
): Promise<void> {
  const sources = new Map<string, Promise<string | undefined>>();
  const read = (file: string) => {
    if (!sources.has(file)) {
      sources.set(file, readFile(file, "utf-8").catch(() => undefined));
    }
    return sources.get(file)!;
  };

  // One parse per module, however many names pass through it.
  const bodies = new Map<string, Promise<Node[]>>();
  const bodyOf = (file: string, source: string) => {
    if (!bodies.has(file)) {
      bodies.set(
        file,
        analyzeModule(source).then((analysis) =>
          analysis.type === "success"
            ? (analysis.ast as { body?: Node[] } | undefined)?.body ?? []
            : []
        )
      );
    }
    return bodies.get(file)!;
  };

  /** The id of the `"use client"` module that holds `name`, if one does. */
  const clientModuleOf = async (
    specifier: string,
    importer: string,
    name: string,
    seen: Set<string>
  ): Promise<string | undefined> => {
    const resolved = await context.resolve(specifier, importer);
    if (!resolved || resolved.external) return undefined;
    const file = resolved.id.replace(/[?#].*$/, "");
    if (!file.includes("/node_modules/") || seen.has(file + "#" + name)) return undefined;
    seen.add(file + "#" + name);
    const source = await read(file);
    if (source === undefined) return undefined;
    if (sourceHasTopLevelClientDirective(source)) return resolved.id;
    if (name === "*") return undefined;

    const body = await bodyOf(file, source);
    const stars: string[] = [];
    for (const node of body) {
      if (node.type === "ExportAllDeclaration" && node.source) {
        // `export * as ns from` binds one name; a plain star passes all but default.
        if (!node.exported) stars.push(node.source.value);
        continue;
      }
      if (node.type !== "ExportNamedDeclaration") continue;
      const specifier = node.specifiers?.find((s) => nameOf(s.exported) === name);
      if (!specifier) continue;
      if (node.source) {
        return clientModuleOf(node.source.value, file, specifier.local.name, seen);
      }
      // `import { X } from "./x"; export { X }`
      for (const imported of body) {
        if (imported.type !== "ImportDeclaration" || !imported.source) continue;
        const binding = imported.specifiers?.find((s) => s.local.name === specifier.local.name);
        if (!binding) continue;
        const from =
          binding.type === "ImportSpecifier"
            ? nameOf(binding.imported)
            : binding.type === "ImportDefaultSpecifier"
            ? "default"
            : "*";
        return clientModuleOf(imported.source.value, file, from ?? "*", seen);
      }
      return undefined;
    }
    if (name === "default") return undefined;
    for (const star of stars) {
      const found = await clientModuleOf(star, file, name, seen);
      if (found) return found;
    }
    return undefined;
  };

  const hosted = new Set<string>();
  for (const [specifier, { importer, names }] of Object.entries(imports)) {
    for (const name of names) {
      const id = await clientModuleOf(specifier, importer, name, new Set());
      if (id && !hosted.has(id)) {
        hosted.add(id);
        context.emitFile({ type: "chunk", id });
      }
    }
  }
}
