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

  it("never splices a script INSIDE a producer chunk (the mid-tag regression)", async () => {
    // The real-browser failure this guards: a flight chunk pending while a
    // big HTML chunk flushes must NOT be spliced into the middle of it (the
    // old byte-offset holdback once landed a script inside a bootstrap
    // script's src attribute). Scripts may appear only at producer chunk
    // boundaries or the final </body> position.
    const chunk1 = `<html><head></head><body><div>${"x".repeat(200)}</div>`;
    const chunk2 = `<link href="/index-abc123.js"><script src="/index-abc123.js" async></script>`;
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([chunk1, chunk2, TRAILER], 12),
          // Pending BEFORE chunk2 flushes — the old design spliced into it.
          flightStream: streamOf(["F"], 3),
        })
      )
    );
    expect(stripScripts(out)).toBe(chunk1 + chunk2 + TRAILER);
    // Every injected script sits at a chunk boundary or the trailer seam.
    const boundaries = new Set([
      chunk1.length,
      chunk1.length + chunk2.length, // == trailer seam here
    ]);
    const stripped = stripScripts(out);
    let cursor = 0;
    for (const m of out.matchAll(SCRIPT_RE)) {
      const at = m.index!;
      // Position of this script in ORIGINAL (stripped) coordinates.
      const before = stripScripts(out.slice(0, at));
      expect(boundaries.has(before.length)).toBe(true);
      cursor = at;
    }
    expect(cursor).toBeGreaterThan(0); // scripts were actually injected
    void stripped;
  });

  it("reassembles multi-byte text intact (whole-chunk pass-through)", async () => {
    const text = `<html><head></head><body>${"héllo wörld ✓ ".repeat(20)}`;
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([text, TRAILER]),
          flightStream: streamOf(["flight"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(text + TRAILER);
    expect(out.includes("\ufffd")).toBe(false);
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

  it("propagates a FLIGHT stream error to the consumer", async () => {
    const boom = new Error("flight producer failed");
    const flightStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("partial"));
        controller.error(boom);
      },
    });
    await expect(
      collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL, TRAILER], 10),
          flightStream,
        })
      )
    ).rejects.toBe(boom);
  });
});

