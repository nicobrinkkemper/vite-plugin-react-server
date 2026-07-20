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
// src/routes/todos/props.ts   (fileRouter("src/routes") — see Routing)
import { addTodo, getTodos } from "../../actions/todos.server.js";

export const props = async () => {
  const todos = await getTodos();
  return { todos, addTodo, getTodos };
};

export type Props = Awaited<ReturnType<typeof props>>;
```

```tsx
// src/routes/todos/page.tsx
import { TodoList } from "../../components/TodoList.client.js";
import type { Props } from "./props.js";

export const Page = (props: Props) => <TodoList {...props} />;
```

```tsx
// src/components/TodoList.client.tsx
"use client";
import { useState } from "react";
import type { Props } from "../routes/todos/props.js";

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

Actions can be dispatched in three ways; the first is what the official demo
runs and the right default:

**1. The baked gate, worker-free, no `--conditions` (primary).** `build.edge`
bakes a sealed action gate into `dist/server-edge/render.js` as
`handleRouteAction`. A plain Node process dispatches through it:

```bash
npm run build
NODE_ENV=production node server.js   # plain node — no --conditions
```

```ts
// server.js
import { createRequestHandler, toNodeListener } from "vite-plugin-react-server/request-handler";
import * as bundle from "./dist/server-edge/render.js";

const app = createRequestHandler({
  staticDir: "dist/static",
  action: bundle.handleRouteAction,   // the baked sealed gate
});
```

> ⚠️ In this no-`--conditions` process, never statically import (or re-export)
> your built `*.server.*` modules — they import the react-server transport at
> load, which asserts the condition and crashes the server at startup. The
> baked gate owns them; dispatch through `handleRouteAction`. See
> [Edge / Single-Isolate](./edge.md) for the full note.

**2. A `--conditions react-server` main thread.** Host `dist/server` directly
under the condition and use the sealed `handleServerAction` helper below.

**3. The dev/worker path.** In dev and in worker-based prod serving, the
client environment's `rsc-worker` dispatches actions; nothing to wire.

See [Build Output](./build-output.md) and [Edge / Single-Isolate](./edge.md)
for server setup details.

## Security

A server action is a callable endpoint. The client POSTs a reference id of the
form `<base><path>#<export>` and the server runs the matching function. That id
is attacker-controllable, so resolving it is a trust boundary. vprs renders
through the ESM transport, which on its own resolves a reference by the path the
id encodes with only a prefix check, no allowlist, so the boundary has to be
enforced one level up.

The baked `handleRouteAction` gate (hosting mode 1) is sealed the same way —
its allowlist is enumerated at build time and compiled in, so nothing below
needs configuring there. The rest of this section describes the on-disk
helper for hosting mode 2.

**`handleServerAction` seals automatically — you do not pass anything extra.**
This is the `--conditions react-server` variant of the condition-split
`vite-plugin-react-server/helpers` export; under the default condition the
same import resolves to the worker-delegating variant, which requires a
worker and takes none of these options — use the baked gate there instead. A
Web-standard `(Request) => Response` sibling, `handleServerActionRequest`, is
what the baked gate itself wraps. In
production it reads the build's server manifest from
`<serverRoot>/.vite/manifest.json` and resolves the id through a sealed allowlist:
an id the build never emitted is rejected before any import, and the importer is
bound to the manifest's real file, never to a path derived from the id.

```ts
import { handleServerAction } from "vite-plugin-react-server/helpers";

// Default build layout (dist/server): nothing else needed — this is sealed.
await handleServerAction(req, res, { projectRoot });

// Custom build output? Point it at the server dir; still no manifest to load.
await handleServerAction(req, res, { projectRoot, serverRoot, base });
```

`serverRoot` defaults to `<projectRoot>/dist/server`; pass it only if you changed
`build.outDir`. You can also pass `serverManifest` directly to override (e.g. a
manifest you already hold). The manifest lookup is cached, so it reads disk once.

It **fails closed**: if no manifest can be found and you are not in the dev path,
the handler refuses the request rather than falling back to unsealed resolution.
A missing manifest is a misconfiguration (wrong `serverRoot`, or an unbuilt tree),
and silently reopening the boundary would defeat the point. If you hit this in
production, point `serverRoot` at your build's server dir (or pass `serverManifest`).
The underlying primitive is exported as `vite-plugin-react-server/references`
(`createSealedServerReferenceGate`) if you wire your own handler.

The only unsealed path is development: the Vite dev wrapper sets `devOpen`, which
resolves actions on demand against live source (project-root resolution with a
traversal guard, no build manifest exists yet). That is **not** a trust boundary —
it is reachable only via the dev wrapper, never from a missing manifest in prod.

Two more notes:

- A static (no-server) build has no runtime to POST to, so it has no server
  action surface at all.
- Keep the dev server off untrusted networks (its on-demand resolver is not a
  trust boundary).

Whatever resolves the id, these stay yours per action:

- Validate and authorize every argument. Treat all of them as untrusted input.
- Do not close over secrets in an action you hand to a client component. The ESM
  transport serializes a reference for that function and does not encrypt the
  values it captures, so treat anything an exposed action closes over as visible
  to the client. Pass an id and look the value up on the server instead.

### Endpoint hardening

The sealed gate decides *which function* a request may resolve — it confirms the
*target* is a real action, not that the *caller* is allowed to call it or that the
request is well-sized. Two opt-in options on `handleServerAction` cover the
endpoint itself; both are off by default so they never silently change an existing
deploy:

```ts
await handleServerAction(req, res, {
  projectRoot,
  allowedOrigins: ["https://app.example.com"], // CSRF guard (see below)
  maxBodyBytes: 1024 * 1024,                    // reject bodies over 1 MiB with 413
});
```

- **`allowedOrigins` (CSRF / cross-origin).** A server action is a cookie-bearing,
  state-changing POST, so a page on another origin can drive a logged-in user's
  browser to invoke one. When set, a request whose `Origin` header is present and
  not in the allowlist is rejected with `403` before the action runs (mirrors
  Next's `serverActions.allowedOrigins`). A *missing* `Origin` is allowed: a page
  cannot suppress it on a cross-origin browser POST, so its absence means
  same-origin or a non-browser client, which is not a CSRF vector.
- **`maxBodyBytes` (DoS).** The handler buffers the POST body in memory to decode
  the arguments. When set, a body exceeding the cap is rejected with `413` before
  it is fully buffered, so an unauthenticated client cannot exhaust memory.

Error responses never include a stack trace — only `{ success: false, error }`.
The full error (with stack) goes to the server log via your Vite logger, not to
the client. If you mount your own handler instead of `handleServerAction`, keep
the same three properties: an origin check, a body cap, and no stack in the
response.

## Limitations

- Server actions don't support CSS collection or custom prop functions
- Keep return values simple — use success indicators and update client state accordingly
- Always use `"use server"` directive (file-level or function-level)
- Never expose sensitive operations without proper authorization
