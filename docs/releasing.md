# Releasing

Step-by-step guide for publishing a new version of `vite-plugin-react-server` and updating downstream demo projects.

## 1. Prepare the plugin

```bash
cd ~/code/vite-plugin-react-server
git checkout main
git pull
```

Make sure all changes are merged and CI is green.

## 2. Bump the version

```bash
npm version patch   # 1.2.3 → 1.2.4
# or: npm version minor / npm version major
```

This updates `package.json`, creates a git commit, and tags it.

## 3. Build and verify

```bash
npm run build
npm pack --dry-run   # sanity check the package contents
```

## 4. Push the version commit and tag

```bash
git push
git push --tags
```

## 5. Publish to npm

```bash
npm publish
```

You'll be prompted for 2FA. This publishes to the default `latest` tag.

For pre-releases:

```bash
npm version 1.3.0-alpha.0
npm publish --tag alpha
```

## 6. Update demo projects

For each demo repo (`bidoof-template`, `mmc`):

```bash
cd ~/code/<demo-repo>
git checkout main && git pull
git checkout -b bump/v<version>
```

Update the version in `package.json`, then **install and commit the lockfile**:

```bash
npm install
npm run postinstall   # applies patches (patch-package)
```

Verify the correct version is in `package-lock.json`:

```bash
grep -A1 '"vite-plugin-react-server"' package-lock.json | head -4
```

Commit both files:

```bash
git add package.json package-lock.json
git commit -m "chore: bump vite-plugin-react-server to <version>"
git push -u origin bump/v<version>
gh pr create --title "chore: bump vite-plugin-react-server to <version>" \
  --body "Bumps plugin to <version>."
```

## 7. Verify CI

Wait for CI to pass on both demo PRs. The GitHub Actions workflow uses `npm ci`, which requires `package-lock.json` to be in sync with `package.json`. **If you skip committing the lockfile, CI will fail.**

## Demo repos

| Repo | GitHub |
|------|--------|
| bidoof-template | `nicobrinkkemper/vite-plugin-react-server-demo-official` |
| mmc | `nicobrinkkemper/mmc` |

## Checklist

- [ ] All changes merged to main
- [ ] `npm version <type>` (creates commit + tag)
- [ ] `npm run build`
- [ ] `git push && git push --tags`
- [ ] `npm publish` (with 2FA)
- [ ] For each demo repo:
  - [ ] Update `package.json`
  - [ ] `npm install` + `npm run postinstall`
  - [ ] Commit `package.json` AND `package-lock.json`
  - [ ] Push branch, create PR
  - [ ] CI passes
- [ ] Merge demo PRs

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](./getting-started.md)
2.	[Core Concepts](./core-concepts.md)
3.	[Configuration Guide](./configuration.md)
4.	[CSS & Styling](./css-handling.md)
5.	[Server Actions](./server-actions.md)
6.	[Build & Deployment](./build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	[Plugin Internals](./transformer-plugin.md)
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](./api-reference.md)
11.	[React Compatibility](./react-type-compatibility.md)
12.	[Troubleshooting](./troubleshooting-guide.md)
13.	[Package Exports](./package-exports.md)
14.	[Transformations](./transformations.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->
