/**
 * Whether a module's prologue carries a file-level `"use client"` or
 * `"use server"` directive.
 *
 * The vendor early return in the transform plugin skips a dependency's module
 * only when this is false: a dependency module without a directive is one the
 * transform never changed, while a module with one must still be transformed
 * (a client reference in the server environment, a stripped directive or a
 * server-reference proxy in the browser graph), whether or not its package is
 * in `clientPackages`.
 *
 * Same structural contract as rsl's `sourceHasTopLevelClientDirective`, for
 * both directives: whitespace (a BOM included), line and block comments and
 * other prologue strings (`"use strict"`) may precede it, and it must be the
 * first real statement. The scan stops at the first token that is none of
 * those, so its cost is bounded by the size of the module's header.
 */
export const hasLeadingDirective = (code: string): boolean => {
  if (!code.includes("use client") && !code.includes("use server")) {
    return false;
  }
  const n = code.length;
  let i = 0;
  const skipTrivia = () => {
    for (;;) {
      while (i < n && /\s/.test(code[i]!)) i++;
      if (code[i] === "/" && code[i + 1] === "/") {
        i += 2;
        while (i < n && code[i] !== "\n") i++;
        continue;
      }
      if (code[i] === "/" && code[i + 1] === "*") {
        i += 2;
        while (i + 1 < n && !(code[i] === "*" && code[i + 1] === "/")) i++;
        i += 2;
        continue;
      }
      break;
    }
  };
  // Reads one string literal at the cursor and moves past it and a trailing
  // `;`; null when the next token is not a string.
  const readStringLiteral = (): string | null => {
    const quote = code[i];
    if (quote !== '"' && quote !== "'") return null;
    let j = i + 1;
    let value = "";
    while (j < n) {
      const ch = code[j];
      if (ch === "\\") {
        value += code[j + 1] ?? "";
        j += 2;
        continue;
      }
      if (ch === quote) {
        i = j + 1;
        while (i < n && /[\s;]/.test(code[i]!)) i++;
        return value;
      }
      value += ch;
      j++;
    }
    return null;
  };
  skipTrivia();
  for (let guard = 0; guard < 4; guard++) {
    const mark = i;
    const literal = readStringLiteral();
    if (literal === null) return false;
    if (literal === "use client" || literal === "use server") return true;
    if (i === mark) return false;
    skipTrivia();
  }
  return false;
};
