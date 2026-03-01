# React Compatibility

This guide covers React version compatibility, type system overview, and the patch system for maintaining compatibility across different React versions.

## Type System Overview

The plugin uses generic types that adapt to your React version and prevent compatibility issues:

```tsx
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";
import { Css } from "vite-plugin-react-server/components";

type MyPageProps = {
  title: string;
};

type MyHtmlProps = HtmlProps<MyPageProps>;

export const Html = ({
  Root,
  cssFiles,
  globalCss,
  pageProps = { title: "404 Not Found" },
  Page,
}: MyHtmlProps) => {
  if (!pageProps.title) {
    pageProps.title = "No title";
  }
  return (
    <html>
      <head>
        <Css cssFiles={globalCss} />
      </head>
      <body>
        <Root
          cssFiles={cssFiles}
          Page={Page}
          pageProps={pageProps}
        />
      </body>
    </html>
  );
};
```

## Generic Types

The plugin uses generic types to maintain compatibility across React versions:

```typescript
// Generic function type that adapts to any React version
type RootComponentType<
  As extends keyof JSX.IntrinsicElements = "div",
  InlineCSS extends boolean = boolean,
  PageProps = any,
  ReactType = any
> = (props: RootProps<As, InlineCSS, PageProps, ReactType>) => ReactType;

// Generic page component type
type PageComponentType<PageProps = any, ReactType = any> = 
  (props: PageProps) => ReactType;
```

### Environment Detection

```typescript
// Check current execution context
function getCondition(): string | null;

// Environment-specific configurations
const RSC_LOADER = {
  development: {
    importServerPath: "react-server-dom-esm/server.node",
    importClientPath: "react-server-dom-esm/server.node",
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference"
  },
  production: {
    importServerPath: "react-server-dom-esm/server",
    importClientPath: "react-server-dom-esm/server",
    registerClientReferenceName: "registerClientReference",
    registerServerReferenceName: "registerServerReference"
  }
};
```

## Version Compatibility

### React 18+ Support

The plugin is designed to work with React 18 and later versions:

```typescript
// React 18+ features supported
import { renderToReadableStream } from "react-server-dom-esm/server.node";
import { renderToPipeableStream } from "react-dom/server";

// Server Components
"use server";
export async function serverAction() {
  return "Hello from server";
}

// Client Components
"use client";
export function ClientComponent() {
  return <div>Hello from client</div>;
}
```

### React Server Components

Full support for React Server Components:

```typescript
// Server Components
export async function ServerComponent() {
  const data = await fetchData();
  return <div>{data}</div>;
}

// Client Components
"use client";
import { useState } from "react";

export function InteractiveComponent() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}
```

### TypeScript Integration

Comprehensive TypeScript support:

```typescript
// Type-safe props
interface PageProps {
  title: string;
  content: string;
  metadata?: {
    description: string;
    keywords: string[];
  };
}

export const Page = ({ title, content, metadata }: PageProps) => (
  <div>
    <h1>{title}</h1>
    <p>{content}</p>
    {metadata && (
      <meta name="description" content={metadata.description} />
    )}
  </div>
);
```

## Vendored ESM Transport

Since v1.3.0, the plugin **vendors `react-server-dom-esm`** (built from React source). No separate install needed.

### How It Works

1. The plugin includes a pre-built copy of `react-server-dom-esm` in `oss-experimental/`
2. A Vite alias plugin resolves all `react-server-dom-esm/*` imports to the vendored copy
3. Server-side entries are marked external during builds and resolved at runtime via `createRequire`
4. A Node.js register hook (`vite-plugin-react-server/register`) handles resolution outside of Vite

### Runtime Usage Outside Vite

If you run plugin utilities outside of Vite (e.g. startup scripts, SSR servers), add the register hook:

```bash
node --import vite-plugin-react-server/register ./your-script.mjs
```

### Updating the Vendored Copy

Plugin maintainers can refresh the vendored `react-server-dom-esm` from React source:

```bash
npm run experimental:build-oss
```

This clones `facebook/react`, builds the ESM transport, and copies it to `oss-experimental/`.

### React Version Requirements

- **Peer dependency**: `react >= 0.0.0-experimental-0` (React 19+ or experimental)
- **Recommended**: `react@19` and `react-dom@19` (or `react@experimental` for latest features)
- The plugin fixes CJS React named imports in both the server environment and RSC worker

### Package Exports for Patch

A patch script is available via the `./patch` export for plugin maintainers:

```json
{
  "./patch": "./bin/patch.mjs"
}
```

For most users, no patching is needed — the vendored copy works out of the box.

## Maintenance Guide

### Updating React Versions

When updating React:

1. **Install the new version**: `npm install react@19 react-dom@19` (or `react@experimental` for bleeding edge)
2. **Test builds**: Verify all build modes work correctly
3. **Run tests**: `npm test` to ensure compatibility

## Version-Specific Features

### React 18 Features

```typescript
// Automatic batching
setTimeout(() => {
  setCount(c => c + 1); // This will be batched
  setFlag(f => !f);     // This will be batched
}, 1000);

// Concurrent features
import { startTransition } from 'react';

function handleClick() {
  startTransition(() => {
    setCount(c => c + 1);
  });
}
```

### React 19 Features

```typescript
// New hooks (when available)
import { use, useActionState } from 'react';

// Server Actions with state
function MyForm() {
  const [state, formAction] = useActionState(async (prevState, formData) => {
    // Handle form submission
    return { message: 'Success!' };
  }, { message: '' });
  
  return (
    <form action={formAction}>
      <input name="name" />
      <button type="submit">Submit</button>
      {state.message && <p>{state.message}</p>}
    </form>
  );
}
```

### Experimental Features

```typescript
// Experimental React features
import { experimental_useOptimistic as useOptimistic } from 'react';

function TodoList() {
  const [todos, setTodos] = useState([]);
  const [optimisticTodos, addOptimisticTodo] = useOptimistic(
    todos,
    (state, newTodo) => [...state, newTodo]
  );
  
  return (
    <ul>
      {optimisticTodos.map(todo => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}
```

## Compatibility

This plugin works with React 19+ stable or experimental builds. The ESM transport (`react-server-dom-esm`) is vendored — consumers do not need to install it.

| React Version | Support | Notes |
|---------------|---------|-------|
| React 19+ stable | ✅ Full Support | Recommended |
| `react@experimental` | ✅ Full Support | Bleeding edge features |
| React 18 stable | ❌ Not supported | Missing RSC APIs |

Install:
```bash
npm install react@19 react-dom@19
```

## Troubleshooting

### Common Issues

1. **Type Errors**: Ensure TypeScript version is compatible
2. **Import Errors**: Check React version and patch configuration
3. **Build Errors**: Verify all dependencies are compatible
4. **Runtime Errors**: Check for experimental feature usage

### Getting Help

- Check the [React documentation](https://react.dev/)
- Consult the [plugin troubleshooting guide](./troubleshooting-guide.md)
- Enable `verbose: true` in plugin options for detailed logging

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
11.	**[React Compatibility](./react-type-compatibility.md) ← you are here**
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







