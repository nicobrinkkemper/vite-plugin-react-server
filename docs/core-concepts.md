# Core Concepts

This document explains the fundamental concepts and architecture of the Vite React Server Plugin.

## Client-Server Separation

The plugin enforces a **strict architectural separation** between client and server execution. This separation is achieved through:

1. **Distinct Entry Files**: Different entry points for client and server environments
2. **Separate Plugins**:
   - `vite-plugin-react-server/client` → Handles client-side rendering and ESM bundling
   - `vite-plugin-react-server/server` → Manages react-server condition thread streaming and ESM bundling

The main entry point `vite-plugin-react-server` automatically includes the right entry based on if `NODE_OPTIONS==--conditions react-server` is set.

## React Server Components (RSC)

React Server Components allow you to write UI that runs on the server and is streamed to the client. Key benefits include:

1. **Reduced Client-Side JavaScript**: Components that don't need interactivity can be rendered on the server
2. **Direct Backend Access**: Server components can directly access backend resources
3. **Progressive Enhancement**: The UI can be progressively enhanced with client components

The plugin leverages React's experimental `react-server-dom-esm` package to enable RSC streaming.

## Client Component Discovery

The plugin uses a convention-based approach for discovering client components:

Files with the `.client.` suffix (e.g., `Component.client.tsx`) are auto discovered.
This is needed in a couple of cases:

- The client component is only imported from a server component
- The client component is used as a boundary between server and client code

While it would be possible to scan the whole code base for the `"use client"` directive, this plugin only checks the file names.
Imagine a Page file:

```typescript
import { ErrorBoundary } from "../components/ErrorBoundary.client.js";
function TestError({ throwError }: { throwError: boolean }) {
  if (throwError) {
    throw new Error("test");
  }
  return null;
}

export const Page = (props: {}) => {
  return (
    <ErrorBoundary>
      <TestError throwError={true} />
    </ErrorBoundary>
  );
};
```

And the client side error boundary

```typescript
"use client";
import * as React from "react";

export class ErrorBoundary extends React.Component {
  public state: {
    hasError: boolean;
    error: Error | null;
  } = {
    hasError: false,
    error: null,
  };
  public props: {
    children: React.ReactNode;
  } = {
    children: null,
  };
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
    this.props = props;
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.state.error) {
        return (
          <div>
            <h1>Error</h1>
            <p>{this.state.error.message}</p>
            <p style={{ whiteSpace: "pre-wrap" }}>{this.state.error.stack}</p>
          </div>
        );
      }
      return <div>Error</div>;
    }
    return this.props.children;
  }
}
```

What should happen here? The error is on the server, but the ErrorBoundary is inheritely a client thing. Let's look at the stream it produces during development:

```text
5:I["/src/components/ErrorBoundary.client.tsx","ErrorBoundary"]
:N1746137013072.7915
1:[]
2:{"name":"CssCollectorInline","env":"Server","key":null,"owner":null,"stack":[["createRscStream","file:///vite-react-stream/dist/plugin/helpers/createRscStream.js",58,25],["createHandler","file:///vite-react-stream/dist/plugin/helpers/createHandler.js",33,26],["","file:///vite-react-stream/dist/plugin/react-server/server.js",88,31]],"props":{"moduleBase":"src","moduleBaseURL":"","moduleBasePath":"","moduleRootPath":"/bidoof-template/dist/server","projectRoot":"/bidoof-template","url":"/error-example","route":"/error-example","pageProps":{"throwError":true},"cssFiles":"$Q1","children":["$","$E((props) => {\n  return /* @__PURE__ */ __vite_ssr_import_0__.createElement((0,__vite_ssr_import_1__.ErrorBoundary), null, /* @__PURE__ */ __vite_ssr_import_0__.createElement(TestError, { throwError: props.throwError }));\n})",null,{"throwError":true},null,[["createRscStream","file:///vite-react-stream/dist/plugin/helpers/createRscStream.js",57,45],["createHandler","file:///vite-react-stream/dist/plugin/helpers/createHandler.js",33,26],["","file:///vite-react-stream/dist/plugin/react-server/server.js",88,31]],1]}}
0:D{"time":0.20284900000115158}
0:D"$2"
0:D{"time":0.24849800000083633}
4:{"name":"Page","env":"Server","key":null,"owner":null,"stack":[["createRscStream","file:///vite-react-stream/dist/plugin/helpers/createRscStream.js",57,45],["createHandler","file:///vite-react-stream/dist/plugin/helpers/createHandler.js",33,26],["","file:///vite-react-stream/dist/plugin/react-server/server.js",88,31]],"props":{"throwError":true}}
3:D{"time":0.2716480000017327}
3:D"$4"
3:D{"time":0.32005800000115414}
7:{"name":"TestError","env":"Server","key":null,"owner":null,"stack":[["Page","/bidoof-template/src/page/error-example/page.tsx",13,147]],"props":{"throwError":true}}
6:D{"time":0.3603380000022298}
6:D"$7"
6:D{"time":0.3780880000012985}
3:["$","$L5",null,{"children":"$L6"},null,[["Page","/bidoof-template/src/page/error-example/page.tsx",13,48]],1]
9:[]
a:{"name":"CssCollectorElements","env":"Server","key":null,"owner":"$2","stack":[["CssCollectorInline","file:///vite-react-stream/dist/plugin/css-collector-inline.js",13,100]],"props":{"cssFiles":"$Q9"}}
8:D{"time":0.44296699999904376}
8:D"$a"
8:D{"time":0.4560769999989134}
8:[]
0:["$3","$8"]
6:E{"digest":"","name":"Error","message":"test","stack":[["TestError","/bidoof-template/src/page/error-example/page.tsx",8,11]],"env":"Server"}
```
This information essentially renders the error message directly to your UI, using react. During production, this is information
you want to hide, which is what this plugin will manage for you.

## Plugin Architecture

### Plugin Composition

The plugin is designed with a modular architecture that allows you to pick and choose only the components you need:

- **Client Plugin**: Handles client-side rendering and ESM bundling
- **Server Plugin**: Manages server-side streaming and RSC processing
- **Static Plugin**: Handles static site generation

### Worker Architecture

The plugin uses a worker-based architecture for processing:

- **RSC Worker**: Used by the client plugin to create server-side streams
- **HTML Worker**: Used by the server plugin to create client-side HTML

You can customize these workers or opt out of using them entirely:

- To disable the RSC worker, don't serve the client plugin
- To disable the HTML worker, don't configure the `build.pages` option

### Built-in React Components

The plugin provides three built-in React components that can be customized:

1. **Html**: Used as the wrapper for production pages
2. **CssCollector**: Used to emit `<link>` tags 
3. **CssCollectorElements**: render only the `cssFiles` or `globalStyles` prop, useful for custom Html components

## Development vs. Production

The plugin behaves differently in development and production environments:

### Development Mode

In development mode:

- Vite's `index.html` is used as the html wrapper

### Production Mode

In production mode:

- The `Html` component is used as the html wrapper

## Static Site Generation

The plugin supports static site generation through the static plugin:

- Generates static HTML and RSC files for each configured build.pages
