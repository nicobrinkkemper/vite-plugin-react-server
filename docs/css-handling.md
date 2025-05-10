# CSS Handling in RSC Static Site Generator

This document explains how CSS is handled in the React Server Components (RSC) static site generator.

## Key Features

The CSS handling system provides three main features that can be used independently or in combination:

1. **User-defined CssCollector**: 
   -  **CssCollector: `(props)=><link href="my-file"/>`**
2. **Alters the props for the CssCollector**
   - **css.inlineCss**: Feature flag to inline CSS content based on a size threshold
   - **css.purgeCss**: Feature flag to omit unused css modules for a given page
   - **css.inlineThreshold**: Size in bytes (number)
   

   - **inlinePatterns**: optional regex to force a `<style>` tag
   - **linkPatterns**: optional regex to force a `<link>` tag


## Default Configuration

```typescript
{
  CSS_COLLECTOR: CssCollector,
  CSS: {
    inlineCss: false,
    purgeCss: false, // not supported yet, for future reference
    inlineThreshold: 4096, // 4KB
    inlinePatterns: [/\.module\.css$/], // Always inline CSS modules
    linkPatterns: [/node_modules/], // Always link node_modules CSS
  }
}
```

## When to Change the Defaults

- **For smaller applications**: Enable `inlineCss` for faster page loads
- **For white-label applications**: Using `purgeCss` may help reduce the overall size of the css, making inlining more viable and use of dynamic classes possible on a module by module basis - not class by class.

- **For custom needs**: Implement your own `CssCollector` component

## User-defined CssCollector

### Props Interface

The props your custom collector receives depend on the `inlineCss` option:

```typescript
// Base props interface
interface CssCollectorProps {
  cssFiles: CssContent[];
  root: string;
  moduleBaseURL: string;
  moduleBasePath: string;
  moduleRootPath: string;
  route: string;
  purgeCss?: boolean;
  children?: React.ReactNode;
}

// Extended props when inlineCss is true
interface InlineCssCollectorProps extends CssCollectorProps {
  cssFiles: CssContent[];  // Contains the actual CSS content
}
```

### Basic Implementation

```typescript
function MyCustomCssCollector(props: CssCollectorProps | InlineCssCollectorProps) {
  // Check if we're in inline mode
  const isInlineMode = 'content' in props.cssFiles[0];
  
  return (
    <>
      {props.cssFiles.map(file => 
        isInlineMode ? (
          <style key={file.path} dangerouslySetInnerHTML={{ __html: file.content }} />
        ) : (
          <link key={file.path} rel="stylesheet" href={file.path} />
        )
      )}
      {props.children}
    </>
  );
}
```

## Inline CSS Feature

When `inlineCss` is enabled:

1. CSS content is loaded and processed during render
2. The content is inlined within `<style>` tags
3. The `InlineCssCollector` component is used (unless overridden)

### Configuration Options

- **inlinePatterns**: Files matching these patterns are always inlined
- **linkPatterns**: Files matching these patterns are always linked

### About inlineThreshold (Planned Feature)

The `inlineThreshold` option is a planned feature that will allow you to control which CSS files get inlined based on their size:

- Files smaller than the threshold (in bytes) will be inlined
- Files larger than the threshold will be linked instead

This is useful for optimizing performance by:
- Inlining small CSS files to reduce HTTP requests
- Avoiding inlining large CSS files that would bloat the HTML document

**Note:** This feature is currently on the roadmap and not yet implemented. The configuration option exists in the type definitions, but the actual functionality will be added in a future release.

## PurgeCSS Feature

When `purgeCss` is enabled:

1. A global class registry (`__USED_CSS_CLASSES__`) tracks used CSS classes
2. During SSR, used classes are recorded
3. After rendering, unused CSS files are removed from the output

This feature is particularly useful for large applications with many CSS files.

## CSS Class Tracking

The CSS class tracking system works in conjunction with the RSC stream to capture which CSS classes are actually used during server-side rendering. This is particularly important for the `purgeCss` feature.

### How Class Tracking Works (Example)

Say we have a whitelabel application and we want to make new CSS themes for it easily. We have a file for each theme containing css variables and we have a "barrel file" that exports all our themes.

```tsx
// themes/A.moduie.css
.Theme {
    --color: red;
} 
// themes/B.module.css
.Theme {
    --color: green;
} 
// themes/index.ts
export A from "A.module.css"
export B from "B.module.css"
// props.ts
export const props = (url)=>{
  if(url === '/B') return {theme: 'B'}
  return {theme: 'A'}
}
// Page.tsx
import * as themes from "./css/index.js"

export const Page = ({theme}:{themeX: 'A' | 'B'})=>{
  <div className={themes[theme]['Theme']}>
      You are using theme: {theme}
  </div>
}
```

Now this will work fine, but the program will include both themes even though only one is used. Especially when inlining all these files, it becomes counter productive. The `purgeCss` feature counters this by emitting the link tags last, and only if at least one class is used. Since our props are static, and we want to use the static generator, we can go ahead and turn on purgeCss.

