export { buildClientPackagesPattern } from "./pattern.js";
export { discoverClientPackages } from "./discover.js";
export type { DiscoverOptions } from "./discover.js";
export { clientPackagesDiscoveryPlugin } from "./plugin.js";
export {
  mergeClientPackagesNoExternal,
  mergeClientPackagesOptimizeDepsExclude,
} from "./applyConfig.js";
