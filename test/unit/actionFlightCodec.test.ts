/**
 * The complete server-action reply protocol, browser-encoded to
 * server-decoded: the request body is produced by the transport's REAL
 * `encodeReply` (not a hand-rolled imitation), and the handler must route it
 * through `decodeReply` — text and multipart alike — then flight-render the
 * `{ returnValue }` response. Pins the two shapes the old JSON.parse path
 * mangled: a multipart File upload, and a typed reply row (Date).
 *
 * Runs under the react-server condition (test:unit), where the built-in
 * codec resolves from the vendored transport pair.
 */
import { describe, it, expect } from "vitest";
// The edge client build carries encodeReply (the Node-stream client does
// not); its encode side is environment-neutral, exactly what a browser emits.
import { encodeReply } from "react-server-dom-esm/client.edge";
import {
  handleServerAction,
  handleServerActionRequest,
} from "../../dist/plugin/helpers/handleServerAction.server.js";
import type { IncomingMessage, ServerResponse } from "node:http";

type ActionModule = Record<string, (...args: never[]) => unknown>;

const options = (impl: ActionModule) => ({
  projectRoot: process.cwd(),
  devOpen: true,
  ssrLoadModule: async () => impl,
});

function requestFor(body: string | FormData, id = "src/actions.ts#run") {
  return new Request("https://example.test/action", {
    method: "POST",
    headers: { "x-rsc-action": id },
    body,
  });
}

/** Extract the model row from a flight payload (dev builds prepend debug rows). */
function modelRow(payload: string): unknown {
  const row = payload.match(/^0:(.*)$/m);
  expect(row, `flight payload: ${payload}`).toBeTruthy();
  return JSON.parse(row![1]!);
}

describe("server-action flight codec (complete reply protocol)", () => {
  it("round-trips a multipart FormData body with a real File (Web handler)", async () => {
    const file = new File(["hello upload"], "note.txt", { type: "text/plain" });
    const body = await encodeReply([file, { label: "attach" }]);
    // Binary arguments force encodeReply's multipart output.
    expect(typeof body).not.toBe("string");

    let received: unknown[] = [];
    const res = await handleServerActionRequest(
      requestFor(body as FormData),
      options({
        run: async (...args: unknown[]) => {
          received = args;
          const f = args[0] as File;
          return { name: f.name, text: await f.text() };
        },
      })
    );

    expect(res.status).toBe(200);
    expect(received[0]).toBeInstanceOf(File);
    expect(modelRow(await res.text())).toEqual({
      returnValue: { name: "note.txt", text: "hello upload" },
    });
  });

  it("decodes typed reply rows (Date) that JSON.parse mangled (Web handler)", async () => {
    const when = new Date("2026-08-19T12:00:00.000Z");
    const body = await encodeReply([when, "plain"]);
    expect(typeof body).toBe("string");

    let received: unknown[] = [];
    const res = await handleServerActionRequest(
      requestFor(body as string),
      options({
        run: async (...args: unknown[]) => {
          received = args;
          return { iso: (args[0] as Date).toISOString(), second: args[1] };
        },
      })
    );

    expect(res.status).toBe(200);
    expect(received[0]).toBeInstanceOf(Date);
    expect(modelRow(await res.text())).toEqual({
      returnValue: { iso: "2026-08-19T12:00:00.000Z", second: "plain" },
    });
  });

  it("round-trips a multipart File through the Node handler", async () => {
    const file = new File(["node leg"], "node.txt", { type: "text/plain" });
    const body = await encodeReply([file]);
    // Serialize the FormData exactly as fetch would, then replay it as a
    // Node request: same bytes, same content-type boundary.
    const wire = new Request("https://example.test/action", {
      method: "POST",
      body: body as FormData,
    });
    const bytes = Buffer.from(await wire.arrayBuffer());
    const contentType = wire.headers.get("content-type")!;

    const req = Object.assign(
      (async function* () {
        yield bytes;
      })(),
      {
        headers: {
          "x-rsc-action": "src/actions.ts#run",
          "content-type": contentType,
        },
        url: "/action",
      }
    ) as unknown as IncomingMessage;

    const chunks: Buffer[] = [];
    let finished: () => void;
    const done = new Promise<void>((resolve) => (finished = resolve));
    const res = {
      setHeader: () => {},
      write: (c: Buffer | string) => (chunks.push(Buffer.from(c)), true),
      end: (c?: Buffer | string) => {
        if (c) chunks.push(Buffer.from(c));
        finished();
      },
      on: () => {},
      once: () => {},
      emit: () => {},
      removeListener: () => {},
    } as unknown as ServerResponse;

    let received: unknown[] = [];
    await handleServerAction(req, res, {
      ...options({
        run: async (...args: unknown[]) => {
          received = args;
          const f = args[0] as File;
          return { name: f.name, text: await f.text() };
        },
      }),
    });
    await done;

    expect(received[0]).toBeInstanceOf(File);
    expect(modelRow(Buffer.concat(chunks).toString())).toEqual({
      returnValue: { name: "node.txt", text: "node leg" },
    });
  });
});
