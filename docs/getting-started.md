# Getting Started

This guide will help you get up and running with the Vite React Server Plugin quickly. The plugin uses **React conditions** to automatically provide the optimal implementation for each execution environment.

## Installation

```bash
npm install -D vite-plugin-react-server react@experimental react-dom@experimental
```

> **React version**: The plugin requires React experimental builds. Peer dependency is `react >= 0.0.0-experimental-0`. The ESM transport (`react-server-dom-esm`) is vendored with the plugin — no separate install needed.

## Basic Setup

### 1. Create Vite Config

The plugin automatically detects your execution environment and loads the optimal implementation:

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      moduleBase: "src",
        Page: (url) => `src/pages${url}/page.tsx`,
  props: (url) => `src/pages${url}/props.ts`,
      build: { pages: ["/", "/about/"] }
    })
  ]
});
```

### 2. Create Page Components

```tsx
// src/pages/page.tsx
export const Page = ({ title }: { title: string }) => (
  <div>
    <h1>{title}</h1>
    <p>Welcome to my app!</p>
  </div>
);
```

```ts
// src/pages/props.ts
export const props = {
  title: "Home Page"
};
```

### 3. Add Package Scripts

The plugin supports two development paradigms using Node.js conditions:

```json
{
  "scripts": {
    "dev:rsc": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:ssr": "vite",
    "build": "NODE_OPTIONS='--conditions react-server' vite build --app",
    "preview": "vite preview"
  }
}
```

## Development Modes

The plugin provides two development paradigms. Both produce identical output but differ in architecture:

### RSC Mode (`dev:rsc`)
```bash
npm run dev:rsc
```
- **Condition**: `react-server` on main thread
- **Architecture**: RSC processing runs directly on the main Vite thread
- **Benefits**: Easier debugging (breakpoints work), simpler mental model, supports React in config files

### SSR Mode (`dev:ssr`)
```bash
npm run dev:ssr
```
- **Condition**: Default (client-focused main thread)
- **Architecture**: RSC processing runs in isolated worker thread
- **Benefits**: Better isolation, closer to traditional SSR/client split

### Environment Detection

The plugin automatically detects the execution environment:

```typescript
// The plugin automatically detects and loads the right implementation
import { getCondition } from 'vite-plugin-react-server/config';

const condition = getCondition(); // Returns 'client' or 'server'
```

## React Conditions

The plugin uses Node.js conditions to dynamically load the appropriate implementation:

### Execution Environments

| Environment | Condition | Use Case | Implementation |
|-------------|-----------|----------|----------------|
| **Client** | `null` (default) | Browser, client-side builds | Client-specific modules |
| **Server** | `react-server` | Server-side rendering, RSC processing | Server-specific modules |

### Module Structure

The plugin follows a consistent pattern for all modules:

```
plugin/
├── index.ts                    # Main entry point with condition detection
├── plugin.client.ts            # Client environment implementation
├── plugin.server.ts            # Server environment implementation
├── dev-server/
│   ├── index.ts                # Condition-based loader
│   ├── index.client.ts         # Client implementation
│   ├── index.server.ts         # Server implementation
│   └── ...                     # Other modules follow same pattern
└── ...
```

This ensures:
- **Client environments** get lightweight, browser-compatible implementations
- **Server environments** get full-featured RSC processing capabilities
- **No runtime overhead** from unused server code in client environments

## Common Use Cases

### Static Site Generation

```ts
export default defineConfig({
  plugins: [
    vitePluginReactServer({
      moduleBase: "src",
      Page: (url) => `src/pages${url}/page.tsx`,
      components: {
        Html: ({ Root, cssFiles, pageProps, Page }) => (
          <html>
            <head>
              <title>{pageProps?.title || "My App"}</title>
            </head>
            <body>
              <Root as="div" id="root" cssFiles={cssFiles} Page={Page} pageProps={pageProps} />
            </body>
          </html>
        )
      },
      build: { pages: ["/", "/about/", "/contact/"] }
    })
  ]
});
// vite.config.ts
```

### Server Actions

```tsx
"use server";

export async function submitForm(data: FormData) {
  const name = data.get("name");
  // Process form data
  return { success: true, name };
}
// src/actions/submit-form.server.ts
```

```tsx
import { submitForm } from "../../actions/submit-form.server";
import React from 'react';

export const Page = () => (
  <form action={submitForm}>
    <input name="name" required />
    <button type="submit">Submit</button>
  </form>
);
// src/pages/contact/page.tsx
```

### CSS Handling

```tsx
import { Css } from "vite-plugin-react-server/components";
import React from 'react';

export const Root = ({ cssFiles, Page, pageProps, ...props }) => {
  const filteredCss = Array.from(cssFiles).filter(({id}) => id.includes('.vars.'));
  return (
    <div {...props}>
      <Page {...pageProps} />
      <Css cssFiles={filteredCss} />
    </div>
  );
};
// src/components/Root.tsx
```

## Production Build

```bash
npm run build
```

This creates:
- `dist/static/` - Static HTML files
- `dist/client/` - Client-side modules
- `dist/server/` - Server-side modules

## Debugging Features

### Verbose Logging
```ts
export default defineConfig({
  plugins: [
    vitePluginReactServer({
      verbose: true,
      // ... other options
    })
  ]
});
```

### Error Boundaries
The plugin automatically provides detailed error information in development mode, including component stacks and source locations.

### Hot Module Replacement
- Client components: Full HMR support
- Server components: Automatic RSC refetching via `setupRscHmr`
- CSS: Real-time updates

For automatic RSC refetching when server components change, use the `setupRscHmr` helper in your client entry:

```tsx
import { createReactFetcher, setupRscHmr } from "vite-plugin-react-server/utils";

const { initialContent, refetch } = createReactFetcher({ callServer });

// Enable HMR for server components
if (import.meta.hot) {
  setupRscHmr(import.meta.hot, refetch);
}
```

Or use the `useRscHmr` React hook in a client component:

```tsx
import { useRscHmr } from "vite-plugin-react-server/utils";

function App({ refetch }) {
  useRscHmr(refetch);
  // ...
}
```

## Next Steps

- Read the [Core Concepts](./core-concepts.md) for deeper understanding
- Explore [Configuration Guide](./configuration.md) for advanced options
- Check [Troubleshooting](./troubleshooting-guide.md) if you encounter issues 

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	**[Getting Started](./getting-started.md) ← you are here**
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







