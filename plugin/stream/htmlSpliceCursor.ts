/**
 * Where a `<script>` can be spliced into an HTML byte stream.
 *
 * The streamed inline flight rides the document as executable chunk scripts
 * (interleaveFlightIntoHtml). A script written where the HTML tokenizer is
 * inside a tag is attribute text, inside a comment it is comment text, inside
 * a `<style>` or `<script>` it is raw text — in each case no element exists
 * and the payload never runs. Written between tags but inside the hydrated
 * tree it does run, yet hydration then meets an element the server never
 * rendered. The producer gives no help: React's streaming renderer packs its
 * output into fixed-size views (4096 bytes on the edge build), so a chunk
 * boundary falls on an arbitrary byte, an attribute value included.
 *
 * This is a byte-level tokenizer of just the states that decide where a
 * script can start, following the HTML tokenizer where it matters:
 *  - tags with quoted attribute values; comments including the `<!-->`,
 *    `<!--->` and `--!>` endings; `<!doctype>`, `<?…>` and `<!…>` bogus
 *    comments that run to the next `>`;
 *  - raw text and RCDATA elements (style, textarea, title, …) up to their end
 *    tag, and script data with its escaped and double-escaped states: after
 *    `<!--` a `<script` makes `</script` content until the matching one, and
 *    `-->` ends the escape;
 *  - foreign content (svg, math), where `<![CDATA[` runs to `]]>`, `/>`
 *    closes the element, and no element is raw text; outside it `<![CDATA[`
 *    is a bogus comment and `/>` means nothing. The HTML rules return inside
 *    an integration point (svg foreignObject, desc and title; MathML mi, mo,
 *    mn, ms, mtext, and annotation-xml with an HTML encoding) until a nested
 *    svg or math opens again;
 *  - the open elements, as a stack of names: void elements open none, an end
 *    tag closes the nearest element of its name and anything still open
 *    inside it, a stray end tag closes nothing.
 * It is fed every emitted byte, in order, and answers two questions: can a
 * script start right here, and where inside a chunk about to be emitted is
 * the first position where one can.
 *
 * A SPLICE POINT is a text-state position directly after the `>` that closed
 * a tag or a comment, with exactly `<body>`'s children open: the script lands
 * between body-level siblings, outside the app's root element, where the
 * blob shape and the completion sentinel already go. Not after text, so a
 * text run is never split in two. React escapes `<`, `>` and quotes in text
 * and attribute values, so a `>` in the text state always closed something;
 * markup from dangerouslySetInnerHTML is read the same way and holds up as
 * long as it is well formed (an unclosed element there only delays scripts
 * to the end of the document, it never breaks one).
 */

const TEXT = 0; // between tags
const TAG_OPEN = 1; // just after "<"
const TAG = 2; // inside a start or end tag, outside quotes
const ATTR_DOUBLE = 3; // inside a "…" attribute value
const ATTR_SINGLE = 4; // inside a '…' attribute value
const DECL = 5; // just after "<!"
const DECL_DASH = 6; // just after "<!-"
const BOGUS = 7; // "<!doctype …>", "<?…>", "<!…>": runs to the next ">"
const COMMENT = 8; // "<!-- … -->"
const CDATA_OPEN = 9; // "<![" in foreign content, matching the rest of "[CDATA["
const CDATA = 10; // "<![CDATA[ … ]]>"
const RAW_TEXT = 11; // inside style/textarea/…, until its end tag
const SCRIPT = 12; // script data, plain or (double-)escaped
const SCRIPT_LT = 13; // script data just after "<"
const SCRIPT_ESCAPE_START = 14; // just after "<!"
const SCRIPT_ESCAPE_START_DASH = 15; // just after "<!-"
const SCRIPT_END_TAG = 16; // after "</": a name that may be the end tag
const SCRIPT_DOUBLE_START = 17; // escaped, after "<" and a letter: a name that may be "script"

/** Content read as text up to the matching end tag (script data is handled apart). */
const RAW_TEXT_ELEMENTS = new Set([
  "style",
  "textarea",
  "title",
  "noscript",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
]);

/** No content, no end tag: opens no level. */
const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const CDATA_START = "[CDATA[";

