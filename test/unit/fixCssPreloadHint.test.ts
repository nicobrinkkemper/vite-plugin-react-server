import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import {
  fixCssPreloadHint,
  createCssPreloadFixStream,
} from "vite-plugin-react-server/static";

// Regression: stable React 19.2.x's Flight server emits CSS preload hints with
// the invalid token `as="stylesheet"` (the valid preload value is `style`), and
// the Flight client replays it verbatim into the SSG HTML, flooding the browser
// console with "preload ignored / invalid as" warnings. vprs rewrites the token
// to the valid `as="style"` in its HTML writer, without forking React.
// See bead geitje-bot-mission-control-1wz (discovered-from d9x).

// Real bytes captured from an mmc GitHub Pages build (dist/static/index.html).
const REAL_SAMPLE =
  '<link rel="preload" as="image" imageSrcSet="/10mmc/illustration-220.webp 220w"/>' +
  '<link rel="preload" href="https://cdnjs.cloudflare.com/ajax/libs/flag-icon-css/3.5.0/css/flag-icon.min.css" as="stylesheet"/>' +
  '<link rel="preload" href="/assets/globalStyles-rszm1l.css" as="stylesheet"/>' +
  '<link rel="stylesheet" href="/assets/globalStyles-rszm1l.css" data-precedence="high"/>';

async function runStream(chunks: string[]): Promise<string> {
  const fix = createCssPreloadFixStream();
  const out: Buffer[] = [];
  Readable.from(chunks.map((c) => Buffer.from(c, "utf8"))).pipe(fix);
  for await (const chunk of fix) out.push(Buffer.from(chunk));
  return Buffer.concat(out).toString("utf8");
}

describe("fixCssPreloadHint (pure)", () => {
  it("rewrites the invalid token to the valid one", () => {
    expect(fixCssPreloadHint('<link as="stylesheet"/>')).toBe(
      '<link as="style"/>'
    );
  });

  it("rewrites every occurrence", () => {
    const out = fixCssPreloadHint(REAL_SAMPLE);
    expect(out).not.toContain('as="stylesheet"');
    expect(out.match(/as="style"/g)).toHaveLength(2);
  });

  it("leaves real stylesheet links and other preloads untouched", () => {
    const out = fixCssPreloadHint(REAL_SAMPLE);
    // The real, valid stylesheet link must be preserved verbatim.
    expect(out).toContain(
      '<link rel="stylesheet" href="/assets/globalStyles-rszm1l.css" data-precedence="high"/>'
    );
    // `as="image"` and other preloads are not CSS hints and stay as-is.
    expect(out).toContain('as="image"');
  });

  it("is a no-op when there is nothing to fix", () => {
    const clean = '<link rel="stylesheet" href="/a.css"/>';
    expect(fixCssPreloadHint(clean)).toBe(clean);
  });
});

describe("createCssPreloadFixStream (streaming)", () => {
  it("rewrites the token within a single chunk", async () => {
    expect(await runStream([REAL_SAMPLE])).toBe(fixCssPreloadHint(REAL_SAMPLE));
  });

  it("rewrites a token split across chunk boundaries", async () => {
    // Split right in the middle of the `as="stylesheet"` token.
    const left = '<link rel="preload" href="/a.css" as="sty';
    const right = 'lesheet"/>';
    const out = await runStream([left, right]);
    expect(out).toBe('<link rel="preload" href="/a.css" as="style"/>');
    expect(out).not.toContain('as="stylesheet"');
  });

  it("rewrites tokens split byte-by-byte (worst case)", async () => {
    const input = REAL_SAMPLE;
    const out = await runStream(input.split(""));
    expect(out).toBe(fixCssPreloadHint(input));
  });

  it("preserves multibyte UTF-8 split across chunk boundaries", async () => {
    // A 3-byte char (€) split across two chunks must round-trip intact.
    const euro = Buffer.from("€", "utf8");
    const fix = createCssPreloadFixStream();
    const out: Buffer[] = [];
    Readable.from([
      Buffer.concat([Buffer.from('<p>', "utf8"), euro.subarray(0, 1)]),
      Buffer.concat([euro.subarray(1), Buffer.from('</p>', "utf8")]),
    ]).pipe(fix);
    for await (const chunk of fix) out.push(Buffer.from(chunk));
    expect(Buffer.concat(out).toString("utf8")).toBe("<p>€</p>");
  });
});
