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
form `<base><path>#<export>` and the server runs the matching function. That id
is attacker-controllable, so resolving it is a trust boundary, and **on a
server-backed deploy that boundary is the server you run**. vprs renders through
the ESM transport, which on its own resolves a reference by the path the id
encodes with only a prefix check, no allowlist. There is no automatic sealed
resolver yet, so do not assume one.

The rule for your handler is simple: **resolve the incoming id against the
build's server manifest and reject anything not in it. Never `import()` a path
derived from the id.** The build writes that manifest
(`<serverRoot>/.vite/manifest.json`); its keys are the real server modules, which
is exactly the allowlist you want.

```ts
// Safe resolution sketch (the official demo, bidoof-template, has a full one)
const [key, exportName] = id.split("#");
const stripped = key.startsWith(base) ? key.slice(base.length) : key;
const file = serverSrcToFile.get(stripped);            // manifest lookup
if (!file) throw new Error("action not in manifest");  // reject unknown ids
const mod = await import(join(serverRoot, file));       // import the manifest's file, not the id
```

vprs ships the pieces for this: the server manifest above, and a reference-gate
primitive (`vite-plugin-react-server/references`, `createSealedServerReferenceGate`)
that wraps the lookup-or-throw. A built-in sealed resolver that wires this for you
is in progress; until it lands, add the manifest check yourself.

Two more notes:

- A static (no-server) build has no runtime to POST to, so it has no server
  action surface at all.
- In development vprs resolves actions on demand (it imports the path the id
  encodes) for iteration speed. That is **not** a trust boundary; keep the dev
  server off untrusted networks.

Whatever resolves the id, these stay yours per action:

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
