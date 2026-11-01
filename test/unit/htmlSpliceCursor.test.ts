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
    const root = `<div class="_electronBall_1pcsx_292" data-x='a>b' title="c > d/>">hello > world<i>x</i></div>`;
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

  it("script data: <!--<script enters the double-escaped state, where </script> is content", () => {
    // In script data "<!--" enters the escaped state and "<script" then the
    // double-escaped state; a "</script" there only returns to escaped, so
    // the element closes at the end tag after the string.
    const script = `<script>globalThis.sample="<!--<script></script>";</script>`;
    expect(segments(`<body>${script}<p>x</p>`)).toEqual([
      "<body>",
      script,
      "<p>x</p>",
    ]);
  });

  it("script data: --> leaves the escaped states, and <!-- alone does not protect </script>", () => {
    const a = `<script>a="<!--<script>"; // --></script>`;
    // Escaped but not double-escaped: the first </script> is the end tag, the
    // rest is text and a stray end tag that opens and closes nothing.
    const b = `<script>b="<!--"; c="</script>`;
    expect(segments(`<body>${a}<p>x</p>${b}";</script><p>y</p>`)).toEqual([
      "<body>",
      a,
      "<p>x</p>",
      b,
      `";</script>`,
      "<p>y</p>",
    ]);
  });

  it("foreign content: <![CDATA[ inside svg or math ends only at ]]>", () => {
    const svg = `<svg><![CDATA[a > </svg> b]]></svg>`;
    const math = `<math><![CDATA[ > ]]></math>`;
    expect(segments(`<body>${svg}<p>x</p>${math}<p>y</p>`)).toEqual([
      "<body>",
      svg,
      "<p>x</p>",
      math,
      "<p>y</p>",
    ]);
  });

  it("outside foreign content <![CDATA[ is a bogus comment that ends at the first >", () => {
    expect(segments(`<body><![CDATA[x > y]]><p>z</p>`)).toEqual([
      "<body>",
      "<![CDATA[x >",
      " y]]><p>z</p>",
    ]);
  });

  it("foreign content: /> closes the element; title, style and script in svg are ordinary elements", () => {
    const svg = `<svg viewBox="0 0 1 1"><path d="M0 0"/><title>a > b</title><style>c > d</style><script>1 < 2</script></svg>`;
    expect(segments(`<body>${svg}<p>x</p>`)).toEqual(["<body>", svg, "<p>x</p>"]);
  });

  it("comments: <!-->, <!---> and --!> all close", () => {
    expect(
      segments(`<body><!--><p>a</p><!---><p>b</p><!-- x --!><p>c</p>`)
    ).toEqual([
      "<body>",
      "<!-->",
      "<p>a</p>",
      "<!--->",
      "<p>b</p>",
      "<!-- x --!>",
      "<p>c</p>",
    ]);
  });

  it("<? opens a bogus comment that ends at the first >", () => {
    expect(segments(`<body><?php echo "<p>" ?><p>a</p>`)).toEqual([
      "<body>",
      `<?php echo "<p>`,
      `" ?><p>a</p>`,
    ]);
  });

  it("textarea is RCDATA: no comments, no escaping; a stray end tag opens and closes nothing", () => {
    const area = `<textarea><!--</textarea>`;
    expect(segments(`<body>${area}--></textarea><p>x</p>`)).toEqual([
      "<body>",
      area,
      "--></textarea>",
      "<p>x</p>",
    ]);
  });
});
