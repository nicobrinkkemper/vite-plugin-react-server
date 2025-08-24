# Getting Started

This guide will help you get up and running with the Vite React Server Plugin quickly. The plugin uses **React conditions** to automatically provide the optimal implementation for each execution environment.

## Installation

```bash
npm install -D vite-plugin-react-server patch-package react@experimental react-dom@experimental react-server-dom-esm
npm run patch
```

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
      Page: (route) => `src/pages${route}page.tsx`,
      props: (route) => `src/pages${route}props.ts`,
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

The plugin automatically adapts to different environments using Node.js conditions:

```json
{
  "scripts": {
    "dev": "NODE_OPTIONS='--conditions react-server' vite",
    "dev:client": "vite",
    "build": "npm run build --app",
    "build:static": "vite build",
    "build:client": "vite build --ssr",
    "build:server": "NODE_OPTIONS='--conditions react-server' vite build --ssr",
    "preview": "vite preview"
  }
}
```

## Development Modes

The plugin provides two development modes that offer **identical user experiences** but differ in their internal implementation:

### Direct Server Mode (Recommended)
```bash
npm run dev
```
- **Condition**: `react-server`
- **Implementation**: Direct main thread processing
- **Benefits**: No worker overhead, better debugging experience, more efficient for server-side development

### RSC Worker Mode
```bash
npm run dev:client
```
- **Condition**: `null` (default)
- **Implementation**: Uses RSC worker thread
- **Benefits**: Default Vite behavior, worker isolation, good for testing client-side behavior

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
      Page: (route) => `src/pages${route}page.tsx`,
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
- Server components: File-based reloading
- CSS: Real-time updates

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
13.	[Testing](./testing.md)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->







