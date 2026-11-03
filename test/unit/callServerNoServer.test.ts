import { describe, it, expect, vi, afterEach } from "vitest";

// The flight client is only needed to encode args; a static host never
// answers with anything it would decode.
vi.mock("../../plugin/utils/flightClient.browser.js", () => ({
  loadBrowserFlightClient: async () => ({
    encodeReply: async () => "[]",
    createFromFetch: () => {
      throw new Error("a non-flight response must not reach the decoder");
    },
  }),
}));

const { createCallServer } = await import("../../plugin/utils/createCallServer.js");

const respondWith = (response: Response) =>
  vi.stubGlobal("fetch", vi.fn(async () => response));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("callServer against a host with no action handler", () => {
  it("explains an error status with no handler body", async () => {
    respondWith(new Response("Method Not Allowed", { status: 405 }));
    const callServer = createCallServer("/");
    await expect(callServer("src/actions.ts#submit", [])).rejects.toThrow(
      /server action failed \(405\)\. No server handled the action\. A static build/
    );
  });

  it("explains a page answered in place of a flight", async () => {
    respondWith(
      new Response("<!doctype html><h1>home</h1>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })
    );
    const callServer = createCallServer("/");
    await expect(callServer("src/actions.ts#submit", [])).rejects.toThrow(
      /not a flight payload \(content-type text\/html\)\. No server handled the action/
    );
  });

  it("keeps a handler's own JSON error message", async () => {
    respondWith(
      new Response(JSON.stringify({ error: "Forbidden origin" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      })
    );
    const callServer = createCallServer("/");
    await expect(callServer("src/actions.ts#submit", [])).rejects.toThrow(
      /^Forbidden origin$/
    );
  });
});
