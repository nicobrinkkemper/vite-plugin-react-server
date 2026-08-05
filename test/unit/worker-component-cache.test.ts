import { describe, it, expect, vi, beforeEach } from "vitest";

// The worker modules read workerData at module scope (state.server.ts throws
// without it), so the mock must be in place before the first import.
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
import {
  hmrState,
  clearAllCachedComponents,
  hasCachedComponent,
} from "../../plugin/worker/rsc/state.server.js";
import { Html as DefaultHtml } from "../../plugin/components/html.js";
import { React } from "../../plugin/vendor/vendor.server.js";

const PAGE = "src/page.tsx";
const ROOT = "src/root.tsx";
const HTML = "src/html.tsx";
const URL = "/test/";

type ModuleMap = Record<string, Record<string, unknown>>;

// Fresh component identities per generation so cache hits are provable:
// a hit returns generation 1's function even when the loader would serve
// generation 2's.
function makeGeneration(propsValue: Record<string, unknown>) {
  const Page = () => null;
  const Root = () => null;
  const Html = () => null;
  const props = vi.fn(() => propsValue);
  const modules: ModuleMap = {
    [PAGE]: { Page, props },
    [ROOT]: { Root },
    [HTML]: { Html },
  };
  return { Page, Root, Html, props, modules };
}

function makeLoader(modules: ModuleMap) {
  return vi.fn(async (id: string) => {
    const path = id.split("#")[0];
    const mod = modules[path];
    if (!mod) throw new Error(`unexpected module request: ${id}`);
    return mod;
  });
}

function loaderPaths(loader: ReturnType<typeof makeLoader>) {
  return loader.mock.calls.map(([id]) => id.split("#")[0]);
}

async function load(
  modules: ModuleMap,
  overrides: Partial<Parameters<typeof loadComponentsWithCache>[0]> = {}
) {
  const loader = makeLoader(modules);
  const result = await loadComponentsWithCache({
    pagePath: PAGE,
    rootPath: ROOT,
    htmlPath: HTML,
    url: URL,
    loader,
    ...overrides,
  });
  return { loader, result };
}

function invalidate(path: string) {
  hmrState.set(path, { timestamp: 1, invalidated: true, routes: [] });
}

beforeEach(() => {
  clearAllCachedComponents();
  hmrState.clear();
});

