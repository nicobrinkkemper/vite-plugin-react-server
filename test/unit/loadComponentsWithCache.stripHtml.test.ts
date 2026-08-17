import { describe, expect, it, vi } from "vitest";

// The worker modules read workerData at module scope (state.server.ts throws
// without it), so the mock must be in place before the first import — same
// bootstrap as worker-component-cache.test.ts.
vi.mock("node:worker_threads", () => ({
  workerData: {
    userOptions: {
      projectRoot: "/test-project",
      moduleBasePath: "",
      verbose: false,
    },
    resolvedConfig: { logLevel: "silent" },
  },
  parentPort: null,
}));

import { loadComponentsWithCache } from "../../plugin/worker/rsc/messageHandler.server.js";
import { getCondition } from "../../plugin/config/getCondition.js";

// The worker render path derives params in TWO places — the page/props loader
// (through resolvePageAndProps) and the layout chain's own matching — and both
// must honor the router's stripHtmlSuffix choice. This exercises the exported
// worker entry directly with a virtual loader, so a dev:ssr / worker render
// can't silently fall back to always-strip while the main-thread and edge
// paths honor the knob.
//
// The module is react-server-side (it pulls the flight renderer), so the
// suite runs on that leg of test:both only.

const isReactServer = getCondition() === "react-server";

/** Virtual-module loader: page + props + a layout layer with its own loader. */
function makeLoader(seen: { props?: unknown; layout?: unknown }) {
  return async (id?: string) => {
    const base = String(id).split("#")[0];
    if (base === "virtual:props")
      return {
        props: (_url: string, ctx?: { params?: unknown }) => {
          seen.props = ctx?.params;
          return { ok: true };
        },
      };
    if (base === "virtual:layout")
      return { Layout: (p: { children?: unknown }) => p?.children ?? null };
    if (base === "virtual:layout-props")
      return {
        props: (_url: string, ctx?: { params?: unknown }) => {
          seen.layout = ctx?.params;
          return {};
        },
      };
    return { Page: () => null };
  };
}

async function renderParams(stripHtmlSuffix: boolean | undefined) {
  const seen: { props?: unknown; layout?: unknown } = {};
  await loadComponentsWithCache({
    pagePath: "virtual:page",
    propsPath: "virtual:props",
    url: "/docs/intro.html",
    routePatterns: ["/docs/$"],
    layouts: [
      {
        component: "virtual:layout",
        props: "virtual:layout-props",
      } as never,
    ],
    loader: makeLoader(seen),
    ...(stripHtmlSuffix === undefined ? {} : { stripHtmlSuffix }),
  });
  return seen;
}

describe.skipIf(!isReactServer)(
  "worker path honors stripHtmlSuffix in both loaders",
  () => {
    it("default strips .html — SSG transport reading", async () => {
      const seen = await renderParams(undefined);
      expect(seen.props).toEqual({ _splat: "intro" });
      expect(seen.layout).toEqual({ _splat: "intro" });
    });

    it("stripHtmlSuffix:false keeps .html as content in page AND layout params", async () => {
      const seen = await renderParams(false);
      expect(seen.props).toEqual({ _splat: "intro.html" });
      expect(seen.layout).toEqual({ _splat: "intro.html" });
    });
  },
);
