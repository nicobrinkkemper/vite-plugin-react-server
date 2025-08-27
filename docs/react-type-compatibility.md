# React Compatibility

This guide covers React version compatibility, type system overview, and the patch system for maintaining compatibility across different React versions.

## Type System Overview

The plugin uses generic types that adapt to your React version and prevent compatibility issues:

```tsx
import React from "react";
import type { HtmlProps } from "vite-plugin-react-server/types";
import { Css } from "vite-plugin-react-server/components";

type MyHtmlProps = HtmlProps<
  // pageProps: defaults, we always pass the title prop
  {
    title: string;
  },
  // inline: boolean, will type cssFiles to either link or tag props
  boolean,
  // as: div, we want to use a div as the root element, any div prop is a valid root prop.
  "div"
>;

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
          as={"div"}
          id="root"
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

## Patch System

The plugin includes a patch system to maintain compatibility with different React versions and experimental features.

### React Version Compatibility

The patch system ensures compatibility across React versions:

```typescript
// patch-system.ts
interface PatchConfig {
  reactVersion: string;
  patches: Patch[];
  conditions: string[];
}

interface Patch {
  name: string;
  description: string;
  apply: (code: string) => string;
  test: (code: string) => boolean;
}
```

### Creating Patches

Create custom patches for specific React versions or experimental features:

```typescript
// custom-patch.ts
import { createPatch } from "vite-plugin-react-server/patch-system";

export const reactExperimentalPatch = createPatch({
  name: "react-experimental",
  description: "Support for React experimental features",
  
  apply(code: string): string {
    // Apply experimental React features
    return code
      .replace(/react@experimental/g, "react")
      .replace(/react-dom@experimental/g, "react-dom");
  },
  
  test(code: string): boolean {
    return code.includes("react@experimental") || 
           code.includes("react-dom@experimental");
  }
});
```

### Patch Configuration

Configure patches in your plugin options:

```typescript
export const config = {
  // ... other options
  patches: {
    enabled: true,
    patches: [
      "react-experimental",
      "react-server-dom-esm",
      "custom-patch"
    ],
    autoApply: true,
    validateAfterApply: true
  }
};
```

### Built-in Patches

The plugin includes several built-in patches:

#### React Experimental Patch

```typescript
// Handles React experimental imports
export const reactExperimentalPatch = {
  name: "react-experimental",
  apply(code: string): string {
    return code
      .replace(/from ['"]react@experimental['"]/g, 'from "react"')
      .replace(/from ['"]react-dom@experimental['"]/g, 'from "react-dom"');
  }
};
```

#### React Server DOM ESM Patch

```typescript
// Handles react-server-dom-esm imports
export const rscEsmPatch = {
  name: "react-server-dom-esm",
  apply(code: string): string {
    return code
      .replace(/react-server-dom-esm\/server\.node/g, "react-server-dom-esm/server")
      .replace(/react-server-dom-esm\/client\.node/g, "react-server-dom-esm/client");
  }
};
```

#### TypeScript Patch

```typescript
// Handles TypeScript-specific issues
export const typescriptPatch = {
  name: "typescript",
  apply(code: string): string {
    return code
      .replace(/import type \{([^}]+)\} from ['"]react['"]/g, 
               'import { $1 } from "react"')
      .replace(/import type \{([^}]+)\} from ['"]react-dom['"]/g, 
               'import { $1 } from "react-dom"');
  }
};
```

## Maintenance Guide

### Updating React Versions

When updating React versions:

1. **Check Compatibility**: Verify the new React version is supported
2. **Update Dependencies**: Update React and related packages
3. **Test Patches**: Ensure existing patches still work
4. **Update Types**: Update TypeScript types if needed
5. **Test Builds**: Verify all build modes work correctly

### Creating New Patches

To create a new patch:

```typescript
// new-patch.ts
import { createPatch } from "vite-plugin-react-server/patch-system";

export const myCustomPatch = createPatch({
  name: "my-custom-patch",
  description: "Custom patch for specific functionality",
  
  apply(code: string): string {
    // Your patch logic here
    return modifiedCode;
  },
  
  test(code: string): boolean {
    // Test if patch should be applied
    return shouldApplyPatch(code);
  },
  
  validate(code: string): boolean {
    // Validate the patched code
    return isValidCode(code);
  }
});
```

### Patch Testing

Test patches thoroughly:

```typescript
// patch.test.ts
import { describe, it, expect } from 'vitest';
import { myCustomPatch } from './my-custom-patch';

describe('My Custom Patch', () => {
  it('should apply patch correctly', () => {
    const input = 'original code';
    const expected = 'patched code';
    
    const result = myCustomPatch.apply(input);
    expect(result).toBe(expected);
  });
  
  it('should detect when patch is needed', () => {
    const code = 'code that needs patching';
    expect(myCustomPatch.test(code)).toBe(true);
  });
  
  it('should validate patched code', () => {
    const patchedCode = 'valid patched code';
    expect(myCustomPatch.validate(patchedCode)).toBe(true);
  });
});
```

### Patch Debugging

Debug patch issues:

```typescript
// Enable patch debugging
export const config = {
  // ... other options
  patches: {
    enabled: true,
    debug: true, // Enable debug logging
    logLevel: 'verbose', // Detailed logging
    validateAfterApply: true,
    failOnError: false // Don't fail build on patch errors
  }
};
```

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

## Compatibility Matrix

| React Version | Server Components | Client Components | Server Actions | TypeScript |
|---------------|-------------------|-------------------|----------------|------------|
| 18.0+         | ✅ Full Support   | ✅ Full Support   | ✅ Full Support | ✅ Full Support |
| 19.0+         | ✅ Full Support   | ✅ Full Support   | ✅ Full Support | ✅ Full Support |
| Experimental  | ⚠️ Partial       | ⚠️ Partial       | ⚠️ Partial     | ⚠️ Partial |

### Migration Guide

#### From React 17 to 18

1. **Update Dependencies**:
   ```bash
   npm install react@^18.0.0 react-dom@^18.0.0
   ```

2. **Update Root Rendering**:
   ```typescript
   // Before (React 17)
   import { render } from 'react-dom';
   render(<App />, document.getElementById('root'));
   
   // After (React 18)
   import { createRoot } from 'react-dom/client';
   const root = createRoot(document.getElementById('root'));
   root.render(<App />);
   ```

3. **Enable Concurrent Features**:
   ```typescript
   // Use startTransition for non-urgent updates
   import { startTransition } from 'react';
   
   function handleClick() {
     startTransition(() => {
       setCount(c => c + 1);
     });
   }
   ```

#### From React 18 to 19

1. **Update Dependencies**:
   ```bash
   npm install react@^19.0.0 react-dom@^19.0.0
   ```

2. **Update Server Actions**:
   ```typescript
   // New useActionState hook
   import { useActionState } from 'react';
   
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

## Troubleshooting

### Common Issues

1. **Type Errors**: Ensure TypeScript version is compatible
2. **Import Errors**: Check React version and patch configuration
3. **Build Errors**: Verify all dependencies are compatible
4. **Runtime Errors**: Check for experimental feature usage

### Debug Configuration

```typescript
export const config = {
  // ... other options
  debug: {
    reactVersion: true,
    patchSystem: true,
    typeChecking: true
  }
};
```

### Getting Help

- Check the [React documentation](https://react.dev/)
- Review [React Server Components RFC](https://github.com/reactjs/rfcs/pull/189)
- Consult the [plugin troubleshooting guide](./troubleshooting-guide.md) 

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







