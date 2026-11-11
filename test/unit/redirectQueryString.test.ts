import { describe, it, expect, vi, afterEach } from "vitest";
import { createEdgeRenderHook } from "../../plugin/edge/createEdgeRequestHandler.js";
import type { EdgeBundleExports } from "../../plugin/edge/createEdgeRequestHandler.types.js";
import { redirect } from "../../plugin/router/loaderSignals.js";
import {
  flightRedirectLocation,
  routeFromFlightUrl,
} from "../../plugin/utils/outcomeHeader.js";

// A redirect target is a URL, not a path: the flight file goes on the
// pathname and the query string stays a query string, on the way out (the
// server's Location) and on the way back (the route the client restores).

vi.mock("../../plugin/utils/flightClient.browser.js", () => ({
  loadBrowserFlightClient: async () => ({
    encodeReply: async () => "[]",
    createFromFetch: async () => "target page",
  }),
}));

const { createCallServer } = await import(
  "../../plugin/utils/createCallServer.js"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flightRedirectLocation", () => {
  it.each([
    ["/", "/index.rsc"],
    ["/next", "/next/index.rsc"],
    ["/next/", "/next/index.rsc"],
    ["/search?q=hello", "/search/index.rsc?q=hello"],
    ["/search/?q=hello&page=2", "/search/index.rsc?q=hello&page=2"],
    ["/?q=hello", "/index.rsc?q=hello"],
    ["/docs#install", "/docs/index.rsc#install"],
    ["/search?q=a/b#top", "/search/index.rsc?q=a/b#top"],
  ])("%s -> %s", (to, location) => {
    expect(flightRedirectLocation(to)).toBe(location);
  });

  it("uses the configured flight file", () => {
    expect(flightRedirectLocation("/search?q=hello", "page.rsc")).toBe(
      "/search/page.rsc?q=hello"
    );
  });
});

describe("a loader redirect on the edge flight path", () => {
  it("keeps the query string behind the flight file", async () => {
    const bundle = {
      renderRouteToDocument: async () => redirect("/search?q=hello"),
    } as unknown as EdgeBundleExports;
    const render = createEdgeRenderHook(bundle);

    const response = await render(
      "/old/index.rsc",
      new Request("http://localhost/old/index.rsc")
    );

    expect(response?.status).toBe(302);
    expect(response?.headers.get("location")).toBe("/search/index.rsc?q=hello");
  });
});

describe("routeFromFlightUrl", () => {
  it("restores the search string with the pathname", () => {
    expect(
      routeFromFlightUrl("http://localhost/search/index.rsc?q=hello")
    ).toBe("/search?q=hello");
    expect(routeFromFlightUrl("http://localhost/index.rsc?q=hello")).toBe(
      "/?q=hello"
    );
    expect(routeFromFlightUrl("http://localhost/next/index.rsc")).toBe("/next");
  });

  it("maps the document pathname before reading the route", () => {
    const stripBase = (pathname: string) => pathname.slice("/app".length);
    expect(
      routeFromFlightUrl("http://localhost/app/index.rsc?q=hello", stripBase)
    ).toBe("/?q=hello");
  });
});

describe("callServer following an action redirect", () => {
  it("hands the router the target route with its search string", async () => {
    const response = new Response("flight", {
      headers: { "content-type": "text/x-component" },
    });
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: "http://localhost/search/index.rsc?q=hello" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => response));
    const onRedirect = vi.fn();

    await createCallServer("/", { onRedirect })("src/actions.ts#go", []);

    expect(onRedirect).toHaveBeenCalledWith("/search?q=hello", "target page");
  });
});
