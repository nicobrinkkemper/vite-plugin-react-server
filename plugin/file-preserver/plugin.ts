import type { ESBuildOptions, Plugin as VitePlugin, Rollup } from "vite";
import { transformWithEsbuild } from "vite";
import { writeFile } from "node:fs/promises";
import { join, sep } from "node:path";
/**
 * Bundling with vite may have some side effects, this plugin is a workaround to prevent
 * the side effects from happening to the files we want to preserve. It's used as a plugin
 * to build this plugin, but you can also use it as a standalone plugin for your projects to have
 * the same effect.
 * @example
 * ```tsx
 * import { filePreserverPlugin } from "vite-plugin-react-server/file-preserver";
 *
 * export default defineConfig({
 *   plugins: [filePreserverPlugin("utils/env")], // don't include the extension
 * });
 * ```
 * The typescript file will not be transformed by vite, only by esbuild, so you can preserve your import.meta.env
 * and use it in your client boundary files.
 */
export function filePreserverPlugin(fileName: string | string[]): VitePlugin[] {
  const sources: {
    id: string;
    originalCode: string;
    transformedCode: string;
    map: string;
  }[] = [];
  const pluginName =
    typeof fileName === "string" ? fileName : fileName.slice(3).join("-");
  let outDir: string = "dist";
  let root: string = process.cwd();
  // `jsxDev` is a valid esbuild transform option, but some resolutions of
  // Vite's ESBuildOptions don't declare it; assert past the excess-property
  // check rather than drop the prod-JSX override.
  let esbuildOptions = {
    jsxDev: false,
    supported: { "import-meta": true },
    target: "esnext",
    format: "esm",
  } as ESBuildOptions;
  const shouldPreserve = Array.isArray(fileName)
    ? (id: string) => fileName.some((f) => id.includes(f))
    : (id: string) => id.includes(fileName);
  return [
    {
      name: `vite:preserver-${pluginName}:post`,
      enforce: "post",
      apply: "build",
      async transform(_code: string, id: string) {
        if (!shouldPreserve(id)) return;
        const normalId = id.replace(root + sep, "");
        const found = sources.findIndex((s) => s.id === normalId);
        if (found === -1) {
          throw new Error(`Source not registered by pre hook for ${id}`);
        }
        return {
          code: sources[found].transformedCode,
          map: sources[found].map,
          id: sources[found].id,
        };
      },
      async writeBundle(_options, bundle) {
        if (sources.length === 0) return;
        const entries = Object.entries(bundle);
        const mapEntries = entries.filter(
          (entry): entry is [string, Rollup.OutputAsset] => {
            const out = entry[1];
            return (
              out.type === "asset" &&
              out.fileName.endsWith(".map") &&
              shouldPreserve(out.fileName)
            );
          }
        );
        if (mapEntries.length === 0) {
          return;
        }
        // even though we're returning the new source map, it might just write ;;;; to the file
        for (const source of sources) {
          for (const [fileName, outputAsset] of mapEntries) {
            const ourMap = source.map;
            const path = join(root, outDir, fileName);
            if (outputAsset.source !== ourMap) {
              await writeFile(path, ourMap);
            }
          }
        }
      },
    },
    {
      name: `vite:preserver-${pluginName}:pre`,
      apply: "build",
      enforce: "pre",
      configResolved(config) {
        outDir = config.build.outDir;
        root = config.root;
        esbuildOptions = config.esbuild || esbuildOptions;
      },
      async transform(code: string, id: string) {
        if (!shouldPreserve(id)) return;
        const found = sources.find((s) => s.id === id);
        if (found) {
          throw new Error(`Source already exists for ${id}`);
        }
        const result = await transformWithEsbuild(code, id, esbuildOptions);
        const source = {
          id: id.replace(root + sep, ""),
          originalCode: code,
          transformedCode: result["code"],
          map: JSON.stringify(result["map"]),
        };
        sources.push(source);
        return {
          id: source.id,
          code: source.transformedCode,
          map: source.map,
        };
      },
    },
  ];
}