describe("worker component cache (loadComponentsWithCache)", () => {
  it("cold load resolves Page/Root/Html through the loader and caches them", async () => {
    const gen = makeGeneration({ title: "one" });
    const { loader, result } = await load(gen.modules);

    expect(result.PageComponent).toBe(gen.Page);
    expect(result.RootComponent).toBe(gen.Root);
    expect(result.HtmlComponent).toBe(gen.Html);
    expect(result.pageProps).toEqual({ title: "one" });

    const paths = loaderPaths(loader);
    expect(paths).toContain(PAGE);
    expect(paths).toContain(ROOT);
    expect(paths).toContain(HTML);

    expect(hasCachedComponent(`${PAGE}#Page`)).toBe(true);
    expect(hasCachedComponent(`${ROOT}#Root`)).toBe(true);
    expect(hasCachedComponent(`${HTML}#Html`)).toBe(true);
  });

  it("warm load serves Page/Root/Html from cache", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    const gen2 = makeGeneration({ title: "two" });
    const { loader, result } = await load(gen2.modules);

    // Cached identities win even though the loader would now serve gen2.
    expect(result.PageComponent).toBe(gen1.Page);
    expect(result.RootComponent).toBe(gen1.Root);
    expect(result.HtmlComponent).toBe(gen1.Html);

    // Root and Html are full cache hits: the loader is never consulted.
    const paths = loaderPaths(loader);
    expect(paths).not.toContain(ROOT);
    expect(paths).not.toContain(HTML);
  });

  it("re-resolves props on every request even when Page is cached (bd-5xu)", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    const gen2 = makeGeneration({ title: "two" });
    const { loader, result } = await load(gen2.modules);

    // Props come fresh from the current loader, not from any cache …
    expect(result.pageProps).toEqual({ title: "two" });
    expect(gen2.props).toHaveBeenCalledTimes(1);
    // gen1's props ran only for its own (cold) request.
    expect(gen1.props).toHaveBeenCalledTimes(1);
    // … which means the page module itself is re-loaded on the warm path
    // (only the PageComponent identity is served from cache).
    expect(loaderPaths(loader)).toContain(PAGE);
  });

  it("skips the props load when the main thread pre-resolved them", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    const gen2 = makeGeneration({ title: "two" });
    const { loader, result } = await load(gen2.modules, {
      resolvedPageProps: { title: "pre-resolved" },
    });

    expect(result.PageComponent).toBe(gen1.Page);
    expect(result.pageProps).toEqual({ title: "pre-resolved" });
    expect(loaderPaths(loader)).not.toContain(PAGE);
    expect(gen2.props).not.toHaveBeenCalled();
  });

  it("invalidation reloads the Page and leaves Root/Html cached", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    invalidate(PAGE);
    const gen2 = makeGeneration({ title: "two" });
    const { result } = await load(gen2.modules);

    expect(result.PageComponent).toBe(gen2.Page);
    expect(result.RootComponent).toBe(gen1.Root);
    expect(result.HtmlComponent).toBe(gen1.Html);

    // Invalidation is sticky: until HMR_CLEANUP clears the hmrState entry,
    // every load reloads the module again.
    const gen3 = makeGeneration({ title: "three" });
    const { result: third } = await load(gen3.modules);
    expect(third.PageComponent).toBe(gen3.Page);

    // Once cleared, the latest reload is served from cache again, and an
    // unrelated invalidation doesn't evict it.
    hmrState.delete(PAGE);
    invalidate(ROOT);
    const gen4 = makeGeneration({ title: "four" });
    const { result: fourth } = await load(gen4.modules);
    expect(fourth.PageComponent).toBe(gen3.Page);
  });

  it("invalidation reloads the Root and leaves Page/Html cached", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    invalidate(ROOT);
    const gen2 = makeGeneration({ title: "two" });
    const { result } = await load(gen2.modules);

    expect(result.RootComponent).toBe(gen2.Root);
    expect(result.PageComponent).toBe(gen1.Page);
    expect(result.HtmlComponent).toBe(gen1.Html);
  });

  it("invalidation reloads the Html and leaves Page/Root cached", async () => {
    const gen1 = makeGeneration({ title: "one" });
    await load(gen1.modules);

    invalidate(HTML);
    const gen2 = makeGeneration({ title: "two" });
    const { result } = await load(gen2.modules);

    expect(result.HtmlComponent).toBe(gen2.Html);
    expect(result.PageComponent).toBe(gen1.Page);
    expect(result.RootComponent).toBe(gen1.Root);
  });

  it("htmlPath '' means explicitly headless: React.Fragment, no load, no cache", async () => {
    const gen = makeGeneration({ title: "one" });
    const { loader, result } = await load(gen.modules, { htmlPath: "" });

    expect(result.HtmlComponent).toBe(React.Fragment);
    expect(loaderPaths(loader)).not.toContain(HTML);
    expect(hasCachedComponent(`${HTML}#Html`)).toBe(false);
  });

  it("htmlPath undefined falls back to the built-in Html document", async () => {
    const gen = makeGeneration({ title: "one" });
    const { result } = await load(gen.modules, { htmlPath: undefined });

    expect(result.HtmlComponent).toBe(DefaultHtml);
  });

  it("rootPath undefined falls back to the built-in Root component", async () => {
    const gen = makeGeneration({ title: "one" });
    const { result } = await load(gen.modules, { rootPath: undefined });

    const { Root: BuiltinRoot } = await import("../../plugin/components/root.js");
    expect(result.RootComponent).toBe(BuiltinRoot);
  });
});
