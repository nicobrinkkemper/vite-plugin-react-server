# Module-resolution escape hatches in vprs

vprs has accumulated about seven different ways to tell the bundler "make
this import behave differently". They aren't really alternatives — each one
solves a slightly different problem at a different layer of the Vite/Rollup
pipeline. Picking the wrong one usually compiles fine and breaks at runtime,
sometimes only in a build the dev server never exercises. This page is the
map.

## The quick decision

The dividing line is whether the specifier has a *real provider* at runtime.

If the runtime really provides the import — Node builtins, `fsevents`,
host-supplied React bundles — use `external`. `build.rollupOptions.external`
is the legacy form for production bundles; `resolve.external` is the
per-environment form Vite 6 introduced. vprs translates between them
internally, so user config keeps writing the legacy form.

If the import is a `virtual:*` URL or any specifier no runtime provides, you
need a `resolveId` + `load` plugin to synthesise the contents. That's the
"stub" pattern — the worked example below walks through why externalizing a
virtual URL was the wrong instinct and why a stub is right.

If the package is a real `node_modules` dep whose per-file `"use client"`
directives must reach vprs's transformer, you need **both**
`optimizeDeps.exclude` (so esbuild's dev pre-bundle doesn't concatenate the
directives away) **and** `ssr.noExternal` (so Rollup inlines the source
instead of leaving it for Node). That's the `clientPackages` shape — both
hatches together, never just one.

If the package is vendored inside a dependency (as `react-server-dom-esm` is,
inside `react-server-loader`) and consumers should import it by bare name, use
the vendor-alias plugin. That one is
itself three things together (alias + `resolveId` + `node_modules/`
symlink); see item 7.

`optimizeDeps.include` is the odd one out. Reach for it only when
auto-discovery misses a known import that would otherwise trip a "new
dependencies optimized, please reload" mid-session reload.

## The hatches in detail

### 1. `build.rollupOptions.external`

Tells Rollup "this specifier is provided at runtime; leave the `import`
statement alone in the output". A Rollup option that Vite forwards in
`vite build`. The classic uses are `node:*` builtins, native modules like
`fsevents`, and runtime-supplied React in an SSR client bundle.

