import { defineConfig, PluginOption } from "vite";
import { StreamPluginOptions, vitePluginReactServer } from "vite-plugin-react-server";

// React Router owns navigation INSIDE a "use client" boundary; vprs owns the
// RSC render and the prerender. Every URL maps to the same page module — the
// router reads the location itself — so deep links work in dev and each entry
// in build.pages prerenders to real HTML that hydrates straight into the
// matching Router view.
export default defineConfig({
  plugins: [
    vitePluginReactServer({
      moduleBase: "src",
      Page: () => "src/page.tsx",
      props: () => "src/props.ts",
      build: {
        pages: ["/", "/about", "/users/ada"],
        edge: { minify: false },
      },
    } satisfies StreamPluginOptions) as PluginOption,
  ],
  optimizeDeps: { include: ["react-server-dom-esm/client.browser"] },
});
