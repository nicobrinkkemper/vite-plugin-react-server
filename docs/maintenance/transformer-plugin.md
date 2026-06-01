# Plugin Internals

This guide covers the internal workings of the Vite React Server Plugin, including the transformation process, loader system, and custom loaders.

## Transformation Process

The transformer plugin is the core component that handles React Server Components transformation logic.

### Plugin Implementation

The transformer plugin operates in the "post" enforcement phase to handle transformations at the last moment:

```typescript
export function reactTransformPlugin(options: StreamPluginOptions): Plugin {
  return {
    name: "vite-plugin-react-server:transformer",
    enforce: "post",
    
    transform(code, id) {
      return transformModuleIfNeeded(code, id, options);
    },
    
    generateBundle(options, bundle) {
      // Handle bundle generation
    }
  };
}
```

### Transformation Process

The transformation process follows these steps:

1. **Module Identification**: Determine if a module needs transformation
2. **AST Parsing**: Parse the code into an Abstract Syntax Tree
3. **Directive Detection**: Identify "use client" and "use server" directives
4. **Code Transformation**: Apply appropriate transformations
5. **Code Generation**: Generate the final transformed code

### Module Transformation

```typescript
function transformModuleIfNeeded(
  code: string, 
  id: string, 
  options: StreamPluginOptions
): string | null {
  // Check if module needs transformation
  if (!shouldTransform(id, options)) {
    return null;
  }
  
  // Parse AST
  const ast = parse(code, {
    sourceType: "module",
    ecmaVersion: "latest",
    plugins: ["jsx", "typescript"]
  });
  
  // Transform directives
  const transformedAst = transformDirectives(ast, options);
  
  // Generate code
  return generate(transformedAst, {
    retainLines: true,
    retainFunctionParens: true
  }).code;
}
```

## Loader System

The plugin includes a comprehensive loader system for handling different module types and environments.

### React Server Components Loader

The RSC loader handles server-side React components:

```typescript
// rsc-loader.js
import { register } from "vite-plugin-react-server/loader";

export function rscLoader(url, context, nextLoad) {
  if (url.endsWith('.server.js') || url.endsWith('.server.tsx')) {
    return {
      format: 'module',
      source: `
        import { registerServerReference } from 'react-server-dom-esm/server';
        ${context.source}
      `,
    };
  }
  return nextLoad(url, context);
}

register(rscLoader);
```

### CSS Loader

The CSS loader handles CSS modules and preprocessing:

```typescript
// css-loader.js
import { preprocessCSS } from "vite";

export async function cssLoader(url, context, nextLoad) {
  if (url.endsWith('.css') || url.endsWith('.module.css')) {
    const processed = await preprocessCSS(context.source, url, context.config);
    return {
      format: 'module',
      source: `export default ${JSON.stringify(processed)};`,
    };
  }
  return nextLoad(url, context);
}
```

### Environment Loader

The environment loader handles environment variables:

```typescript
// env-loader.js
export function envLoader(url, context, nextLoad) {
  if (url === 'virtual:env') {
    return {
      format: 'module',
      source: `
        export const env = ${JSON.stringify(process.env)};
        export const mode = '${context.mode}';
      `,
    };
  }
  return nextLoad(url, context);
}
```

## Directive Processing

The plugin processes React directives to determine module boundaries with intelligent context-aware validation.

### Client-Module Classification — single source

Every "is this a client module?" decision routes through `detectClientModule({ source, moduleId, parseFn? })` in `plugin/loader/directives/detectClientModule.ts`. The transformer passes Rollup's `this.parse`; the dev-server file watcher, worker react-loader, build auto-discover, and configurable `loader.*` defaults use the parser-free fallback (`sourceHasTopLevelClientDirective.ts`). Both paths agree on every well-authored case. The filename half is `CLIENT_FILENAME_PATTERN = /(^|[\/.])client\.[cm]?[jt]sx?$/` — covers the dotted-suffix convention and standalone `client.tsx`. The regex-and-matcher snippets below describe the underlying mechanics; do not re-implement them in new call sites.

