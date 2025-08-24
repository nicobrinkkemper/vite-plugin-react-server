import type {  StreamPluginOptions } from "vite-plugin-react-server/types";


export const testUserOptions = {
  moduleBase: "src",
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '',
  moduleBaseURL: typeof process.env.VITE_BASE_URL === 'string' ? process.env.VITE_BASE_URL : '/',
  verbose: true,
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


