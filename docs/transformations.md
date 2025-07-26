

## Transformations

Example of how a server action is transformed from original:

```typescript
"use server";

export async function add(a, b) {
  return a + b;
}

export async function subtract(a, b) {
  return a - b;
}
```

To dist/server

```typescript
import { registerServerReference } from "react-server-dom-esm/server.node";
function add(a, b) {
  return a + b;
}
function subtract(a, b) {
  return a - b;
}
registerServerReference(add, "/src/page/actions.server.ts", "add");
registerServerReference(subtract, "/src/page/actions.server.ts", "subtract");
export {
  add,
  subtract
};
```

On the client and static builds, these are omitted.

The client boundary will be transformed from original:

```typescript
// Original client component
"use client"
import React from 'react';
const { useState } = React;

export function ClientComponent({add, subtract}) {
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    try {
      const sum = await add(2, 3);
      setResult(sum);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSubtract = async () => {
    try {
      const diff = await subtract(5, 2);
      setResult(diff);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <button onClick={handleAdd}>Add 2 + 3</button>
      <button onClick={handleSubtract}>Subtract 5 - 2</button>
      {result !== null && <p>Result: {result}</p>}
      {error && <p>Error: {error}</p>}
    </div>
  );
}
```

To something like this for browsers:

```typescript
import{R as e}from"../index-CpGtqe5P.js";const{useState:a}=e;function d({add:s,subtract:o}){const[l,r]=a(null),[c,n]=a(null),u=async()=>{try{const t=await s(2,3);r(t),n(null)}catch(t){n(t.message)}},m=async()=>{try{const t=await o(5,2);r(t),n(null)}catch(t){n(t.message)}};return e.createElement("div",null,e.createElement("button",{onClick:u},"Add 2 + 3"),e.createElement("button",{onClick:m},"Subtract 5 - 2"),l!==null&&e.createElement("p",null,"Result: ",l),c&&e.createElement("p",null,"Error: ",c))}export{d as ClientComponent};

```

And something like this for the client boundary

```typescript
import React from "react";
const { useState } = React;
function ClientComponent({ add, subtract }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const handleAdd = async () => {
    try {
      const sum = await add(2, 3);
      setResult(sum);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };
  const handleSubtract = async () => {
    try {
      const diff = await subtract(5, 2);
      setResult(diff);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };
  return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("button", { onClick: handleAdd }, "Add 2 + 3"), /* @__PURE__ */ React.createElement("button", { onClick: handleSubtract }, "Subtract 5 - 2"), result !== null && /* @__PURE__ */ React.createElement("p", null, "Result: ", result), error && /* @__PURE__ */ React.createElement("p", null, "Error: ", error));
}
export {
  ClientComponent
};

```

And the server boundary:

```typescript
import { registerClientReference } from "react-server-dom-esm/server";
const Link = registerClientReference(
  function () {
    throw new Error(
      "Attempted to call Link() from the server but Link is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
    );
  },
  "/components/Link.client-CnBCzH8H.js",
  "Link"
);
export { Link };
```

The component implementation is stripped, and the imports are removed.

```typescript
// Transformed client code
import { registerClientReference } from "react-server-dom-esm/server";
const TodoList = registerClientReference(
  function () {
    throw new Error(
      "Attempted to call TodoList() from the server but TodoList is on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component."
    );
  },
  "/components/TodoList.client-xOHJR0LY.js",
  "TodoList"
);
export { TodoList };
```

<!-- AUTO-GENERATED-TOC-START -->

## 📚 Documentation Navigation

## Table of Contents