describe("interleaveFlightIntoHtmlStream (edges and volume)", () => {
  it("empty flight still closes the protocol: sentinel only, trailer last", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL, TRAILER]),
          flightStream: streamOf([]),
        })
      )
    );
    expect(extractPushes(out)).toEqual([null]);
    expect(stripScripts(out)).toBe(SHELL + TRAILER);
    expect(out.endsWith(TRAILER)).toBe(true);
  });

  it("empty HTML still delivers the flight: scripts + sentinel, no phantom trailer", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([]),
          flightStream: streamOf(["only-flight"]),
        })
      )
    );
    expect(extractPushes(out)).toEqual([btoa("only-flight"), null]);
    expect(stripScripts(out)).toBe("");
  });

  it("round-trips arbitrary binary flight bytes (all 256 values, large chunk)", async () => {
    const bytes = new Uint8Array(256 * 512);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL, TRAILER]),
          flightStream: streamOf([bytes]),
        })
      )
    );
    const pushes = extractPushes(out);
    expect(pushes).toHaveLength(2);
    const decoded = atob(pushes[0]!);
    expect(decoded.length).toBe(bytes.length);
    let mismatch = -1;
    for (let i = 0; i < bytes.length; i++) {
      if (decoded.charCodeAt(i) !== bytes[i]) {
        mismatch = i;
        break;
      }
    }
    expect(mismatch).toBe(-1); // byte-exact, full compare
  });

  it("preserves flight order across many interleaved chunks with jittered timing", async () => {
    const flightChunks = Array.from({ length: 30 }, (_, i) => `chunk-${i}`);
    const htmlMiddle = Array.from({ length: 30 }, (_, i) => `<p>row ${i}</p>`);
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          // Different pump cadences so the two sides genuinely interleave.
          htmlStream: streamOf([SHELL, ...htmlMiddle, TRAILER], 2),
          flightStream: streamOf(flightChunks, 3),
        })
      )
    );
    const pushes = extractPushes(out);
    expect(pushes.slice(0, -1).map((p) => atob(p!))).toEqual(flightChunks);
    expect(pushes[pushes.length - 1]).toBeNull();
    expect(stripScripts(out)).toBe(SHELL + htmlMiddle.join("") + TRAILER);
  });

  it("holds scripts while <body is split across HTML chunks", async () => {
    const headFiller = `<html><head>${"m".repeat(80)}</head>`;
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf(
            [`${headFiller}<bo`, `dy><div>content</div>`, TRAILER],
            5
          ),
          // Flight ready immediately — must still wait for the body-open bytes.
          flightStream: streamOf(["early"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(
      `${headFiller}<body><div>content</div>${TRAILER}`
    );
    expect(out.indexOf("<script>")).toBeGreaterThan(out.indexOf("<body"));
  });

  it("matches a <body tag that carries attributes", async () => {
    const doc = `<html><head></head><body class="app" data-x="1"><main>y</main>`;
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([doc + "x".repeat(40), TRAILER]),
          flightStream: streamOf(["f"]),
        })
      )
    );
    expect(out.indexOf("<script>")).toBeGreaterThan(out.indexOf("<body"));
    expect(out.endsWith(TRAILER)).toBe(true);
  });

  it("ignores a literal </body> in mid-document content; only the final trailer moves", async () => {
    const decoy = `<div><!-- literally </body> in a comment --></div>`;
    const middle = decoy + "z".repeat(100); // push the decoy out of the tail window
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL + middle + TRAILER]),
          flightStream: streamOf(["f"]),
        })
      )
    );
    expect(stripScripts(out)).toBe(SHELL + middle + TRAILER);
    // Scripts land after the decoy, before the real trailer.
    expect(out.indexOf("<script>")).toBeGreaterThan(out.indexOf(decoy));
    expect(out.lastIndexOf("</script>")).toBeLessThan(out.lastIndexOf(TRAILER));
  });

  it("one-byte-at-a-time delivery still reassembles bytes exactly (empty flight)", async () => {
    // Byte-sized chunks violate the producer contract for SCRIPT placement
    // (boundaries split tokens), so no mid-stream scripts here — but the
    // held-window plumbing must still pass every byte through unmangled and
    // find the trailer at the end.
    const doc = `<html><head></head><body>héllo ✓ wörld${TRAILER}`;
    const bytes = encoder.encode(doc);
    const oneByteChunks = Array.from({ length: bytes.length }, (_, i) =>
      bytes.subarray(i, i + 1)
    );
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf(oneByteChunks),
          flightStream: streamOf([]),
        })
      )
    );
    expect(stripScripts(out)).toBe(doc);
    expect(out.includes("\ufffd")).toBe(false);
    expect(out.endsWith(TRAILER)).toBe(true);
    expect(extractPushes(out)).toEqual([null]);
  });

  it("no flight and no body: bare fragment passes through with just the sentinel", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf(["<div>plain</div>"]),
          flightStream: streamOf([]),
        })
      )
    );
    expect(extractPushes(out)).toEqual([null]);
    expect(stripScripts(out)).toBe("<div>plain</div>");
  });

  it("stamps the CSP nonce on every injected script (chunks and sentinel)", async () => {
    const out = decodeAll(
      await collect(
        interleaveFlightIntoHtmlStream({
          htmlStream: streamOf([SHELL, TRAILER]),
          flightStream: streamOf(["a", "b"]),
          nonce: "r4nd0m+Base64=",
        })
      )
    );
    const opens = out.match(/<script[^>]*>/g) ?? [];
    expect(opens).toHaveLength(3); // two chunks + sentinel
    for (const open of opens) {
      expect(open).toBe(`<script nonce="r4nd0m+Base64=">`);
    }
  });

  it("rejects a nonce that could break out of the attribute", async () => {
    const stream = interleaveFlightIntoHtmlStream({
      htmlStream: streamOf([SHELL, TRAILER]),
      flightStream: streamOf(["a"]),
      nonce: `"><script>alert(1)</script>`,
    });
    await expect(collect(stream)).rejects.toThrow(/nonce/);
  });
});
