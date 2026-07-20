import { build as viteBuild, type Logger } from "vite";
import { createRequire } from "node:module";
import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedUserOptions } from "../types.js";
import { DEFAULT_CONFIG } from "../config/defaults.js";
import { hostedPath } from "./clientManifest.js";

/**
 * Bake the CONSUMER half of the single-isolate edge render: decode a Flight
 * payload and render it to HTML, with client React and every client-reference
 * module compiled in.
 *
 * The producer bundle (buildEdgeBundle) has been self-contained since the
 * client manifest was baked into it. The consumer was not: at request time it
 * resolved `react-dom/server.edge` out of the consumer's node_modules through
 * `createRequire` (plugin/vendor/vendor.client.ts) and pulled client islands in
 * with `import(moduleBaseURL + chunk)` off the ssr tree. Both need a filesystem
 * and a Node module resolver, which is what kept the whole request path
 * Node-bound even though the producer wasn't. Baking the consumer closes that:
 * the pair composes on a runtime with no `node:` at all.
 *
 * WEBPACK ONLY, and not by preference. The esm client transport resolves a
 * reference by `import(metadata.specifier)` with no loader seam, so there is no
 * way to point it at a compiled-in registry — an esm build keeps the runtime
 * consumer. The webpack transport resolves through a module map, which is
 * exactly the seam a closed registry needs.
 *
 * Built as a SEPARATE bundle from the producer on purpose: the producer bakes
 * SERVER React (the react-server export conditions) and this bakes CLIENT
 * React. Both graphs have to co-exist in one isolate, which they can only do as
 * two module graphs.
 */