### AutoDiscover — directive-only client modules

Filename-convention client modules (`Foo.client.tsx`) come from `createGlobAutoDiscover("**/*.client.*")`. Directive-only modules (`Counter.tsx` starting with `"use client"`) come from `createDirectiveClientAutoDiscover()` (`plugin/config/autoDiscover/createDirectiveClientAutoDiscover.ts`). The latter also filters out files referenced by `<projectRoot>/index.html` `<script type="module" src>` — required so Vite's own `index.html` manifest entry survives for `collectManifestCss(staticManifest, "index.html")` in `plugin/react-static/processCssFilesForPages.ts:34`.

### Directive Detection

```typescript
const DIRECTIVE_PATTERNS = {
  server: /^["']use server["'];?\s*$/gm,
  client: /^["']use client["'];?\s*$/gm,
  general: /^["']use (server|client)["'];?\s*$/gm
};

function detectDirectives(code: string): DirectiveInfo[] {
  const directives: DirectiveInfo[] = [];
  
  // Detect server directives
  const serverMatches = code.matchAll(DIRECTIVE_PATTERNS.server);
  for (const match of serverMatches) {
    directives.push({
      type: 'server',
      index: match.index!,
      line: getLineNumber(code, match.index!),
      context: getContext(code, match.index!)
    });
  }
  
  // Detect client directives
  const clientMatches = code.matchAll(DIRECTIVE_PATTERNS.client);
  for (const match of clientMatches) {
    directives.push({
      type: 'client',
      index: match.index!,
      line: getLineNumber(code, match.index!),
      context: getContext(code, match.index!)
    });
  }
  
  return directives;
}
```

### Context-Aware Validation

The plugin provides comprehensive validation with context-aware error messages:

```typescript
const DIRECTIVE_CONFIGS = {
  client: {
    functionLevel: false,
    validate: (params) => params.index === 0, // Must be at file start
    warning: "'use client' directive is only allowed at the top of a file"
  },
  server: {
    functionLevel: true,
    validate: (params) => {
      const before = params.code.slice(0, params.index).trim();
      return before === '' || before.endsWith('\n');
    },
    warning: "File-level directives must be at the top of the file"
  }
};

function validateDirective(directive: DirectiveInfo, code: string): ValidationResult {
  const config = DIRECTIVE_CONFIGS[directive.type];
  
  if (!config.validate({ ...directive, code })) {
    return {
      valid: false,
      error: config.warning,
      context: getErrorContext(directive, code)
    };
  }
  
  return { valid: true };
}
```

### Error Detection Categories

The plugin provides specific, actionable error messages for:

- **Nested Functions**: Detects directives in functions inside other functions
- **Class Methods**: Identifies directives in class method definitions  
- **Non-async Server Functions**: Validates that server directives are in async functions
- **Function Type Detection**: Provides context-specific messages for arrow functions, class methods, etc.

## Module Boundaries

The plugin manages client/server boundaries through module transformation.

### Client Boundary Management

```typescript
function createClientBoundary(code: string, options: LoaderOptions): string {
  const { registerClientReferenceName } = options;
  
  return `
    import { ${registerClientReferenceName} } from '${options.importClientPath}';
    
    // Register client reference
    ${registerClientReferenceName}(module.exports, '${getModuleId(code)}');
    
    ${code}
  `;
}
```

### Server Boundary Management

```typescript
function createServerBoundary(code: string, options: LoaderOptions): string {
  const { registerServerReferenceName } = options;
  
  return `
    import { ${registerServerReferenceName} } from '${options.importServerPath}';
    
    // Register server reference
    ${registerServerReferenceName}(module.exports, '${getModuleId(code)}');
    
    ${code}
  `;
}
```

### Custom Registration Functions

You can customize the registration functions:

```typescript
export const config = {
  // ... other options
  loader: {
    registerClientReferenceName: "registerClientComponent",
    registerServerReferenceName: "registerServerAction",
    importServerPath: "react-server-dom-esm/server.node",
    importClientPath: "react-server-dom-esm/client.node",
  }
};
```

