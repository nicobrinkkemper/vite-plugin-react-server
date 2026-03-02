# Error Handling

## Current State

The plugin uses standard `throw new Error()` and `try/catch` — there are no custom error classes, error codes, or centralized error handlers.

## Error Patterns in Use

### Loader Errors (compile time)

The transformer generates runtime throw stubs for cross-boundary misuse:

```typescript
// Server component imported on client → throws at call site
export const Foo = registerClientReference(
  function() { throw new Error("Attempted to call Foo() on the client"); },
  "src/Foo.tsx", "Foo"
);

// Client entry called from server
throw new Error('Client entry point was called from the server...');
```

### Configuration Errors (startup)

Loaders (`react-loader.ts`, `css-loader.ts`, `env-loader.ts`) validate resolved options and throw early:

```typescript
if (resolvedUserOptions.error) {
  throw resolvedUserOptions.error;
}
```

### Stream Errors (build time)

`createRenderToPipeableStreamHandler` logs render errors via `logger?.error()` and lets them propagate through the stream pipeline. No recovery is attempted — a failed page fails the build.

### Directive Warnings

`analyzeDirectives.ts` collects warnings for misplaced directives (e.g. `"use client"` inside a function body). In strict mode, warnings become thrown errors:

```typescript
throw new Error(warning.message);
```

