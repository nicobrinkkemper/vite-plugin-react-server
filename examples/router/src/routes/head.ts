import type { RouteHeadContribution } from "vite-plugin-react-server/router";

export const head: RouteHeadContribution = {
  title: "File router demo",
  meta: [{ name: "description", content: "vprs file-based routing" }],
};
