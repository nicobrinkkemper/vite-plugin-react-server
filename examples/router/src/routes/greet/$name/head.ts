import type { RouteHeadExport } from "vite-plugin-react-server/router";

export const head: RouteHeadExport = ({ data }) => ({
  title: `Greeting ${(data as { name?: string }).name ?? "?"}`,
});
