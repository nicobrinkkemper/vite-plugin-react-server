import { defineConfig } from "vite";
import { resolve } from "node:path";
import { filePreserverPlugin } from "./plugin/file-preserver/plugin.js";

export default defineConfig({
  plugins: [filePreserverPlugin("utils/env")],
  build: {
    minify: false,
    target: "esnext",
    // already taken care of by rm -rf dist before tsc, and we don't want to remove the .d.ts files
    // this avoids the @rollup/plugin-typescript for re-adding them (You can technically leave out this entire vite build step, it
    // should work with tsc (I might remove this step in the future, as vite is more browser oriented than node library oriented
    // you need to fight it to not try and externalize things for the browser)
    emptyOutDir: false,
    ssr: true,
    sourcemap: 'inline',
    lib: {
      entry: {
        client: resolve(__dirname, "client.ts"),
        server: resolve(__dirname, "server.ts"),
        static: resolve(__dirname, "static.ts"),
        
        
        
        "plugin/worker/index": resolve(
          __dirname,
          "plugin/worker/index.ts"
        ),
        "plugin/worker/html/index": resolve(
          __dirname,
          "plugin/worker/html/index.ts"
        ),
        "plugin/worker/rsc/index": resolve(
          __dirname,
          "plugin/worker/rsc/index.ts"
        ),
        
        "plugin/loader/react-loader": resolve(
          __dirname,
          "plugin/loader/react-loader.ts"
        ),
        "plugin/loader/env-loader": resolve(
          __dirname,
          "plugin/loader/env-loader.ts"
        ),
        "plugin/loader/css-loader": resolve(  
          __dirname,
          "plugin/loader/css-loader.ts"
        ),
        "plugin/loader/index": resolve(
          __dirname,
          "plugin/loader/index.ts"
        ),
        "plugin/orchestrator/plugin": resolve(__dirname, "plugin/orchestrator/index.ts"),
        "plugin/components/index": resolve(__dirname, "plugin/components/index.ts"),
        "plugin/utils/index": resolve(__dirname, "plugin/utils/index.ts"),
        "plugin/metrics/index": resolve(__dirname, "plugin/metrics/index.ts"),
        
        "plugin/stream/server": resolve(__dirname, "plugin/stream/index.server.ts"),
        "plugin/stream/client": resolve(__dirname, "plugin/stream/index.client.ts"),
        
        "plugin/vendor/index": resolve(__dirname, "plugin/vendor/index.ts"),
        "plugin/vendor/vendor.server": resolve(__dirname, "plugin/vendor/vendor.server.ts"),
        "plugin/vendor/vendor.client": resolve(__dirname, "plugin/vendor/vendor.client.ts"),
        "plugin/vendor/vendor.static": resolve(__dirname, "plugin/vendor/vendor.static.ts"),
        "plugin/config/index": resolve(__dirname, "plugin/config/index.ts"),
        "plugin/error/index": resolve(__dirname, "plugin/error/index.ts"),
        
        
        "plugin/dev-server/index.server": resolve(__dirname, "plugin/dev-server/index.server.ts"),
        "plugin/dev-server/index.client": resolve(__dirname, "plugin/dev-server/index.client.ts"),
        
        "plugin/dev-server/configureReactServer.server": resolve(__dirname, "plugin/dev-server/configureReactServer.server.ts"),
        
        "plugin/dev-server/handleServerAction.server": resolve(__dirname, "plugin/dev-server/handleServerAction.server.ts"),
        "plugin/dev-server/handleServerAction.client": resolve(__dirname, "plugin/dev-server/handleServerAction.client.ts"),
        
        "plugin/stream/handleRscStream.server": resolve(__dirname, "plugin/stream/handleRscStream.server.ts"),
        "plugin/stream/handleRscStream.client": resolve(__dirname, "plugin/stream/handleRscStream.client.ts"),
        
        "plugin/stream/createRscStream.server": resolve(__dirname, "plugin/stream/createRscStream.server.ts"),
        "plugin/stream/createRscStream.client": resolve(__dirname, "plugin/stream/createRscStream.client.ts"),
        
        "plugin/file-preserver/plugin": resolve(
          __dirname,
          "plugin/file-preserver/plugin.ts"
        ),
        "plugin/loader/directives/index": resolve(
          __dirname,
          "plugin/loader/directives/index.ts"
        ),
        "plugin/helpers/index.server": resolve(__dirname, "plugin/helpers/index.server.ts"),
        "plugin/helpers/index.client": resolve(__dirname, "plugin/helpers/index.client.ts"),
        "plugin/env/index.server": resolve(__dirname, "plugin/env/index.server.ts"),
        "plugin/env/index.client": resolve(__dirname, "plugin/env/index.client.ts"),
        "plugin/env/plugin.server": resolve(__dirname, "plugin/env/plugin.server.ts"),
        "plugin/env/plugin.client": resolve(__dirname, "plugin/env/plugin.client.ts"),
        "plugin/index.server": resolve(__dirname, "plugin/index.server.ts"),
        "plugin/index.client": resolve(__dirname, "plugin/index.client.ts"),
        "plugin/plugin.server": resolve(__dirname, "plugin/plugin.server.ts"),
        "plugin/plugin.client": resolve(__dirname, "plugin/plugin.client.ts"),
        "plugin/react-server/index.server": resolve(__dirname, "plugin/react-server/index.server.ts"),
        "plugin/react-server/index.client": resolve(__dirname, "plugin/react-server/index.client.ts"),
        "plugin/react-client/index.server": resolve(__dirname, "plugin/react-client/index.server.ts"),
        "plugin/react-client/index.client": resolve(__dirname, "plugin/react-client/index.client.ts"),
        "plugin/react-static/index.server": resolve(__dirname, "plugin/react-static/index.server.ts"),
        "plugin/react-static/index.client": resolve(__dirname, "plugin/react-static/index.client.ts"),
        "plugin/transformer/plugin.server": resolve(__dirname, "plugin/transformer/plugin.server.ts"),
        "plugin/transformer/plugin.client": resolve(__dirname, "plugin/transformer/plugin.client.ts"),
        "plugin/orchestrator/createPluginOrchestrator.server": resolve(__dirname, "plugin/orchestrator/createPluginOrchestrator.server.ts"),
        "plugin/orchestrator/createPluginOrchestrator.client": resolve(__dirname, "plugin/orchestrator/createPluginOrchestrator.client.ts"),
        "plugin/config/createHandlerOptions.server": resolve(__dirname, "plugin/config/createHandlerOptions.server.ts"),
        "plugin/config/createHandlerOptions.client": resolve(__dirname, "plugin/config/createHandlerOptions.client.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: {
      // probably too much, but these are the ones that gave errors at some point
      external: (id) => {
        // Exclude test fixtures from the build
        if (id.includes('/test/') || id.includes('\\test\\')) {
          return true;
        }
        
        // Check against the static external list
        const staticExternals = [
        // Node.js built-ins
        "node:worker_threads",
        "node:path",
        "node:fs",
        "node:fs/promises",
        // Dependencies
        "vite",
        "esbuild",
        "tsx",
        "react",
        "react-dom",
        "react-dom/server",
        "react-dom/server.node",
        "react-server-dom-esm/server",
        "react-server-dom-esm/server.node",
        "react-server-dom-esm/client.node",
        "react-server-dom-esm/client.browser",
        "react-server-dom-esm/node-loader",
        "webpack-sources",
        "webpack-sources/lib/helpers/createMappingsSerializer.js",
        "webpack-sources/lib/helpers/readMappings.js",
        // css
        "symbols",
        "postcss",
        "happy-dom",
        // Add tsx and its dependencies
        "tsx",
        "tsx/esm/api",
        "tsx/source-map-support",
        "tsx/register",
        "vitest",
        "rollup",
        "source-map",
        "acorn-loose",
        "fsevents",
        "webpack-sources",
        "stream",
        "util",
        "crypto",
        "async_hooks",
        "@jridgewell/sourcemap-codec",
        "path",
        "fs",
        "fs/promises",
        "worker_threads",
        "tsx",
        "tsx/esm/api",
        "rollup",
        // if we use node: paths in our code, it should always be catched by below rule.
        /^node:.*/,
        /^_virtual/,
        ];
        
        // Check if the id matches any of the static externals
        return staticExternals.some(external => {
          if (typeof external === 'string') {
            return id === external;
          } else if (external instanceof RegExp) {
            return external.test(id);
          }
          return false;
        });
      },
      output: {
        dir: "dist",
        exports: "named",
        preserveModules: true,
        esModule: true,
        compact: false,
        banner:
          "/**\n * vite-plugin-react-server\n * Copyright (c) Nico Brinkkemper\n * MIT License\n */",
      },
    },
    // Preserve module structure for proper tree-shaking
    modulePreload: false,
  },
  // Prevent Vite from replacing import.meta.hot with undefined during library build.
  // Consumers use useRscHmr in dev where import.meta.hot IS defined.
  define: {
    "import.meta.hot": "import.meta.hot",
  },
  esbuild: {
    // Preserve import.meta expressions in utils files
    supported: {
      "import-meta": true,
    },
    target: "esnext",
    format: "esm",
  },
});
