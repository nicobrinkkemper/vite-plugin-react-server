/**
 * The webpack half of the server-action reply protocol. Its own file, not a
 * case in actionFlightCodec.test.ts: React registers ONE RSC renderer per
 * module registry, so the esm and webpack renderers cannot both flight-render
 * in one test context — exactly the one-transport-per-deploy rule the
 * `transport` option enforces for real apps.
 */
import { describe, it, expect } from "vitest";
import { handleServerActionRequest } from "../../dist/plugin/helpers/handleServerAction.server.js";

const options = (impl: Record<string, (...args: never[]) => unknown>) => ({
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

describe("server-action flight codec (webpack transport)", () => {
  it("round-trips File + Date with the same semantics as esm", async () => {
    // The webpack flavor must expose identical action semantics: its own
    // encodeReply on the wire in, its own decodeReply + renderer on the way
    // out (selected by the options' transport field), and its own flight
    // client decoding the response.
    const { encodeReply, createFromReadableStream } = await import(
      "react-server-loader/webpack/client.edge"
    );
    const file = new File(["webpack leg"], "wp.txt", { type: "text/plain" });
    const when = new Date("2026-08-19T13:00:00.000Z");
    const body = await encodeReply([file, when]);
    expect(typeof body).not.toBe("string");

    let received: unknown[] = [];
    const res = await handleServerActionRequest(requestFor(body as FormData), {
      ...options({
        run: async (...args: unknown[]) => {
          received = args;
          const f = args[0] as File;
          return {
            name: f.name,
            text: await f.text(),
            iso: (args[1] as Date).toISOString(),
            // A typed value in the RESPONSE too — webpack-flavored rows.
            echoedAt: new Date("2026-08-19T13:30:00.000Z"),
          };
        },
      }),
      transport: "webpack",
    });

    expect(res.status).toBe(200);
    expect(received[0]).toBeInstanceOf(File);
    expect(received[1]).toBeInstanceOf(Date);
    // Decode the response with the REAL webpack flight client — the JSON
    // reading of row 0 cannot tell a typed row from its marker string.
    const decoded = (await createFromReadableStream(res.body as ReadableStream, {
      // No client references in this payload; the webpack client still
      // requires the options bag with a manifest slot.
      serverConsumerManifest: { moduleMap: {}, serverModuleMap: null, moduleLoading: null },
    })) as {
      returnValue: { name: string; text: string; iso: string; echoedAt: Date };
    };
    expect(decoded.returnValue.name).toBe("wp.txt");
    expect(decoded.returnValue.text).toBe("webpack leg");
    expect(decoded.returnValue.iso).toBe("2026-08-19T13:00:00.000Z");
    expect(decoded.returnValue.echoedAt).toBeInstanceOf(Date);
    expect(decoded.returnValue.echoedAt.toISOString()).toBe(
      "2026-08-19T13:30:00.000Z"
    );
  });
});
