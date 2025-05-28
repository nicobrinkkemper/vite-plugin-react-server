// import { resolveOptions } from "../config/resolveOptions.js";
// import type {
//   InlineCssOpt,
//   PagePropOpt,
//   ResolvedUserOptions,
//   StreamPluginOptions,
// } from "../types.js";
// import type { Plugin } from "vite";
// import { join } from "node:path";
// import { tryManifest } from "../helpers/tryManifest.js";
// import { transformModuleIfNeeded } from "../loader/transformModuleIfNeeded.js";
// import type { SourceMapInput } from "rollup";

// /**
//  * Plugin for transforming server actions for the client build.
//  *
//  * Core responsibilities:
//  * 1. Transforms "use server" directives
//  * 2. Transforms server actions for the client build
//  * 3. Uses react-loader's transformModuleIfNeeded to create a server action reference
//  *
//  * When a component is marked with "use server", it:
//  * - Gets transformed into a server action
//  * - Maintains module ID for RSC boundaries
//  * - Preserves class/function behavior
//  *
//  * @example
//  * ```ts
//  * export default defineConfig({
//  *   plugins: [
//  *     viteReactClientTransformPlugin({
//  *       projectRoot: process.cwd(),
//  *     })
//  *   ]
//  * });
//  * ```
//  */
// export function reactTransformPlugin<
//   T extends PagePropOpt = PagePropOpt,
//   InlineCSS extends InlineCssOpt = InlineCssOpt
// >(options: StreamPluginOptions<T, InlineCSS>): Plugin {
//   let userOptions: ResolvedUserOptions<T, InlineCSS>;
//   const resolvedOptionsResult = resolveOptions(options);
//   if (resolvedOptionsResult.type === "error") throw resolvedOptionsResult.error;
//   userOptions = resolvedOptionsResult.userOptions;

//   let isBuild = true;
//   let isSSR = false;
//   return {
//     name: "react-transform",
//     enforce: "pre", // Run before Vite's transforms
//     async config(config, configEnv) {
//       isBuild = configEnv.command === "build";
//       isSSR = configEnv.isSsrBuild || Boolean(config?.build?.ssr);
//       if (isBuild && isSSR) {
//         const staticManifestResult = await tryManifest({
//           root: userOptions.projectRoot,
//           ssrManifest: false,
//           outDir: join(userOptions.build.outDir, userOptions.build.static),
//         });
//         if (staticManifestResult.type === "error") {
//           throw staticManifestResult.error;
//         }
//       }
//     },
//     async transform(code, id, options) {
//       if (isBuild || !options?.ssr || !userOptions.autoDiscover.modulePattern(id)) {
//         return null;
//       }
//       const isServer = code?.match(/^"use server"[\s;]*\n?/m);
//       const isClient = code?.match(/^"use client"[\s;]*\n?/m);

//       // Check if this is a client component or server action
//       const isClientComponent =
//         userOptions.autoDiscover.clientComponents(id) || isClient !== null;
//       const isServerAction =
//         userOptions.autoDiscover.serverFunctions(id) || isServer !== null;

//       // Only transform if it's a client component or server action
//       if (!isClientComponent && !isServerAction) {
//         return null;
//       }

//       // Transform the module
//       const result = await transformModuleIfNeeded(
//         code,
//         id,
//         isServer,
//         isClient
//       );
//       if (userOptions.verbose)
//         this.environment.logger.info(
//           "[react-client-transform] Transformed client module:\n" +
//             result.source
//         );
//       if (!result.source) {
//         return null;
//       }

//       return {
//         code: result.source,
//         map: result.sourceMap as SourceMapInput,
//       };
//     },
//   };
// }
