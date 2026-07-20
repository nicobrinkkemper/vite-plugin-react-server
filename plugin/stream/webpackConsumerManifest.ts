/**
 * The pass-through server-consumer manifest for decoding a webpack-transport
 * flight against a closed registry.
 *
 * The payload's reference id is echoed back as its own single chunk, so the
 * transport asks the chunk loader for exactly the id it was given and never
 * composes a module path out of payload input. Chunk loading (the
 * `installWebpackGlobals({ load })` side) stays the caller's: the runtime
 * decode imports off `moduleBaseURL`, the baked consumer looks up its
 * compiled-in registry.
 *
 * ONE implementation on purpose: the runtime renderer and the baked consumer
 * bundle (whose generated entry bundles this module in) must agree on this
 * contract byte-for-byte — two hand-rolled copies is how they drift apart.
 * Import-free leaf so the bake can bundle it without dragging anything else.
 */

type ConsumerManifestEntry = { id: string; chunks: string[]; name: string };

export type ServerConsumerManifest = {
  moduleMap: unknown;
  serverModuleMap: null;
  moduleLoading: null;
};

export function createPassthroughConsumerManifest(): ServerConsumerManifest {
  const moduleMap = new Proxy(
    {},
    {
      get: (_outer, id: string | symbol) =>
        typeof id !== "string"
          ? undefined
          : new Proxy(
              {},
              {
                get: (_inner, name: string | symbol): ConsumerManifestEntry | undefined =>
                  typeof name !== "string"
                    ? undefined
                    : { id, chunks: [id], name },
              }
            ),
    }
  );
  return { moduleMap, serverModuleMap: null, moduleLoading: null };
}
