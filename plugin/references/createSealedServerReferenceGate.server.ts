// node:path loads lazily inside the disk-import fallback ONLY: a top-level
// import would crash module EVALUATION on a filesystem-less runtime, even
// though a baked bundle (which always supplies loadModule) never takes that
// branch. Top-level imports are load-bearing whether or not the code runs.
import {
  createReferenceGate,
  type ReferenceGate,
} from "react-server-loader/references";

/** A Vite manifest entry (the fields we use). */
export interface ViteManifestEntry {
  file: string;
  src?: string;
  css?: string[];
}

export interface SealedServerReferenceGateOptions {
  /**
   * Vite's emitted server manifest — `JSON.parse(<serverRoot>/.vite/manifest.json)`.
   * Keys are source paths (e.g. `src/server/actions.server.ts`); `entry.file` is
   * the built output path. No bespoke manifest: this is what Vite already writes.
   */
  serverManifest: Record<string, ViteManifestEntry | undefined>;
  /** Absolute path to the built server directory (where `entry.file` lives). */
  serverRoot: string;
  /** URL base the client prefixes onto reference ids (default `/`). */
  base?: string;
  /**
   * Override how a registered module is loaded. The default disk-imports
   * `<serverRoot>/<entry.file>` — correct under `--conditions react-server`. The
   * single-isolate edge bake injects a loader that returns a module STATICALLY
   * BAKED into the edge bundle (server React inlined), so the gate runs in a
   * process with no `react-server` condition and never disk-imports the
   * transport. Called with the manifest key and its built file. The allowlist
   * is unchanged: only manifest-enumerated keys are registered.
   */
  loadModule?: (key: string, file: string) => Promise<Record<string, unknown>>;
}

/**
 * Build a SEALED reference gate from Vite's emitted server manifest — the
 * production trust boundary for resolving server-action ids on a server-backed
 * deploy.
 *
 * A server action POST carries a client-supplied id of the form
 * `<srcPath>#<exportName>` (the directive transform bakes the bare manifest key),
 * or `<base><srcPath>#<exportName>` from a base-prefixed transport. The vendored
 * transport would `import()` a path
 * derived from that id (an open allowlist); this gate instead resolves it as a
 * dictionary lookup against the modules the build actually emitted, with each
 * importer bound to the manifest's real built file — never to anything derived
 * from the incoming id. An id whose module the build never enumerated cannot
 * resolve, which makes `../` traversal structurally impossible, and the gate's
 * own post-import check still rejects an export that isn't a real server
 * reference.
 *
 * Registration mirrors the client's id shape (`base` + manifest key) so
 * resolution is an exact-key lookup. The gate is sealed before return: in
 * production an unregistered id throws rather than falling back to an on-demand
 * import.
 *
 * Static (no-backend) builds never reach this — there is no server runtime to
 * call. It is for server-backed deploys (a Node server in front of the build).
 */
export function createSealedServerReferenceGate({
  serverManifest,
  serverRoot,
  base = "/",
  loadModule,
}: SealedServerReferenceGateOptions): ReferenceGate {
  const gate = createReferenceGate({ mode: "sealed" });
  const prefix = base.endsWith("/") ? base : `${base}/`;

  for (const [key, entry] of Object.entries(serverManifest)) {
    if (!entry?.file) continue;
    const file = entry.file;
    const load = loadModule
      ? () => loadModule(key, file)
      : async (): Promise<Record<string, unknown>> => {
          const { join } = await import("node:path");
          return import(join(serverRoot, file)) as Promise<
            Record<string, unknown>
          >;
        };
    // The directive transform bakes a BARE manifest-key id (`<srcKey>#<export>`);
    // a base-prefixed transport sends `<base><srcKey>#<export>`. Register both
    // shapes so resolution is an exact-key lookup either way. This does not widen
    // the allowlist: only modules the build enumerated are registered, and every
    // importer is bound to the manifest's built file, never to anything derived
    // from the incoming id — so a forged id still has no entry to resolve.
    const bareKey = key.replace(/^\//, "");
    for (const id of new Set([bareKey, prefix + bareKey])) {
      gate.register({ id, kind: "server", load });
    }
  }

  gate.seal();
  return gate;
}