1.	[Getting Started](./getting-started.md)
	- [Installation and Setup](./getting-started.md#installation-and-setup)
	- [Basic Configuration](./getting-started.md#basic-configuration)
	- [Example Projects](./getting-started.md#example-projects)

2.	[Core Concepts](./core-concepts.md)
	- [Client-Server Separation](./core-concepts.md#client-server-separation)
	- [React Server Components](./core-concepts.md#react-server-components)
	- [Plugin Architecture](./core-concepts.md#plugin-architecture)

3.	[Configuration](./configuration.md)
	- [Plugin Options](./configuration.md#plugin-options)
	- [Routing Configuration](./configuration.md#routing-configuration)
	- [Build Configuration](./configuration.md#build-configuration)

4.	[Component Resolution](./component-resolution.md)
	- [Path-based vs Direct Components](./component-resolution.md#path-based-vs-direct-components)
	- [When to Use Each Approach](./component-resolution.md#when-to-use-each-approach)
	- [Migration Guide](./component-resolution.md#migration-guide)

5.	[CSS Handling](./css-handling.md)
	- [CSS Collectors](./css-handling.md#css-collectors)
	- [Inline CSS](./css-handling.md#inline-css)
	- [Custom CSS Processing](./css-handling.md#custom-css-processing)

6.	[Server Actions](./server-actions.md)
	- [Creating Server Actions](./server-actions.md#creating-server-actions)
	- [Client Integration](./server-actions.md#client-integration)
	- [Error Handling](./server-actions.md#error-handling)
	- [Database Integration](./server-actions.md#database-integration)

7.	[Static Site Generation](./static-site-generation.md)
	- [Static Plugin](./static-site-generation.md#static-plugin)
	- [Build Process](./static-site-generation.md#build-process)
	- [Deployment Strategies](./static-site-generation.md#deployment-strategies)

8.	[Build Orchestration](./build-orchestration.md)
	- [Multiple Build Targets](./build-orchestration.md#multiple-build-targets)
	- [Plugin Architecture](./build-orchestration.md#plugin-architecture)
	- [Environment-Specific Builds](./build-orchestration.md#environment-specific-builds)

9.	[Architecture](./architecture.md)
	- [Design Philosophy](./architecture.md#design-philosophy)
	- [Environment Variables](./architecture.md#environment-variables)
	- [Plugin Composition](./architecture.md#plugin-composition)
	- [HTML Component Support](./architecture.md#html-component-support)

10.	[Advanced Topics](./advanced-topics.md)
	- [Custom Workers](./advanced-topics.md#custom-workers)
	- [Message System](./advanced-topics.md#message-system)
	- [Extending the Plugin](./advanced-topics.md#extending-the-plugin)

11.	[API Reference](./api-reference.md)
	- [Plugin Options](./api-reference.md#plugin-options)
	- [Component Props](./api-reference.md#component-props)
	- [Worker Messages](./api-reference.md#worker-messages)
	- [Type Definitions](./api-reference.md#type-definitions)

12.	**[Transformations](./transformations.md) ← you are here**
	- [Code Transformations](./transformations.md#code-transformations)
	- [Directive Handling](./transformations.md#directive-handling)
	- [Build Output Examples](./transformations.md#build-output-examples)

13.	[Loader](./loader.md)
	- [React Server Components Loader](./loader.md#react-server-components-loader)
	- [Directive Processing](./loader.md#directive-processing)
	- [Module Boundaries](./loader.md#module-boundaries)
	- [Custom Registration Functions](./loader.md#custom-registration-functions)

14.	[Patch System](./patch-system.md)
	- [React Version Compatibility](./patch-system.md#react-version-compatibility)
	- [Creating Patches](./patch-system.md#creating-patches)
	- [Maintenance Guide](./patch-system.md#maintenance-guide)

15.	[Practical Guide](./practical-guide.md)
	- [Real-world Examples](./practical-guide.md#real-world-examples)
	- [Debugging Features](./practical-guide.md#debugging-features)
	- [Production Implementations](./practical-guide.md#production-implementations)

16.	[Troubleshooting Guide](./troubleshooting-guide.md)
	- [Common Issues](./troubleshooting-guide.md#common-issues)
	- [Debugging Tips](./troubleshooting-guide.md#debugging-tips)
	- [Performance Optimization](./troubleshooting-guide.md#performance-optimization)

### Quick Links
- [🏠 Main Documentation](./README.md)
- [🚀 Getting Started](./getting-started.md)
- [📖 GitHub Repository](https://github.com/nicobrinkkemper/vite-plugin-react-server)
- [🎮 Official Demo](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official)

---

<!-- AUTO-GENERATED-TOC-END -->