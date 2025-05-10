import { CssCollector } from "../css-collector.js";
import { Html } from "../html.js";
export const DEFAULT_CONFIG = {
  MODULE_EXTENSION: /\.(m|c)?(j|t)sx?$/,
  CLIENT_ASSETS_DIR: "assets",
  RSC_DIR: "rsc",
  MODULE_BASE: "src",
  MODULE_BASE_PATH: "",
  MODULE_BASE_URL: "",
  PAGE: "page.tsx",
  PROPS: "props.ts",
  CLIENT_ENTRY: undefined,
  SERVER_ENTRY: undefined,
  PAGE_EXPORT_NAME: "Page",
  PROPS_EXPORT_NAME: "props",
  HTML_WORKER_PATH: `worker/html/html-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  RSC_WORKER_PATH: `worker/rsc/rsc-worker.${
    process.env["NODE_ENV"] === "production" ? "production" : "development"
  }.js`,
  LOADER_PATH: "worker/loader.js",
  RSC_EXTENSION: ".rsc",
  CSS_COLLECTOR: CssCollector,
  HTML: Html,
  ON_METRICS: ()=>{},
  DEV_PORT: 5173,
  PREVIEW_PORT: 4173,
  DEV_HOST: "localhost",
  PREVIEW_HOST: "localhost",
  ENV_PREFIX: "VITE_",
  BUILD: {
    pages: ["/"],
    client: "client",
    server: "server",
    static: "static",
    api: "api",
    outDir: "dist",
    assetsDir: "assets",
    hash: "hash",
    rscOutputPath: "index.rsc",
    htmlOutputPath: "index.html",
    preserveModulesRoot: true,
  },
  CSS: {
    inlineCss: false,
    purgeCss: false,
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [/\.css$/] as RegExp[], // 
    linkPatterns: [/node_modules/] as RegExp[], // Always link node_modules CSS
  },
  MODULE_BASE_EXCEPTIONS: [] as string[],
  AUTO_DISCOVER: {
    // All REGEX tricks used here are based on the following:
    // $ = endsWith
    // ^ = startsWith
    // . = includes
    // \ = escape
    // ? = optional
    // () = group
    // | = or
    modulePattern: (n: string) => /\.(m|c)?(j|t)sx?$/.test(n),
    pagePattern: (n: string) => /\.?page(\.js)?$/.test(n),
    propsPattern: (n: string) => /\.?props(\.js)?$/.test(n),
    clientComponents: (n: string) => /(\.|\/)?client(\.js)?$/.test(n),
    serverFunctions: (n: string) => /(\.|\/)?server(\.js)?$/.test(n),
    cssPattern: (n: string) => /\.css$/.test(n),
    cssModulePattern: (n: string) => /\.css\.js$/.test(n),
    virtualPattern: (n: string) => /^\/_virtual\//.test(n),
    vendorPattern: (n: string) =>
      /^\/node_modules\//.test(n),
    htmlPattern: (n: string) => /\.html$/.test(n),
    jsonPattern: (n: string) => /\.json$/.test(n),
    nodeOnly: (n: string) => /\.node(\.js)?$/.test(n),
    dotFiles: (n: string) => n.split('/').some(p => p.startsWith('.')),
    rscPattern: (n: string) => /\.rsc$/.test(n),  
  },
  MODULE_ID: (id: string) => id,
} as const;