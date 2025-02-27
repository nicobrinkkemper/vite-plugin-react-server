import { join } from "path";
import { DEFAULT_CONFIG } from "../plugin/config/defaults.js";
import { resolveOptions } from "../plugin/config/resolveOptions.js";

const resolvedTestConfig = resolveOptions({
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: DEFAULT_CONFIG.PAGE,
  props: DEFAULT_CONFIG.PROPS,
  build: {
    pages: ["/"],
    assetsDir: 'assets',
    client: "client",
    server: "server",
    static: "static",
    outDir: "dist",
  }
})

if(resolvedTestConfig.type === 'error') {
  throw resolvedTestConfig.error;
}

export const testUserOptions = resolvedTestConfig.userOptions;
