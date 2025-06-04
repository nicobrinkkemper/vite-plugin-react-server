# Server Actions

Server Actions are a powerful feature that allows you to define server-side functions that can be called directly from your React components. This guide will show you how to implement and use server actions in your application.

## Important Disclaimers

1. **Experimental Feature**: use Server Actions at your own risk.
2. **ESM modules**: Server Actions work through native ESM modules and can be used to stream static build output
3. **Hosting Requirements**: You need a Node.js environment to run server actions. They cannot be used with static hosting alone.
4. **Database Considerations**: Server actions that interact with databases need proper connection handling and error management.

## Table of Contents

- [Basic Concepts](#basic-concepts)
- [Creating Server Actions](#creating-server-actions)
- [Using Server Actions in Components](#using-server-actions-in-components)
- [Form Handling](#form-handling)
- [Error Handling](#error-handling)
- [Optimistic Updates](#optimistic-updates)
- [Advanced Patterns](#advanced-patterns)
- [Database Integration](#database-integration)
- [Static Rendering](#static-rendering)
- [Server Hosting](#server-hosting)

## Basic Concepts

Server Actions are functions that run on the server but can be called from the client. They are marked with the `'use server'` directive and can be used to perform server-side operations like database updates, file operations, or API calls.

## Creating Server Actions

Server actions are defined in files with the `.server.ts` extension. Here's a practical example using SQLite:

```typescript
// src/server/actions/todoActions.server.ts
"use server";

import sqlite from "node:sqlite";

// Initialize database
const db = new sqlite.DatabaseSync("todos.db", {
  open: true,
});

// Create table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  ) STRICT
`);

// Server action to fetch todos
export async function getTodos() {
  const stmt = db.prepare("SELECT * FROM todos ORDER BY created_at DESC");
  const results = stmt.all();
  return results.map((todo) => ({
    ...todo,
    completed: Boolean(todo.completed),
  }));
}

// Server action to add a todo
export async function addTodo(title: string) {
  try {
    const stmt = db.prepare(
      "INSERT INTO todos (title) VALUES (?) RETURNING id"
    );
    const result = stmt.get(title) as { id: number } | undefined;
    return { success: true, id: result?.id };
  } catch (error) {
    console.error("Error adding todo:", error);
    return { success: false };
  }
}

// Server action to toggle todo completion status
export async function toggleTodo(id: number) {
  try {
    const stmt = db.prepare(
      "UPDATE todos SET completed = NOT completed WHERE id = ?"
    );
    stmt.run(id);
    return { success: true };
  } catch (error) {
    console.error("Error toggling todo:", error);
    return { success: false };
  }
}

// Server action to delete a todo
export async function deleteTodo(id: number) {
  try {
    const stmt = db.prepare("DELETE FROM todos WHERE id = ?");
    stmt.run(id);
    return { success: true };
  } catch (error) {
    console.error("Error deleting todo:", error);
    return { success: false };
  }
}

// Server action to edit a todo
export async function editTodo(id: number, title: string) {
  try {
    const stmt = db.prepare("UPDATE todos SET title = ? WHERE id = ?");
    stmt.run(title, id);
    return { success: true };
  } catch (error) {
    console.error("Error editing todo:", error);
    return { success: false };
  }
}

// Server action to clear completed todos
export async function clearCompletedTodos() {
  try {
    const stmt = db.prepare("DELETE FROM todos WHERE completed = 1");
    stmt.run();
    return { success: true };
  } catch (error) {
    console.error("Error clearing completed todos:", error);
    return { success: false };
  }
}
```

## Using Server Actions in Components

Server actions can be passed to client components and used there. Here's how it works:

```typescript
// src/page/todos/props.ts
import {
  addTodo,
  toggleTodo,
  deleteTodo,
  editTodo,
  clearCompletedTodos,
  getTodos,
} from "../../server/actions/todoActions.server.js";

// Define the props function that returns the server actions and initial data
export const props = async () => {
  const initialTodos = await getTodos();

  return {
    addTodo,
    toggleTodo,
    deleteTodo,
    editTodo,
    clearCompletedTodos,
    getTodos,
    initialTodos,
  };
};

// Use Awaited<ReturnType<typeof props>> to infer the final Props type send to Page / TodoList
export type Props = Awaited<ReturnType<typeof props>>;
```

```tsx
// src/page/todos/page.tsx
import { TodoList } from "../../components/TodoList.client.js";
import type { Props } from "./props.js";

export async function Page(props: Props) {
  return (
    <div>
      <TodoList {...props} />
    </div>
  );
}
```

```tsx
// src/components/TodoList.client.tsx
"use client";

import { useState } from "react";
import type { Props } from "../page/todos/props.js";

export function TodoList({
  initialTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  editTodo,
  clearCompletedTodos,
  getTodos,
}: Props) {
  const [todos, setTodos] = useState(initialTodos);
  const [newTodo, setNewTodo] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;

    const result = await addTodo(newTodo);
    if (result.success) {
      const updatedTodos = await getTodos();
      setTodos(updatedTodos);
      setNewTodo("");
    }
  };

  const handleToggle = async (id: number) => {
    const result = await toggleTodo(id);
    if (result.success) {
      const updatedTodos = await getTodos();
      setTodos(updatedTodos);
    }
  };

  const handleDelete = async (id: number) => {
    const result = await deleteTodo(id);
    if (result.success) {
      const updatedTodos = await getTodos();
      setTodos(updatedTodos);
    }
  };

  const handleEdit = async (id: number, title: string) => {
    const result = await editTodo(id, title);
    if (result.success) {
      const updatedTodos = await getTodos();
      setTodos(updatedTodos);
    }
  };

  const handleClearCompleted = async () => {
    const result = await clearCompletedTodos();
    if (result.success) {
      const updatedTodos = await getTodos();
      setTodos(updatedTodos);
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="What needs to be done?"
        />
        <button type="submit">Add Todo</button>
      </form>

      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggle(todo.id)}
            />
            <input
              type="text"
              value={todo.title}
              onChange={(e) => handleEdit(todo.id, e.target.value)}
            />
            <button onClick={() => handleDelete(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>

      <button onClick={handleClearCompleted}>Clear Completed</button>
    </div>
  );
}
```

This pattern shows how to:

1. Define server actions in a `.server.ts` file
2. Use `Awaited<ReturnType<typeof props>>` to infer the Props type from the props function
3. Pass them through props or import them
4. Use them in a client component (marked with 'use client')
5. Handle state updates and optimistic UI updates
6. Maintain type safety across the server-client boundary

The key benefits of this approach are:

- Server actions are available anywhere and it's clear which are needed
- Client components can use them as regular functions
- Type safety is maintained throughout
- State management is handled properly
- Error handling is consistent

## Form Handling

Server actions work seamlessly with HTML forms. The form's action prop can directly reference a server action:

```tsx
// src/page/todos/page.tsx
import { addTodo } from "../actions.server";

export default function TodoForm() {
  return (
    <form action={addTodo}>
      <input
        type="text"
        name="title"
        placeholder="What needs to be done?"
        required
      />
      <button type="submit">Add Todo</button>
    </form>
  );
}
```

## Error Handling

Server actions can handle errors and return them to the client:

```typescript
// src/page/actions.server.ts
"use server";

export async function addTodo(title: string) {
  try {
    if (!title.trim()) {
      throw new Error("Title cannot be empty");
    }

    const todo = await db.todos.create({
      data: {
        title,
        completed: false,
      },
    });

    revalidatePath("/todos");
    return { success: true, data: todo };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "An error occurred",
    };
  }
}
```

## Optimistic Updates

You can implement optimistic updates with server actions:

```tsx
// src/page/todos/page.tsx
import { useTransition } from "react";
import { toggleTodo } from "../actions.server";

export default function TodoItem({ todo }) {
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    // Optimistically update the UI
    const optimisticTodo = { ...todo, completed: !todo.completed };

    startTransition(() => {
      toggleTodo(todo.id);
    });
  };

  return (
    <li className={isPending ? "opacity-50" : ""}>
      <input type="checkbox" checked={todo.completed} onChange={handleToggle} />
      {todo.title}
    </li>
  );
}
```

## Common Pitfalls

1. **Missing 'use server' directive**: Always include the 'use server' directive at the top of server action files.
2. **Security issues**: Never expose sensitive operations to the client.

## Static Rendering

When building your application, server actions are transformed into different outputs:

1. **Client Build** (`dist/client/`):

   - Contains the client-side code that calls server actions during ssr
   - Example: `dist/client/page/todos.js`

2. **Server Build** (`dist/server/`):

   - Contains the server-side implementation of actions, pages, props and others
   - Example: `dist/server/actions/todoActions.js`

3. **Static Build** (`dist/static/`):
   - Contains static assets and initial HTML and RSC files
   - Example: `dist/static/index.html` and `index.rsc` next to each other

While it is totally possible to include the output of the database in the static render, the static render will not handle the fact that a common static-host can't actually respond to the server action in any meaningful way.

If you want dynamic server actions you have to make sure that you also HOST your server modules, much like this plugin hosts your modules during development. If the server actions work both in the client environment's "rsc-worker" and the server environment's main thread, then
you choose between deciding your own server setup.


When running in non-production mode, `react-server-dom-esm/server` will be transformed to `react-server-dom-esm/server.node` instead. This is to support vitest module resolution.

## Server Hosting

To host an application with server actions:

1. **Build the Application**:

   ```bash
   npm run build
   ```

2. **Start the Server**:

   ```bash
   node dist/server/index.js
   ```

3. **Environment Setup**:
   - Set up your database connection
   - Configure environment variables
   - Set up proper error handling
   - Always use VITE_ prefix for variables

### .env

```env
VITE_BASE_URL=$BASE_URL
VITE_PUBLIC_ORIGIN=$PUBLIC_ORIGIN
VITE_GITHUB_ACTIONS=$GITHUB_ACTIONS
```

Mapping your environment variables like this ensures they're able to reach all the different boundaries.

Server actions can be used and passed around via Page streams

### Transformations

Example of how a server action is transformed from original:

```typescript
"use server";

export function add(a, b) {
  return a + b;
}

export function subtract(a, b) {
  return a - b;
}
```

To

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

```typescript
await handleRscStream(`http://localhost:${port}/index.rsc`);
```

Or call your server action directly by sending a post message to the module.

```typescript
await handleRscPost(`http://localhost:${port}/src/action.server.tsx#add', 1, 1)
```

## Conclusion

Server Actions provide a powerful way to handle server-side operations in your React application. They simplify the development process by allowing you to write server-side code directly in your React components while maintaining type safety and security.

## Limitations

Server action are not as powerful as pages, because they do not support the css collection and custom prop function out of the box. While
they could be used to stream React components, generally it is used for sending mutations to the server like the todo app in demo shows.
Try to keep the return value simple and update the state on the client side on success indicator. 
