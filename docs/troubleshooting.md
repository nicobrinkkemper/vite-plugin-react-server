# Troubleshooting

## React Version Mismatch

**Symptoms:** Type errors, "rules of hooks" during builds, `Root cannot be used as a JSX component`.

**Fix:** Ensure all React packages match:

```json
{
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "@types/react": "^19.0.9",
  "@types/react-dom": "^19.0.3"
}
```

## Missing Stack Traces

Open the browser DevTools console (F12). The plugin streams detailed errors there, not to the rendered page.

## `react-server-dom-esm` Resolution Errors

Since v1.3.0 this is vendored. No separate install needed. For scripts outside Vite:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

## `"use client"` Not Working

- Must be the **first line** of the file
- Use `.client.` suffix for auto-discovery: `Counter.client.tsx`
- Import with `.js` extension: `import { Counter } from "./Counter.client.js"`

## `"use server"` Not Working

- File-level: must be first line
- Function-level: must be first statement in function body
- Server actions only work with a Node.js server, not static hosting

## Sourcemap Warning (Transformer Plugin)

```
src/components/Link.client.tsx (1:0): Error when using sourcemap...
```

Non-critical. The transformer removes directives and the sourcemap points to the removed line. End result is correct.

## Environment API Only Builds One Environment

Use `createBuilder()` instead of `build()`:

```ts
import { createBuilder } from "vite";
const builder = await createBuilder(config);
await builder.buildApp();
```

## CORS Errors During Preview

Access via `localhost:4173`, not `127.0.0.1:4173`. Or set `publicOrigin` explicitly:

```ts
publicOrigin: "http://localhost:4173",
```

## Worker Timeouts

Increase timeout values:

```ts
rscTimeout: 10000,
htmlTimeout: 30000,
htmlWorkerStartupTimeout: 10000,
rscWorkerStartupTimeout: 10000,
```

## Performance Script in HTML Output

If you see `<script>requestAnimationFrame(function(){$RT=performance.now()});</script>` unexpectedly, you're calling `pipe()` late. Call it immediately after `renderToPipeableStream`:

```ts
const { pipe } = ReactDOMServer.renderToPipeableStream(element);
pipe(passThrough); // Call immediately — not in onShellReady
```

## Stream Timeouts (3 seconds)

The plugin uses only the worker timeout. If operations complete in 5-30ms but timeout at 3s, you may be on an older version. Update the plugin.

## Import Extensions

Always use `.js` extensions in imports, even for TypeScript files:

```ts
import { Page } from "./page.js";       // ✅
import { Page } from "./page.tsx";      // ❌
import { Page } from "./page";          // ❌
```

## Debug Build

```json
{
  "scripts": {
    "debug-build": "NODE_ENV=development npm run build -- --mode development"
  }
}
```

This shows full error messages instead of "this error message is hidden in production".

## Verbose Logging

```ts
vitePluginReactServer({
  verbose: true,
  onEvent: (event) => console.log("Event:", event),
  onMetrics: (metrics) => console.log("Metrics:", metrics),
});
```

## Checklist for New Projects

- [ ] React packages have matching versions (19+)
- [ ] Client components have `"use client"` directive
- [ ] Server actions have `"use server"` directive
- [ ] Imports use `.js` extensions
- [ ] CSS files imported in components (not standalone)
- [ ] `tsconfig.json` includes `"vite-plugin-react-server/virtual"` in types
