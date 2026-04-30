import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    moduleBase: "src",
    Page: "src/page.tsx",
    props: "src/props.ts",
    build: { pages: ["/"] },
  }),
  optimizeDeps: {
    include: ["react-server-dom-esm/client.browser"],
  },
});
