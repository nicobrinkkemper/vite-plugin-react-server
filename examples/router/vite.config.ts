import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";

// File-based routing in one field: `routes: { dir }` (relative to moduleBase)
// scans src/routes/** for page.tsx (+ sibling props.ts) and derives Page /
// props / routePatterns / the prerender worklist. `/greet/$name` is a dynamic
// route; staticPaths prerenders two names, and it also renders live per request
// on the edge for any other name.
export default defineConfig({
  plugins: [
    vitePluginReactServer({
      runner: "isolated",
      moduleBase: "src",
      routes: {
        dir: "routes",
        staticPaths: { "/greet/$name": () => [{ name: "ada" }, { name: "grace" }] },
      },
      build: { edge: { minify: false } },
    } satisfies StreamPluginOptions) as PluginOption,
  ],
  optimizeDeps: { include: ["react-server-dom-esm/client.browser"] },
});
