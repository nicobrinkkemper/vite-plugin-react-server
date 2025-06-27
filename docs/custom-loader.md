# Custom React Loader

The plugin provides extensive customization options for how React directives are processed and transformed. This allows you to integrate with different React Server Components implementations, customize registration functions, and adapt the loader to your specific needs.

## Overview

The custom loader system allows you to:

- **Use different RSC implementations** (webpack, turbopack, custom)
- **Customize import paths** for registration functions
- **Override directive detection patterns** 
- **Configure environment-specific behavior**
- **Add custom validation logic**

## Basic Configuration

### Custom Import Paths

The most common customization is changing where registration functions are imported from:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Use webpack-based RSC implementation
      importServerPath: "react-server-dom-webpack/server",
      importClientPath: "react-server-dom-webpack/client",
      
      // Or use turbopack
      // importServerPath: "react-server-dom-turbopack/server",
      // importClientPath: "react-server-dom-turbopack/client",
    }
  }),
});
```

### Custom Registration Function Names

Some RSC implementations use different function names:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      registerServerReferenceName: "createServerReference",
      registerClientReferenceName: "createClientReference",
    }
  }),
});
```

## Environment-Specific Configuration

The loader automatically adapts to different environments, but you can override this:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      mode: "development", // or "production" | "test"
      
      // Development uses .node extensions for better debugging
      importServerPath: "react-server-dom-esm/server.node",
      importClientPath: "react-server-dom-esm/server.node",
    }
  }),
});
```

**Default Environment Behavior:**
- **Development**: Uses `.node` extensions for better error messages
- **Production**: Uses standard paths for optimal bundling
- **Test**: Uses `.node` extensions for consistent testing

## Advanced Customization

### Custom Directive Detection

You can customize how the loader detects server and client code:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      // Custom patterns for detecting server/client code
      isServerFunctionCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting server functions
        return code.includes('"use server"') || 
               moduleId?.includes('.server.') ||
               moduleId?.includes('/api/');
      },
      
      isClientComponentCode: (code: string, moduleId?: string) => {
        // Custom logic for detecting client components
        return code.includes('"use client"') ||
               moduleId?.includes('.client.') ||
               moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Custom Parser

For specialized TypeScript/JSX processing:

```typescript
import { parse } from 'acorn';
import { transformWithEsbuild } from 'vite';

export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      parse: async (source: string) => {
        // Custom parsing logic
        const result = await transformWithEsbuild(source, 'file.tsx', {
          loader: 'tsx',
          target: 'es2022',
        });
        
        return {
          ast: parse(result.code, { 
            ecmaVersion: 'latest', 
            sourceType: 'module' 
          }),
          code: result.code,
          map: result.map,
        };
      }
    }
  }),
});
```

## Real-World Examples

### Next.js Compatibility

Configure the loader to work with Next.js RSC:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-webpack/server.edge",
      importClientPath: "react-server-dom-webpack/client.edge",
      registerServerReferenceName: "registerServerReference",
      registerClientReferenceName: "registerClientReference",
      
      // Next.js uses different patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') || 
               moduleId?.endsWith('.server.js') ||
               moduleId?.includes('/app/') && !moduleId?.includes('/components/');
      },
    }
  }),
});
```

### Remix Integration

For Remix-style server functions:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "react-server-dom-esm/server",
      importClientPath: "react-server-dom-esm/client",
      
      // Remix patterns
      isServerFunctionCode: (code, moduleId) => {
        return code.includes('"use server"') ||
               moduleId?.includes('.server.') ||
               moduleId?.includes('/routes/') && code.includes('export async function');
      },
    }
  }),
});
```

### Custom RSC Implementation

For your own RSC implementation:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    loader: {
      importServerPath: "./lib/my-rsc/server",
      importClientPath: "./lib/my-rsc/client",
      registerServerReferenceName: "createServerAction",
      registerClientReferenceName: "createClientComponent",
      
      // Custom validation
      isServerFunctionCode: (code, moduleId) => {
        // Your custom logic here
        return code.includes('@server') || moduleId?.includes('_server');
      },
    }
  }),
});
```

## Transformation Examples

### Example Transformations

The loader transforms modules differently depending on the **environment** (client vs server):

#### Server Environment

**Client Component (becomes error-throwing stub):**
```typescript
// Input: Counter.client.tsx
"use client";
export function Counter() { return <div>count</div>; }

// Output: Error-throwing client reference
import { registerClientReference } from "react-server-dom-esm/server";
export const Counter = registerClientReference(function() { throw new Error("Attempted to call Counter() from the server but Counter is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."); }, "Counter.client.tsx", "Counter");
```

