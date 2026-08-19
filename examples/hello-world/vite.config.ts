import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [vitePluginReactServer({
    runner: "isolated",
    moduleBase: "src",
    // File-based routing: scan `moduleBase` itself — src/page.tsx (+ sibling
    // props.ts) becomes "/", and the prerender worklist derives from the tree.
    routes: {},
    build: {
      // The single-isolate edge bundle is ON by default; the object form just
      // tunes it. Here: keep dist/server-edge/render.js unminified for learning
      // (minify defaults to true for real edge deploys). `edge: false` opts out.
      edge: { minify: false },
    },
  } satisfies StreamPluginOptions) as PluginOption],
  optimizeDeps: {
    include: ["react-server-dom-esm/client.browser"],
  },
});
