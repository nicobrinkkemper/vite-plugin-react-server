# Contributing to vite-plugin-react-server

Thanks for considering a contribution. `vite-plugin-react-server` (vprs) brings
React Server Components to Vite as a low-level plugin — on **stable React 19.2+**
(or experimental), with the version-locked transport supplied by
`react-server-loader`. Bug reports, repros, docs fixes, and PRs are all welcome.

## Prerequisites

- **Node.js ≥ 22** (see `engines` in `package.json`).
- **npm** — this repo uses `package-lock.json`. Please don't introduce a second
  package manager.

## Setup

```bash
git clone https://github.com/nicobrinkkemper/vite-plugin-react-server.git
cd vite-plugin-react-server
npm install
```

## The test gate

RSC splits the module graph into a server environment (loaded under the
`react-server` export condition) and a normal client environment, so vprs runs
its suite in **both**. The single command that runs the full gate is:

```bash
npm test          # = scripts/test-both.sh: client + server runs
```

Under the hood that's two passes you can also run individually while iterating:

```bash
npm run test:client                                  # vitest run
npm run test:server                                  # NODE_OPTIONS='--conditions react-server' vitest run
```

If a test needs fixtures, generate them first:

```bash
npm run setup:test-fixtures
```

Run the **full** `npm test` (both environments) before pushing — a change that
passes client but not server, or vice versa, is the most common way to break
RSC.

## Build and lint

```bash
npm run build     # clean + build:types + build:vite
npm run lint      # eslint ./plugin --fix
```

## Opening a pull request

- Keep PRs small and focused on one change.
- Green `npm test` and a clean `npm run build` before you push.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for the title
  and commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`,
  `perf:`. Scope is optional, e.g. `fix(rsc): …`.
- Link the issue your PR addresses (`Fixes #123`), or describe in the PR why the
  change is needed.
- Make the PR body stand on its own — what changed and why, not the discussion
  that led there.

## Where to ask

- **Questions / ideas / "is this a bug?"** → open a
  [Discussion](https://github.com/nicobrinkkemper/vite-plugin-react-server/discussions).
- **Reproducible bugs and concrete feature requests** → open an
  [Issue](https://github.com/nicobrinkkemper/vite-plugin-react-server/issues/new/choose)
  using a template.
- **Docs** → start at [`docs/`](./docs) and the
  [getting-started guide](./docs/getting-started.md).

By contributing you agree your contributions are licensed under the project's
[MIT License](./LICENSE).