## Custom Loaders

The plugin supports custom loaders for specialized file types and processing needs.

### Creating Custom Loaders

```typescript
// custom-loader.js
export function customLoader(url, context, nextLoad) {
  // Check if this loader should handle the URL
  if (!shouldHandle(url)) {
    return nextLoad(url, context);
  }
  
  try {
    // Process the module
    const processed = await processModule(url, context);
    
    return {
      format: 'module',
      source: processed.source,
      shortCircuit: true, // Prevent other loaders from processing
    };
  } catch (error) {
    // Handle errors
    throw new Error(`Custom loader error: ${error.message}`);
  }
}

function shouldHandle(url) {
  return url.endsWith('.custom') || url.startsWith('custom:');
}

async function processModule(url, context) {
  // Custom processing logic
  const content = await readFile(url);
  const processed = await transform(content);
  
  return {
    source: `export default ${JSON.stringify(processed)};`
  };
}
```

### Loader Configuration

Configure custom loaders in your plugin options:

```typescript
export const config = {
  // ... other options
  loader: {
    customLoaders: [
      {
        name: "custom-loader",
        pattern: /\.custom$/,
        loader: "./loaders/custom-loader.js"
      },
      {
        name: "markdown-loader",
        pattern: /\.md$/,
        loader: "./loaders/markdown-loader.js"
      }
    ]
  }
};
```

### Advanced Loader Examples

#### Markdown Loader

```typescript
// markdown-loader.js
import { marked } from 'marked';

export function markdownLoader(url, context, nextLoad) {
  if (url.endsWith('.md')) {
    const html = marked(context.source);
    return {
      format: 'module',
      source: `
        import React from 'react';
        export default function MarkdownContent() {
          return React.createElement('div', {
            dangerouslySetInnerHTML: { __html: ${JSON.stringify(html)} }
          });
        }
      `,
    };
  }
  return nextLoad(url, context);
}
```

#### JSON Schema Loader

```typescript
// schema-loader.js
import { validate } from 'jsonschema';

export function schemaLoader(url, context, nextLoad) {
  if (url.endsWith('.schema.json')) {
    const schema = JSON.parse(context.source);
    
    return {
      format: 'module',
      source: `
        export const schema = ${JSON.stringify(schema)};
        export function validate(data) {
          return validate(data, schema);
        }
      `,
    };
  }
  return nextLoad(url, context);
}
```

#### Virtual Module Loader

```typescript
// virtual-loader.js
export function virtualLoader(url, context, nextLoad) {
  if (url.startsWith('virtual:')) {
    const moduleName = url.slice(8); // Remove 'virtual:' prefix
    
    switch (moduleName) {
      case 'config':
        return {
          format: 'module',
          source: `
            export const config = ${JSON.stringify(context.config)};
            export const mode = '${context.mode}';
          `,
        };
      
      case 'routes':
        return {
          format: 'module',
          source: `
            export const routes = ${JSON.stringify(getRoutes())};
          `,
        };
      
      default:
        return nextLoad(url, context);
    }
  }
  return nextLoad(url, context);
}
```

## Loader Integration

### Integration with Vite

Custom loaders integrate seamlessly with Vite's module system:

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import { vitePluginReactServer } from "vite-plugin-react-server";

