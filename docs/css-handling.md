# CSS Handling in RSC Static Site Generator

This document explains how CSS is handled in the React Server Components (RSC) static site generator.

## Key Features

The CSS handling system provides three main features that can be used independently or in combination:

1. **User-defined CssCollector**: 
   -  **CssCollector: `(props)=><link href="my-file"/>`**
2. **Alters the props for the CssCollector**
   - **css.inlineCss**: Feature flag to disable inlining css completely
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

## User-defined CssCollector

### Props Interface

The props your custom collector receives depend on the imported css for each page & prop file combination.

```typescript
import styles from './styles.module.css';
export const Page = () => {
 return <div className={styles.userClass}>Hello World</div>
}
```  
then the module will basically contain whatever `styles` exported here. But how does it track css class usages
during streaming?
```ts
const links = Array.from(cssFiles.values()).map(cssFile => <link rel="stylesheet" href={cssFile.path} />)
```
The types for cssFiles is an array of either CssProps and or InlineCssProps.
```ts
type BaseCssProps = {
  as: string;
  id: string;
};

type CssProps = BaseCssProps & {
  as: "link";
  type?: never;
  children?: InlineCssProps extends false ? never : React.ReactNode;
  id: string;
  href: string;
  rel: "stylesheet";
  precedence?: string;
};
type InlineCssProps = BaseCssProps & {
  as: "style";
  type: "text/css";
  children?: React.ReactNode;
  precedence?: never;
  rel?: never;
  href?: never;
};
```

### Basic Implementation

```typescript
function MyCustomCssCollector(props: CssCollectorProps) {
  // Check if we're in inline mode
  const isInlineMode = 'content' in props.cssFiles[0];
  
  return (
    <>
      {props.cssFiles.map(cssFile => 
        cssFile.as === 'style' ? (
          <style key={cssFile.id} type={cssFile.type}>{cssFile.code}</style>
        ) : (
          <link key={cssFile.id} rel="stylesheet" href={cssFile.href} />
        )
      )}
      {props.children}
    </>
  );
}
```


### Configuration Options

- **inlinePatterns**: Files matching these patterns are always inlined
- **linkPatterns**: Files matching these patterns are always linked

### About inlineThreshold

The `inlineThreshold` feature will allow you to control which CSS files get inlined based on their size:

- Files smaller than the threshold (in bytes) will be inlined
- Files larger than the threshold will be linked instead

This is useful for optimizing performance by:
- Inlining small CSS files to reduce HTTP requests
- Avoiding inlining large CSS files that would bloat the HTML document


## PurgeCSS Feature

**Note:** This feature is currently on the roadmap and not yet implemented. The configuration option exists in the type definitions, but the actual functionality will be added in a future release.

When `purgeCss` is enabled:

1. A global class registry tracks used CSS classes
2. During SSR, used classes are recorded
3. After rendering, unused CSS files are removed from the output

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
  
  
  // Custom CSS settings
  CSS: {
    // Feature flags
    inlineCss: true,
    purgeCss: true,
    // actual config
    inlineThreshold: 8192, // 8KB
    inlinePatterns: [
      /\.inline\.css$/
    ],
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
  css: {
    inlineCss: true, // default
    purgeCss: true, // requires custom implementation
    inlineThreshold: 4096,
    inlinePatterns: [/\.module\.css$/, /critical\.css$/],
    linkPatterns: [/node_modules/, /vendor\.css$/]
  }
}
```

This collector provides a good balance between performance and flexibility, while demonstrating how to handle different CSS file types appropriately based on their characteristics and usage patterns. 