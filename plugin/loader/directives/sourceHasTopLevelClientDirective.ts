/**
 * Detect a top-of-file `"use client"` directive in RAW source text (including
 * untranspiled TSX, which the acorn-based detectors can't parse).
 *
 * Used during build-time auto-discovery, where we must scan first-party
 * `.tsx/.ts/.jsx/.js` files on disk to decide which directive-only client
 * modules to emit to `dist/client`. We can't run the JSX/TS-aware Rollup
 * parser there (no plugin context), so we apply React's own structural
 * contract directly: a file-level `"use client"` must be a string-literal
 * statement at the very top of the module, before any real code.
 *
 * This is deliberately stricter than the naive `code.match(/client/)`
 * substring check (which flags any module mentioning the word "client"):
 *   - leading whitespace, line (`//`) and block (`/* *\/`) comments are
 *     skipped (they're allowed above a directive),
 *   - a leading `"use strict"` prologue is tolerated (real libraries ship
 *     `"use strict"; "use client";`),
 *   - the directive must then be the first actual statement.
 * Anything else (an import, a variable, the word "client" in a comment or
 * identifier) yields false.
 */
export function sourceHasTopLevelClientDirective(source: string): boolean {
  if (!source.includes("use client")) return false;

  let i = 0;
  const n = source.length;

  const skipTrivia = () => {
    for (;;) {
      // Whitespace (incl. newlines, BOM)
      while (i < n && /\s/.test(source[i]!)) i++;
      if (i + 1 < n && source[i] === "/" && source[i + 1] === "/") {
        // Line comment
        i += 2;
        while (i < n && source[i] !== "\n") i++;
        continue;
      }
      if (i + 1 < n && source[i] === "/" && source[i + 1] === "*") {
        // Block comment
        i += 2;
        while (i + 1 < n && !(source[i] === "*" && source[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }
  };

  // Read a single string-literal directive at the current position, returning
  // its value (without quotes) or null if the next token isn't a string.
  const readStringLiteral = (): string | null => {
    const quote = source[i];
    if (quote !== '"' && quote !== "'") return null;
    let j = i + 1;
    let value = "";
    while (j < n) {
      const ch = source[j]!;
      if (ch === "\\") {
        // Skip escaped char (directives never contain escapes, but be safe)
        value += source[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (ch === quote) {
        // Move cursor past the closing quote and an optional `;`
        i = j + 1;
        while (i < n && /[\s;]/.test(source[i]!)) i++;
        return value;
      }
      value += ch;
      j++;
    }
    return null;
  };

  skipTrivia();
  // Tolerate a leading "use strict" (or any prologue string directive) above
  // the "use client" directive.
  for (let guard = 0; guard < 4; guard++) {
    const mark = i;
    const literal = readStringLiteral();
    if (literal === null) return false;
    if (literal === "use client") return true;
    // Some other prologue directive (e.g. "use strict") — keep scanning.
    if (i === mark) return false; // no progress, bail
    skipTrivia();
  }
  return false;
}
