import type { RenderMetrics, StreamPluginOptions, PluginEvent } from "vite-plugin-react-server/types";

const resolvedTestConfig = {
  moduleBase: "src",
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '',
  moduleBaseURL: process.env.VITE_BASE_URL || '/',
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
  css: {
    inlineCss: false,
  },
} satisfies StreamPluginOptions;

export const testUserOptions = resolvedTestConfig;


