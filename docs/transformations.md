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
11.	[React Compatibility](./react-type-compatibility.md)
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







