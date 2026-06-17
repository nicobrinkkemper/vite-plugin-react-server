/**
 * Characterization tests for createHandlerOptions.server / .client.
 *
 * The two variants are ~90% identical and are slated to be consolidated behind
 * a shared `.shared.ts`. They have already drifted in a few places, and the
 * point of this file is to pin EXACTLY where their resolved-options output
 * differs for identical input, so the consolidation can preserve (or
 * deliberately change) each difference rather than regress it silently.
 *
 * Runs under the react-server condition only (test/unit/** is gated to it).
 * Workers are disabled and components are pre-supplied so neither variant
 * spawns a thread or performs a dynamic import — this stays a pure unit test.
 *
 * Findings this locks in (some correct earlier assumptions, some not):
 *  - clientPipeableStreamOptions: server coerces undefined -> {} ("|| {}"),
 *    client passes undefined through. REAL divergence.
 *  - Components: server loads PageComponent/RootComponent/HtmlComponent eagerly;
 *    client sets all three to undefined (placeholders). REAL divergence.
 *  - `components` field: BOTH carry it (via the `...userOptions` spread), so the
 *    "client drops components" assumption is FALSE — they match.
 *  - `children`: client threads it through; server omits it.
 *  - Shared scalar fields (route/url/paths/timeouts/build/dev) match.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createLogger } from "vite";
import { resolveOptions } from "vite-plugin-react-server/config";
import { testUserOptions } from "../test-config.js";
import { createHandlerOptions as createServerHandlerOptions } from "../../plugin/config/createHandlerOptions.server.js";
import { createHandlerOptions as createClientHandlerOptions } from "../../plugin/config/createHandlerOptions.client.js";

const PageStub = () => null;
const RootStub = () => null;
const HtmlStub = () => null;
const CHILDREN = { marker: "children-passthrough" };

function emptyAutoDiscoveredFiles(): any {
  return {
    clientInputs: {},
    serverInputs: {},
    staticManifest: {},
    staticInputs: {},
    workerPaths: {},
    serverEntry: null,
    clientEntry: {},
    serverActions: {},
    propsMap: new Map(),
    pageMap: new Map(),
    rootMap: new Map(),
    htmlMap: new Map(),
    routeMap: new Map(),
    urlMap: new Map(),
    errors: [],
  };
}

let server: any;
let client: any;

beforeAll(async () => {
  const userOptions: any = resolveOptions(testUserOptions).userOptions!;

  // Pre-supply components so the server variant skips component loading, and
  // force undefined stream options so the "|| {}" divergence is observable.
  userOptions.components = { Page: PageStub, Root: RootStub, Html: HtmlStub };
  userOptions.clientPipeableStreamOptions = undefined;

  // Disable every worker path so neither variant spawns a thread. Under the
  // react-server condition + build mode, build.useHtmlWorker would default true.
  userOptions.dev = { ...userOptions.dev, useRscWorker: false, useHtmlWorker: false };
  userOptions.build = { ...userOptions.build, useRscWorker: false, useHtmlWorker: false };

  // Seed the route resolution so getRouteFiles takes the cache fast-path and
  // returns a headless ("") root/html without touching the filesystem.
  const autoDiscoveredFiles = emptyAutoDiscoveredFiles();
  autoDiscoveredFiles.urlMap.set("/", {
    page: "src/page/page.tsx",
    props: undefined,
    root: "",
    html: "",
  });

  const common = {
    userOptions,
    autoDiscoveredFiles,
    configEnv: { mode: "production", command: "build" } as const,
    mode: "production",
    logger: createLogger("silent"),
  };

  server = await createServerHandlerOptions("/", { ...common, id: "char-server" });
  client = await createClientHandlerOptions("/", {
    ...common,
    id: "char-client",
    children: CHILDREN,
  });
});

describe("createHandlerOptions: shared output (must survive consolidation)", () => {
  it("resolves the same route, url and file paths", () => {
    expect(server.route).toBe("/");
    expect(client.route).toBe(server.route);
    expect(client.url).toBe(server.url);
    expect(client.pagePath).toBe(server.pagePath);
    expect(client.rootPath).toBe(server.rootPath);
    expect(client.htmlPath).toBe(server.htmlPath);
  });

  it("resolves the same timeouts and build/dev config", () => {
    expect(client.rscTimeout).toBe(server.rscTimeout);
    expect(client.htmlTimeout).toBe(server.htmlTimeout);
    expect(client.build).toEqual(server.build);
    expect(client.dev).toEqual(server.dev);
  });

  it("carries the components map on BOTH variants (via the spread)", () => {
    // Corrects the assumption that the client variant drops `components`.
    expect(server.components).toBe(client.components);
    expect(server.components).toEqual({ Page: PageStub, Root: RootStub, Html: HtmlStub });
  });

  it("creates no workers when all worker flags are disabled", () => {
    expect(server.worker).toBeUndefined();
    expect(server.rscWorker).toBeUndefined();
    expect(server.htmlWorker).toBeUndefined();
    expect(client.worker).toBeUndefined();
    expect(client.rscWorker).toBeUndefined();
    expect(client.htmlWorker).toBeUndefined();
  });
});

describe("createHandlerOptions: documented divergences", () => {
  it("coerces undefined clientPipeableStreamOptions to {} on server, passes through on client", () => {
    expect(server.clientPipeableStreamOptions).toEqual({});
    expect(client.clientPipeableStreamOptions).toBeUndefined();
  });

  it("loads components eagerly on server, leaves placeholders on client", () => {
    expect(server.PageComponent).toBe(PageStub);
    expect(server.RootComponent).toBe(RootStub);
    expect(server.HtmlComponent).toBe(HtmlStub);

    expect(client.PageComponent).toBeUndefined();
    expect(client.RootComponent).toBeUndefined();
    expect(client.HtmlComponent).toBeUndefined();
  });

  it("threads `children` through on client only", () => {
    expect(client.children).toBe(CHILDREN);
    expect(server.children).toBeUndefined();
  });
});
