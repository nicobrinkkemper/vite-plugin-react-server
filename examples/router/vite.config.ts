import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";
import { fileRouter } from "vite-plugin-react-server/router";

// File-based routing: fileRouter scans src/routes/** for page.tsx (+ sibling
// props.ts) and produces Page/props/build.pages. `/greet/$name` is a dynamic
// route; getStaticPaths prerenders two names, and it also renders live per
// request on the edge for any other name.
const router = fileRouter("src/routes", {
  staticPaths: { "/greet/$name": () => [{ name: "ada" }, { name: "grace" }] },
});

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      moduleBase: "src",
      Page: router.Page,
      props: router.props,
      routePatterns: router.routePatterns,
      build: {
        pages: router.build.pages,
        edge: { minify: false },
      },
    } satisfies StreamPluginOptions) as PluginOption,
  ],
  optimizeDeps: { include: ["react-server-dom-esm/client.browser"] },
});
