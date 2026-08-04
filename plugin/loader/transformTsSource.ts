// Strip TS/JSX from a source string with whichever transform the running
// Vite provides. Vite 8 (rolldown) deprecates `transformWithEsbuild` in
// favor of `transformWithOxc`; Vite 6/7 only have esbuild. Feature-detect at
// call time — a static named import of the Oxc function would fail to link
// under 6/7 and break the compat matrix. Options are normalized to the
// intersection both transforms honor: language, ESM out, external sourcemap.
import * as vite from "vite";
import { transformWithEsbuild } from "vite";

export type TransformedTsSource = { code: string; map: unknown };

type OxcTransform = (
  code: string,
  filename: string,
  options?: { lang: string; sourcemap: boolean; sourceType: "module" },
) => Promise<TransformedTsSource>;

const oxc = (vite as Record<string, unknown>)["transformWithOxc"] as
  | OxcTransform
  | undefined;

export async function transformTsSource(
  code: string,
  filename: string,
  lang: "ts" | "tsx",
): Promise<TransformedTsSource> {
  // sourceType pinned: a source without import/export statements would
  // otherwise resolve "unambiguous" to script and the JSX runtime import
  // comes out as require() — broken in the ESM contexts these callers serve.
  if (oxc) return oxc(code, filename, { lang, sourcemap: true, sourceType: "module" });
  return transformWithEsbuild(code, filename, {
    loader: lang,
    format: "esm",
    sourcemap: "external",
  });
}
