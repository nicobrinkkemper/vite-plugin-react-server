# vite-plugin-react-server — agent guide

You are working in `vite-plugin-react-server`, a Vite plugin that turns React components into native ESM with React Server Components support. This repo has its own remote and its own release lifecycle.

> Beads (`bd`) issues live in `~/code/geitje-bot-mission-control/.beads/`. They reference work in this repo via `bd-<id>` in commit messages but the issue store is not tracked here.

## The core rule: never mix `.client` and `.server`

The plugin works because every code path is split into a `react-server` half and a `react-client` half. The package exposes them via conditional exports in `package.json`. **Inside the package**, the same rule must hold — at module-init time:

- A `*.server.ts` file may only `import from "...*.server.js"` or condition-neutral files.
- A `*.client.ts` file may only `import from "...*.client.js"` or condition-neutral files.
- A condition-neutral file (no `.server`/`.client` suffix) must not statically `import` or `export from` any `.server` or `.client` file. If it does, it is not actually neutral — give it the suffix that matches what it loads, or split it.

ESM static `import`/`export ... from` evaluates the imported module at link time, even when the consumer only pulls a single named symbol. So a neutral aggregator that re-exports both worlds will eagerly run both halves of the split, which defeats the conditional-exports map and crashes the moment the wrong-side module hits `react-dom/server` (which throws under `--conditions react-server` by design).

If a file genuinely needs to choose at runtime (e.g. a dispatcher), the established pattern is the **TLA + interpolated dynamic import**:

```ts
const condition = getCondition("");
const dirname = new URL("./", import.meta.url).pathname.replace(/\/$/, "");
export const { React, ReactDOMServer } = await import(
  `${dirname}/vendor.${condition}.js`
);
```

This is load-bearing. Vite's dynamic-import helper analyzes the template literal, bundles **both** candidate files, and picks at runtime — so it satisfies bundling without forcing a static link. The interpolated string is required; a plain string makes Vite resolve it eagerly. Prefer splitting + conditional exports over this pattern, but don't replace this pattern with static imports of one side.

The 2026-04 PR #27 ("remove all top-level await wrappers") removed exactly this fallback under the assumption that conditional exports replace it. They don't, because static aggregators bypass them. That's tracked under `bd-6pi`.

## The publishing protocol — non-negotiable

Before any `npm publish`, you must verify the in-tree build against the **linked** demo repos. The published-package smoke (`npx playwright test`) by itself is not enough — it runs against whatever is in `dist/`, but does not catch regressions that only fire when the package is consumed via `file:..` from a real downstream app whose conditions, exports, and resolver state differ.

### Required pre-release checks

Run all of these in order. Stop at the first failure and fix it before publishing.

1. `npm test` (covers `test:server` and `test:client`). All non-flaky tests must pass on both halves. If a test only passes on one side, do **not** disable it — that hides a real cross-condition violation. Investigate.
2. `npm run build` cleanly produces `dist/`.
3. **Link the local build into each demo repo and run their builds and dev servers**:
   - `bidoof-template` (`~/code/bidoof-template`): change `vite-plugin-react-server` in `package.json` to `"file:../vite-plugin-react-server"`, run `npm install`, then run `npm run build:preview` AND start `npm run dev:rsc` (or equivalent) and confirm the home page renders. Restore `package.json`/`package-lock.json` afterwards.
   - `mmc` (`~/code/mmc`): same shape — link, build, smoke the dev server, restore.
4. `npx playwright test` — runs against `bidoof-template` (linked) per `playwright.config.ts`. All e2e specs pass.
5. `npm run test:bidoof-template` and `npm run test:mmc` from inside this repo (the convenience wrappers).

Only then bump the version, push, and `npm publish`. The 2FA step is the human gate.

See `docs/releasing.md` for the exact commands.

### What to do when a demo crashes against your branch

That is the bug. File a `bd` issue, do not publish, and do not hand-wave it as "preexisting" without a bisect. A regression that is on `main` but not yet released is still your responsibility to surface — it blocks the next release for downstream consumers.

## Tests are signals, not obstacles

If a test fails, the default response is to make it pass by fixing the code. Disabling it (`describe.skipIf`, `it.skip`, deleting it, or moving it to a script that is not part of the default suite) hides the failure from the maintainer and from CI, and the bug stays in the codebase. Acceptable reasons to skip a test:

- The test exercises a path that is genuinely outside the supported matrix (e.g. a different runtime). The skip is permanent and explicit, with a comment explaining why.
- The test is flaky and is in the process of being fixed under a tracked issue. The skip is temporary and references the issue.

"It only passes under `--conditions react-server`" is **not** an acceptable reason to gate a test in `test/dev/`. The whole point of the plugin is that it manages the condition for the consumer; if a test path requires the consumer to set the condition, that points at a missing piece of the plugin's worker/condition propagation, not at a test gating problem.

## Working with workers

The dev server uses two worker pools — RSC (under `react-server`) and HTML (under `react-client`). The opposite-condition worker is spawned with explicit `execArgv: ["--conditions", reverseCondition, ...]` (see `plugin/worker/createWorker.ts`). The intent: a process running under one condition can spawn a worker running under the other, and the plugin handles the condition flip transparently.

Two things follow from this:

1. **Not every dev server needs every worker.** A dev server running in client-mode needs the RSC worker but does not need the HTML worker; the inverse holds for server-mode. Code paths that pull in worker entry modules at the wrong time waste cost and increase the surface for cross-condition leaks. When you add a new code path, ask: does this need both workers, or only one?
2. **Worker entry files should carry the condition suffix.** `worker/rsc/messageHandler.js` runs under `react-server` and should be (or import only from) `.server.js` files; `worker/html/handleHtmlRender.js` runs under `react-client` and should be (or import only from) `.client.js` files. Files at the worker entry that are condition-neutral are violation-bait.

## Node / npm

This repo is part of a personal monorepo-of-siblings. Local installs only:

- `npx <bin>` (e.g. `npx vitest run`, `npx playwright test`, `npx tsc --noEmit`).
- No global tools, no `npm install -g`, no `npm link` unless you have a specific reason and you restore the consumer afterwards.
- The plugin's own `package.json` is authoritative for what tools are available; add to `devDependencies` before reaching.

## Git

- Conventional commits with the bd reference: `<type>(bd-<id>): <subject>`. Examples: `fix(bd-6pi): split config/index.ts into server/client halves`, `feat(bd-qvz): add examples/hello-world runnable RSC starter`.
- New commits, not amends, unless explicitly asked.
- Don't push or open PRs without explicit user say-so. The user runs the publish step (2FA).

## When in doubt

The user designed this plugin's condition handling intentionally. The wrappers, the worker spawn logic, the conditional exports map — these are not boilerplate. Before refactoring across the .client/.server boundary, ask why it is split that way. The answer is usually "because the plugin manages the condition for the user, so the user does not have to."
