import { describe, it, expect } from "vitest";
import { createHtmlSpliceCursor } from "../../plugin/stream/htmlSpliceCursor.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * The markup between consecutive splice points, fed one byte at a time: the
 * first entry runs up to and including the tag that opened the body, every
 * later one is what a script may be written after.
 */
function segments(html: string): string[] {
  const bytes = encoder.encode(html);
  const cursor = createHtmlSpliceCursor();
  const out: string[] = [];
  let from = 0;
  for (let i = 0; i < bytes.length; i++) {
    cursor.scan(bytes.subarray(i, i + 1));
    if (cursor.canSplice()) {
      out.push(decoder.decode(bytes.subarray(from, i + 1)));
      from = i + 1;
    }
  }
  return out;
}

describe("createHtmlSpliceCursor", () => {
  it("allows a script only after a tag end, as a direct child of <body>", () => {
    const head = `<!DOCTYPE html><html><head><meta charSet="utf-8"/><title>t</title></head>`;
    const root = `<div id="root"><p class="a">text</p><span>s</span></div>`;
    expect(segments(`${head}<body>${root}</body></html>`)).toEqual([
      `${head}<body>`,
      root,
    ]);
  });

  it("never inside a tag, an attribute value, a text run, or a nested element", () => {
    // The ">" in text and in quoted values closes nothing; "after" is text.
    const root = `<div class="_electronBall_1pcsx_292" data-x='a>b'>hello > world<i>x</i></div>`;
    expect(segments(`<body>${root}after`)).toEqual(["<body>", root]);
  });

  it("void elements and self-closing tags open no level", () => {
    expect(
      segments(`<body><meta charSet="utf-8"/><br><img src="x"><hr/><input><p>x</p>`)
    ).toEqual([
      "<body>",
      `<meta charSet="utf-8"/>`,
      "<br>",
      `<img src="x">`,
      "<hr/>",
      "<input>",
      "<p>x</p>",
    ]);
  });

  it("reads comments, declarations and raw-text elements as text", () => {
    expect(
      segments(
        `<body><!-- <div> not a tag --><style>a > b{}</style>` +
          `<script>if (1 > 0) { "</div>" }</script><textarea></div></textarea>` +
          `<title>a</title><p>x</p>`
      )
    ).toEqual([
      "<body>",
      `<!-- <div> not a tag -->`,
      "<style>a > b{}</style>",
      `<script>if (1 > 0) { "</div>" }</script>`,
      "<textarea></div></textarea>",
      "<title>a</title>",
      "<p>x</p>",
    ]);
  });

  it("a raw-text end tag may carry whitespace, and a lookalike is content", () => {
    expect(segments(`<body><script>"</scripts"</script ><p>x</p>`)).toEqual([
      "<body>",
      `<script>"</scripts"</script >`,
      "<p>x</p>",
    ]);
  });

  it("a stray < in text opens no tag", () => {
    expect(segments(`<body>a < b<p>c</p>`)).toEqual(["<body>", "a < b<p>c</p>"]);
  });

  it("a <body> with attributes opens the body like a bare one; nothing before it", () => {
    const head = `<html><head><link rel="stylesheet" href="/a.css"/></head>`;
    expect(
      segments(`${head}<body class="app" data-x="1"><main>y</main>`)
    ).toEqual([`${head}<body class="app" data-x="1">`, "<main>y</main>"]);
  });

  it("Suspense output: segments and their scripts at body level are splice points, their insides are not", () => {
    expect(
      segments(
        `<body><div id="root"><!--$?--><template id="B:0"></template><!--/$--></div>` +
          `<div hidden id="S:0"><p>late</p></div><script>$RC("B:0","S:0")</script>`
      )
    ).toEqual([
      "<body>",
      `<div id="root"><!--$?--><template id="B:0"></template><!--/$--></div>`,
      `<div hidden id="S:0"><p>late</p></div>`,
      `<script>$RC("B:0","S:0")</script>`,
    ]);
  });

  it("scan: the first splice point inside a chunk, in byte offsets, across chunk boundaries that split tokens", () => {
    const cursor = createHtmlSpliceCursor();
    const chunk1 = encoder.encode(`<html><head></head><bo`);
    const chunk2 = encoder.encode(`dy class="x"><div id="root"><div class="_electronBall_1pcsx`);
    const chunk3 = encoder.encode(`_292"></div></div><p>t</p>`);
    expect(cursor.scan(chunk1)).toBe(-1);
    expect(cursor.canSplice()).toBe(false);
    // Right after the ">" that closes <body class="x">.
    expect(cursor.scan(chunk2)).toBe(`dy class="x">`.length);
    // The chunk ends inside an attribute value: no script can start here.
    expect(cursor.canSplice()).toBe(false);
    // The value closes, the nested div and the root close: the first point.
    expect(cursor.scan(chunk3)).toBe(`_292"></div></div>`.length);
    expect(cursor.canSplice()).toBe(true);
  });

  it("multi-byte text never confuses the byte scan", () => {
    expect(segments(`<body><p>héllo ✓ wörld</p><p>→</p>`)).toEqual([
      "<body>",
      "<p>héllo ✓ wörld</p>",
      "<p>→</p>",
    ]);
  });
});
