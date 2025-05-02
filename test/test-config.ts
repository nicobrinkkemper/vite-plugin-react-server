import { join } from "path";
import type { RenderMetrics, StreamPluginOptions, PluginEvent } from "../plugin/types.js";
import React from "react";

const Html = ({ children }: { children: React.ReactNode }) => {
  return React.createElement('html', null, 
    React.createElement('head', null),
    React.createElement('body', null, 
      React.createElement('div', { id: 'root' }, children)
    )
  );
};

const resolvedTestConfig = {
  moduleBase: "src",
  projectRoot: join(__dirname, '../fixtures/test-project/'),
  Page: "src/page/page.tsx",
  props: "src/page/props.ts",
  pageExportName: "Page",
  Html,
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