export async function buildConsumerBundle(opts: {
  userOptions: ResolvedUserOptions;
  projectRoot: string;
  logger: Logger;
}): Promise<void> {
  const { userOptions, projectRoot, logger } = opts;
  const tag = "[build.edge]";

  // The esm transport has no module-map seam to bind a registry to; leave those
  // builds on the runtime consumer rather than emitting something that can't work.
  if (userOptions.build.edge.transport !== "webpack") return;

  const outRoot = join(projectRoot, userOptions.build.outDir);
  const edgeDir = join(
    outRoot,
    userOptions.build.edge.outDir ?? DEFAULT_CONFIG.BUILD.edge.outDir
  );
  const clientDir = join(outRoot, userOptions.build.client);
  const clientManifestPath = join(clientDir, ".vite/manifest.json");
  if (!existsSync(clientManifestPath)) {
    logger.warn(
      `${tag} no client manifest at ${clientManifestPath}; skipping the consumer bake ` +
        `(the runtime consumer still serves this build)`
    );
    return;
  }

  const staticManifestPath = join(
    outRoot,
    userOptions.build.static,
    ".vite/manifest.json"
  );
  const clientManifest = JSON.parse(
    readFileSync(clientManifestPath, "utf8")
  ) as Record<string, { file?: string } | undefined>;
  const staticManifest = existsSync(staticManifestPath)
    ? (JSON.parse(readFileSync(staticManifestPath, "utf8")) as Record<
        string,
        { file?: string } | undefined
      >)
    : {};

  const moduleBasePath = userOptions.moduleBasePath ?? "";
  const hosted = (file: string): string => hostedPath(moduleBasePath, file);

  // Register each ssr module under EVERY hosted id it can be asked for.
  //
  // The two build trees do NOT agree on filenames. They share the manifest KEY
  // (the source path) but only sometimes the built file: a `"use client"`
  // component hashes identically in both (src/Nav.client.tsx -> the same
  // Nav.client-<hash>.js), while CSS-module and node_modules-shipped client
  // modules do not (styles.js in the ssr tree vs styles-<hash>.js in the
  // browser tree). The id the payload carries comes from the transform, so
  // keying this registry off the ssr tree alone would miss whichever spelling
  // the payload used and 404 at request time — the same class of mismatch that
  // made the browser chunks 404 when they were derived from the ssr manifest.
  // Keying off the source path and registering both spellings is the fix.
  const importLines: string[] = [];
  const registryLines: string[] = [];
  const idByFile = new Map<string, string>();
  let divergent = 0;

  for (const [key, entry] of Object.entries(clientManifest)) {
    const file = entry?.file;
    if (!file || !/\.[cm]?js$/.test(file)) continue;
    const abs = join(clientDir, file);
    if (!existsSync(abs)) continue;

    let ns = idByFile.get(abs);
    if (!ns) {
      ns = `C${idByFile.size}`;
      idByFile.set(abs, ns);
      importLines.push(`import * as ${ns} from ${JSON.stringify(abs)};`);
    }

    const ids = new Set<string>([hosted(file)]);
    const staticFile = staticManifest[key]?.file;
    if (staticFile && /\.[cm]?js$/.test(staticFile) && staticFile !== file) {
      ids.add(hosted(staticFile));
      divergent++;
    }
    for (const id of ids) {
      registryLines.push(`  ${JSON.stringify(id)}: ${ns},`);
    }
  }

  if (importLines.length === 0) {
    logger.warn(
      `${tag} no client modules found in ${clientDir}; skipping the consumer bake`
    );
    return;
  }

  const { consumerFileName, consumerExport } = DEFAULT_CONFIG.EDGE;
  const projectRequire = createRequire(join(projectRoot, "package.json"));
  const webpackClientEdge = projectRequire.resolve(
    "react-server-loader/webpack/client.edge"
  );
  const webpackRuntime = projectRequire.resolve(
    "react-server-loader/webpack/runtime"
  );
  // The SAME pass-through manifest the runtime decode uses, bundled in — one
  // implementation of the contract both sides must agree on.
  const consumerManifestHelper = join(
    dirname(fileURLToPath(import.meta.url)),
    "../stream/webpackConsumerManifest.js"
  );

  const entryPath = join(clientDir, `.vprs-${consumerFileName}`);
  const entrySource = `import * as React from "react";
import { renderToReadableStream } from "react-dom/server.edge";
import { createFromReadableStream } from ${JSON.stringify(webpackClientEdge)};
import { installWebpackGlobals } from ${JSON.stringify(webpackRuntime)};
import { createPassthroughConsumerManifest } from ${JSON.stringify(consumerManifestHelper)};
${importLines.join("\n")}

/**
 * Every client-reference module in this build, compiled in and keyed by the
 * hosted id the flight payload carries. This is the whole point of the bake:
 * resolution is a property lookup, so nothing reaches for a module loader.
 */
const CLIENT_MODULES = {
${registryLines.join("\n")}
};

// The transport's chunk loader, backed by the closed registry instead of
// import(). React preloads a reference's chunks through __webpack_chunk_load__
// before the synchronous require, so an async lookup is the supported seam.
installWebpackGlobals({
  load: async (chunkId) => {
    const mod = CLIENT_MODULES[chunkId];
    if (!mod) {
      throw new Error(
        "[edge:consumer] no baked client module for chunk: " + chunkId +
          " (known: " + Object.keys(CLIENT_MODULES).join(", ") + ")"
      );
    }
    return mod;
  },
});

const serverConsumerManifest = createPassthroughConsumerManifest();

/**
 * Decode a Flight stream and render it to an HTML stream, entirely in-process.
 * Same contract as the runtime renderFlightToHtml, minus the options that only
 * describe how to FIND things (moduleBaseURL, clientManifest, flightTransport):
 * this bundle already contains them.
 */
export async function ${consumerExport}(options) {
  const {
    rscStream,
    bootstrapModules,
    bootstrapScriptContent,
    nonce,
    onError,
    signal,
  } = options;

  if (!rscStream) {
    throw new Error("[edge:consumer] rscStream is required");
  }

  // Decode ONCE into a stable promise: a Web ReadableStream has a single
  // reader, and the streaming HTML render may re-invoke its component on retry,
  // so decoding inside the component would re-read a locked stream.
  const elementPromise = createFromReadableStream(rscStream, {
    serverConsumerManifest,
  });

  function Root() {
    return React.use(elementPromise);
  }

  return renderToReadableStream(
    React.createElement(React.Suspense, null, React.createElement(Root)),
    { bootstrapModules, bootstrapScriptContent, nonce, onError, signal }
  );
}
`;
  writeFileSync(entryPath, entrySource, "utf8");

  try {
    await viteBuild({
      root: clientDir,
      logLevel: "warn",
      configFile: false,
      // No react-server aliasing here — that is the producer's job. This graph
      // resolves React normally, which is what makes it the CLIENT half.
      define: { "process.env.NODE_ENV": JSON.stringify("production") },
      ssr: { target: "node", noExternal: true },
      build: {
        ssr: true,
        outDir: edgeDir,
        // The producer wrote this directory first; emptying it here would
        // delete the bundle this one is meant to pair with.
        emptyOutDir: false,
        minify: userOptions.build.edge.minify,
        rollupOptions: {
          input: { [consumerFileName.replace(/\.js$/, "")]: entryPath },
          output: { preserveModules: false, format: "es" },
        },
      },
    });
    const detail = divergent
      ? ` (${divergent} module(s) registered under both tree spellings)`
      : "";
    logger.info(
      `${tag} baked consumer bundle over ${idByFile.size} client module(s)${detail} → ` +
        `${join(edgeDir, consumerFileName)}`
    );
  } catch (error) {
    // Additive, like the producer bake: a failure here leaves the runtime
    // consumer in place rather than failing an otherwise-good build.
    logger.warn(
      `${tag} consumer bake skipped — the runtime consumer still serves this build ` +
        `(set build.edge:false to silence): ${
          error instanceof Error ? error.message : String(error)
        }`
    );
  } finally {
    rmSync(entryPath, { force: true });
  }
}
