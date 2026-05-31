# Module-resolution escape hatches in vprs

Contributor-facing reference for the seven different "make this import behave
differently" mechanisms that show up across the vprs codebase. They look
interchangeable. They aren't. Picking the wrong one usually compiles fine and
fails at runtime — sometimes only in a build the dev server never exercises
(see PR #57 below).

## TL;DR — one-paragraph decision tree

If the import is a real package that exists at runtime on the consumer
(`node:fs`, `fsevents`, a CDN-provided global) and you want the bundler to
leave the specifier alone, use `external` (`build.rollupOptions.external` for
production bundles, `resolve.external` for Vite 6 environments). If the import
is a `virtual:*` URL or any specifier with no provider on the target runtime,
use a virtual-stub plugin (`resolveId` + `load`). If the import is a real
package but esbuild's dev pre-bundle would mangle something we care about
(per-file `"use client"` directives), use `optimizeDeps.exclude`. If the
package is in `node_modules` but must be source-transformed (Rollup needs to
see the original code), use `ssr.noExternal`. If the import is a bare
specifier for a package vprs ships in-tree (`react-server-dom-esm`), use a
vendor alias. Reach for `optimizeDeps.include` only to head off a known
late-discovery slow path.

## The hatches

### 1. `build.rollupOptions.external`

**What it does (bundler-level).** Tells Rollup: "this specifier is provided
at runtime; don't bundle it, leave the `import` statement as-is in the
output." It is a Rollup option that Vite forwards in `vite build`. The
classic use is `node:*` builtins and packages the host environment provides.

Rollup's docs:
> "Either a function that takes an id and returns true (external) or false
> (not external), or an Array of module IDs, or regular expressions that
> match module IDs, that should remain external to the bundle."
> ([Rollup `external`](https://rollupjs.org/configuration-options/#external))

**When to reach for it.** The runtime target really does provide the module:
- Node-only SSR/server bundle externalizing `react`, `react-dom`,
  `react-server-dom-esm/server`. Used at
  [`plugin/config/resolveUserConfig.ts:645-652`](../plugin/config/resolveUserConfig.ts#L645).
- Universal "don't bundle this native macOS module" — `fsevents` at
  [`plugin/config/resolveUserConfig.ts:548`](../plugin/config/resolveUserConfig.ts#L548)
  and [`:560`](../plugin/config/resolveUserConfig.ts#L560).
- SSR client bundle that ships React from a runtime —
  [`plugin/config/resolveUserConfig.ts:481-487`](../plugin/config/resolveUserConfig.ts#L481).

**When NOT to reach for it.**
- The specifier has no provider on the target runtime — e.g. a `virtual:*`
  URL emitted by another plugin.
- The specifier is a *browser* import and the target is *browser*. Externalizing
  it leaves a literal `import "..."` in the static bundle; the browser then
  tries to fetch it as a URL.
- You're in Vite 6 environment-API land and not the legacy `vite build`
  path — see `resolve.external` below.

**Failure mode if picked wrong.** The build succeeds, the static bundle
contains `import x from "virtual:react-server/hmr"` (or `import "some-pkg"`
for a browser bundle), and the browser fails to load it. With `virtual:`
URLs the failure is loud and unambiguous:

> "Access to script at 'virtual:react-server/hmr' has been blocked by CORS
> policy: Cross origin requests are only supported for protocol schemes:
> chrome, chrome-untrusted, data, http, https. Failed to load resource:
> net::ERR_FAILED."

`storybook dev` won't reproduce this because the dev server resolves the
virtual at runtime — see PR #57 below.

### 2. `resolve.external` (Vite 6 environments)

**What it does (bundler-level).** Vite 6's environment API moved per-env
externalization off `build.rollupOptions.external` and onto
`resolve.external` (and `resolve.noExternal`). It's the same idea — "don't
bundle this, runtime provides it" — but the option lives on the environment's
`resolve` block so different environments (client / server / static) can
externalize different sets.

vprs explicitly translates the legacy form to the new one before handing
config to the environment API:

> // IMPORTANT: Map externals from resolveUserConfig (rollupOptions.external)
> // to Environment API format
> // In Environment API, externals go in resolve.external, not
> // build.rollupOptions.external
>
> — [`plugin/environments/createEnvironmentPlugin.ts:237-238`](../plugin/environments/createEnvironmentPlugin.ts#L237)

The actual remap happens at
[`plugin/environments/createEnvironmentPlugin.ts:241-267`](../plugin/environments/createEnvironmentPlugin.ts#L241):
the resolved user-config `rollupOptions.external` is hoisted to
`environment.resolve.external` and `rollupOptions.external` is set to
`undefined` to avoid double-application.

**When to reach for it.** When you're writing/modifying environment plugin
code, not user-facing build config. User code should keep writing
`build.rollupOptions.external` — vprs translates it.

**When NOT to reach for it.** From a Vite *user-config* surface. Users pass
`build.rollupOptions.external`; the environment layer is internal.

**Failure mode if picked wrong.** Mixing both at once double-applies the
externalization. If you set `resolve.external` for an environment and forget
to clear `build.rollupOptions.external`, Rollup will see the legacy form
again on top of the env-API form — surprising precedence interactions,
particularly with function-form externals.

### 3. `optimizeDeps.exclude`

**What it does (bundler-level).** Tells Vite's dev pre-bundle step (esbuild)
to skip this package. esbuild otherwise pre-bundles `node_modules` deps once
into `node_modules/.vite/deps/` to speed up dev. Pre-bundled output is a
single concatenated ESM file — and per-file source-level directives are *lost*
in that concatenation.

**When to reach for it.** A `node_modules` package whose individual files
ship `"use client"` / `"use server"` directives that a later transform must
read. vprs uses it exactly here for `clientPackages` (Chakra, MUI, Mantine,
react-aria, etc.):

> "Three things happen here: 1. `optimizeDeps.exclude` keeps esbuild's
> pre-bundle from stripping the per-file `"use client"` directives before
> our transform. 2. `noExternal` … makes Rollup inline these packages into
> the server bundle, where our transform converts each `"use client"` module
> to a `registerClientReference` stub. …"
>
> — [`plugin/config/resolveUserConfig.ts:384-395`](../plugin/config/resolveUserConfig.ts#L384)

Implementation: [`plugin/clientPackages/applyConfig.ts:27-36`](../plugin/clientPackages/applyConfig.ts#L27).

**When NOT to reach for it.** A package that does *not* need its individual
source files preserved. Excluding adds dev-server cold-start cost (every
import goes through Vite resolution instead of the pre-bundled blob) and
risks late-discovery full-page reloads when an unexpected import path is hit.

**Failure mode if picked wrong.** If you exclude a package vprs has vendored
under `oss-experimental/` (e.g. `react-server-dom-esm`) without going through
the vendor-alias plugin, dev cold start gets slower, and Vite may try to
resolve sub-paths it can't reach. Conversely, if you forget to exclude a
client-directive package, the transformer sees an esbuild-bundled blob with
the `"use client"` markers already stripped, and `registerClientReference`
never runs.

### 4. `optimizeDeps.include`

**What it does (bundler-level).** Force-includes a package in esbuild's
pre-bundle even if Vite's auto-discovery wouldn't have picked it up. Useful
for deps imported from a non-standard entry path Vite can't crawl statically
(e.g. dynamic imports under conditional code).

**When to reach for it.** vprs pre-includes the core RSC client deps so the
first request never trips a "new dependencies optimized, please reload" page
reload at
[`plugin/config/resolveUserConfig.ts:409-413`](../plugin/config/resolveUserConfig.ts#L409):

```ts
include: config.ssr?.optimizeDeps?.include ?? [
  "react",
  "react-dom",
  "react-server-dom-esm/client",
],
```

The storybook preset *removes* the vendored package from `include` because
under Storybook the vendor-alias isn't installed and a bare
`react-server-dom-esm/*` import would fail discovery —
[`plugin/storybook/preset.ts:51-53`](../plugin/storybook/preset.ts#L51):

```ts
const include = (config.optimizeDeps?.include ?? []).filter(
  (entry) => !entry.startsWith("react-server-dom-esm"),
);
```

**When NOT to reach for it.** A package vprs supplies via `resolveId`
(virtual or vendor-aliased). esbuild won't find the file on disk and dev
startup errors with `Failed to resolve entry for package`.

**Failure mode if picked wrong.** Including a vendor-aliased specifier:
esbuild fails to resolve the bare import (because the alias only applies
inside Vite's plugin pipeline, not the pre-bundle), and dev startup errors
out before the user sees their app.

### 5. `ssr.noExternal` / `ssr.external`

**What it does (bundler-level).** Vite's SSR-side counterparts. Default Vite
behaviour: SSR bundles externalize everything in `node_modules` (so Node's
own loader pulls them at runtime), and bundles app code. `ssr.noExternal`
forces a `node_modules` package to be inlined into the SSR bundle anyway —
necessary when Rollup has to *see and transform* the source. `ssr.external`
is the explicit opposite. Vite 6 also exposes `resolve.noExternal` per
environment; vprs mirrors both because the legacy `ssr.noExternal` doesn't
propagate into the environment API.

> "Vite 6 environments honor `resolve.noExternal` per-env, while the legacy
> `ssr.noExternal` doesn't propagate. Mirror clientPackages here too so the
> SSR env (outputs dist/client/) bundles them in alongside user-authored
> .client.tsx files."
>
> — [`plugin/config/resolveUserConfig.ts:488-491`](../plugin/config/resolveUserConfig.ts#L488)

Mirror sites: server config —
[`plugin/config/resolveUserConfig.ts:608`](../plugin/config/resolveUserConfig.ts#L608);
SSR-side config object —
[`plugin/config/resolveUserConfig.ts:406`](../plugin/config/resolveUserConfig.ts#L406).

**When to reach for it.** A `node_modules` package whose source must reach
the RSC transformer (per-file `"use client"` modules). This is the second
half of the `clientPackages` story — `optimizeDeps.exclude` (item 3)
preserves the directives through pre-bundle, then `noExternal` inlines the
package source into the server bundle where the transformer rewrites
`"use client"` modules to `registerClientReference` stubs.

Merge logic: [`plugin/clientPackages/applyConfig.ts:9-24`](../plugin/clientPackages/applyConfig.ts#L9).
Auto-discovery (packages with `react` in `peerDependencies`):
[`plugin/clientPackages/discover.ts:35-67`](../plugin/clientPackages/discover.ts#L35).

**When NOT to reach for it.** Browser/static builds — `ssr.*` only applies
to SSR environments. The browser-side equivalent ("bundle me into the
client") is what `resolve.noExternal` becomes in Vite 6 envs, which vprs
also sets at
[`plugin/config/resolveUserConfig.ts:492`](../plugin/config/resolveUserConfig.ts#L492).

**Failure mode if picked wrong.** If you forget `noExternal` on a
client-package, Node's loader pulls the package from `node_modules` at
SSG-render time, bypassing every Vite plugin including the RSC transform —
the rendered HTML embeds raw component code instead of client references,
and hydration fails with `Element type is invalid` once the browser tries
to instantiate it. If you over-apply `noExternal` (`ssr.noExternal: true`,
say), the SSR bundle pulls in deps that assume a `node_modules` install at
runtime and may crash on first import.

### 6. Virtual-stub plugins (`resolveId` + `load`)

**What it does (bundler-level).** A `vite.Plugin` that pairs `resolveId` (to
claim a specifier and produce a canonical resolved ID) with `load` (to return
source for that resolved ID). The convention is to prefix the resolved ID
with `\0` so other plugins know to skip it. The real module never has to
exist on disk; the plugin synthesizes its source at build time.

**When to reach for it.** Whenever a specifier needs to *exist* in the
resolved module graph but has no real on-disk file in the current pipeline:
- Providing the implementation of a `virtual:*` URL (the dev-server side of
  vprs HMR — [`plugin/dev-server/virtualRscHmrPlugin.ts:117-127`](../plugin/dev-server/virtualRscHmrPlugin.ts#L117)).
- Substituting a *no-op* for a `virtual:*` URL when the real provider isn't
  in scope (the Storybook-build case — see worked example below).
- Rewriting one bare specifier to another (`react-server-dom-esm/client.browser`
  → vendored ESM file — [`plugin/storybook/preset.ts:28-41`](../plugin/storybook/preset.ts#L28)).

**When NOT to reach for it.** The specifier is a real package on disk that
runtime can resolve unchanged — that's what `external` and aliases are for.
Reaching for a virtual stub when an alias suffices makes the resolution path
opaque to other plugins.

**Failure mode if picked wrong.** A `resolveId` hook without a matching
`load` produces a resolved ID that no other plugin will know how to load,
and Rollup errors with `Could not resolve "<id>"`.

#### Worked example — PR #57: `virtual:react-server/hmr` under Storybook

This is the bug that motivated this doc. The first version of
`plugin/storybook/preset.ts` added `virtual:react-server/hmr` to
`build.rollupOptions.external`:

```ts
const existingExternal = config.build?.rollupOptions?.external;
const external = [
  ...(Array.isArray(existingExternal) ? existingExternal : []),
  "virtual:react-server/hmr",
];
```

`storybook dev` worked: Vite's dev pipeline runs `virtualRscHmrPlugin` (the
real one at
[`plugin/dev-server/virtualRscHmrPlugin.ts`](../plugin/dev-server/virtualRscHmrPlugin.ts))
and the import resolves before "external" ever applies.

`storybook build` (used by Chromatic / hosted Storybook / visual-regression
pipelines) didn't include the dev plugin. `external` told Rollup "leave the
import alone", so the static bundle shipped
`import { useRscHmr } from "virtual:react-server/hmr"`. The browser tried to
fetch the `virtual:` URL — no protocol handler, CORS rejection, `<div
id="root"></div>` never populated.

The fix in PR #57 replaces the external entry with a stub plugin:

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

The stub mirrors the real virtual's export shape (see
[`plugin/types/virtual-rsc-hmr.d.ts`](../plugin/types/virtual-rsc-hmr.d.ts)),
so type-checking and tree-shaking work unchanged. Storybook stories never
need RSC HMR — they don't talk to a vprs dev server — so a no-op is the
correct semantics, not a workaround.

The key distinction: **`external` is for things the runtime provides;
virtual stubs are for things the runtime doesn't.** A `virtual:*` URL with
no browser-side provider is always the second case.

### 7. Vendor alias paths

**What it does (bundler-level).** A plugin that uses `config()` to install a
`resolve.alias` entry (rewriting a bare specifier to an absolute path inside
the package) *and* uses `resolveId()` to short-circuit further resolution to
the vendored file. For server-side entries it also sets `external: true` so
Vite's module runner uses native `import()` (the runner can't eval CJS as
ESM).

vprs uses this to host the entire `react-server-dom-esm` package in-tree
under `oss-experimental/`, eliminating the need for consumers to install or
patch it:

> "Vite plugin that aliases `react-server-dom-esm/*` imports to the vendored
> copy shipped with this plugin. This eliminates the need for consumers to
> install `react-server-dom-esm` separately or use patch-package.
>
> Browser client entries use true ESM files for Rollup tree-shaking.
> Server/static entries are CJS and must be loadable via native Node
> import() (not eval'd as ESM by Vite's module runner, which lacks
> require())."
>
> — [`plugin/vendor/vendor-alias.ts:20-31`](../plugin/vendor/vendor-alias.ts#L20)

Concrete sites:
- The alias install (browser-client → vendored ESM):
  [`plugin/vendor/vendor-alias.ts:42-51`](../plugin/vendor/vendor-alias.ts#L42).
- `resolveId` with `external: true` for server entries:
  [`plugin/vendor/vendor-alias.ts:73-85`](../plugin/vendor/vendor-alias.ts#L73).
- `node_modules` symlink fallback (so Vite's module runner can resolve the
  bare specifier through Node's own resolution):
  [`plugin/vendor/vendor-alias.ts:93-112`](../plugin/vendor/vendor-alias.ts#L93).
- Registration in both orchestrators:
  [`plugin/orchestrator/createPluginOrchestrator.server.ts:39`](../plugin/orchestrator/createPluginOrchestrator.server.ts#L39)
  and [`.client.ts:33`](../plugin/orchestrator/createPluginOrchestrator.client.ts#L33).

**When to reach for it.** Hosting a package in-repo (`oss-experimental/`,
`patches/`, etc.) and wanting consumers to import it by its canonical bare
name with no installation step. The Storybook preset's
`resolveReactServerDomEsm()` is a reduced version of the same idea — it
re-targets `react-server-dom-esm/client.browser` at the vendored ESM file
because the full vendor-alias plugin is stripped along with the rest of the
vprs plugin under Storybook
([`plugin/storybook/preset.ts:28-41`](../plugin/storybook/preset.ts#L28)).

**When NOT to reach for it.** A real `npm install`able dependency. Use a
normal import.

**Failure mode if picked wrong.** Vendor-aliasing a package without also
ensuring `node_modules` reachability (the symlink step) breaks Vite's
module runner under SSR / vitest / custom scripts — the runner resolves
bare imports through Node, not through plugin hooks. Aliasing without
setting `external: true` for CJS server entries breaks because Vite's
module runner can't eval CJS as ESM (no `require()` in the runner).

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
├─ Is the specifier a bare name for a package vprs hosts in-tree
│   (oss-experimental/, patches/)?
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

### Externalizing a `virtual:*` URL

The PR #57 failure mode. `external` means "runtime provides this", and a
`virtual:*` URL has no provider unless a Vite plugin synthesizes it. The
bundle ships a literal `import "virtual:..."`, the browser tries to fetch
it as a URL, and it fails with a CORS / protocol error. Fix: a virtual-stub
plugin (item 6).

### `optimizeDeps.include`-ing a vendor-aliased package

esbuild runs the include resolution outside Vite's plugin pipeline (the
alias only applies inside `resolveId` hooks during the dev pipeline). If
you include `react-server-dom-esm/client` while vendor-aliasing it, esbuild
errors at dev startup with `Failed to resolve entry for package
"react-server-dom-esm"`. The Storybook preset filters these entries back
out at
[`plugin/storybook/preset.ts:51-53`](../plugin/storybook/preset.ts#L51).

### Forgetting `optimizeDeps.exclude` for a `clientPackages` entry

esbuild's pre-bundle concatenates the package's per-file modules into a
single ESM file. The per-file `"use client"` directives are lost in the
concatenation. The transformer downstream sees a single blob with no
directives, treats the package as ordinary library code, and never emits
client references. The Counter button renders nothing. Always pair
`optimizeDeps.exclude` with `ssr.noExternal` for a clientPackage — they're
not independent (see comment block at
[`plugin/config/resolveUserConfig.ts:384-395`](../plugin/config/resolveUserConfig.ts#L384)).

### Setting `build.rollupOptions.external` *and* `resolve.external` in env code

The environment plugin at
[`plugin/environments/createEnvironmentPlugin.ts:241-267`](../plugin/environments/createEnvironmentPlugin.ts#L241)
explicitly clears `rollupOptions.external` after lifting it to
`resolve.external`. If you add a new env-config site that sets both, the
externalization double-applies — function-form externals see ids twice with
inconsistent `isResolved` flags, array-form externals merge unpredictably.
Always lift, never duplicate.

### Vendor-aliasing without ensuring `node_modules` reachability

Vite's module runner (used by SSR, vitest, custom scripts) resolves bare
imports through Node's own resolution, not through Vite plugin hooks. If
you alias a bare specifier and forget the symlink step (see
[`plugin/vendor/vendor-alias.ts:93-112`](../plugin/vendor/vendor-alias.ts#L93)),
the alias works under `vite dev` and `vite build` but breaks under the
runner. CJS server entries additionally need `external: true` so the runner
delegates to native Node `import()` instead of trying to eval CJS as ESM.

## References

- Rollup, [`external`](https://rollupjs.org/configuration-options/#external)
- Vite, [`ssr.noExternal`](https://vite.dev/config/ssr-options.html#ssr-noexternal)
- Vite, [`optimizeDeps.exclude`](https://vite.dev/config/dep-optimization-options.html#optimizedeps-exclude) /
  [`optimizeDeps.include`](https://vite.dev/config/dep-optimization-options.html#optimizedeps-include)
- Vite, [Environment API — `resolve.external`](https://vite.dev/guide/api-environment.html)
- Vite, [Virtual Modules Convention](https://vite.dev/guide/api-plugin.html#virtual-modules-convention)
