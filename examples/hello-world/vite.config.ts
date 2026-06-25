import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    props: "src/props.ts",
    build: {
      pages: ["/"],
      edge: {
        singleIsolate: true,
        // Keep the baked dist/server-edge/render.js readable for learning.
        // Defaults to true — leave it on for real edge deploys (size limits).
        minify: false,
      },
    },
  } satisfies StreamPluginOptions) as PluginOption],
  optimizeDeps: {
    include: ["react-server-dom-esm/client.browser"],
  },
});
