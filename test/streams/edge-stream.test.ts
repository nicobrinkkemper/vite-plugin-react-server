import { describe, it, expect } from "vitest";
import * as streamApi from "vite-plugin-react-server/stream";
import {
  createHandlerOptions,
  resolveOptions,
} from "vite-plugin-react-server/config";

// The edge renderer is react-server-only: `vite-plugin-react-server/stream`
// resolves to index.server (which exports renderRscReadableStream) under the
// react-server condition, and to index.client (which does NOT) otherwise. So
// under the client leg of test-both these are undefined — skip there.
const renderRscReadableStream = (streamApi as any).renderRscReadableStream as
  | typeof import("../../plugin/stream/renderRscReadableStream.server.js").renderRscReadableStream
  | undefined;
const renderRscResponse = (streamApi as any).renderRscResponse as
  | typeof import("../../plugin/stream/renderRscReadableStream.server.js").renderRscResponse
  | undefined;
const RSC_CONTENT_TYPE = (streamApi as any).RSC_CONTENT_TYPE as string | undefined;

resolveOptions({
  moduleBase: "test/streams",
  Page: "test/streams/TestPage.tsx",
  verbose: false,
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

describe.skipIf(!renderRscReadableStream)("edge RSC renderer (Web ReadableStream)", () => {
  it("renders a page to a non-empty Web ReadableStream", async () => {
    const config = await createHandlerOptions("/", {
      configEnv: { command: "serve", mode: "development" },
    });

    const result = renderRscReadableStream!(config);
    expect(result.type).toBe("server-edge");
    expect(result.ok).toBe(true);
    expect(typeof result.rscStream.getReader).toBe("function"); // a real Web stream
    expect(typeof result.abort).toBe("function");

    const payload = await readAll(result.rscStream);
    expect(payload.length).toBeGreaterThan(0); // a real Flight payload
  });

  it("renderRscResponse returns 200 with the RSC content type", async () => {
    const config = await createHandlerOptions("/", {
      configEnv: { command: "serve", mode: "development" },
    });

    const res = renderRscResponse!(config);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(RSC_CONTENT_TYPE);
    const body = await readAll(res.body as unknown as ReadableStream<Uint8Array>);
    expect(body.length).toBeGreaterThan(0);
  });

  it("reports ok:false and renderRscResponse returns 500 on a synchronous render-setup failure", async () => {
    // createReactElement reads options.htmlPath first; a throwing getter forces
    // a synchronous setup failure (the branch the 500 path exists for).
    const bad = {
      id: "edge-fail",
      route: "/",
      verbose: false,
      get htmlPath(): string {
        throw new Error("boom: forced setup failure");
      },
    } as any;

    const result = renderRscReadableStream!(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    // failed setup yields an empty, already-closed stream
    expect(await readAll(result.rscStream)).toBe("");

    const res = renderRscResponse!(bad);
    expect(res.status).toBe(500);
  });

  it("abort() reports a single Stream Aborted error and emits no route.error", async () => {
    const config = await createHandlerOptions("/", {
      configEnv: { command: "serve", mode: "development" },
    });
    const errors: Array<{ context?: string }> = [];
    const events: Array<{ type?: string }> = [];
    const result = renderRscReadableStream!(
      { ...config, onEvent: (e: any) => events.push(e) } as any,
      { onError: (_id: string, _err: unknown, ctx: any) => errors.push(ctx) }
    );
    expect(result.ok).toBe(true);

    // Let the render begin, then abort it mid-flight.
    await new Promise((r) => setTimeout(r, 0));
    result.abort("test-abort");
    // The renderer observes the aborted signal asynchronously — give it a tick.
    await new Promise((r) => setTimeout(r, 20));

    // Exactly one explicit "Stream Aborted" report from abort()...
    expect(errors.filter((c) => c?.context === "Stream Aborted")).toHaveLength(1);
    // ...and the renderer's own onError must NOT also fire on a deliberate
    // abort, nor emit a route.error (which would spuriously trip panicThreshold).
    expect(errors.filter((c) => c?.context === "React Stream Error")).toHaveLength(0);
    expect(events.filter((e) => e?.type === "route.error")).toHaveLength(0);
  });
});
