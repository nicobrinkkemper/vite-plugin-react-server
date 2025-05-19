import { join } from "path";
import type { RenderMetrics, StreamPluginOptions, PluginEvent } from "../plugin/types.js";
import { Html } from "../plugin/components/html.js";

const resolvedTestConfig = {
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  Html: Html,
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
    purgeCss: false as boolean,
  },
} satisfies StreamPluginOptions;

export const testUserOptions = resolvedTestConfig;


