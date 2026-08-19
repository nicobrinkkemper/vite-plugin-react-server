# Runner spec — explicit `runner: "main" | "isolated" | "edge"` (draft)

Status: DRAFT for review. First deliverable of the runner-abstraction epic,
in the mold of the router parity spec.

## Problem

(This section describes the 3.x state the spec set out to retire; 4.0
implements the resolutions below — the `.` entry is now one neutral module
and the runner is required.)

The execution paradigm was inferred, not declared. The package exports map
split the plugin API on the process condition (`.` → `index.server.js`
under `react-server`, `index.client.js` otherwise), `getCondition()` read
the same signal at runtime, and the two orchestrator faces differed only in
an `OrchestratorStrategy` (`defaultEnvironment: "server" | "client"` plus
which `.server`/`.client` dev-server and static plugins they pull). The
paradigm a consumer ran was therefore the *reverse image of their
`--conditions` flag* —
a fact about how the process was launched, smeared across every script:

- mmc: `dev:rsc`, `build`, `build:gh` each restate
  `NODE_OPTIONS='--conditions react-server'`.
- bidoof-template: `env:dev-server`, `build`, `build:server` likewise.
- geitje dashboard: `dev:rsc`, `build` likewise.

Same paradigm, declared zero times; launch flag repeated per script; and the
`env.server` / `env.client` script split (build vs build:preview) exists only
to re-select the inferred side.

## The flag

```ts
vitePluginReactServer({ runner: "main" | "isolated" | "edge", ... })
```

One declaration names the choice. Two roles must not be conflated:

- **DISPATCH** (which orchestrator/pipeline/plugins run): the runner flag
  **replaces** the condition here. The exports-map API split and
  `getCondition()`-driven selection retire as dispatch mechanisms.
- **RESOLUTION** (which module graph `react-server` code resolves through):
  the runner **never** replaces the condition here. Each runner instead
  *names* who owns resolution — Node's resolver, or Vite's Environment API.

Both topologies stay valid. The runner is not a canonicalization; it is the
name of a deliberate choice.

### The runner/condition invariant (validated, not assumed)

The flag names an intent; the process either matches it or the build must
say so loudly, because neither direction fails soft:

- **`main` requires the process condition present.** The flag cannot
  retroactively add `--conditions react-server` to imports that already
  resolved — `vite.config.ts` and its graph load BEFORE any plugin code
  runs, so a `main` runner in a flagless process has already resolved
  client-condition React into the config layer. Erroring is the only honest
  response: "runner 'main' needs NODE_OPTIONS='--conditions react-server'
  (react-in-config resolves at process start)".
- **`isolated` / `edge` require the condition absent.** A global
  `--conditions react-server` poisons every module the orchestrator loads
  outside its per-environment `resolve.conditions` — the launch flag would
  silently reintroduce exactly the inference this spec retires. Error:
  "runner '<name>' owns react-server resolution itself; remove the process
  flag".

Validation is one `getCondition()` check at config-resolve time, and it is
what makes the flag trustworthy: after it, `runner` is the single source of
truth for paradigm, and the process flag is a checked precondition rather
than a signal.

## Paradigm matrix

| | `main` | `isolated` | `edge` |
|---|---|---|---|
| Where react-server executes | main thread | `worker_threads` rsc-worker | single isolate |
| react-server resolution owner | **Node's own resolver via `--conditions react-server`** (kept, declared once, knowingly) | Vite Environment API: per-environment `resolve.conditions` on the server env | build-time bake: React resolved per-env at bundle time, nothing resolved at runtime |
| react-in-config (React usable in `vite.config.ts`) | **yes** — the only runner that can; config executes in plain Node, outside any Vite environment, so only the process flag reaches it | no | no |
| Render pipeline | in-process render | worker protocol (`RSC_CHUNK`/`RSC_END`), html-worker for SSG | baked pair (`dist/server-edge/render.js`), Web streams end-to-end |
| Streams | Node streams | Node streams over the worker bridge | Web streams only, no `node:*` |
| Dev shape | `vite` under the process flag (today's `dev:rsc`) | plain `vite` — the rsc-worker carries the condition internally (today's client-first dev) | plain `vite` + baked-pair preview |
| Prod shape | host `dist/server` under the flag (`handleServerAction` sealed helper) | worker-based serving | `handleRouteAction` baked gate, no `--conditions` process |
| Action dispatch | sealed executor in-process | delegate to worker | baked sealed gate |
| Stack traces / debugging | best (one thread, one graph) | split across bridge | bundled |
| React copies | one, process-wide | per side of the bridge | baked per-env |

## What a runner owns (OrchestratorStrategy, grown up)

`OrchestratorStrategy` today is the two-way proto-runner:

```ts
interface OrchestratorStrategy {
  defaultEnvironment: "server" | "client";
  devServerPlugin: (userOptions) => Plugin | Plugin[];
  staticPlugin: (userOptions) => Plugin;
}
```

The runner is this record made explicit, selected by the flag instead of by
which conditional export the consumer's process happened to load, and
extended to own what the strategy currently leaves implicit:

