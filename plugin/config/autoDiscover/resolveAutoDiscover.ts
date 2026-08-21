import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type ConfigEnv, type UserConfig } from "vite";
import type { AutoDiscoveredFiles, ResolvedUserOptions } from "../../types.js";
import { resolveBuildPages } from "./resolveBuildPages.js";
import { resolvePages } from "../resolvePages.js";
import type { Logger, ResolvedConfig } from "vite";
import { createGlobAutoDiscover } from "./createGlobAutoDiscover.js";
import { createDirectiveClientAutoDiscover } from "./createDirectiveClientAutoDiscover.js";
import { createDirectiveServerAutoDiscover } from "./createDirectiveServerAutoDiscover.js";
import { patternProbeUrl } from "../../router/matchRoute.js";
import { customWorkerFiles } from "./customWorkerFiles.js";
import { pageAndPropFiles } from "./pageAndPropFiles.js";



type ResolveAutoDiscoverProps = {
  config: UserConfig | ResolvedConfig;
  configEnv: ConfigEnv;
  userOptions: Pick<
    ResolvedUserOptions,
    | "build"
    | "normalizer"
    | "serverEntry"
    | "clientEntry"
    | "projectRoot"
    | "moduleBase"
    | "moduleBasePath"
    | "Page"
    | "props"
    | "layoutsResolver"
    | "layoutExportName"
    | "htmlWorkerPath"
    | "rscWorkerPath"
    | "pageExportName"
    | "propsExportName"
    | "htmlExportName"
    | "rootExportName"
    | "Root"
    | "Html"
    | "verbose"
    | "panicThreshold"
    | "autoDiscover"
    | "routePatterns"
  >;
  logger: Logger;
};

type ResolveAutoDiscoverReturn =
  | {
      type: "success";
      id: string;
      autoDiscoveredFiles: AutoDiscoveredFiles;
      error?: never;
    }
  | {
      type: "error";
      error: unknown;
      id: string;
      autoDiscoveredFiles?: never;
    };

export type ResolveAutoDiscoverFn = (
  props: ResolveAutoDiscoverProps
) => Promise<ResolveAutoDiscoverReturn>;

