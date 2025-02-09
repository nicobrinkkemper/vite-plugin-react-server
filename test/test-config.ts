import { dirname, join, relative } from "path";
import { ResolvedUserOptions } from "../plugin/types.js";
import { DEFAULT_CONFIG } from "../plugin/config/defaults.js";
import { fileURLToPath } from "node:url";
export const testDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/test-project')
export const testConfig = {
  moduleBase: DEFAULT_CONFIG.MODULE_BASE,
  moduleBasePath: DEFAULT_CONFIG.MODULE_BASE_PATH,
  moduleBaseURL: DEFAULT_CONFIG.MODULE_BASE_URL,
  projectRoot: testDir,
  moduleBaseExceptions: DEFAULT_CONFIG.MODULE_BASE_EXCEPTIONS,
  htmlWorkerPath: "../../../dist/plugin/worker/html/html-worker.js" ,
  rscWorkerPath: "../../../dist/plugin/worker/rsc/rsc-worker.js",
  loaderPath: "../../../dist/plugin/worker/loader.js",
  build: DEFAULT_CONFIG.BUILD,
  Page: DEFAULT_CONFIG.PAGE,
  props: DEFAULT_CONFIG.PROPS,
  Html: DEFAULT_CONFIG.HTML,
  pageExportName: DEFAULT_CONFIG.PAGE_EXPORT,
  propsExportName: DEFAULT_CONFIG.PROPS_EXPORT,
  collectCss: DEFAULT_CONFIG.COLLECT_CSS,
  collectAssets: DEFAULT_CONFIG.COLLECT_ASSETS,
  assetsDir: DEFAULT_CONFIG.CLIENT_ASSETS_DIR,
  clientEntry: DEFAULT_CONFIG.CLIENT_ENTRY,
  serverEntry: DEFAULT_CONFIG.SERVER_ENTRY,
  autoDiscover: DEFAULT_CONFIG.AUTO_DISCOVER
} satisfies ResolvedUserOptions