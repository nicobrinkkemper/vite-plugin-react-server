import { describe, it, expect } from "vitest";
import { interleaveFlightIntoHtmlStream } from "../../plugin/stream/interleaveFlightIntoHtml.js";
import { INLINE_FLIGHT_STREAM_GLOBAL } from "../../plugin/utils/inlineFlightId.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function streamOf(
  chunks: Array<Uint8Array | string>,
  delayMs = 0
): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      const c = chunks[i++];
      controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array[]> {
  const reader = stream.getReader();
  const out: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    if (value) out.push(value);
  }
}

function decodeAll(chunks: Uint8Array[]): string {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return decoder.decode(merged);
}

const SCRIPT_RE = new RegExp(
  `<script>\\(self\\.${INLINE_FLIGHT_STREAM_GLOBAL}\\|\\|=\\[\\]\\)\\.push\\((?:"([^"]*)"|null)\\)</script>`,
  "g"
);

function extractPushes(html: string): Array<string | null> {
  const pushes: Array<string | null> = [];
  for (const m of html.matchAll(SCRIPT_RE)) {
    pushes.push(m[1] ?? null);
  }
  return pushes;
}

function stripScripts(html: string): string {
  return html.replace(SCRIPT_RE, "");
}

const SHELL = `<html><head><title>t</title></head><body><div id="root">hello</div>`;
const TRAILER = `</body></html>`;

describe("interleaveFlightIntoHtmlStream", () => {
  it("injects flight chunks in order, closes with the null sentinel, keeps the trailer last", async () => {
    const flightA = encoder.encode('0:["$","div",null,{}]\n');
    const flightB = encoder.encode("1:I[123]\n");
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL, TRAILER]),
          flightStream: streamOf([flightA, flightB]),
        })
      )
    );

    const pushes = extractPushes(out);
    expect(pushes).toHaveLength(3);
    expect(pushes[2]).toBeNull();
    expect(atob(pushes[0]!)).toBe(decoder.decode(flightA));
    expect(atob(pushes[1]!)).toBe(decoder.decode(flightB));

    expect(stripScripts(out)).toBe(SHELL + TRAILER);
    expect(out.endsWith(TRAILER)).toBe(true);
    // Every script sits inside <body>: after the shell opening, before the trailer.
    const firstScript = out.indexOf("<script>");
    expect(firstScript).toBeGreaterThan(out.indexOf("<body"));
    expect(out.lastIndexOf("</script>")).toBeLessThan(out.lastIndexOf(TRAILER));
  });

  it("emits no flight bytes before the first HTML bytes even when the flight is ready first", async () => {
    const chunks = await collect(
      interleaveFlightIntoHtmlStream({
        // HTML arrives slowly; the flight is available immediately.
        htmlStream: streamOf([SHELL, TRAILER], 20),
        flightStream: streamOf(["flight-bytes"]),
      })
    );
    const first = decoder.decode(chunks[0]);
    expect(first.startsWith("<html>")).toBe(true);
    expect(first.includes(INLINE_FLIGHT_STREAM_GLOBAL)).toBe(false);
  });

  it("drains a flight that keeps streaming after the HTML finished, before the trailer", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL + TRAILER]),
          flightStream: streamOf(["late-a", "late-b"], 15),
        })
      )
    );
    const pushes = extractPushes(out);
    expect(pushes.map((p) => (p === null ? null : atob(p)))).toEqual([
      "late-a",
      "late-b",
      null,
    ]);
    expect(out.endsWith(TRAILER)).toBe(true);
  });

  it("handles the trailer split across HTML chunks", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL + "</bo", "dy></html>"]),
          flightStream: streamOf(["x"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(SHELL + TRAILER);
    expect(out.endsWith(TRAILER)).toBe(true);
    expect(out.lastIndexOf("</script>")).toBeLessThan(out.lastIndexOf(TRAILER));
  });

  it("never splices a script mid-character (multi-byte text at the holdback boundary)", async () => {
    // Multi-byte characters positioned so the 32-byte holdback boundary lands
    // inside one of them; chunk boundaries also split a character in half.
    const text = `<html><head></head><body>${"héllo wörld ✓ ".repeat(20)}`;
    const bytes = encoder.encode(text);
    const splitAt = 41; // inside a multi-byte sequence for this content
    expect(bytes[splitAt] & 0b11000000).toBe(0b10000000); // proves mid-char split
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([
            bytes.subarray(0, splitAt),
            bytes.subarray(splitAt),
            TRAILER,
          ]),
          flightStream: streamOf(["flight"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(text + TRAILER);
    expect(out.includes("�")).toBe(false); // no replacement characters
  });

  it("appends scripts at the end when the document has no </body> trailer", async () => {
    const bare = "<div>fragment</div>";
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([bare]),
          flightStream: streamOf(["x"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(bare);
    expect(extractPushes(out)).toEqual([btoa("x"), null]);
  });

  it("propagates an HTML stream error to the consumer", async () => {
    const boom = new Error("render failed");
    const htmlStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(SHELL));
        controller.error(boom);
      },
    });
    await expect(
      collect(
        interleaveFlightIntoHtmlStream({
          htmlStream,
          flightStream: streamOf(["x"]),
        })
      )
    ).rejects.toBe(boom);
  });
});