/** svg children whose content is HTML again. */
const SVG_INTEGRATION_POINTS = new Set(["foreignobject", "desc", "title"]);
/** MathML text integration points; annotation-xml is one with an HTML encoding. */
const MATH_INTEGRATION_POINTS = new Set(["mi", "mo", "mn", "ms", "mtext"]);
const ENCODING_ATTR_RE = /(?:^|\s)encoding\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;
const HTML_ENCODINGS = new Set(["text/html", "application/xhtml+xml"]);

const LT = 0x3c; // <
const GT = 0x3e; // >
const SLASH = 0x2f; // /
const BANG = 0x21; // !
const QUESTION = 0x3f; // ?
const DASH = 0x2d; // -
const BRACKET_OPEN = 0x5b; // [
const BRACKET_CLOSE = 0x5d; // ]
const DOUBLE_QUOTE = 0x22;
const SINGLE_QUOTE = 0x27;

function isSpace(byte: number): boolean {
  return (
    byte === 0x20 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d
  );
}

function isAlpha(byte: number): boolean {
  return (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
}

function lower(byte: number): number {
  return byte >= 0x41 && byte <= 0x5a ? byte | 0x20 : byte;
}

/** Whitespace, "/" or ">": what may follow a tag name. */
function endsName(byte: number): boolean {
  return isSpace(byte) || byte === SLASH || byte === GT;
}

export interface HtmlSpliceCursor {
  /**
   * Advance over every byte of `chunk`, in order. Returns the end offset of
   * the first splice point inside it, or -1 when it holds none.
   */
  scan(chunk: Uint8Array): number;
  /**
   * Whether a script written right here — after everything scanned so far —
   * parses as a direct child of `<body>`.
   */
  canSplice(): boolean;
}

export function createHtmlSpliceCursor(): HtmlSpliceCursor {
  let state = TEXT;
  let afterTagEnd = false; // the last byte closed a tag or a comment
  let endTag = false; // the tag being read is "</…"
  let name = ""; // its name so far, lowercased
  let readingName = false;
  let selfClosing = false; // the last byte inside the tag was "/"
  let buf = ""; // a name or marker being matched, lowercased
  let dashes = 0; // consecutive "-" in a comment or escaped script data
  let bang = false; // a comment saw "--!"
  let brackets = 0; // consecutive "]" in a CDATA section
  let escape = 0; // script data: 0 plain, 1 escaped, 2 double-escaped
  let rawEnd = ""; // "</style": the end tag that leaves RAW_TEXT
  let rawPos = 0; // how much of rawEnd has matched
  let attrs = ""; // the attribute text of an annotation-xml tag being read
  // Open elements, outermost first: the name, the foreign namespace it is in
  // (null for HTML) and whether its children are parsed as foreign content.
  const open: Array<{
    name: string;
    ns: "svg" | "math" | null;
    foreignChildren: boolean;
  }> = [];
  let bodyDepth = -1; // open.length just inside <body>, -1 until it opens

  /** Whether the current position is in foreign content. */
  const inForeign = (): boolean =>
    open.length > 0 && open[open.length - 1].foreignChildren;

  /** An element of `ns` whose children are parsed as HTML again. */
  const isIntegrationPoint = (ns: "svg" | "math" | null): boolean => {
    if (ns === "svg") return SVG_INTEGRATION_POINTS.has(name);
    if (ns !== "math") return false;
    if (MATH_INTEGRATION_POINTS.has(name)) return true;
    if (name !== "annotation-xml") return false;
    const m = ENCODING_ATTR_RE.exec(attrs);
    const encoding = (m?.[1] ?? m?.[2] ?? m?.[3] ?? "").toLowerCase();
    return HTML_ENCODINGS.has(encoding);
  };

  const canSplice = (): boolean =>
    state === TEXT &&
    afterTagEnd &&
    bodyDepth !== -1 &&
    open.length === bodyDepth;

  /** The ">" that closes the tag being read. */
  const finishTag = (): void => {
    afterTagEnd = true;
    readingName = false;
    state = TEXT;
    if (endTag) {
      // The nearest open element of that name closes, with anything still
      // open inside it; a stray end tag closes nothing.
      for (let at = open.length - 1; at >= 0; at--) {
        if (open[at].name === name) {
          open.length = at;
          break;
        }
      }
      return;
    }
    const foreign = inForeign();
    if (foreign ? selfClosing : VOID_ELEMENTS.has(name)) return;
    if (name === "body" && bodyDepth !== -1) return; // a second <body> is ignored
    if (foreign) {
      // A child of a foreign element stays in its namespace; an integration
      // point's own tag is foreign, its children are HTML.
      const ns = open[open.length - 1].ns;
      open.push({ name, ns, foreignChildren: !isIntegrationPoint(ns) });
      return;
    }
    if (name === "svg" || name === "math") {
      open.push({ name, ns: name, foreignChildren: true });
      return;
    }
    open.push({ name, ns: null, foreignChildren: false });
    if (name === "body") bodyDepth = open.length;
    if (name === "script") {
      state = SCRIPT;
      escape = 0;
      dashes = 0;
    } else if (RAW_TEXT_ELEMENTS.has(name)) {
      state = RAW_TEXT;
      rawEnd = `</${name}`;
      rawPos = 0;
    }
  };

  /** The byte after "</name" in script data decided the name was a real end tag. */
  const endScript = (byte: number): void => {
    endTag = true;
    name = "script";
    readingName = false;
    selfClosing = byte === SLASH;
    state = TAG;
    if (byte === GT) finishTag();
  };

  const feed = (byte: number): void => {
    switch (state) {
      case TEXT:
        afterTagEnd = false;
        if (byte === LT) state = TAG_OPEN;
        return;
      case TAG_OPEN:
        if (byte === SLASH) {
          endTag = true;
          name = "";
          readingName = true;
          selfClosing = false;
          state = TAG;
        } else if (isAlpha(byte)) {
          endTag = false;
          name = String.fromCharCode(lower(byte));
          readingName = true;
          selfClosing = false;
          attrs = "";
          state = TAG;
        } else if (byte === BANG) {
          state = DECL;
        } else if (byte === QUESTION) {
          state = BOGUS;
        } else {
          // A "<" that opened nothing was text.
          state = byte === LT ? TAG_OPEN : TEXT;
        }
        return;
      case TAG:
        if (byte === GT) {
          finishTag();
          return;
        }
        if (!readingName && name === "annotation-xml") {
          attrs += String.fromCharCode(byte);
        }
        if (byte === DOUBLE_QUOTE || byte === SINGLE_QUOTE) {
          readingName = false;
          selfClosing = false;
          state = byte === DOUBLE_QUOTE ? ATTR_DOUBLE : ATTR_SINGLE;
          return;
        }
        if (readingName) {
          if (endsName(byte)) readingName = false;
          else name += String.fromCharCode(lower(byte));
        }
        selfClosing = byte === SLASH;
        return;
      case ATTR_DOUBLE:
      case ATTR_SINGLE:
        if (name === "annotation-xml") attrs += String.fromCharCode(byte);
        if (byte === (state === ATTR_DOUBLE ? DOUBLE_QUOTE : SINGLE_QUOTE)) {
          state = TAG;
        }
        return;
      case DECL:
        if (byte === DASH) state = DECL_DASH;
        else if (byte === BRACKET_OPEN && inForeign()) {
          buf = "[";
          state = CDATA_OPEN;
        } else if (byte === GT) {
          afterTagEnd = true;
          state = TEXT;
        } else state = BOGUS;
        return;
      case DECL_DASH:
        if (byte === DASH) {
          // "<!-->" and "<!--->" close at once, as if "--" was just read.
          dashes = 2;
          bang = false;
          state = COMMENT;
        } else if (byte === GT) {
          afterTagEnd = true;
          state = TEXT;
        } else state = BOGUS;
        return;
      case BOGUS:
        if (byte === GT) {
          afterTagEnd = true;
          state = TEXT;
        }
        return;
      case COMMENT:
        if (byte === DASH) {
          dashes = bang ? 1 : Math.min(dashes + 1, 2);
          bang = false;
        } else if (byte === BANG && dashes >= 2 && !bang) {
          bang = true;
        } else if (byte === GT && dashes >= 2) {
          afterTagEnd = true;
          state = TEXT;
        } else {
          dashes = 0;
          bang = false;
        }
        return;
      case CDATA_OPEN:
        // "<![" in foreign content: "[CDATA[" opens a CDATA section, anything
        // else was a bogus comment, which the first ">" ends.
        if (byte === GT) {
          afterTagEnd = true;
          state = TEXT;
          return;
        }
        buf += String.fromCharCode(byte);
        if (buf === CDATA_START) {
          brackets = 0;
          state = CDATA;
        } else if (!CDATA_START.startsWith(buf)) {
          state = BOGUS;
        }
        return;
      case CDATA:
        if (byte === BRACKET_CLOSE) {
          if (brackets < 2) brackets++;
        } else if (byte === GT && brackets >= 2) {
          state = TEXT; // "]]>" ends a text run, not a tag
        } else {
          brackets = 0;
        }
        return;
      case RAW_TEXT:
        if (rawPos === rawEnd.length) {
          // "</name" has matched; only a terminator makes it the end tag.
          if (byte === GT) {
            endTag = true;
            finishTag();
          } else if (isSpace(byte) || byte === SLASH) {
            endTag = true;
            readingName = false;
            selfClosing = byte === SLASH;
            state = TAG;
          } else {
            rawPos = byte === LT ? 1 : 0;
          }
          return;
        }
        if (lower(byte) === rawEnd.charCodeAt(rawPos)) rawPos++;
        else rawPos = byte === LT ? 1 : 0;
        return;
      case SCRIPT:
        if (byte === LT) {
          dashes = 0;
          state = SCRIPT_LT;
          return;
        }
        if (escape !== 0) {
          // "-->" (after any number of dashes) ends both escaped states.
          if (byte === DASH) {
            if (dashes < 2) dashes++;
            return;
          }
          if (byte === GT && dashes >= 2) escape = 0;
          dashes = 0;
        }
        return;
      case SCRIPT_LT:
        if (byte === SLASH) {
          buf = "";
          state = SCRIPT_END_TAG;
        } else if (byte === BANG && escape === 0) {
          state = SCRIPT_ESCAPE_START;
        } else if (isAlpha(byte) && escape === 1) {
          buf = String.fromCharCode(lower(byte));
          state = SCRIPT_DOUBLE_START;
        } else {
          state = SCRIPT;
          feed(byte);
        }
        return;
      case SCRIPT_ESCAPE_START:
        if (byte === DASH) {
          state = SCRIPT_ESCAPE_START_DASH;
        } else {
          state = SCRIPT;
          feed(byte);
        }
        return;
      case SCRIPT_ESCAPE_START_DASH:
        if (byte === DASH) {
          escape = 1;
          dashes = 2;
        }
        state = SCRIPT;
        if (byte !== DASH) feed(byte);
        return;
      case SCRIPT_END_TAG:
        // "</" + letters: "script" ends the double-escaped state when in it,
        // otherwise it is the element's end tag; any other name is content.
        if (isAlpha(byte)) {
          buf += String.fromCharCode(lower(byte));
          return;
        }
        if (buf === "script" && endsName(byte)) {
          if (escape === 2) {
            escape = 1;
            dashes = 0;
            state = SCRIPT;
          } else {
            endScript(byte);
          }
          return;
        }
        dashes = 0;
        state = SCRIPT;
        feed(byte);
        return;
      case SCRIPT_DOUBLE_START:
        // Escaped, "<" + letters: "script" enters the double-escaped state.
        if (isAlpha(byte)) {
          buf += String.fromCharCode(lower(byte));
          return;
        }
        dashes = 0;
        state = SCRIPT;
        if (endsName(byte)) {
          if (buf === "script") escape = 2;
          return;
        }
        feed(byte);
        return;
    }
  };

  return {
    scan(chunk) {
      let first = -1;
      for (let i = 0; i < chunk.byteLength; i++) {
        feed(chunk[i]);
        if (first === -1 && chunk[i] === GT && canSplice()) first = i + 1;
      }
      return first;
    },
    canSplice,
  };
}