export const resolveAutoDiscover: ResolveAutoDiscoverFn =
  async function _resolveAutoDiscover({
    config,
    configEnv,
    userOptions,
    logger,
  }) {
    const envId = `${configEnv.command}-${configEnv.mode}`;
    

    
    
    

    const configInputRecord = {} as Record<string, string>;
    if (typeof config.build?.rollupOptions?.input === "string") {
      configInputRecord[
        userOptions.normalizer(config.build?.rollupOptions?.input)[0]
      ] = config.build?.rollupOptions?.input;
    } else if (typeof config.build?.rollupOptions?.input === "object") {
      for (const [, value] of Object.entries(
        config.build?.rollupOptions?.input
      )) {
        configInputRecord[userOptions.normalizer(value)[0]] = value;
      }
    }

    const serverEntry =
      typeof userOptions.serverEntry === "string"
        ? Object.fromEntries([userOptions.normalizer(userOptions.serverEntry)])
        : null;

    const indexHtmlInputs = { index: "index.html" };

    const clientEntry =
      typeof userOptions.clientEntry === "string"
        ? Object.fromEntries([userOptions.normalizer(userOptions.clientEntry)])
        : {};

    const { type, error, pages } = await resolvePages(userOptions.build.pages);

    if (type === "error") {
      return {
        type: "error",
        error,
        id: envId,
      };
    }
    const clientFiles = createGlobAutoDiscover(userOptions.autoDiscover.clientEntry);
    // First-party modules detected by a top-of-file `"use client"` directive
    // (no `.client.` suffix) must also be emitted to dist/client.
    const directiveClientFiles = createDirectiveClientAutoDiscover();
    // First-party action modules detected by a top-of-file `"use server"`
    // directive (no `.server.` suffix) must also be BUILT server-side, or a
    // client-only-imported action ships a working browser proxy pointing at a
    // module the sealed gate has never heard of.
    const directiveServerFiles = createDirectiveServerAutoDiscover();
    const serverFiles = createGlobAutoDiscover(userOptions.autoDiscover.serverEntry);
    const cssFiles = createGlobAutoDiscover(userOptions.autoDiscover.cssEntry);
    const jsonFiles = createGlobAutoDiscover(userOptions.autoDiscover.jsonEntry);
    const htmlFiles = createGlobAutoDiscover(userOptions.autoDiscover.htmlPattern.source);

    const files = await resolveBuildPages({
      pages,
      userOptions,
      logger,
    });

 

    const customWorkerInputs = customWorkerFiles({
      inputs: {},
      userOptions,
    });
    const clientInputs = await clientFiles({
      inputs: {},
      userOptions,
    });
    const { inputs: directiveClientInputs, serverImportsRouterClient } =
      await directiveClientFiles({
        inputs: {},
        userOptions,
      });
    const globServerActions = await serverFiles({
      inputs: {},
      userOptions,
    });
    const { inputs: directiveServerActions } = await directiveServerFiles({
      inputs: {},
      userOptions,
    });
    // One action set, discovered two ways: the `.server.` filename glob and
    // the file-level directive scan. Downstream consumers (server inputs, the
    // baked gate's walk) see them uniformly.
    const serverActions = { ...globServerActions, ...directiveServerActions };

    const pageAndPropInputs = pageAndPropFiles({
      files,
      inputs: {},
    });

    // Every file-router route's modules must be BUILT, even a server-only
    // dynamic route with no getStaticPaths entry (e.g. an authenticated route
    // you deliberately don't prerender) — otherwise it can't be served
    // per-request in production (edge/handler). Probe each pattern (each `$`
    // segment → a placeholder no static segment equals) to map it to its
    // page/props module and add those as build inputs WITHOUT enumerating a url,
    // so nothing extra gets prerendered.
    const routeModuleInputs: Record<string, string> = {};
    for (const pattern of userOptions.routePatterns ?? []) {
      const probe = patternProbeUrl(pattern, userOptions.routePatterns);
      for (const opt of [userOptions.Page, userOptions.props]) {
        const src = typeof opt === "function" ? opt(probe) : opt;
        if (typeof src !== "string") continue;
        const [key, value] = userOptions.normalizer(src);
        if (!routeModuleInputs[key]) routeModuleInputs[key] = value;
      }
      // Nested layouts: every matched `route.tsx` (and its shared props,
      // error/loading boundaries and head module) must be BUILT too, or the
      // renderer can't load the chain to fold it (the layer gets silently
      // skipped). Add each layer's modules as inputs, mirroring the Page/props
      // probe above.
      for (const layer of userOptions.layoutsResolver?.(probe) ?? []) {
        for (const src of [
          layer.component,
          layer.props,
          layer.error,
          layer.loading,
          layer.head,
        ]) {
          if (typeof src !== "string") continue;
          const [key, value] = userOptions.normalizer(src);
          if (!routeModuleInputs[key]) routeModuleInputs[key] = value;
        }
      }
    }

    const cssInputs = await cssFiles({
      inputs: {},
      userOptions,
    });

    const jsonInputs = await jsonFiles({
      inputs: {},
      userOptions,
    });

    const htmlInputs = await htmlFiles({
      inputs: {},
      userOptions,
    });

    // Add custom Root and Html components to inputs
    const customComponentInputs: Record<string, string> = {};

    // Add Root components from resolved build pages
    for (const [rootKey, rootValue] of files.rootMap) {
      if (!customComponentInputs[rootKey]) {
        customComponentInputs[rootKey] = rootValue;
      }
    }

    // Add Html components from resolved build pages
    for (const [htmlKey, htmlValue] of files.htmlMap) {
      if (!customComponentInputs[htmlKey]) {
        customComponentInputs[htmlKey] = htmlValue;
      }
    }


    
    // vprs ships its client router (Link / RouterProvider / useParams) as a
    // "use client" package export. When a SERVER component imports it directly,
    // the react-server build records a client reference at vprs's node_modules
    // path — but nothing in the CLIENT graph pulls that file in, so it is never
    // emitted and the reference dangles (ERR_MODULE_NOT_FOUND). Add vprs's own
    // client barrel as a client build input so it is hosted at the reference
    // path. Reference-driven: only when a server-side file actually imports the
    // barrel (a client-side importer already auto-hosts it), so consumers that
    // don't use the router — or use it only client-side — emit no extra chunk.
    // Value must be project-root-relative (env config strips a leading "/", so
    // an absolute path would be mangled). Skip a hoisted install (rel escapes
    // with ".."): preserveModules emits its node_modules deps at a leaked
    // absolute path there, so the cluster can't be hosted consistently — better
    // a clear "reference dangles" build error than a silently broken chunk
    // cluster. Direct server-side import of the router is a direct-dependency
    // feature today; the first-party *.client.tsx wrapper still works hoisted.
    const routerClientInput: Record<string, string> = ((): Record<
      string,
      string
    > => {
      if (!serverImportsRouterClient) return {};
      const rel = relative(
        userOptions.projectRoot,
        fileURLToPath(new URL("../../router/client.js", import.meta.url))
      );
      if (!rel || rel.startsWith("..")) {
        // Hoisted install (vprs lives outside the project root, e.g. a pnpm /
        // monorepo layout): preserveModules would emit the barrel at a leaked
        // absolute path, so it can't be hosted at the recorded reference path.
        // Fail loudly with a fix rather than dangle to a runtime
        // ERR_MODULE_NOT_FOUND on the first request.
        throw new Error(
          "[vprs] A server component imports the router client barrel " +
            "(vite-plugin-react-server/router/client), but vite-plugin-react-server " +
            "is installed outside the project root (hoisted / monorepo layout), so " +
            "its client reference can't be hosted. Import <Link> etc. from a " +
            "first-party '*.client.tsx' wrapper instead, or install vprs at the " +
            "project root."
        );
      }
      return { "vprs-router-client": rel };
    })();

    // Separate client and server inputs
    const clientInputsCollection = {
      ...configInputRecord,
      ...clientInputs,
      ...directiveClientInputs,
      ...clientEntry,
      ...cssInputs,
      ...routerClientInput,
    };
    // If no client entries found, fall back to index.html so SSR environment has inputs
    if (Object.keys(clientInputsCollection).length === 0) {
      Object.assign(clientInputsCollection, indexHtmlInputs);
    }
    
    const serverInputsCollection = {
      ...clientInputsCollection,
      ...customWorkerInputs,
      ...pageAndPropInputs,
      ...routeModuleInputs, // server-only route modules (built, not prerendered)
      ...cssInputs,
      ...serverActions,
      ...serverEntry,
      ...jsonInputs,
      ...customComponentInputs, // Add custom components to server build
    };

    return {
      type: "success",
      id: envId,
      autoDiscoveredFiles: {
        ...files,
        workerPaths: customWorkerInputs,
        serverEntry,
        clientEntry,
        staticInputs: {
          ...indexHtmlInputs,
          ...htmlInputs,
          ...clientInputsCollection
        },
        clientInputs: clientInputsCollection,
        serverInputs: serverInputsCollection,
        serverActions,
      },
    };
  };
