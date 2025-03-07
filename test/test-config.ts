import { join } from "path";
import { DEFAULT_CONFIG } from "../plugin/config/defaults.js";

const resolvedTestConfig = {
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: DEFAULT_CONFIG.PAGE,
  props: DEFAULT_CONFIG.PROPS,
  htmlWorkerPath: '../../../dist/plugin/worker/html/html-worker.development.js',
  rscWorkerPath: '../../../dist/plugin/worker/rsc/rsc-worker.development.js',
  build: {
    pages: ["/"],
    assetsDir: 'assets',
    client: "client",
    server: "server",
    static: "static",
    outDir: "dist",
  }
}

export const testUserOptions = resolvedTestConfig;
