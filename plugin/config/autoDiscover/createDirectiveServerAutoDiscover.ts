import type { ResolvedUserOptions } from "../../types.js";
import { glob, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { analyzeModule } from "react-server-loader/directives";
import { transformTsSource } from "../../loader/transformTsSource.js";

/**
 * Auto-discovers first-party server-action modules detected by a top-of-file
 * `"use server"` DIRECTIVE rather than the `.server.` filename convention —
 * the server twin of {@link createDirectiveClientAutoDiscover}.
 *
 * Why this exists: `createGlobAutoDiscover("**\/*.server.*")` only finds
 * filename-convention action modules. A directive-only action module
 * (e.g. `src/routes/edgePing.ts` starting with `"use server"`) that only a
 * CLIENT component imports was never added as a server build input: the
 * browser got a correct `createServerReference` proxy, but the server build
 * never emitted the module, so the sealed gate had nothing to resolve and
 * every call died at runtime with "Unknown server reference" — with no
 * build-time signal. The 3.9.1 gate fix made gate MEMBERSHIP directive-driven;
 * this makes DISCOVERY match, so the standard client-imports-an-action
 * topology registers and executes like any other action module.
 *
 * Detection is the same scanner the transform and the gate use: strip TS with
 * the running Vite's transform (raw TS does not parse under rsl's JS-only
 * grammar), then require a FILE-LEVEL `"use server"` via `analyzeModule` —
 * quoted strings and comments rejected, function-level directives excluded
 * (those ride whichever module already owns them).
 */
export function createDirectiveServerAutoDiscover(
  modulePattern = "**/*.{tsx,jsx,mts,cts,ts,js,mjs,cjs}"
) {
  return async function _directiveServerAutoDiscover({
    inputs,
    userOptions,
  }: {
    inputs: Record<string, string>;
    userOptions: Pick<
      ResolvedUserOptions,
      "moduleBase" | "projectRoot" | "normalizer"
    >;
  }): Promise<{ inputs: Record<string, string> }> {
    const baseDir = resolve(userOptions.projectRoot, userOptions.moduleBase);
    const absolutePattern = resolve(baseDir, modulePattern);

    let allFiles: AsyncIterable<string>;
    try {
      allFiles = glob(absolutePattern);
    } catch {
      return { inputs };
    }

    for (const file of await collect(allFiles)) {
      // Skip files already covered by the `.server.` filename convention —
      // `createGlobAutoDiscover` discovers those separately.
      if (/\.server\.[cm]?[jt]sx?$/.test(file)) continue;
      // Never treat dependencies as first-party action inputs.
      if (file.includes("node_modules")) continue;

      let source: string;
      try {
        source = await readFile(file, "utf-8");
      } catch {
        continue;
      }
      // Cheap pre-filter before any parse.
      if (!source.includes("use server")) continue;

      try {
        const lang = /\.[cm]?tsx$|\.jsx$/.test(file) ? "tsx" : "ts";
        const { code } = await transformTsSource(source, file, lang);
        const analysis = await analyzeModule(code);
        if (
          analysis.type !== "success" ||
          analysis.directiveInfo?.fileLevel?.type !== "server"
        ) {
          continue;
        }
      } catch {
        // Unparseable source is not silently an action module.
        continue;
      }

      const relativePath = file.replace(baseDir, "").replace(/^\/+/, "");
      const [key, value] = userOptions.normalizer(
        join(userOptions.moduleBase, relativePath)
      );
      if (!inputs[key]) {
        inputs[key] = value;
      }
    }

    return { inputs };
  };
}

async function collect(files: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const f of files) out.push(f);
  return out;
}
