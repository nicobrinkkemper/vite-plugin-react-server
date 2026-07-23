/**
 * The pass-through CLIENT manifest for producing a webpack-transport flight
 * in dev — the producer-side sibling of `createPassthroughConsumerManifest`.
 *
 * In a build, the webpack renderer resolves each client reference against the
 * baked manifest (hosted id → { id, chunks, name }, see
 * bundle/clientManifest.ts). Dev has no bundler manifest and needs no
 * sealing: the transform registers references under their source-relative
 * module id (`src/Foo.client.tsx`), and the Vite dev server serves exactly
 * that path — so the manifest is a Proxy that maps any id to its own dev URL.
 *
 * The reference row then carries the dev URL as both the module id and its
 * single chunk. The runtime preloads every listed chunk before the sync
 * require (see rsl's installWebpackGlobals contract), so the browser's load
 * callback (`chunk => import(chunk)`, passed by createReactFetcher) fetches
 * the module from Vite and the require reads it back from the runtime's
 * cache. Nothing is composed from payload input beyond prefixing the base —
 * and dev, unlike prod, serves the whole source tree anyway.
 */

type ClientManifestEntry = { id: string; chunks: string[]; name: string };

/**
 * @param moduleBaseURL the browser-facing base the dev server serves modules
 *                      under (userOptions.moduleBaseURL, "/" in a plain dev
 *                      setup) — the same base the esm client resolves ids
 *                      against.
 */
export function createPassthroughClientManifest(
  moduleBaseURL: string
): Record<string, ClientManifestEntry> {
  const base = moduleBaseURL.replace(/\/$/, "");
  const toDevUrl = (id: string): string =>
    id.startsWith("/") ? id : base + "/" + id;
  return new Proxy(
    {},
    {
      get: (_target, key: string | symbol): ClientManifestEntry | undefined => {
        if (typeof key !== "string") return undefined;
        // The transport tries the FULL `$$id` ("path#export") first and only
        // splits off the export name on a miss. Answering the full id would
        // ship the entry's empty `name` and the browser would resolve the
        // module namespace instead of the export — so miss on purpose, like
        // the baked manifest's per-module keys do, and let the transport's
        // fallback carry the export name through.
        if (key.includes("#")) return undefined;
        const url = toDevUrl(key);
        return { id: url, chunks: [url], name: "" };
      },
    }
  );
}
