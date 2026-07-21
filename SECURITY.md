# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 3.3.x   | Yes — receives security fixes |
| < 3.3   | Best effort only |

The latest minor release receives security fixes. Fixes for older minors are
best-effort. Check `package.json` on `main` for the current version.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub Security
Advisories on this repository: open the **Security** tab and use **Report a
vulnerability**.

Please do **not** open a public issue for a suspected vulnerability. Public
issues are indexed immediately and give users no time to update before details
are visible.

Include what you can: affected version, a minimal reproduction, and the impact
you believe it has. You will get an acknowledgement in the advisory thread.

## Scope

### In scope

- **Server-action reference resolution (the production trust boundary).**
  In production, server-action POSTs resolve the client-supplied id through a
  sealed allowlist built from Vite's emitted server manifest
  (`plugin/references/createSealedServerReferenceGate.server.ts`, used by
  `plugin/helpers/handleServerAction.server.ts`). Ids the build never emitted
  must be rejected before any import, module loading must never derive a path
  from the incoming id, and a missing manifest must fail closed. Any bypass of
  this gate — resolving an unregistered id, importing a path derived from the
  request, or reaching the unsealed dev resolver under production — is a
  vulnerability.
- **Path traversal in file serving** — the static/preview request handlers and
  the loaders (e.g. `plugin/helpers/createRequestHandler.server.ts`,
  `plugin/react-static/configurePreviewServer.ts`) must never serve files
  outside their configured root.
- **Worker message injection** — the RSC/HTML render workers
  (`plugin/worker/`) act on structured messages; crafted messages that cause
  code execution or file access outside the intended render are in scope.

### Out of scope

- **The dev server exposed to untrusted networks.** Dev mode serves live
  source through an open resolver by design and is not a security boundary.
  Do not expose a Vite dev server to networks you do not trust.
- Content of verbose/debug logging.
- Vulnerabilities in consumer application code (your pages, actions, and
  server code), or in dependencies of your application.

## Disclosure

Disclosure is coordinated: we prepare and release a fix before details are
made public, and publish the advisory once a fixed version is available.
Reporters are credited in the advisory unless they prefer otherwise.
