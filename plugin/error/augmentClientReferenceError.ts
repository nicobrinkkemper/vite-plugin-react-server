/**
 * Augments the opaque react-server-dom-esm client-reference failures that
 * surface during static (`--app`) prerender with an actionable explanation.
 *
 * Two failure modes share the same root cause — a client module whose hosted
 * moduleID is wrong — but react-server-dom-esm reports them without context:
 *
 *   1. "Attempted to load a Client Module outside the hosted root."
 *      Thrown by `serializeClientReference` when a client reference's `$$id`
 *      does not start with the bundler's baseURL (`moduleBasePath`). Happens
 *      when a `"use client"` module wasn't hosted (`/`-prefixed) — e.g. a
 *      directive-only client module that the build didn't recognize.
 *
 *   2. "Cannot find module '<dist/client>/…'"
 *      Thrown when the html-worker imports the hosted moduleID but no file was
 *      emitted there — e.g. a directive-only client module that was hosted but
 *      never added as a client/SSR build input.
 *
 * Neither message names the offending module (the id is discarded inside the
 * vendored lib for case 1), so we attach the most actionable guidance we can:
 * the likely cause and the fact that directive-only `"use client"` modules are
 * supported, including the resolved path we *can* see for case 2.
 */
export function augmentClientReferenceError(error: unknown): unknown {
  if (!(error instanceof Error)) return error;

  const message = error.message || "";

  const isHostedRootError = message.includes(
    "Client Module outside the hosted root"
  );
  // Only treat "Cannot find module" as client-reference-related when it points
  // into a build's client output directory (that's where client refs resolve).
  const missingClientModule =
    message.startsWith("Cannot find module") &&
    /[\\/](client|static)[\\/]/.test(message);

  if (!isHostedRootError && !missingClientModule) return error;

  if ((error as { vprsClientReferenceAugmented?: boolean })
      .vprsClientReferenceAugmented) {
    return error;
  }

  const detail = isHostedRootError
    ? [
        "A client module's moduleID is not hosted (it does not start with the configured `moduleBasePath`).",
        "This usually means a `\"use client\"` module was not recognized as a client reference and got a raw, unhosted moduleID.",
        "Directive-detected `\"use client\"` modules (no `.client.` filename) ARE supported — ensure the module declares the directive at the very top of the file.",
      ].join(" ")
    : [
        "A hosted client reference points at a file that was not emitted to the client build output.",
        "This usually means a directive-only `\"use client\"` module was hosted but not added as a client/SSR build input.",
      ].join(" ");

  const augmented = new Error(
    `${message}\n\n[vite-plugin-react-server] ${detail}`
  );
  augmented.stack = error.stack;
  (augmented as { cause?: unknown }).cause = error;
  (augmented as { vprsClientReferenceAugmented?: boolean })
    .vprsClientReferenceAugmented = true;
  return augmented;
}
