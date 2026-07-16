import type { Plugin } from "vite";

/**
 * Derives the vendored package directory containing `fileName`, or `null` if
 * the file doesn't live under a `node_modules/` segment.
 *
 * Uses the LAST `node_modules/` segment so a nested dependency
 * (`node_modules/a/node_modules/b/x.js`) resolves to the innermost package —
 * that's the directory whose `package.json` Node consults first.
 *
 * Scoped packages (`@scope/name`) span two segments.
 */
export const resolveVendoredPackageDir = (fileName: string): string | null => {
  const marker = "node_modules/";
  const at = fileName.lastIndexOf(marker);
  if (at === -1) return null;

  const start = at + marker.length;
  const segments = fileName.slice(start).split("/");
  const depth = segments[0]?.startsWith("@") ? 2 : 1;
  // Needs the package segment(s) AND at least one file below them; otherwise
  // there is no chunk here to govern.
  if (segments.length <= depth) return null;
  if (segments.slice(0, depth).some((s) => !s)) return null;

  return fileName.slice(0, start) + segments.slice(0, depth).join("/");
};

/**
 * Rollup's `preserveModules` lays dependency chunks out under
 * `<outDir>/node_modules/<pkg>/…` but copies none of those packages' own
 * `package.json`. The chunks are ESM (`export { Link }`), and with no local
 * `"type": "module"` Node decides their format from the nearest PARENT
 * package.json.
 *
 * From the project root that's ours (type:module) and it works. A serverless
 * function ships only the build output, so the root package.json is not
 * co-located, the function scope defaults to CommonJS, and Node reads the
 * chunks as CJS: named exports vanish, `import { Link } from ".../link.js"`
 * throws "does not provide an export named 'Link'", the island fails to
 * instantiate during SSR, and the document degrades to a shell with no #root.
 * Build is green and the deploy is READY — it only fails in the function.
 *
 * Stamping a minimal package.json into each vendored package dir makes the
 * chunks unambiguously ESM wherever they run. Emitted as a build asset rather
 * than written post-build so it lands through the normal output pipeline.
 */
export const createVendoredPackageJsonPlugin = (): Plugin => {
  return {
    name: "vite-plugin-react-server:vendored-package-json",
    enforce: "post",
    apply: "build",

    generateBundle(_outputOptions, bundle) {
      // Every vprs build environment emits `format: "esm"`, so this holds for
      // whichever output we're stamping.
      const packageDirs = new Set<string>();
      for (const fileName of Object.keys(bundle)) {
        const dir = resolveVendoredPackageDir(fileName);
        if (dir) packageDirs.add(dir);
      }

      for (const dir of packageDirs) {
        const fileName = `${dir}/package.json`;
        // Never clobber a package.json the build already produced — rollup
        // would also throw on the duplicate fileName.
        if (bundle[fileName]) continue;
        this.emitFile({
          type: "asset",
          fileName,
          source: `${JSON.stringify({ type: "module" })}\n`,
        });
      }
    },
  };
};
