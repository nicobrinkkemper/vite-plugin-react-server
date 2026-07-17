// Public "./edge" entry: the per-request edge server for a vprs build.
//
// Exported WITHOUT a `react-server` condition key, on purpose. The handler runs
// client React (the baked bundle carries server React inside it), but consumers
// import it from code that a react-server-condition build also has to load —
// a `./stream`-style condition split resolves that import to a server barrel
// which does not export it, and the build dies on a module that would never have
// run under that condition anyway. One target for both conditions is what makes
// the import safe from anywhere.
export {
  createEdgeRequestHandler,
  createEdgeRenderHook,
} from "./createEdgeRequestHandler.js";
export type {
  CreateEdgeRequestHandlerOptions,
  EdgeBundleExports,
  EdgeRenderHook,
} from "./createEdgeRequestHandler.types.js";
export type { EdgeFetchHandler } from "../stream/createEdgeHandler.types.js";
