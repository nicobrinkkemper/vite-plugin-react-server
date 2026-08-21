/**
 * Terminal outcomes of a server action, on both handler envelopes (Web
 * Request/Response and Node req/res):
 *
 *  - `redirect()` answers 303 to the TARGET's flight (fetch follows it, so
 *    the browser client decodes the target page).
 *  - `notFound()` answers the marker: 404 + the outcome header, no body —
 *    the client router fetches the 404 route's flight through its own GET
 *    path, so the shape is identical on hosts that cannot render.
 *  - a thrown error answers VALID FLIGHT: a `{ error: { message } }`
 *    envelope decoded with the transport's real client — never JSON/text
 *    fed to a flight decoder. Tagged statuses (403/413) survive.
 *
 * Runs under the react-server condition (test:unit), where the built-in
 * codec resolves from the vendored transport pair.
 */
import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import { encodeReply, createFromReadableStream } from "react-server-dom-esm/client.edge";
import {
  handleServerAction,
  handleServerActionRequest,
} from "../../dist/plugin/helpers/handleServerAction.server.js";
import {
  redirect,
  notFound,
} from "../../dist/plugin/router/loaderSignals.js";
import {
  OUTCOME,
  OUTCOME_HEADER,
} from "../../dist/plugin/utils/outcomeHeader.js";
import type { IncomingMessage, ServerResponse } from "node:http";

type ActionModule = Record<string, (...args: never[]) => unknown>;

const options = (impl: ActionModule) => ({
  projectRoot: process.cwd(),
  devOpen: true,
  ssrLoadModule: async () => impl,
});

async function webRequestFor(id = "src/actions.ts#run") {
  return new Request("https://example.test/action", {
    method: "POST",
    headers: { "x-rsc-action": id },
    body: (await encodeReply([])) as string,
  });
}

/**
 * A Node ServerResponse stand-in the flight renderer can PIPE into: a real
 * writable (PassThrough) carrying statusCode/headers, with the written body
 * collected for decoding.
 */
function nodeResponse() {
  const stream = new PassThrough();
  const headers: Record<string, string> = {};
  const chunks: Buffer[] = [];
  stream.on("data", (chunk: Buffer) => chunks.push(chunk));
  const res = Object.assign(stream, {
    statusCode: 200,
    headersSent: false,
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
  });
  const finished = new Promise<void>((resolve) => stream.on("finish", () => resolve()));
  return {
    res: res as unknown as ServerResponse,
    headers,
    finished,
    body: () => Buffer.concat(chunks),
    status: () => res.statusCode,
  };
}

async function nodeRequestFor(id = "src/actions.ts#run") {
  const body = (await encodeReply([])) as string;
  const req = new PassThrough();
  req.end(body);
  return Object.assign(req, {
    method: "POST",
    url: "/action",
    headers: {
      "x-rsc-action": id,
      "content-type": "text/plain;charset=UTF-8",
    },
  }) as unknown as IncomingMessage;
}

const decodeFlight = async (bytes: Uint8Array | ReadableStream) => {
  const stream =
    bytes instanceof Uint8Array
      ? new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        })
      : bytes;
  return createFromReadableStream(stream, { moduleBaseURL: "/" });
};

describe("server-action terminal outcomes (Web handler)", () => {
  it("redirect() answers 303 to the target's flight", async () => {
    const res = await handleServerActionRequest(
      await webRequestFor(),
      options({ run: () => redirect("/next/") })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/next/index.rsc");
    expect(res.headers.get(OUTCOME_HEADER)).toBe(OUTCOME.redirect);
  });

  it("redirect('/') maps to the root flight", async () => {
    const res = await handleServerActionRequest(
      await webRequestFor(),
      options({ run: () => redirect("/") })
    );
    expect(res.headers.get("location")).toBe("/index.rsc");
  });

  it("notFound() answers the bodyless 404 marker", async () => {
    const res = await handleServerActionRequest(
      await webRequestFor(),
      options({ run: () => notFound() })
    );
    expect(res.status).toBe(404);
    expect(res.headers.get(OUTCOME_HEADER)).toBe(OUTCOME.notFound);
    expect(await res.text()).toBe("");
  });

  it("a thrown error answers a decodable flight envelope, not JSON", async () => {
    const res = await handleServerActionRequest(
      await webRequestFor(),
      options({
        run: () => {
          throw new Error("kaboom");
        },
      })
    );
    expect(res.status).toBe(500);
    expect(res.headers.get(OUTCOME_HEADER)).toBe(OUTCOME.error);
    expect(res.headers.get("content-type")).toContain("text/x-component");
    const payload = (await decodeFlight(res.body as ReadableStream)) as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("kaboom");
  });

  it("a tagged status (413) survives onto the error outcome", async () => {
    const res = await handleServerActionRequest(
      await webRequestFor(),
      options({
        run: () => {
          const err = new Error("too big") as Error & { statusCode?: number };
          err.statusCode = 413;
          throw err;
        },
      })
    );
    expect(res.status).toBe(413);
    expect(res.headers.get(OUTCOME_HEADER)).toBe(OUTCOME.error);
  });
});

describe("server-action terminal outcomes (Node handler)", () => {
  it("redirect() answers 303 to the target's flight", async () => {
    const { res, headers, status } = nodeResponse();
    await handleServerAction(
      await nodeRequestFor(),
      res,
      options({ run: () => redirect("/next/") })
    );
    expect(status()).toBe(303);
    expect(headers["location"]).toBe("/next/index.rsc");
    expect(headers[OUTCOME_HEADER]).toBe(OUTCOME.redirect);
  });

  it("notFound() answers the bodyless 404 marker", async () => {
    const { res, headers, status, finished, body } = nodeResponse();
    await handleServerAction(
      await nodeRequestFor(),
      res,
      options({ run: () => notFound() })
    );
    await finished;
    expect(status()).toBe(404);
    expect(headers[OUTCOME_HEADER]).toBe(OUTCOME.notFound);
    expect(body().length).toBe(0);
  });

  it("a thrown error answers a decodable flight envelope, not JSON", async () => {
    const { res, headers, status, finished, body } = nodeResponse();
    await handleServerAction(
      await nodeRequestFor(),
      res,
      options({
        run: () => {
          throw new Error("kaboom");
        },
      })
    );
    await finished;
    expect(status()).toBe(500);
    expect(headers[OUTCOME_HEADER]).toBe(OUTCOME.error);
    expect(headers["content-type"]).toContain("text/x-component");
    const payload = (await decodeFlight(new Uint8Array(body()))) as {
      error: { message: string };
    };
    expect(payload.error.message).toBe("kaboom");
  });
});
