# Migrating to 4.0

Two changes reach every consumer: the `runner` option is required, and
`react-server-loader` is a peer dependency you install yourself. A third —
the `.` package entry no longer condition-splits — changes nothing in your
imports.

## Declare a runner

Every config passes `runner: "main" | "isolated" | "edge"` — the execution
paradigm, i.e. where react-server executes. There is no default: a missing
runner errors at config-resolve time with the three options, because a
default would silently pick a topology for you. The declared runner is
validated against the process condition, so runner and scripts either agree
or the build says so loudly.

Pick by what your scripts already do:

**Scripts run plain `vite` / `vite build --app` (no `NODE_OPTIONS`)** —
declare `"isolated"`. A worker thread owns react-server resolution; nothing
else changes.

```ts
vitePluginReactServer({
  runner: "isolated",
  // ...unchanged
})
```

**Scripts carry `NODE_OPTIONS='--conditions react-server'`** (the old
`:rsc` variants) — declare `"main"`, and put the flag on *every* command
that loads the config (`dev`, `build`, `preview`): `vite.config.ts` and its
imports resolve before plugin code runs, so the flag cannot be added
retroactively.

```ts
vitePluginReactServer({
  runner: "main",
  // ...unchanged
})
```

**A repo that deliberately runs both topologies** (a `dev` and a `dev:rsc`
script over one config) — pick one and delete the other script; that
duality is what the flag replaces. If running both is the point (a demo, a
compatibility matrix), say so explicitly by deriving from the condition:

```ts
import { getCondition } from "vite-plugin-react-server/config";

vitePluginReactServer({
  runner: getCondition() === "react-server" ? "main" : "isolated",
  // ...unchanged
})
```

`"edge"` (single isolate, React baked per environment) is a recognized value
but is currently rejected: declaring it is a config-time error until the edge
runner ships in a later 4.x minor. Use `"isolated"` or `"main"` with
`build.edge` to emit the baked pair meanwhile.

## Install react-server-loader yourself

`react-server-loader` moved from `dependencies` to `peerDependencies`, so
one copy in your tree serves vprs and your app — the private nested copy
npm used to create on the experimental train (and the `overrides` blocks
that papered over it) is gone. Install it alongside `react` / `react-dom`.

Stable (React floor is `^19.2.8`):

```bash
npm install react@^19.2.8 react-dom@^19.2.8 react-server-loader
```

Experimental: install all three at the exact snapshot vprs's peer range
names — the floating `@experimental` dist-tag moves daily and drifts past
the exact peer:

```bash
npm view vite-plugin-react-server peerDependencies  # the exact snapshot
npm install react@<snapshot> react-dom@<snapshot> react-server-loader@<snapshot>
```

If you carried an `overrides` block forcing `react-server-loader` to one
copy, delete it — the peer layout makes it redundant.

## The `.` entry is one module

The root entry no longer condition-splits: `import { vitePluginReactServer }
from "vite-plugin-react-server"` resolves the same module under both
conditions and dispatches per side at runtime. Imports are unchanged. The
explicit `vite-plugin-react-server/client` and `/server` subpaths keep
their behavior: opting into a side under the wrong condition still fails
loudly.

Type-level: `StreamPluginOptions.runner` is required, so configs typed with
`satisfies StreamPluginOptions` surface the missing field at typecheck time
— the same fix as the runtime error: declare a runner.
