import { join } from "node:path";
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
}

/**
 * Build a SEALED reference gate from Vite's emitted server manifest — the
 * production trust boundary for resolving server-action ids on a server-backed
 * deploy.
 *
 * A server action POST carries a client-supplied id of the form
 * `<base><srcPath>#<exportName>`. The vendored transport would `import()` a path
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
}: SealedServerReferenceGateOptions): ReferenceGate {
  const gate = createReferenceGate({ mode: "sealed" });
  const prefix = base.endsWith("/") ? base : `${base}/`;

  for (const [key, entry] of Object.entries(serverManifest)) {
    if (!entry?.file) continue;
    // Hosted id = base + source key, matching what the client sends. The
    // importer is bound to the built file from the manifest, not the id.
    const id = prefix + key.replace(/^\//, "");
    const file = entry.file;
    gate.register({
      id,
      kind: "server",
      load: () => import(join(serverRoot, file)) as Promise<Record<string, unknown>>,
    });
  }

  gate.seal();
  return gate;
}
