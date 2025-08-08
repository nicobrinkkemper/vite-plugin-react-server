import type {  StreamPluginOptions } from "vite-plugin-react-server/types";


export const testUserOptions = {
  moduleBase: "src",
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '/',
  moduleBaseURL: process.env.VITE_BASE_URL || '/',
  verbose: true,
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
} as StreamPluginOptions;


