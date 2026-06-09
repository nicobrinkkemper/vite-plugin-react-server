/**
 * fixCssPreloadHint.ts
 *
 * PURPOSE: Neutralize the invalid CSS preload hint that stable React's Flight
 * server emits, so apps on stable React stop flooding the console with
 * "Preload ... was ignored / invalid `as` value" warnings — without forking,
 * vendoring, or patching React.
 *
 * Root cause (bead geitje-bot-mission-control-1wz, discovered-from d9x):
 * React 19.2.x stable's `ReactFlightServerConfigDOM.processLink()` calls
 * `preload(href, 'stylesheet')`, but `stylesheet` is NOT a valid preload `as`
 * value (the valid token is `style`). The Flight client replays the hint
 * verbatim, so the static HTML ends up with:
 *     <link rel="preload" href="..." as="stylesheet"/>
 * Browsers reject the hint and warn. The real, valid stylesheet link
 * (`<link rel="stylesheet" ... data-precedence>`) is emitted separately, so the
 * preload is redundant — we simply rewrite the token to the valid `style` to
 * silence the warning while preserving React's preload intent.
 *
 * We can't change what React's Flight server serializes, but vprs owns the SSG
 * HTML writer (fileWriter), so we fix it there on the way to disk. Scope is the
 * exact token `as="stylesheet"`, which only ever appears in this invalid
 * preload hint — a real stylesheet uses `rel="stylesheet"` (never `as=`), and
 * other preloads use `as="image"`, `as="script"`, etc. — so the rewrite cannot
 * touch anything legitimate.
 */
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const INVALID = 'as="stylesheet"';
const VALID = 'as="style"';

/** Replace every invalid CSS preload token in a complete string. */
export function fixCssPreloadHint(html: string): string {
  return html.split(INVALID).join(VALID);
}

/**
 * A streaming Transform that rewrites `as="stylesheet"` -> `as="style"` as HTML
 * flows to disk. Safe across chunk boundaries: a `StringDecoder` keeps partial
 * multibyte sequences intact, and we hold back the last `INVALID.length - 1`
 * characters of each emitted chunk so a token split across two chunks is still
 * matched once the rest arrives.
 */
export function createCssPreloadFixStream(): Transform {
  const decoder = new StringDecoder("utf8");
  // The longest tail that could be the start of a token split across chunks.
  const hold = INVALID.length - 1;
  let carry = "";

  return new Transform({
    transform(chunk, _encoding, callback) {
      const buf = carry + decoder.write(chunk as Buffer);
      const replaced = fixCssPreloadHint(buf);
      if (replaced.length <= hold) {
        // Not enough yet to safely emit anything without risking a split token.
        carry = replaced;
        callback();
        return;
      }
      carry = replaced.slice(replaced.length - hold);
      callback(null, replaced.slice(0, replaced.length - hold));
    },
    flush(callback) {
      const buf = carry + decoder.end();
      callback(null, fixCssPreloadHint(buf));
    },
  });
}