```
{
  css: {
    purgeCss: true,
    inlineThreshold: 4096
  }
}


1. **Initial Collection**: CSS files are collected from the bundle manifest and module graph. This may initially contain a lot more than is actually needed as explained in previous example.


2. **RSC Stream Processing**: 
   - The RSC stream is created and processed on the main thread
   - Components using CSS modules are rendered
   - Class usage is tracked via the CSS module proxy
3. **Shell Ready Event**: 
   - When the worker client-side stream's shell is ready, we emit an event from the worker
   - The main thread for static rendering determines that all classes by now should be used
   - The RSC stream continues streaming and ends with all the link tags
   - The link tags have precedence high and bubble to top
4. **Final Processing**:
   - If `purgeCss` is enabled files that have 0 used classes are omitted from the stream
   - If a file has any usages at all - it will be included
   - CSS files are either inlined or linked based on configuration threshold

### Integration with PurgeCSS

When `purgeCss` is enabled:

1. The class tracking system captures all used classes during RSC rendering
2. After the shell is ready, we have a complete picture of which classes are used
3. The `css.collect` event includes this information
4. The CSS collector can then use this information to:
   - Remove unused classes from inlined CSS
   - Filter out unused CSS files
   - Optimize the final CSS output

## Practical Example: Advanced CssCollector

Here's a practical example that handles different CSS file types differently:

```typescript
import React from 'react';
import type { CssCollectorProps, InlineCssCollectorProps, CssContent } from './types';

type Props = CssCollectorProps | InlineCssCollectorProps;

function AdvancedCssCollector(props: Props) {
  const { cssFiles, purgeCss } = props;
  const isInlineMode = 'content' in cssFiles[0];

  const handleCssFile = (file: CssContent) => {
    const filePath = file.path;
    
    // Use a switch case to handle different CSS file types
    switch (true) {
      // Case 1: Always inline critical CSS files
      case filePath.includes('critical.css'):
        return isInlineMode ? (
          <style key={filePath}>{file.content}</style>
        ) : (
          <link key={filePath} rel="stylesheet" href={filePath} />
        );

      // Case 2: Always link external CSS files from CDN
      case filePath.startsWith('https://'):
        return <link key={filePath} rel="stylesheet" href={filePath} />;

      // Case 3: Handle CSS modules with special attributes
      case filePath.includes('.module.css'):
        return isInlineMode ? (
          <style 
            key={filePath} 
            data-module="true"
            dangerouslySetInnerHTML={{ __html: file.content }} 
          />
        ) : (
          <link 
            key={filePath} 
            rel="stylesheet" 
            href={filePath}
            data-module="true"
          />
        );

      // Case 4: Handle vendor CSS with preload
      case filePath.includes('vendor.css'):
        return (
          <>
            <link 
              key={`preload-${filePath}`}
              rel="preload"
              href={filePath}
              as="style"
            />
            <link 
              key={filePath}
              rel="stylesheet" 
              href={filePath}
            />
          </>
        );

      default:
        return <link key={filePath} rel="stylesheet" href={filePath} />
    }
  };

  return (
    <>
      {cssFiles.map(handleCssFile)}
      {props.children}
    </>
  );
}

export default AdvancedCssCollector;
```

### Features of the Advanced Collector

1. **Type Safety**: Handles both inline and non-inline modes
2. **Flexible Handling**: Different strategies based on file characteristics
3. **Performance Optimization**: 
   - Preloads vendor CSS files
   - Inlines critical CSS when possible
   - Handles CDN files appropriately
4. **Module Support**: Special handling for CSS modules
5. **Fallback Strategy**: Default case for standard CSS files

### Configuration Example

```typescript
{
  CssCollector: AdvancedCssCollector,
  CSS: {
    inlineCss: true,
    inlineThreshold: 4096,
    inlinePatterns: [/\.module\.css$/, /critical\.css$/],
    linkPatterns: [/node_modules/, /vendor\.css$/]
  }
}
```

- Use `purgeCss` only for dynamic css cases, like themes
- Helps make less http calls 

### For Performance Optimization
- Use CSS modules for component-specific styles
- Enable both `inlineCss` and `purgeCss` for optimal performance
- Monitor the size of inlined CSS to avoid large HTML documents

## Combining Features

The features can be used in various combinations:

1. **Basic Usage**: Default CssCollector with no inlining or purging
2. **Optimized Bundle**: Inline CSS + PurgeCSS for smallest possible output
3. **Custom Handling**: User CssCollector + selected features

## Configuration Example

```typescript
{
  // Use custom collector
  CssCollector: MyCustomCssCollector,
  
  // Enable features
  inlineCss: true,
  purgeCss: true,
  
  // Custom CSS settings
  CSS: {
    inlineThreshold: 8192, // 8KB
    inlinePatterns: [
      /\.module\.css$/,
      /\.critical\.css$/
    ],
    linkPatterns: [
      /node_modules/,
      /\.vendor\.css$/
    ]
  }
}
```

This example demonstrates several advanced features:

1. **Type Safety**: Properly handles both inline and non-inline modes using TypeScript
2. **Flexible Handling**: Uses a switch case to apply different strategies based on file characteristics
3. **Performance Optimization**: 
   - Preloads vendor CSS files
   - Inlines critical CSS when possible
   - Handles CDN files appropriately
4. **Module Support**: Special handling for CSS modules with data attributes
5. **Fallback Strategy**: Default case for standard CSS files

To use this collector, you would configure it like this:

```typescript
{
  CssCollector: AdvancedCssCollector,
  inlineCss: true,
  purgeCss: true,
  CSS: {
    inlineThreshold: 4096,
    inlinePatterns: [/\.module\.css$/, /critical\.css$/],
    linkPatterns: [/node_modules/, /vendor\.css$/]
  }
}
```

This collector provides a good balance between performance and flexibility, while demonstrating how to handle different CSS file types appropriately based on their characteristics and usage patterns. 