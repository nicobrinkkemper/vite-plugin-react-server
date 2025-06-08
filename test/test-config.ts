import { join } from "path";
import type { RenderMetrics, StreamPluginOptions, PluginEvent } from "../plugin/types.js";

const resolvedTestConfig = {
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  moduleBasePath: '/',
  moduleBaseURL: '/',
  verbose: true, // Enable verbose mode for debugging
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


