// import type {
//   OutputAsset,
//   OutputBundle,
//   OutputChunk,
//   PluginContext,
// } from "rollup";
// import { DEFAULT_CONFIG } from "../config/defaults.js";

// type GetBundleOptions<SSR extends boolean> = {
//   root: string;
//   outDir: string;
//   ssr?: SSR;
//   pluginContext: PluginContext;
//   moduleExtension: RegExp;
// };

// const stashedBundle: Map<string, any> = new Map();

// export function setBundle(outDir: string, bundle: OutputBundle) {
//   stashedBundle.set(outDir, bundle);
// }

// export function getBundle<SSR extends boolean>(
//   options: GetBundleOptions<SSR>
// ):
//   | {
//       type: "success";
//       bundle: OutputBundle;
//       error?: never;
//     }
//   | {
//       type: "error";
//       error: Error;
//       manifest?: never;
//     } {
//   if (stashedBundle.has(options.outDir)) {
//     return {
//       type: "success",
//       bundle: stashedBundle.get(options.outDir),
//     };
//   }
//   try {
//     console.log("proactively generating bundle");
//     const bundle = Array.from(options.pluginContext.getModuleIds()).reduce(
//       (acc, id) => {
//         console.log("proactively generating bundle", id);
//         const moduleInfo = options.pluginContext.getModuleInfo(id);
//         if (moduleInfo) {
//           const hash = options.pluginContext.emitFile({
//             fileName: moduleInfo.id,
//             source: moduleInfo?.code ?? "",
//             type: "asset",
//           });
//           const fileName = options.pluginContext.getFileName(hash);
//           console.log("proactively emitted", fileName);
//           acc[id] = {
//             type: "asset",
//             fileName: fileName,
//             source: moduleInfo?.code ?? "",
//             needsCodeReference: false,
//             name: fileName.replace(options.moduleExtension, ""),
//             names: [id.replace(options.moduleExtension, "")],
//             originalFileName: id,
//             originalFileNames: [id],
//           };
//           console.log("proactively emitted", acc[id]);
//         }
//         return acc;
//       },
//       {} as Record<string, OutputAsset | OutputChunk>
//     );
//     stashedBundle.set(options.outDir, bundle);
//     return {
//       type: "success",
//       bundle: bundle,
//     };
//   } catch (e) {
//     return {
//       type: "error",
//       error: e as Error,
//     };
//   }
// }
