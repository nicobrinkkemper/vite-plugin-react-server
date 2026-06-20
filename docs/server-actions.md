# Server Actions

Server actions are functions marked with `"use server"` that run on the server but can be called from client components.

> **Experimental feature.** Requires a Node.js server — static hosting alone cannot handle server action requests.

## Creating Server Actions

```ts
// src/actions/todos.server.ts
"use server";

export async function addTodo(title: string) {
  // Database operations, file I/O, etc.
  return { success: true };
}

export async function getTodos() {
  return [{ id: 1, title: "Example", completed: false }];
}
```

## Passing Actions to Components

Use the props file to wire server actions into your page:

```ts
// src/pages/props.ts
import { addTodo, getTodos } from "../../actions/todos.server.js";

export const props = async () => {
  const todos = await getTodos();
  return { todos, addTodo, getTodos };
};

export type Props = Awaited<ReturnType<typeof props>>;
```

```tsx
// src/pages/page.tsx
import { TodoList } from "../../components/TodoList.client.js";
import type { Props } from "./props.js";

export const Page = (props: Props) => <TodoList {...props} />;
```

```tsx
// src/components/TodoList.client.tsx
"use client";
import { useState } from "react";
import type { Props } from "../pages/props.js";

export function TodoList({ todos: initial, addTodo, getTodos }: Props) {
  const [todos, setTodos] = useState(initial);
  const [input, setInput] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    await addTodo(input);
    setTodos(await getTodos());
    setInput("");
  };

  return (
    <form onSubmit={handleAdd}>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button type="submit">Add</button>
      <ul>{todos.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
    </form>
  );
}
```

## Directive Placement

File-level — marks all exports as server actions:

```ts
"use server";
export async function myAction() { /* ... */ }
```

Function-level — marks individual functions:

```ts
export async function myAction() {
  "use server";
  // ...
}
```

`"use client"` must always be file-level (first line).

## Build Transformation

Server actions are transformed differently per build target:

**Server build** — `registerServerReference` is added:

```ts
import { registerServerReference } from "react-server-dom-esm/server";
registerServerReference(addTodo, "/src/actions/todos.server.ts", "addTodo");
```

**Client/static builds** — server actions are excluded.

## Hosting

To run server actions in production, you need to host the server modules:

```bash
npm run build
node --conditions react-server dist/server/index.js
```

Server actions work in both the client environment's `rsc-worker` and the server environment's main thread. See [Build Output](./build-output.md) and [Examples](./examples.md) for server setup details.

## Security

A server action is a callable endpoint. The client POSTs a reference id of the
form `<base><path>#<export>` and the server runs the matching function. vprs
resolves that id through a sealed reference gate, rather than importing a path
derived from the id.

- The gate is built from the build's own manifest. An id maps to a real built
  module by exact lookup, and the importer is bound to that module, never to
  anything parsed out of the incoming id. An id the build never emitted does not
  resolve, so `../` path traversal is structurally impossible, and an export that
  was not registered as a server reference is rejected.
- In production the gate is sealed: an unknown id throws, with no on-demand
  import fallback. Development keeps an open fallback for iteration speed; that is
  not a trust boundary and is not meant to face untrusted clients.
- A static (no-server) build has no runtime to POST to, so it has no server
  action surface at all.

The gate decides *which* functions are reachable, not *what* arguments they
accept. Inside each action you still own the rest:

- Validate and authorize every argument. Treat all of them as untrusted input.
- Do not close over secrets in an action you hand to a client component. The ESM
  transport serializes a reference for that function and does not encrypt the
  values it captures, so treat anything an exposed action closes over as visible
  to the client. Pass an id and look the value up on the server instead.

## Limitations

- Server actions don't support CSS collection or custom prop functions
- Keep return values simple — use success indicators and update client state accordingly
- Always use `"use server"` directive (file-level or function-level)
- Never expose sensitive operations without proper authorization
