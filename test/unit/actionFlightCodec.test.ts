/**
 * The complete server-action reply protocol, browser-encoded to
 * server-decoded AND server-rendered to client-decoded: request bodies come
 * from the transport's REAL `encodeReply` (not a hand-rolled imitation), and
 * responses are decoded with the transport's REAL flight client (not a
 * JSON.parse of row 0 — that reading cannot tell a typed row from its marker
 * string, which is the bug class this protocol replaces). Pins the shapes the
 * old JSON path mangled in BOTH directions: a multipart File upload in, a
 * typed value (Date) in, and a typed value inside `returnValue` out.
 *
 * Runs under the react-server condition (test:unit), where the built-in
 * codec resolves from the vendored transport pair.
 */
import { describe, it, expect } from "vitest";
// The edge client build carries encodeReply and a Web-stream decoder (the
// Node-stream client has neither); its codec side is environment-neutral —
// exactly what a browser does.
import {
  encodeReply,
  createFromReadableStream,
} from "react-server-dom-esm/client.edge";
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

/** Decode a response the way the browser does: the real esm flight client. */
async function decodeResponse(res: Response): Promise<{ returnValue: unknown }> {
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/x-component");
  return (await createFromReadableStream(res.body as ReadableStream, {
    moduleBaseURL: "/",
  })) as { returnValue: unknown };
}

describe("server-action flight codec (complete reply protocol)", () => {
  it("round-trips a multipart File in and a typed Date out (Web handler)", async () => {
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
          return {
            name: f.name,
            text: await f.text(),
            // A non-JSON flight value in the RESPONSE — the round trip the
            // old 0:<json> row could never carry.
            receivedAt: new Date("2026-08-19T14:00:00.000Z"),
          };
        },
      })
    );

    expect(received[0]).toBeInstanceOf(File);
    const decoded = await decodeResponse(res);
    const value = decoded.returnValue as {
      name: string;
      text: string;
      receivedAt: Date;
    };
    expect(value.name).toBe("note.txt");
    expect(value.text).toBe("hello upload");
    expect(value.receivedAt).toBeInstanceOf(Date);
    expect(value.receivedAt.toISOString()).toBe("2026-08-19T14:00:00.000Z");
  });

  it("decodes typed reply rows (Date argument) that JSON.parse mangled (Web handler)", async () => {
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

    expect(received[0]).toBeInstanceOf(Date);
    const decoded = await decodeResponse(res);
    expect(decoded.returnValue).toEqual({
      iso: "2026-08-19T12:00:00.000Z",
      second: "plain",
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
          return {
            name: f.name,
            text: await f.text(),
            stamped: new Date("2026-08-19T15:30:00.000Z"),
          };
        },
      }),
    });
    await done;

    expect(received[0]).toBeInstanceOf(File);
    // Decode the captured Node response body with the real flight client.
    const decoded = (await createFromReadableStream(
      new Response(Buffer.concat(chunks)).body as ReadableStream,
      { moduleBaseURL: "/" }
    )) as { returnValue: { name: string; text: string; stamped: Date } };
    expect(decoded.returnValue.name).toBe("node.txt");
    expect(decoded.returnValue.text).toBe("node leg");
    expect(decoded.returnValue.stamped).toBeInstanceOf(Date);
  });
});
