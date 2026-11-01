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
 * script can start: text, inside a tag (with quoted attribute values), inside
 * a comment or declaration, and inside a raw-text element (script, style,
 * textarea, title and friends) until its end tag. It counts open elements —
 * void elements and `/>` open none — and notes the depth just inside the
 * `<body>` start tag. It is fed every emitted byte, in order, and answers two
 * questions: can a script start right here, and where inside a chunk about
 * to be emitted is the first position where one can.
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
const RAW_TEXT = 9; // inside script/style/…, until its end tag

/** Content read as text up to the matching end tag. */
const RAW_TEXT_ELEMENTS = new Set([
  "script",
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

const LT = 0x3c; // <
const GT = 0x3e; // >
const SLASH = 0x2f; // /
const BANG = 0x21; // !
const QUESTION = 0x3f; // ?
const DASH = 0x2d; // -
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
  let dashes = 0; // consecutive "-" inside a comment
  let rawEnd = ""; // "</style": the end tag that leaves RAW_TEXT
  let rawPos = 0; // how much of rawEnd has matched
  let depth = 0; // open elements
  let bodyDepth = -1; // depth just inside <body>, -1 until it opens

  const canSplice = (): boolean =>
    state === TEXT && afterTagEnd && bodyDepth !== -1 && depth === bodyDepth;

  /** The ">" that closes the tag being read. */
  const finishTag = (): void => {
    afterTagEnd = true;
    readingName = false;
    if (endTag) {
      if (depth > 0) depth--;
      state = TEXT;
      return;
    }
    if (selfClosing || VOID_ELEMENTS.has(name)) {
      state = TEXT;
      return;
    }
    depth++;
    if (name === "body") bodyDepth = depth;
    if (RAW_TEXT_ELEMENTS.has(name)) {
      state = RAW_TEXT;
      rawEnd = `</${name}`;
      rawPos = 0;
    } else {
      state = TEXT;
    }
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
        if (byte === DOUBLE_QUOTE || byte === SINGLE_QUOTE) {
          readingName = false;
          selfClosing = false;
          state = byte === DOUBLE_QUOTE ? ATTR_DOUBLE : ATTR_SINGLE;
          return;
        }
        if (readingName) {
          if (isSpace(byte) || byte === SLASH) readingName = false;
          else name += String.fromCharCode(lower(byte));
        }
        selfClosing = byte === SLASH;
        return;
      case ATTR_DOUBLE:
        if (byte === DOUBLE_QUOTE) state = TAG;
        return;
      case ATTR_SINGLE:
        if (byte === SINGLE_QUOTE) state = TAG;
        return;
      case DECL:
        if (byte === DASH) state = DECL_DASH;
        else if (byte === GT) {
          afterTagEnd = true;
          state = TEXT;
        } else state = BOGUS;
        return;
      case DECL_DASH:
        if (byte === DASH) {
          // "<!-->" and "<!--->" close at once, as if "--" was just read.
          dashes = 2;
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
        if (byte === DASH) dashes++;
        else if (byte === GT && dashes >= 2) {
          afterTagEnd = true;
          state = TEXT;
        } else dashes = 0;
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