1. `defaultEnvironment` and the transformer's environment set (unchanged).
2. The dev-server and SSG plugin variants (unchanged in role).
3. **Per-environment `resolve.conditions`** on the environments it creates —
   the piece that lets `isolated`/`edge` drop the process flag entirely.
4. The render transport (in-process / worker bridge / baked pair) and the
   action-dispatch surface it implies.

`createPluginOrchestratorImpl` stays the shared body (plugin order, the
shared-`userOptions`-reference invariant, environment wiring). Three runner
records replace the two condition-selected faces; `main` is the strategy the
`react-server` face is today, `isolated` is the client-first face with the
worker path named, `edge` is the baked pair promoted from `build.edge`
add-on to first-class paradigm.

## Dev/prod boundary

The runner is consumed at config/build time only; nothing in `dist/` reads
it. Prod is a thin host over the emitted artifacts and manifest (plain Node
over `dist/server`, the worker consumer, or the baked pair). The host does
import vprs runtime helpers (the request handler, the sealed action gate),
but as VENDORED copies inside `dist/server/node_modules` — prod never
resolves the installed package, so dev concerns cannot reach it through a
dependency edge.

- The dev/build split lives inside the runner record (`devServerPlugin` vs
  `staticPlugin`); consumers never branch on mode.
- Each runner uses the same render transport in dev and prod (in-process,
  worker bridge, baked pair) FOR ITS OWN SERVING PATH. Dev-only machinery
  (HMR, the module runner) wraps that transport and dies with the dev server
  process. A `build.edge` artifact emitted from a `main`/`isolated` config
  sits outside this invariant: it is an additional output, and deploying it
  is choosing the edge paradigm's transport for that deployment.
- Prod action dispatch goes through sealed references baked into the
  manifest; dev's permissive dispatch surface is structurally absent from
  the artifacts.
- The one deliberate dev→prod crossing is `main`'s process flag: resolution,
  declared once.

## Migration

- Exports map: `.` stops condition-splitting the *API*. The public entry is
  one module; the runner flag picks the orchestrator. (Internal
  `.server`/`.client` module pairs remain an implementation layout, and the
  `main` runner's *runtime* still resolves `react-server` through the
  process flag — resolution, not dispatch.)
- `getCondition()` demotes from paradigm oracle to what it is: a helper that
  reports the process condition where the `main` runner genuinely needs it.
- No compat shim for the old inference: this rides the new major
  (over-indexing backward compat is explicitly out of scope). A missing
  `runner` errors with the three options and a one-line description each.

## Consumer code deleted

- mmc: `NODE_OPTIONS='--conditions react-server'` leaves `dev:rsc`, `build`,
  `build:gh` (isolated/edge), or collapses to the single declared `main`
  runner + one flag stated once and knowingly.
- bidoof-template: same for `env:dev-server`, `build`, `build:server`; the
  `env:*` server/client script split collapses into the declared runner.
- geitje dashboard: same for `dev:rsc`, `build`.
- Generally: the build vs build:preview divergence stops being encoded in
  which flag a script exports; it is the same runner either way.

## Non-goals

- Retiring `--conditions react-server` for the `main` runner. It is the
  React-official documented mechanism, and the only resolution path that
  reaches `vite.config.ts` (plain Node, deps externalized — the Environment
  API cannot resolve config-time imports). Deleting it deletes
  react-in-config.
- Declaring a winner between topologies. `main` optimizes debuggability and
  react-in-config; `isolated` optimizes isolation without launch flags;
  `edge` optimizes portability. The flag names the trade, the docs state it.

## Resolutions (proposed, for review)

1. **Flag default: none — a missing `runner` errors**, listing the three
   options with a one-line description each; a PRESENT flag is then checked
   against the process condition (the invariant above), so a mismatch is a
   config-time error, not a runtime mystery. A default is inference with
   better branding: it silently canonicalizes one topology, which Non-goals
   refuses, and it hides the exact choice this spec exists to surface. The
   error message doubles as the paradigm's elevator pitch; templates ship
   with `runner` already set, so first-run DX is a template concern, not a
   default.
2. **`build.edge` survives as an artifact knob on the other runners — and
   every emitted host target describes itself.** Runner and edge artifact
   are different axes: the runner is process topology, `build.edge` is an
   emitted output. A `main` setup that debugs in-process but deploys the
   baked pair needs both from one config. Such a build has TWO valid
   deployment targets, so hosting metadata is per-target, never global: each
   emitted serving path carries its own host manifest / generated host entry
   next to its own artifacts (see the host spec), and nothing in `dist/`
   claims to speak for the build as a whole. The `edge` runner is the
   paradigm where the baked pair also serves dev and prod, not the only gate
   to producing it.
3. **The runner owns action dispatch; the delegator stays an advanced
   export.** Consumer action code is identical under all three runners —
   that identity is what makes `runner` one abstraction instead of three
   products sharing a config file. `delegateServerActionToWorker` remains
   exported and documented as the instrumentation/interception point for
   the worker bridge, not the primary path.
