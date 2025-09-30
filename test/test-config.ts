import type {  StreamPluginOptions } from "vite-plugin-react-server/types";
import { metricWatcher } from "vite-plugin-react-server/metrics";

export const testUserOptions = {
  moduleBase: "src",
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  propsExportName: "props",
  moduleBasePath: '',
  moduleBaseURL: typeof process.env.VITE_BASE_URL === 'string' ? process.env.VITE_BASE_URL : '/',
  verbose: false,
  // Enable metricWatcher to catch backpressure issues
  onMetrics: metricWatcher({
    maxTime: 200,           // Warn if processing takes > 200ms
    maxBackpressure: 0,     // Warn if ANY backpressure occurs (0 = warn on first occurrence)
    warnOnly: false,        // Show both warnings and info messages
  }),
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


