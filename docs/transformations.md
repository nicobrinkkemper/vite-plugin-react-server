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