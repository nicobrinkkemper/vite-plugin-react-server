import { describe, it, expect } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";

// Consumer mirror of edge-stream.test.ts. The Web-stream consumer is
// client-only: `vite-plugin-react-server/stream` resolves to index.client
// (which exports createFromReadableStream / createFromFetch) under the default
// condition, and to index.server (which does NOT) under react-server. So under
// the react-server leg of test-both these are undefined — skip there, exactly
// as the producer test skips on the client leg.
const createFromReadableStream = (streamApi as any).createFromReadableStream as
  | typeof import("../../plugin/stream/createFromReadableStream.client.js").createFromReadableStream
  | undefined;
const createFromFetch = (streamApi as any).createFromFetch as
  | typeof import("../../plugin/stream/createFromReadableStream.client.js").createFromFetch
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

const isReactElement = (v: unknown): boolean =>
  typeof v === "object" && v !== null && "$$typeof" in (v as object);

describe.skipIf(!createFromReadableStream)(
  "edge RSC consumer (createFromReadableStream)",
  () => {
    it("wires a Flight ReadableStream into a client React element", () => {
      const result = createFromReadableStream!({
        rscStream: flightStream('0:"hello"\n'),
        moduleBaseURL: "/",
      });
      expect(result.type).toBe("client");
      // The decode is deferred to render (React.use), so we assert the wrapper
      // produced a real, renderable client element rather than rendering here.
      expect(isReactElement(result.children)).toBe(true);
    });

    it("short-circuits when children are already resolved", () => {
      const el = { alreadyResolved: true } as any;
      const result = createFromReadableStream!({ children: el } as any);
      expect(result.type).toBe("client");
      expect(result.children).toBe(el); // returned as-is, no decode
    });

    it("throws when given neither a stream nor children", () => {
      expect(() => createFromReadableStream!({} as any)).toThrow(
        /no rscStream nor children/
      );
    });

    it("createFromFetch wires a Flight Response into a client React element", () => {
      const res = new Response('0:"hi"\n', {
        headers: { "Content-Type": "text/x-component" },
      });
      const result = createFromFetch!({ response: res, moduleBaseURL: "/" });
      expect(result.type).toBe("client");
      expect(isReactElement(result.children)).toBe(true);
    });
  }
);
