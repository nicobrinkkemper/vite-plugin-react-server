import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    props: "src/props.ts",
    build: {
      pages: ["/"],
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
