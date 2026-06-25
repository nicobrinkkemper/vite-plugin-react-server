import { describe, it, expect } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";

// Companion to edge-from-readable-stream.test.ts. renderFlightToHtml is the
// single-isolate HTML render: decode a Flight ReadableStream and render it to
// an HTML ReadableStream in one process (react-dom/server.edge), no worker. It
// is client-only — `vite-plugin-react-server/stream` exposes it under the
// default condition and NOT under react-server — so skip on the react-server
// leg of test-both, exactly like the decode test.
const renderFlightToHtml = (streamApi as any).renderFlightToHtml as
  | typeof import("../../plugin/stream/renderFlightToHtml.client.js").renderFlightToHtml
  | undefined;

function flightStream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

describe.skipIf(!renderFlightToHtml)(
  "single-isolate HTML render (renderFlightToHtml)",
  () => {
    it("renders a Flight ReadableStream to an HTML ReadableStream in-process", async () => {
      // A host-element-only Flight (no client references) so the render needs
      // no module resolution — it exercises the decode + react-dom/server.edge
      // HTML render path end to end.
      const html = await readAll(
        await renderFlightToHtml!({
          rscStream: flightStream(
            '0:["$","div",null,{"id":"root","children":"hello-flight"}]\n'
          ),
          moduleBaseURL: "/",
        })
      );
      expect(html).toContain("hello-flight");
      expect(html).toContain('id="root"');
    });

    it("throws when given no rscStream", async () => {
      await expect(renderFlightToHtml!({} as any)).rejects.toThrow(
        /rscStream is required/
      );
    });
  }
);
