import { parse } from "../parse.js";
import { analyzeDirectives } from "./analyzeDirectives.js";
import type { Program } from "acorn";

/**
 * Robustly detect whether `source` declares a *file-level* `"use client"`
 * directive (top-of-file, before any real code — the React contract).
 *
 * Why this exists: the build's moduleID hosting used to key client-component
 * detection purely off the `.client.[jt]sx?` filename pattern. First-party
 * modules that declare `"use client"` via DIRECTIVE but lack the `.client.`
 * suffix got a raw, unhosted moduleID, so react-server-dom-esm's
 * `serializeClientReference` threw "Attempted to load a Client Module outside
 * the hosted root" during prerender.
 *
 * Detection MUST be robust. The naive `isClientComponentByCode`
 * (`code.match(/(\.|\/)?client(\.|\/)?/)`) substring-matches the word "client"
 * anywhere — variables, comments, import paths — and would mis-host server
 * modules as client refs, breaking the build. We instead parse with acorn and
 * reuse `analyzeDirectives`, whose `fileLevel.type === "client"` is the source
 * of truth for a top-of-file `"use client"` directive (it validates position
 * via the AST, the same way the transformer does).
 *
 * Performance: parsing is gated behind a cheap substring pre-check so server
 * files (the common case) never hit the parser.
 *
 * @param source   Original module source content.
 * @param parseFn  Optional AST producer (e.g. Rollup's `this.parse`). Falls
 *                 back to the plugin's own acorn-based `parse` when omitted.
 */
export function hasFileLevelClientDirective(
  source: string | undefined,
  parseFn?: (source: string) => Program
): boolean {
  if (!source) return false;
  // Cheap gate: no "use client" text at all → definitely not a client module.
  // (Substring match here is only a *pre-filter*; the AST check below is what
  // actually decides, so false positives from this gate are harmless.)
  if (!source.includes("use client")) return false;

  try {
    const ast = parseFn
      ? parseFn(source)
      : (parse(source).ast as unknown as Program);
    const directiveInfo = analyzeDirectives(ast, source);
    if (directiveInfo.fileLevel?.type !== "client") return false;
    // Reject a MISPLACED directive: `analyzeDirectives` still records a
    // file-level entry for a `"use client";` string statement that appears
    // after real code, but flags it with a placement warning. React's
    // contract requires the directive at the very top, so only a properly
    // placed one counts as a real file-level client directive.
    const misplaced = directiveInfo.warnings.some((w) =>
      w.message.includes("must be at the top of the file")
    );
    return !misplaced;
  } catch {
    // If parsing fails for any reason, fall back to "not a client module".
    // The filename-based check still applies upstream, so a genuine
    // `.client.tsx` module is unaffected by a parse failure here.
    return false;
  }
}
