import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { toNodeListener } from "../../plugin/helpers/createRequestHandler.server.js";

// The Node→Web bridge under an action POST: the handler's `request.text()`
// must see exactly the bytes the client sent — a chunked body arrives
// bit-exact (no truncation, no duplication), and a client that dies mid-body
// rejects the read instead of resolving a truncated body as a clean success.

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

function listen(s: Server): Promise<number> {
  return new Promise((resolve) => {
    s.listen(0, "127.0.0.1", () => resolve((s.address() as AddressInfo).port));
  });
}

describe("toNodeListener action-body bridge", () => {
  it("delivers a chunked body bit-exact — no truncation, no duplication", async () => {
    let received: string | undefined;
    server = createServer(
      toNodeListener(async (request) => {
        received = await request.text();
        return new Response("ok");
      })
    );
    const port = await listen(server);

    // Distinct per-chunk content so a dropped or doubled chunk changes the
    // reassembled body, not just its length.
    const chunks = Array.from({ length: 8 }, (_, i) => `chunk-${i}:${"x".repeat(1024)};`);
    const sent = chunks.join("");

    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, method: "POST", path: "/action" },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        }
      );
      req.on("error", reject);
      (async () => {
        for (const c of chunks) {
          req.write(c);
          await wait(5);
        }
        req.end();
      })();
    });

    expect(status).toBe(200);
    expect(received).toBe(sent);
  });

  it("rejects the body read when the client dies mid-body — never a truncated success", async () => {
    let outcome: "resolved" | "rejected" | undefined;
    let handlerDone!: () => void;
    const done = new Promise<void>((r) => (handlerDone = r));

    server = createServer(
      toNodeListener(async (request) => {
        try {
          await request.text();
          outcome = "resolved";
        } catch {
          outcome = "rejected";
        } finally {
          handlerDone();
        }
        return new Response("ok");
      })
    );
    const port = await listen(server);

    const req = httpRequest({
      host: "127.0.0.1",
      port,
      method: "POST",
      path: "/action",
      headers: { "content-length": "4096" },
    });
    req.on("error", () => {});
    req.write("only-half-the-promised-body");
    await wait(50);
    req.destroy();

    await done;
    expect(outcome).toBe("rejected");
  }, 5000);
});
