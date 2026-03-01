# Releasing

Step-by-step guide for publishing a new version of `vite-plugin-react-server` and updating downstream demo projects. Written for both human maintainers and AI agents.

## Prerequisites

- Push access to the plugin repo and demo repos
- npm publish access (requires 2FA — human step)
- Node.js 20+, npm 10+

## 1. Verify everything passes

```bash
cd ~/code/vite-plugin-react-server

# Build
npm run build

# Run e2e tests (requires Playwright browsers installed)
npx playwright test test/e2e/hmr.spec.ts

# All 9 tests should pass:
# - page content is visible
# - server component RSC refetch (preserves client state)
# - server component updates todos page
# - useRscHmr listener is active
# - import.meta.hot preserved in library build
# - CSS HMR preserves client state
# - client component does not trigger RSC refetch
# - server action works
# - todo toggle persists
```

## 2. Bump the version

```bash
npm version patch   # 1.4.0 → 1.4.1
# or: npm version minor  # 1.4.0 → 1.5.0
# or: npm version major  # 1.4.0 → 2.0.0
```

Use `--no-git-tag-version` if you want to commit and tag manually:

```bash
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "v1.5.0"
git tag v1.5.0
```

For pre-releases:

```bash
npm version 1.5.0-alpha.0
npm publish --tag alpha
```

## 3. Push and publish

```bash
git push && git push --tags
npm publish   # requires 2FA (human step)
```

## 4. Update demo projects

For each demo repo (`bidoof-template`, `mmc`):

```bash
cd ~/code/<demo-repo>
git checkout main && git pull
git checkout -b fix/v<version>
```

Update the version in `package.json`:

```bash
sed -i 's/"vite-plugin-react-server": "[^"]*"/"vite-plugin-react-server": "^<version>"/' package.json
npm install
```

Verify the correct version resolved:

```bash
grep -A1 '"vite-plugin-react-server"' package-lock.json | head -4
```

Commit **both** `package.json` and `package-lock.json` — CI uses `npm ci` which requires them in sync:

```bash
git add package.json package-lock.json
git commit -m "chore: bump vite-plugin-react-server to ^<version>"
git push -u origin fix/v<version>
gh pr create --title "chore: bump vite-plugin-react-server to v<version>" \
  --body "Bumps vite-plugin-react-server to v<version>."
```

## 5. Verify CI

Wait for GitHub Actions to pass on both demo PRs. The workflows will:
- Install dependencies (`npm ci`)
- Build the project
- Deploy to GitHub Pages (on merge)

If CI fails, check that `package-lock.json` was committed and the version actually published to npm.

## 6. Merge demo PRs

Once CI passes, merge the PRs. This triggers the GitHub Pages deploy.

## End-to-end verification (optional)

After merging, verify the deployed demos work:

```bash
# bidoof-template
curl -s https://nicobrinkkemper.github.io/vite-plugin-react-server-demo-official/ | head -5

# mmc
curl -s https://nicobrinkkemper.github.io/mmc/ | head -5
```

## Local dev testing (linked package)

When developing locally, `npm install` in demo projects will remove the `npm link` symlink. After any `npm install`, re-link:

```bash
cd ~/code/<demo-repo>
npm link vite-plugin-react-server
```

The plugin's `configResolved` hook auto-creates the `react-server-dom-esm` symlink in `node_modules/` on every Vite startup — no manual step needed.

> **⚠️ Never run `killall -9 node`** — this kills Cursor/VS Code's WSL server and crashes the editor. Use targeted kills: `lsof -ti:<port> | xargs kill` or `kill %1`.

## Demo repos

| Repo | GitHub | Deploy |
|------|--------|--------|
| bidoof-template | `nicobrinkkemper/vite-plugin-react-server-demo-official` | [GitHub Pages](https://nicobrinkkemper.github.io/vite-plugin-react-server-demo-official/) |
| mmc | `nicobrinkkemper/mmc` | [GitHub Pages](https://nicobrinkkemper.github.io/mmc/) |

## Checklist

- [ ] `npm run build` succeeds
- [ ] `npx playwright test test/e2e/hmr.spec.ts` — 9/9 pass
- [ ] `npm version <type>`
- [ ] `git push && git push --tags`
- [ ] `npm publish` (2FA — human step)
- [ ] For each demo repo:
  - [ ] Create branch from main
  - [ ] Update `package.json` version
  - [ ] `npm install` — commit **both** `package.json` and `package-lock.json`
  - [ ] Push branch, create PR
  - [ ] CI passes
  - [ ] Merge PR
