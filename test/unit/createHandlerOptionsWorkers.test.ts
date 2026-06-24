/**
 * Worker-creation characterization tests for createHandlerOptions.server / .client.
 *
 * The sibling test (createHandlerOptions.test.ts) runs with workers DISABLED, so
 * it cannot guard the worker-creation blocks. This file does the opposite: it
 * ENABLES the worker flags, mocks createWorker, and pins the EXACT createWorker
 * call shape each of the four blocks (server/client × rsc/html) produces for
 * identical input. That is the safety net that makes folding the four blocks
 * onto one shared helper safe (bd-3ly) — assert-the-call-shape, then unify.
 *
 * Pinned divergences (must survive consolidation):
 *  - currentCondition: server="react-server", client="react-client".
 *  - reverseCondition: server-rsc="react-server", server-html="react-client",
 *    client-rsc=OMITTED (createWorker defaults it), client-html="react-client".
 *  - workerData.resolvedConfig: server passes the RAW { configEnv, mode };
 *    client passes serializeResolvedConfig(config) or, with no config,
 *    undefined (rsc) / a synthesized ResolvedConfig literal (html).
 *  - workerData.configEnv: client includes it, server omits it.
 *  - workerData.userOptions: both pass serializedOptions(userOptions, files).
 *  - workerPath: rsc uses userOptions.rscWorkerPath, html uses htmlWorkerPath.
 *
 * Runs under the react-server condition only (test/unit/** is gated to it).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { createWorkerMock } = vi.hoisted(() => ({ createWorkerMock: vi.fn() }));
vi.mock("../../plugin/worker/createWorker.js", () => ({
  createWorker: createWorkerMock,
}));

import { createLogger } from "vite";
import { resolveOptions } from "vite-plugin-react-server/config";
import { testUserOptions } from "../test-config.js";
import { createHandlerOptions as createServerHandlerOptions } from "../../plugin/config/createHandlerOptions.server.js";
import { createHandlerOptions as createClientHandlerOptions } from "../../plugin/config/createHandlerOptions.client.js";

const PageStub = () => null;
const RootStub = () => null;
const HtmlStub = () => null;

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

function buildUserOptions() {
  const userOptions: any = resolveOptions(testUserOptions).userOptions!;
  // Pre-supply components so the server variant skips component loading.
  userOptions.components = { Page: PageStub, Root: RootStub, Html: HtmlStub };
  // Enable BOTH workers under build mode so each block runs exactly once.
  userOptions.dev = { ...userOptions.dev, useRscWorker: true, useHtmlWorker: true };
  userOptions.build = { ...userOptions.build, useRscWorker: true, useHtmlWorker: true };
  return userOptions;
}

function seededFiles() {
  const autoDiscoveredFiles = emptyAutoDiscoveredFiles();
  autoDiscoveredFiles.urlMap.set("/", {
    page: "src/page/page.tsx",
    props: undefined,
    root: "",
    html: "",
  });
  return autoDiscoveredFiles;
}

const CONFIG_ENV = { mode: "production", command: "build" } as const;

/** Pull the createWorker call for a given workerPath (rsc vs html). */
function callFor(workerPath: string) {
  const call = createWorkerMock.mock.calls.find(
    ([args]) => args.workerPath === workerPath
  );
  if (!call) throw new Error(`no createWorker call for workerPath ${workerPath}`);
  return call[0];
}

beforeEach(() => {
  createWorkerMock.mockReset();
  // Every block runs createConfiguredWorker, which needs a tagged result.
  createWorkerMock.mockResolvedValue({ type: "success", worker: { kind: "stub" } });
});

describe("createHandlerOptions.server: worker call shape", () => {
  it("spawns one RSC and one HTML worker with the server-side args", async () => {
    const userOptions = buildUserOptions();
    await createServerHandlerOptions("/", {
      userOptions,
      autoDiscoveredFiles: seededFiles(),
      configEnv: CONFIG_ENV,
      mode: "production",
      logger: createLogger("silent"),
      id: "char-server-workers",
    });

    expect(createWorkerMock).toHaveBeenCalledTimes(2);

    const rsc = callFor(userOptions.rscWorkerPath);
    expect(rsc.currentCondition).toBe("react-server");
    expect(rsc.reverseCondition).toBe("react-server");
    expect(rsc.workerData.id).toBe("/");
    expect(rsc.workerData.userOptions).toBeDefined();
    // Server passes the raw { configEnv, mode } as resolvedConfig, no top-level configEnv.
    expect(rsc.workerData.resolvedConfig).toEqual({ configEnv: CONFIG_ENV, mode: "production" });
    expect("configEnv" in rsc.workerData).toBe(false);

    const html = callFor(userOptions.htmlWorkerPath);
    expect(html.currentCondition).toBe("react-server");
    expect(html.reverseCondition).toBe("react-client");
    expect(html.workerData.resolvedConfig).toEqual({ configEnv: CONFIG_ENV, mode: "production" });
    expect("configEnv" in html.workerData).toBe(false);
  });
});

describe("createHandlerOptions.client: worker call shape", () => {
  it("spawns one RSC and one HTML worker with the client-side args", async () => {
    const userOptions = buildUserOptions();
    await createClientHandlerOptions("/", {
      userOptions,
      autoDiscoveredFiles: seededFiles(),
      configEnv: CONFIG_ENV,
      mode: "production",
      logger: createLogger("silent"),
      id: "char-client-workers",
    });

    expect(createWorkerMock).toHaveBeenCalledTimes(2);

    const rsc = callFor(userOptions.rscWorkerPath);
    expect(rsc.currentCondition).toBe("react-client");
    // client RSC omits reverseCondition (createWorker derives it).
    expect("reverseCondition" in rsc).toBe(false);
    expect(rsc.workerData.id).toBe("/");
    expect(rsc.workerData.userOptions).toBeDefined();
    // No config passed -> RSC resolvedConfig is undefined; configEnv is threaded.
    expect(rsc.workerData.resolvedConfig).toBeUndefined();
    expect(rsc.workerData.configEnv).toEqual(CONFIG_ENV);

    const html = callFor(userOptions.htmlWorkerPath);
    expect(html.currentCondition).toBe("react-client");
    expect(html.reverseCondition).toBe("react-client");
    expect(html.workerData.configEnv).toEqual(CONFIG_ENV);
    // No config passed -> HTML synthesizes a ResolvedConfig-shaped fallback.
    expect(html.workerData.resolvedConfig).toEqual(
      expect.objectContaining({
        mode: "production",
        command: "build",
        isSsrBuild: true,
        base: "/",
      })
    );
  });
});