**Server Action (stays as-is with registration):**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: Registered server function
import { registerServerReference } from "react-server-dom-esm/server";


export async function createUser(data: FormData) {
  return { success: true };
}

registerServerReference(createUser, "/actions.server.js", "createUser");
```

#### Client Environment

**Client Component (runs as-is):**
```typescript
// Input: Counter.client.tsx  
"use client";
export function Counter() { return <div>count</div>; }

// Output: No transformation - runs directly
"use client";
export function Counter() { return <div>count</div>; }
```

**Server Action (becomes error-throwing stub):**
```typescript
// Input: actions.server.ts
"use server";
export async function createUser(data: FormData) {
  return { success: true };
}

// Output: Error-throwing server reference
import { registerServerReference } from "react-server-dom-esm/client";
export const createUser = registerServerReference(function() { throw new Error("Attempted to call createUser() on the client"); }, "actions.server.ts", "createUser");
```

## Testing Custom Loaders

Create test configurations for different scenarios:

```typescript
// test/custom-loader.test.ts
import { createTransformer } from "vite-plugin-react-server/loader";

const customLoaderConfig = {
  importServerPath: "my-custom-rsc/server",
  importClientPath: "my-custom-rsc/client",
  registerServerReferenceName: "myRegisterServer",
  registerClientReferenceName: "myRegisterClient",
  mode: "test",
};

const transformer = createTransformer({ 
  options: { 
    loader: customLoaderConfig,
    verbose: false 
  }
});

// Test your custom configuration
const result = await transformer(code, "test.ts");
expect(result.code).toContain('my-custom-rsc/server');
```

## Debugging Custom Loaders

Enable verbose logging to debug loader behavior:

```typescript
export default defineConfig({
  plugins: vitePluginReactServer({
    verbose: true, // Enable detailed logging
    loader: {
      // Your custom configuration
    }
  }),
});
```

This will output detailed information about:
- Module resolution
- Directive detection
- Transformation steps
- Registration function calls

## Common Patterns

### File-Based Routing

Automatically detect server/client based on file structure:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('/api/') ||
           moduleId?.includes('/server/') ||
           moduleId?.endsWith('.server.ts');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('/components/') ||
           moduleId?.includes('/ui/') ||
           moduleId?.endsWith('.client.tsx');
  },
}
```

### Monorepo Support

Handle different packages in a monorepo:

```typescript
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') ||
           moduleId?.includes('packages/server/') ||
           moduleId?.includes('apps/api/');
  },
  
  isClientComponentCode: (code, moduleId) => {
    return code.includes('"use client"') ||
           moduleId?.includes('packages/ui/') ||
           moduleId?.includes('apps/web/');
  },
}
```

## Error Handling

Custom loaders should handle errors gracefully:

```typescript
loader: {
  parse: async (source: string) => {
    try {
      // Your custom parsing logic
      return { ast, code, map };
    } catch (error) {
      console.error('Custom parser error:', error);
      // Fallback to default parser
      throw error;
    }
  }
}
```

## Performance Considerations

- **Caching**: Custom detection functions are called frequently - keep them fast
- **Regex Patterns**: Pre-compile regex patterns outside the functions
- **File System**: Avoid file system operations in detection functions

```typescript
// ✅ Good: Pre-compiled patterns
const SERVER_PATTERN = /\.(server|api)\./;
const CLIENT_PATTERN = /\.(client|component)\./;

loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && SERVER_PATTERN.test(moduleId));
  }
}

// ❌ Bad: Creating regex on every call
loader: {
  isServerFunctionCode: (code, moduleId) => {
    return code.includes('"use server"') || 
           (moduleId && /\.(server|api)\./.test(moduleId));
  }
}
```

## Integration with Build Tools

### Webpack Integration

```typescript
// For webpack-based builds
loader: {
  importServerPath: "react-server-dom-webpack/server",
  importClientPath: "react-server-dom-webpack/client",
}
```

### Rollup Integration

```typescript
// For Rollup-based builds  
loader: {
  importServerPath: "react-server-dom-esm/server",
  importClientPath: "react-server-dom-esm/client",
}
```

The custom loader system provides the flexibility to adapt the plugin to virtually any React Server Components implementation or build setup while maintaining type safety and performance.