export default defineConfig({
  plugins: [
    vitePluginReactServer({
      // ... other options
      loader: {
        customLoaders: [
          {
            name: "my-loader",
            pattern: /\.my$/,
            loader: "./loaders/my-loader.js"
          }
        ]
      }
    })
  ]
});
```

### Loader Chaining

Loaders can be chained for complex processing:

```typescript
// loader-chain.js
export async function chainedLoader(url, context, nextLoad) {
  // First loader: Process TypeScript
  if (url.endsWith('.ts') || url.endsWith('.tsx')) {
    const tsResult = await processTypeScript(url, context);
    
    // Second loader: Process React components
    if (tsResult.source.includes('React')) {
      const reactResult = await processReact(tsResult.source, context);
      return reactResult;
    }
    
    return tsResult;
  }
  
  return nextLoad(url, context);
}
```

### Error Handling

Implement robust error handling in custom loaders:

```typescript
export function robustLoader(url, context, nextLoad) {
  try {
    // Loader logic
    return processModule(url, context);
  } catch (error) {
    // Log error for debugging
    console.error(`Loader error for ${url}:`, error);
    
    // Fallback to next loader
    return nextLoad(url, context);
  }
}
```

## Performance Optimization

### Loader Caching

Implement caching for expensive loader operations:

```typescript
const loaderCache = new Map();

export function cachedLoader(url, context, nextLoad) {
  const cacheKey = `${url}-${context.mode}`;
  
  if (loaderCache.has(cacheKey)) {
    return loaderCache.get(cacheKey);
  }
  
  const result = processModule(url, context);
  loaderCache.set(cacheKey, result);
  
  return result;
}
```

### Lazy Loading

Implement lazy loading for large modules:

```typescript
export function lazyLoader(url, context, nextLoad) {
  if (url.endsWith('.large')) {
    return {
      format: 'module',
      source: `
        export default import('${url}').then(m => m.default);
      `,
    };
  }
  return nextLoad(url, context);
}
```

## Testing Loaders

### Unit Testing

Test custom loaders in isolation:

```typescript
// loader.test.js
import { describe, it, expect } from 'vitest';
import { customLoader } from './custom-loader.js';

describe('Custom Loader', () => {
  it('should process custom files', async () => {
    const result = await customLoader(
      'test.custom',
      { source: 'test content', mode: 'development' },
      () => Promise.resolve({ format: 'module', source: 'fallback' })
    );
    
    expect(result.format).toBe('module');
    expect(result.source).toContain('processed');
  });
  
  it('should fallback for non-custom files', async () => {
    const fallback = { format: 'module', source: 'fallback' };
    const nextLoad = () => Promise.resolve(fallback);
    
    const result = await customLoader(
      'test.js',
      { source: 'test content', mode: 'development' },
      nextLoad
    );
    
    expect(result).toBe(fallback);
  });
});
```

### Integration Testing

Test loaders in the context of the full plugin:

<!-- TOC START -->

## 📚 Documentation Navigation

<!-- Auto-generated TOC - Do not edit manually -->

## Table of Contents

<!-- Auto-generated TOC - Do not edit manually -->



1.	[Getting Started](../getting-started.md)
2.	[Core Concepts](../core-concepts.md)
3.	[Configuration Guide](../configuration.md)
4.	[CSS & Styling](../css-handling.md)
5.	[Server Actions](../server-actions.md)
6.	[Build & Deployment](../build-orchestration.md)
7.	[Advanced Development](./advanced-topics.md)
8.	**[Plugin Internals](./transformer-plugin.md) ← you are here**
9.	[Worker System](./rsc-worker.md)
10.	[API Reference](../api-reference.md)
11.	[React Compatibility](../react-type-compatibility.md)
12.	[Troubleshooting](../troubleshooting-guide.md)
13.	[Package Exports](../package-exports.md)
14.	[Transformations](../transformations.md)

### Quick Links
- [🏠 Main Documentation](../README.md)
- [🚀 Getting Started](../getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- TOC END -->





```typescript
// integration.test.js
import { build } from 'vite';
import { defineConfig } from 'vite';
import { vitePluginReactServer } from 'vite-plugin-react-server';

describe('Loader Integration', () => {
  it('should process custom files in build', async () => {
    const config = defineConfig({
      plugins: [
        vitePluginReactServer({
          loader: {
            customLoaders: [
              {
                name: "test-loader",
                pattern: /\.custom$/,
                loader: "./test-loader.js"
              }
            ]
          }
        })
      ]
    });
    
    const result = await build(config);
    expect(result).toBeDefined();
  });
});
```