vprs reaches for it on exactly those cases — the Node-only SSR/server bundle
externalizes `react`, `react-dom`, `react-server-dom-esm/server`
([`plugin/config/resolveUserConfig.ts:645-652`](../../plugin/config/resolveUserConfig.ts#L645));
`fsevents` is excluded at
[`:548`](../../plugin/config/resolveUserConfig.ts#L548) and
[`:560`](../../plugin/config/resolveUserConfig.ts#L560); the SSR client
bundle ships React from a runtime at
[`:481-487`](../../plugin/config/resolveUserConfig.ts#L481).

The trap is reaching for it when the specifier doesn't actually exist at
runtime. A `virtual:*` URL has no provider on the consumer; externalizing
it just leaves a literal `import "virtual:..."` in the static bundle, and
the browser tries to fetch the `virtual:` URL as if it were a path. That's
the virtual-externalization bug, walked through under item 6.

**Failure mode.** Build succeeds, runtime fails. With `virtual:` URLs the
failure is loud and unambiguous:

> Access to script at 'virtual:react-server/hmr' has been blocked by CORS
> policy: Cross origin requests are only supported for protocol schemes:
> chrome, chrome-untrusted, data, http, https. Failed to load resource:
> net::ERR_FAILED.

`storybook dev` won't reproduce this because the dev pipeline runs the real
virtual plugin and resolves the import before "external" applies.

### 2. `resolve.external` (Vite 6 environments)

Same idea as `rollupOptions.external` — "don't bundle, runtime provides" —
but moved onto each environment's `resolve` block so different environments
can externalize different sets. Vite 6 needed this because the legacy form
was a single global list and there's no longer a single global build.

vprs translates between the two forms before handing config to the
environment layer:

> // IMPORTANT: Map externals from resolveUserConfig (rollupOptions.external)
> // to Environment API format
> // In Environment API, externals go in resolve.external, not
> // build.rollupOptions.external
>
> — [`plugin/environments/createEnvironmentPlugin.ts:237`](../../plugin/environments/createEnvironmentPlugin.ts#L237)

The actual hoist happens at
[`:241-267`](../../plugin/environments/createEnvironmentPlugin.ts#L241):
the resolved user config's `rollupOptions.external` is moved to
`environment.resolve.external`, then the original is cleared so the
externalization doesn't apply twice.

So user-facing config keeps writing `build.rollupOptions.external`.
Environment plugin code reads `resolve.external`. Don't set both — the
clearing only happens once.

**Failure mode.** Double-application. If a new env-config site sets both,
Rollup sees the legacy form on top of the env-API form. Function-form
externals get called twice with inconsistent `isResolved` flags; array-form
externals merge in unpredictable order.

### 3. `optimizeDeps.exclude`

Tells Vite's dev pre-bundle (esbuild) to skip a package. By default esbuild
pre-bundles `node_modules` deps into a concatenated ESM file in
`node_modules/.vite/deps/` for cold-start speed. The concatenation is fine
for ordinary libraries, but it's disastrous for anything where vprs needs
to read per-file source-level directives — `"use client"` markers in
particular are stripped in the merge.

vprs uses it for `clientPackages` (Chakra, MUI, Mantine, react-aria, …):

> Three things happen here: 1. `optimizeDeps.exclude` keeps esbuild's
> pre-bundle from stripping the per-file `"use client"` directives before
> our transform. 2. `noExternal` … makes Rollup inline these packages into
> the server bundle, where our transform converts each `"use client"`
> module to a `registerClientReference` stub. …
>
> — [`plugin/config/resolveUserConfig.ts:384-395`](../../plugin/config/resolveUserConfig.ts#L384)

Implementation at
[`plugin/clientPackages/applyConfig.ts:27-36`](../../plugin/clientPackages/applyConfig.ts#L27).

The cost: excluding adds dev cold-start time (every import resolves through
Vite rather than the pre-bundled blob) and risks late-discovery full reloads
when esbuild hits an unexpected import path. So don't exclude packages whose
per-file source doesn't actually need to survive.

**Failure mode.** Two shapes. Excluding a package vprs resolves through the
vendor-alias plugin (like `react-server-dom-esm`, vendored inside
`react-server-loader`) bypasses that alias — dev cold start slows down and Vite
tries to resolve sub-paths it
can't reach. Forgetting to exclude a client-directive package means the
transformer sees an esbuild-bundled blob with the directives already
stripped, and `registerClientReference` never runs.

### 4. `optimizeDeps.include`

The opposite of `exclude`: force a package into esbuild's pre-bundle even
when Vite's auto-discovery wouldn't find it. Useful for deps reached via
non-standard entry paths Vite can't crawl statically (dynamic imports under
conditional code, for instance).

vprs pre-includes the core RSC client deps so the first request never trips
a mid-session reload:

```ts
include: config.ssr?.optimizeDeps?.include ?? [
  "react",
  "react-dom",
  "react-server-dom-esm/client",
],
```

— [`plugin/config/resolveUserConfig.ts:409-413`](../../plugin/config/resolveUserConfig.ts#L409)

The Storybook preset filters out the vendored entries because under
Storybook the vendor-alias isn't installed, so a bare
`react-server-dom-esm/*` import would fail esbuild discovery:

```ts
const include = (config.optimizeDeps?.include ?? []).filter(
  (entry) => !entry.startsWith("react-server-dom-esm"),
);
```

— [`plugin/storybook/preset.ts:51-53`](../../plugin/storybook/preset.ts#L51)

**Failure mode.** Including a vendor-aliased specifier breaks dev startup
with `Failed to resolve entry for package "react-server-dom-esm"`. The alias
only applies inside Vite's plugin pipeline; esbuild's pre-bundle runs
outside it.

### 5. `ssr.noExternal` / `ssr.external`

Vite's SSR-side counterparts. Default SSR bundles application code and
externalizes everything in `node_modules` (Node's loader pulls them at
runtime). `ssr.noExternal` overrides that for a specific package — Rollup
inlines it into the SSR bundle so the transformer can see and rewrite the
source. `ssr.external` is the explicit opposite.

This is the second half of the `clientPackages` story.
`optimizeDeps.exclude` (item 3) preserves the per-file `"use client"`
directives through the dev pre-bundle. `ssr.noExternal` inlines the package
source into the server bundle so the transformer can rewrite each
`"use client"` module into a `registerClientReference` stub.

Vite 6 exposes `resolve.noExternal` per-environment in addition. vprs
mirrors both because the legacy `ssr.noExternal` doesn't propagate to the
environment API:

> Vite 6 environments honor `resolve.noExternal` per-env, while the legacy
> `ssr.noExternal` doesn't propagate. Mirror clientPackages here too so the
> SSR env (outputs dist/client/) bundles them in alongside user-authored
> .client.tsx files.
>
> — [`plugin/config/resolveUserConfig.ts:488-491`](../../plugin/config/resolveUserConfig.ts#L488)

Mirror sites at
[`:608`](../../plugin/config/resolveUserConfig.ts#L608) (server config),
[`:406`](../../plugin/config/resolveUserConfig.ts#L406) (SSR-side config
object), and
[`:492`](../../plugin/config/resolveUserConfig.ts#L492) (the Vite 6 form).
Merge logic at
[`plugin/clientPackages/applyConfig.ts:9-24`](../../plugin/clientPackages/applyConfig.ts#L9);
auto-discovery (packages with `react` in `peerDependencies`) at
[`plugin/clientPackages/discover.ts:35-67`](../../plugin/clientPackages/discover.ts#L35).

**Failure mode.** If you forget `noExternal` on a clientPackage, Node's
loader pulls the package from `node_modules` at SSG-render time, bypassing
every Vite plugin including the RSC transform. The rendered HTML embeds raw
component code instead of client references, and hydration fails with
`Element type is invalid` once the browser tries to instantiate the
components. Over-applying (`ssr.noExternal: true` blanket) pulls in deps
that assume a real `node_modules` install at runtime — they crash on first
import.

### 6. Virtual-stub plugins (`resolveId` + `load`)

A `vite.Plugin` pair: `resolveId` claims a specifier and produces a
canonical resolved ID (convention: prefix with `\0` so other plugins skip
it); `load` returns the synthesised source for that resolved ID. The
"module" never has to exist on disk — the plugin synthesises its content
at build time.

Three legitimate shapes:

- Providing the *real* implementation of a `virtual:*` URL. The dev-server
  side of vprs's HMR is exactly this, at
  [`plugin/dev-server/virtualRscHmrPlugin.ts:117-127`](../../plugin/dev-server/virtualRscHmrPlugin.ts#L117).
- Substituting a no-op for a `virtual:*` URL when the real provider isn't
  in scope. The Storybook-build case is the worked example below.
- Rewriting one bare specifier to another, like remapping
  `react-server-dom-esm/client.browser` to the vendored ESM file in the
  Storybook preset at
  [`plugin/storybook/preset.ts:28-41`](../../plugin/storybook/preset.ts#L28).

The wrong instinct is reaching for a virtual stub when an alias suffices —
that makes the resolution path opaque to other plugins.

**Failure mode.** A `resolveId` hook without a matching `load` produces a
resolved ID that no other plugin knows how to handle. Rollup errors with
`Could not resolve "<id>"`.

#### Worked example: externalizing a virtual URL

The Storybook preset's first version added `virtual:react-server/hmr` to
`build.rollupOptions.external`:

```ts
const existingExternal = config.build?.rollupOptions?.external;
const external = [
  ...(Array.isArray(existingExternal) ? existingExternal : []),
  "virtual:react-server/hmr",
];
```

`storybook dev` worked: Vite's dev pipeline runs the real
`virtualRscHmrPlugin`
([`plugin/dev-server/virtualRscHmrPlugin.ts`](../../plugin/dev-server/virtualRscHmrPlugin.ts))
and the import resolves before "external" ever applies.

`storybook build` — the path used by Chromatic, hosted Storybook, and
visual-regression pipelines — didn't include the dev plugin. `external`
told Rollup "leave it alone", so the static bundle shipped a literal
`import { useRscHmr } from "virtual:react-server/hmr"`. The browser tried
to fetch the `virtual:` URL as if it were a path, hit a protocol error,
and `<div id="root"></div>` never populated.

The fix replaces the external entry with a stub plugin:

```ts
function stubVirtualRscHmr(): Plugin {
  return {
    name: "vite-plugin-react-server:storybook:stub-virtual-rsc-hmr",
    enforce: "pre",
    resolveId(source) {
      if (source === VIRTUAL_RSC_HMR) {
        return RESOLVED_VIRTUAL_RSC_HMR_STUB;
      }
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_RSC_HMR_STUB) {
        return [
          "export const RSC_HMR_EVENT = 'vite-plugin-react-server:server-component-update';",
          "export function useRscHmr() {}",
          "export function setupRscHmr() {}",
        ].join("\n");
      }
      return null;
    },
  };
}
```

The stub mirrors the real virtual's export shape
([`plugin/types/virtual-rsc-hmr.d.ts`](../../plugin/types/virtual-rsc-hmr.d.ts)),
so type-checking and tree-shaking work unchanged. Storybook stories never
need RSC HMR — they don't talk to a vprs dev server — so a no-op is the
correct semantics, not a workaround.

The lesson: **`external` is for things the runtime provides; virtual stubs
are for things the runtime doesn't.** A `virtual:*` URL with no
browser-side provider is always the second case.

### 7. Vendor alias paths

The most elaborate hatch. A plugin that does three things together:

1. Uses `config()` to install a `resolve.alias` entry that rewrites a bare
   specifier to an absolute path inside the package's vendored copy.
2. Uses `resolveId()` to short-circuit further resolution and, for CJS
   server entries, sets `external: true` so Vite's module runner uses
   native `import()` — the runner can't eval CJS as ESM because there's no
   `require()` available.
3. Symlinks the vendored copy into `node_modules/` so the module runner —
   which resolves bare imports through Node's own resolution rather than
   plugin hooks — can still find the package.

vprs uses this to resolve the entire `react-server-dom-esm` package from the
`react-server-loader` dependency (which vendors it under its own `vendor/`),
eliminating the need for consumers to install or patch it:

> Vite plugin that aliases `react-server-dom-esm/*` imports to the vendored
> copy shipped with this plugin. This eliminates the need for consumers to
> install `react-server-dom-esm` separately or use patch-package.
>
> Browser client entries use true ESM files for Rollup tree-shaking.
> Server/static entries are CJS and must be loadable via native Node
> import() (not eval'd as ESM by Vite's module runner, which lacks
> require()).
>
> — [`plugin/vendor/vendor-alias.ts:20-31`](../../plugin/vendor/vendor-alias.ts#L20)

Concrete sites: the alias install at
[`:42-51`](../../plugin/vendor/vendor-alias.ts#L42); the `resolveId` with
`external: true` for server entries at
[`:73-85`](../../plugin/vendor/vendor-alias.ts#L73); the symlink fallback
at [`:93-112`](../../plugin/vendor/vendor-alias.ts#L93). Registered in both
orchestrators —
[`plugin/orchestrator/createPluginOrchestrator.server.ts:39`](../../plugin/orchestrator/createPluginOrchestrator.server.ts#L39)
and
[`.client.ts:33`](../../plugin/orchestrator/createPluginOrchestrator.client.ts#L33).

The Storybook preset's `resolveReactServerDomEsm()` is a reduced version of
the same pattern: it re-targets `react-server-dom-esm/client.browser` at
the vendored ESM file because the full vendor-alias plugin gets stripped
along with the rest of the vprs plugin under Storybook
([`plugin/storybook/preset.ts:28-41`](../../plugin/storybook/preset.ts#L28)).

**Failure mode.** Skip the symlink and the alias works under `vite dev`
and `vite build` but breaks under the module runner — the runner uses
Node's resolution, not plugin hooks. Skip the `external: true` for CJS
server entries and the runner crashes trying to eval CJS as ESM.

## Decision tree

```
Need to change how an import resolves?
│
├─ Is the specifier a virtual:* URL or otherwise nonexistent on disk?
│  ├─ YES, real implementation is in scope (dev server)
│  │     → resolveId + load plugin (item 6 — like virtualRscHmrPlugin)
│  ├─ YES, real implementation NOT in scope (Storybook build, prod stub)
│  │     → resolveId + load stub (item 6 — like stubVirtualRscHmr)
│  └─ NO → continue
│
├─ Is the specifier a bare name for a package vprs vendors via a dependency
│   (react-server-dom-esm, inside react-server-loader)?
│   → vendor alias (item 7 — vitePluginVendorAlias)
│
├─ Is the target environment Node + the package really lives on disk
│   in node_modules at runtime (or is fsevents / node:* / similar)?
│   → build.rollupOptions.external (item 1)
│     (the environment layer translates this to resolve.external — item 2)
│
├─ Is the package a node_modules dep whose per-file source must reach
│   the RSC transformer (per-file "use client" directives)?
│   → BOTH:
│       optimizeDeps.exclude  (item 3 — keep esbuild from stripping)
│       ssr.noExternal        (item 5 — make Rollup inline the source)
│     i.e. clientPackages
│
├─ Is the package an SSR-time dep that should stay in node_modules at
│   runtime (default Vite SSR behavior, no transform needed)?
│   → nothing (default), or ssr.external to be explicit
│
└─ Are you tripping "new dependencies optimized, please reload" page
    reloads on a known import that auto-discovery missed?
    → optimizeDeps.include (item 4)
```

## Common mistakes

**Externalizing a `virtual:*` URL.** `external` means "runtime provides
this", and a `virtual:*` URL has no provider unless a Vite plugin
synthesises it. Fix: virtual-stub plugin (item 6).

**`optimizeDeps.include`-ing a vendor-aliased package.** esbuild runs
include resolution outside Vite's plugin pipeline, so the alias doesn't
apply. Dev startup errors with `Failed to resolve entry for package
"react-server-dom-esm"`. The Storybook preset filters those entries back
out at
[`plugin/storybook/preset.ts:51-53`](../../plugin/storybook/preset.ts#L51).

**Forgetting `optimizeDeps.exclude` for a `clientPackages` entry.**
Pre-bundle concatenates the package and the `"use client"` directives are
lost. The transformer treats the package as ordinary library code and never
emits client references — the components render nothing.
`optimizeDeps.exclude` and `ssr.noExternal` are always paired for a
clientPackage; one without the other is broken (see comment block at
[`plugin/config/resolveUserConfig.ts:384-395`](../../plugin/config/resolveUserConfig.ts#L384)).

**Setting `build.rollupOptions.external` *and* `resolve.external` in env
code.** The environment plugin at
[`plugin/environments/createEnvironmentPlugin.ts:241-267`](../../plugin/environments/createEnvironmentPlugin.ts#L241)
clears `rollupOptions.external` after lifting it. A new env-config site
that sets both will double-apply the externalization — function-form
externals get called twice; array-form externals merge unpredictably.
Lift, never duplicate.

**Vendor-aliasing without ensuring `node_modules` reachability.** Vite's
module runner resolves bare imports through Node's resolution, not through
plugin hooks. Aliasing without the symlink step (see
[`plugin/vendor/vendor-alias.ts:93-112`](../../plugin/vendor/vendor-alias.ts#L93))
works under `vite dev` and `vite build` but breaks under the runner. CJS
server entries additionally need `external: true` so the runner uses
native Node `import()` instead of trying to eval CJS as ESM.

## References

- Rollup, [`external`](https://rollupjs.org/configuration-options/#external)
- Vite, [`ssr.noExternal`](https://vite.dev/config/ssr-options.html#ssr-noexternal)
- Vite,
  [`optimizeDeps.exclude`](https://vite.dev/config/dep-optimization-options.html#optimizedeps-exclude) /
  [`optimizeDeps.include`](https://vite.dev/config/dep-optimization-options.html#optimizedeps-include)
- Vite, [Environment API — `resolve.external`](https://vite.dev/guide/api-environment.html)
- Vite, [Virtual Modules Convention](https://vite.dev/guide/api-plugin.html#virtual-modules-convention)
