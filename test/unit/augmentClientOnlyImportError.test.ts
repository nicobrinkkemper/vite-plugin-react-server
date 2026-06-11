import { describe, it, expect } from "vitest";
import {
  augmentClientOnlyImportError,
  REACT_SERVER_OMITTED_EXPORTS,
} from "../../plugin/error/augmentClientOnlyImportError.js";

/**
 * Diagnostic for client-only React APIs reached in the server graph (bd-qea).
 * The raw failure is a bare linker error; the augmented one must name the
 * API, say it's client-only, and point at the `"use client"` fix — WITHOUT
 * stubbing or rewriting the import (the load still fails).
 */
describe("augmentClientOnlyImportError", () => {
  const esmLinkError = (name: string, mod = "react") =>
    new SyntaxError(
      `The requested module '${mod}' does not provide an export named '${name}'`
    );
  const cjsInteropError = (name: string, mod = "react") =>
    new SyntaxError(
      `Named export '${name}' not found. The requested module '${mod}' is a CommonJS module, which may not support all module.exports as named exports.`
    );

  it("rewrites the ESM link error for a client-only API with a clear diagnostic", () => {
    const out = augmentClientOnlyImportError(
      esmLinkError("createContext"),
      "src/theme/context.tsx"
    ) as Error;
    expect(out.message).toContain("CLIENT-ONLY React API");
    expect(out.message).toContain("`createContext`");
    expect(out.message).toContain('src/theme/context.tsx');
    expect(out.message).toContain('"use client"');
    // the original linker text is preserved for searchability
    expect(out.message).toContain("does not provide an export named");
  });

  it("rewrites the CJS-interop variant too", () => {
    const out = augmentClientOnlyImportError(
      cjsInteropError("useState")
    ) as Error;
    expect(out.message).toContain("CLIENT-ONLY React API");
    expect(out.message).toContain("`useState`");
  });

  it("matches react resolved as a file path, not just the bare specifier", () => {
    const out = augmentClientOnlyImportError(
      esmLinkError(
        "useContext",
        "/proj/node_modules/react/cjs/react.react-server.development.js"
      )
    ) as Error;
    expect(out.message).toContain("CLIENT-ONLY React API");
  });

  it("keeps the original error as cause and preserves the stack", () => {
    const raw = esmLinkError("useRef");
    const out = augmentClientOnlyImportError(raw) as Error;
    expect((out as { cause?: unknown }).cause).toBe(raw);
    expect(out.stack).toBe(raw.stack);
  });

  it("does not re-augment an already-augmented error", () => {
    const once = augmentClientOnlyImportError(esmLinkError("useState"));
    const twice = augmentClientOnlyImportError(once);
    expect(twice).toBe(once);
  });

  it("leaves missing exports that are NOT client-only React APIs alone", () => {
    const raw = esmLinkError("useServerInsertedHTML");
    expect(augmentClientOnlyImportError(raw)).toBe(raw);
  });

  it("leaves missing exports from non-react modules alone", () => {
    const raw = esmLinkError("createContext", "preact");
    expect(augmentClientOnlyImportError(raw)).toBe(raw);
    const ariaRaw = esmLinkError("useRef", "react-aria");
    expect(augmentClientOnlyImportError(ariaRaw)).toBe(ariaRaw);
  });

  it("leaves unrelated errors alone", () => {
    const raw = new Error("ECONNREFUSED");
    expect(augmentClientOnlyImportError(raw)).toBe(raw);
    expect(augmentClientOnlyImportError("not an error")).toBe("not an error");
  });

  it("covers every export the react-server build omits (hooks + classes)", () => {
    for (const name of [
      "useState",
      "useEffect",
      "useContext",
      "createContext",
      "Component",
      "PureComponent",
      "startTransition",
      "useOptimistic",
    ]) {
      expect(REACT_SERVER_OMITTED_EXPORTS.has(name)).toBe(true);
      const out = augmentClientOnlyImportError(esmLinkError(name)) as Error;
      expect(out.message).toContain("CLIENT-ONLY React API");
    }
  });
});
