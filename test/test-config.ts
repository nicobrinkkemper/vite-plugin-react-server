import { join } from "path";
import type { RenderMetrics, StreamPluginOptions, PluginEvent } from "../plugin/types.js";

const resolvedTestConfig = {
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '/',
  moduleBaseURL: '/',
  verbose: false,
  rscTimeout: 720,
  rscWorkerStartupTimeout: 2000,
  htmlWorkerStartupTimeout: 2000,
  build: {
    pages: ["/"],
    assetsDir: 'assets',
    client: "client",
    server: "server",
    static: "static",
    outDir: "dist",
  },
  onMetrics: (() => {}) as ((metrics: RenderMetrics) => void) | undefined,
  onEvent: undefined as ((event: PluginEvent) => void) | undefined,
  css: {
    inlineCss: false as boolean,
  },
} satisfies StreamPluginOptions;

export const testUserOptions = resolvedTestConfig;


