import { mkdir, writeFile } from "fs/promises";
import { resolve } from "path";

export async function setupIndexHTML(testDir: string) {
  await mkdir(testDir, { recursive: true });
  await mkdir(resolve(testDir, "src"), { recursive: true });
  await setupClientTSX(testDir);
  await writeFile(
    resolve(testDir, "index.html"),
    `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Test App</title>
    </head>
    <body>
      <div id="root"></div>
      <script type="module" src="/src/client.tsx"></script>
    </body>
  </html>
  `
  );
}

export async function setupClientTSX(testDir: string) {
  await writeFile(
    resolve(testDir, "src/client.tsx"),
    `import React from 'react'
  import { createRoot } from 'react-dom/client'
  const root = createRoot(document.getElementById('root')!)
  root.render(<div>Client App</div>)
  `
  );
}

export async function setupServerTSX(testDir: string) {
  await writeFile(
    resolve(testDir, "src/server.tsx"),
    `"use server"
  import React from 'react'
  export async function TestServerAction() {
    return <div>Server</div>
  }
  `
  );
}

export async function setupLinkClientTSX(testDir: string) {
  await mkdir(resolve(testDir, "src/components"), { recursive: true });
  // Create Link component
  await writeFile(
    resolve(testDir, "src/components/Link.client.tsx"),
    `"use client";
import React from 'react';

export function Link({ to, children }: { to: string, children: React.ReactNode }) {
  return <a href={to}>{children}</a>;
}`
  );
}
export async function setupPropsTS(testDir: string) {
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `
export const props = (url: string)=>({
  title: 'Test',
  url
})
`
  );
}

export async function setupPageTSX(testDir: string) {
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/test.module.css"),
    `.test {color: red}
.shared {background: white}
.unused {display: none}`
  );
  await setupLinkClientTSX(testDir);
  await setupPropsTS(testDir);
  // First page
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `
import React from 'react'
import styles from './test.module.css'
import { Link } from '../components/Link.client.js'
export function Page(props: any) {
  console.log("Test Page rendering", props, styles.test, styles.shared);
  return (
    <div className={styles.test}>
      <span className={styles.shared}>Page</span>
      <Link to="/page2">Go to Page 2</Link>
    </div>
  )
}
`
  );
}

export async function setupPageTSX2(testDir: string) {
  await mkdir(resolve(testDir, "src/page2"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page2/props.ts"),
    `
export const props = (url: string)=>({
  title: 'Test Page 2',
  url
})
`
  );

  await writeFile(
    resolve(testDir, "src/page2/test.module.css"),
    `.test {color: blue;}
.shared {background: gray;}
.unused {display: none;}`
  );
  await writeFile(
    resolve(testDir, "src/page2/page.tsx"),
    `import React from 'react'
  import styles from './test.module.css'
  export function Page() {
    return React.createElement('div', {className: styles.test}, 
      React.createElement('span', {className: styles.shared}, 'Test Page 2')
    )
  }
  `
  );
}

export async function setupTestServerActionJS(testDir: string) {
  // Use existing setup functions for basic structure
  await setupIndexHTML(testDir);


  // Create server actions 
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/actions.server.ts"),
    `"use server";

export async function add(a, b) {
  return a + b;
}

export async function subtract(a, b) {
  return a - b;
}`
  );
  await writeFile(
    resolve(testDir, "src/page/add.server.ts"),
    `
// only add is a server function, test must verify that only one is registered in client and BOTH are defined in server, but only one is registered.    
export async function add(a, b) {
 "use server";
  return a + b;
}

export async function subtract(a, b) {
  return a - b;
}`
  );

  
  await writeFile(
    resolve(testDir, "src/page/subtract.server.ts"),
    `
export async function add(a, b) {
  return a + b;
} 

async function subtract(a, b) {
 "use server";
  return a - b;
}


async function multiply(a, b) {
  "use server";
   return a * b;
 }
// export all, but only subtract and multiply are server functions
export { subtract, multiply};
`

  );

  // Create a client component that uses the actions
  await writeFile(
    resolve(testDir, "src/page/ClientComponent.client.tsx"),
    `"use client"
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
}`
  );

  // Create page component that uses both server actions and client component
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `import React from 'react';
import { ClientComponent } from './ClientComponent.client.js';

export async function Page({add, subtract}) {
  const addResult = await add(2, 3);
  const subtractResult = await subtract(5, 2);
  
  return (
    <div>
      <h1>Server Actions Test</h1>
      <p>Server-side Add: {addResult}</p>
      <p>Server-side Subtract: {subtractResult}</p>
      <ClientComponent add={add} subtract={subtract} />
    </div>
  );
}`
  );

  // Create props file
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `import * as actions from './actions.server.js';
export const props = async () => {
  return {
    add: actions.add,
    subtract: actions.subtract,
  };
};`
  );
}

export async function setupTodoTestProject(testDir: string) {
  // Use existing setup functions for basic structure
  await setupIndexHTML(testDir);
  await mkdir(resolve(testDir, "src/components"), { recursive: true });
  await mkdir(resolve(testDir, "src/page"), { recursive: true });

  // Create server actions
  await writeFile(
    resolve(testDir, "src/page/actions.server.ts"),
    `"use server"

type Todo = {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
};

let todos: Todo[] = [];

export async function getTodos(): Promise<Todo[]> {
  return todos;
}

export async function addTodo(title: string): Promise<{ success: boolean }> {
  const newTodo: Todo = {
    id: Date.now(),
    title,
    completed: false,
    created_at: new Date().toISOString()
  };
  todos = [...todos, newTodo];
  return { success: true };
}

export async function toggleTodo(id: number): Promise<{ success: boolean }> {
  todos = todos.map(todo => 
    todo.id === id ? { ...todo, completed: !todo.completed } : todo
  );
  return { success: true };
}

export async function deleteTodo(id: number): Promise<{ success: boolean }> {
  todos = todos.filter(todo => todo.id !== id);
  return { success: true };
}`
  );

  // Create client component for todo list
  await writeFile(
    resolve(testDir, "src/components/TodoList.client.tsx"),
    `"use client";

import React, { useState } from 'react';

type Todo = {
  id: number;
  title: string;
  completed: boolean;
  created_at: string;
};

type Props = {
  initialTodos: Todo[];
  addTodo: (title: string) => Promise<{ success: boolean }>;
  toggleTodo: (id: number) => Promise<{ success: boolean }>;
  deleteTodo: (id: number) => Promise<{ success: boolean }>;
  getTodos: () => Promise<Todo[]>;
};

export function TodoList({ initialTodos, addTodo, toggleTodo, deleteTodo, getTodos }: Props) {
  const [todos, setTodos] = useState<Todo[]>(initialTodos);
  const [newTodo, setNewTodo] = useState('');

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTodo.trim()) return;

    await addTodo(newTodo);
    setNewTodo('');
    const updatedTodos = await getTodos();
    setTodos(updatedTodos as Todo[]);
  }

  async function handleToggleTodo(id: number) {
    await toggleTodo(id);
    const updatedTodos = await getTodos();
    setTodos(updatedTodos as Todo[]);
  }

  async function handleDeleteTodo(id: number) {
    await deleteTodo(id);
    const updatedTodos = await getTodos();
    setTodos(updatedTodos as Todo[]);
  }

  return (
    <div>
      <h1>Todo List</h1>
      
      <form onSubmit={handleAddTodo}>
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo..."
        />
        <button type="submit">Add</button>
      </form>

      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggleTodo(todo.id)}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none' }}>
              {todo.title}
            </span>
            <button onClick={() => handleDeleteTodo(todo.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}`
  );

  // Create server page component
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `import React from 'react';
import { TodoList } from '../components/TodoList.client';
import type { Props } from './props.js';

export function Page({ todos, addTodo, toggleTodo, deleteTodo, getTodos }: Props) {
  return (
    <div>
      <TodoList 
        initialTodos={todos} 
        addTodo={addTodo}
        toggleTodo={toggleTodo}
        deleteTodo={deleteTodo}
        getTodos={getTodos}
      />
    </div>
  );
}`
  );

  // Create props file
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `import { addTodo, deleteTodo, getTodos, toggleTodo } from './actions.server.ts';

export const props = async () => {
  const todos = await getTodos();
  return {
    todos,
    addTodo,
    toggleTodo,
    deleteTodo,
    getTodos,
  };
};

export type Props = Awaited<ReturnType<typeof props>>;`
  );
}

export async function setupTestProject(testDir: string) {
  await setupIndexHTML(testDir);
  await mkdir(resolve(testDir, "src/components"), { recursive: true });

  // Create test files
  await setupServerTSX(testDir);
  await setupPageTSX(testDir);
  await setupPageTSX2(testDir);
}

export async function setupTestProjectEnv(testDir: string) {
  await setupIndexHTML(testDir);
  await setupPageTSX2(testDir);

  // Create a test page component
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await writeFile(
    resolve(testDir, "src", "page", "page.tsx"),
    `import React from "react";

export function Page(propsEnv) {
return (
  <div>
    <h1>Home Page</h1>
    <p>Base URL: {propsEnv.BASE_URL}</p>
    <p>Public: {propsEnv.PUBLIC_ORIGIN}</p>
    <p>Mode: {import.meta.env.MODE}</p>
    <p>Prod: {import.meta.env.PROD}</p>
    <p>Dev: {import.meta.env.DEV}</p>
    <p>SSR: {import.meta.env.SSR}</p>
    <p>URL: {import.meta.env.BASE_URL}</p>
    <p>Public Origin: {import.meta.env.PUBLIC_ORIGIN}</p>
  </div>
);
}`
  );
  await writeFile(
    resolve(testDir, "src", "page", "props.ts"),
    `export const props = ()=>import.meta.env;`
  );
}

export async function setupTestProjectPropsVariations(testDir: string) {
  // Create base directories
  await setupIndexHTML(testDir);
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await mkdir(resolve(testDir, "src/page2"), { recursive: true });
  await setupServerTSX(testDir);

  // Create a test page component
  await writeFile(
    resolve(testDir, "src", "page", "page.tsx"),
    `import React from "react";
export function props(){
    return import.meta.env;
}
export function Page(propsEnv) {
return (
  <div>
    <h1>Home Page</h1>
    <p>Base URL: {propsEnv.BASE_URL}</p>
    <p>Public: {propsEnv.PUBLIC_ORIGIN}</p>
    <p>Mode: {import.meta.env.MODE}</p>
    <p>Prod: {import.meta.env.PROD}</p>
    <p>Dev: {import.meta.env.DEV}</p>
    <p>SSR: {import.meta.env.SSR}</p>
    <p>URL: {import.meta.env.BASE_URL}</p>
    <p>Public Origin: {import.meta.env.PUBLIC_ORIGIN}</p>
  </div>
);
}`
  );
  // Create a test page component
  await writeFile(
    resolve(testDir, "src", "page2", "page.tsx"),
    `import React from "react";
export function Page({url, propsEnv = import.meta.env}) {
return (
  <div>
    <h1>Home Page for {new URL(import.meta.env.BASE_URL + url, import.meta.env.PUBLIC_ORIGIN + import.meta.env.BASE_URL).pathname}</h1>
    <p>Base URL: {propsEnv.BASE_URL}</p>
    <p>Public: {propsEnv.PUBLIC_ORIGIN}</p>
    <p>Mode: {import.meta.env.MODE}</p>
    <p>Prod: {import.meta.env.PROD}</p>
    <p>Dev: {import.meta.env.DEV}</p>
    <p>SSR: {import.meta.env.SSR}</p>
    <p>URL: {import.meta.env.BASE_URL}</p>
    <p>Public Origin: {import.meta.env.PUBLIC_ORIGIN}</p>
  </div>
);
}`
  );
}

export async function setupErrorBoundaryTestProject(testDir: string) {
  // Setup basic structure
  await setupIndexHTML(testDir);
  
  // Create fallback page for root route
  await mkdir(resolve(testDir, "src/page"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/page.tsx"),
    `import React from "react";
export function Page(props: any) {
  return (
    <div>
      <h1>Error Boundary Test Home</h1>
      <p>This is the fallback page</p>
    </div>
  );
}`
  );
  
  await writeFile(
    resolve(testDir, "src/page/props.ts"),
    `export const props = (url: string) => ({
  title: "Error Boundary Test",
  url
});`
  );
  
  // Create ErrorMessage component
  await mkdir(resolve(testDir, "src/components"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/components/ErrorMessage.tsx"),
    `"use client";
import React from "react";

export function ErrorMessage({ error }: { error: { message: string; stack?: string } }) {
  return (
    <div data-testid="error-boundary">
      <h2>Error</h2>
      <p data-testid="error-message">{error.message}</p>
      {error.stack && (
        <details>
          <summary>Stack trace</summary>
          <pre>{error.stack}</pre>
        </details>
      )}
    </div>
  );
}`
  );

  // Create ErrorBoundary component using the provided code
  await writeFile(
    resolve(testDir, "src/components/ErrorBoundary.client.tsx"),
    `"use client";
import React from "react";
import { ErrorMessage } from "./ErrorMessage.js";

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
    console.log("[ErrorBoundary] Caught error:", error.message);
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      if (this.state.error) {
        return (
          <ErrorMessage
            error={{
              message: this.state.error.message,
              stack: this.state.error.stack,
            }}
          />
        );
      }
      return <div>Error</div>;
    }
    return this.props.children;
  }
}`
  );

  // Create TestError component that throws an error
  await writeFile(
    resolve(testDir, "src/components/TestError.tsx"),
    `import React from "react";
export function TestError({ throwError }: { throwError: boolean }) {
  if (throwError) {
    throw new Error("test error example");
  }
  return <div>No error</div>;
}`
  );

  // Create server error page
  await mkdir(resolve(testDir, "src/page/server-error-example"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/server-error-example/props.ts"),
    `export const props = (url: string) => {
  const result = {
    throwError: true,
    title: "Server Error Example",
    url
  };
  return result;
};`
  );

  await writeFile(
    resolve(testDir, "src/page/server-error-example/page.tsx"),
    `import React from "react";
import { TestError } from "../../components/TestError.js";

export function Page(props: any) {
  return (
    <>
      <title>{props.title}</title>
      <div>
        <p>This page should show an error.</p>
        <TestError throwError={props.throwError} />
      </div>
    </>
  );
}`
  );

  // Create client error page  
  await mkdir(resolve(testDir, "src/page/client-error-example"), { recursive: true });
  await writeFile(
    resolve(testDir, "src/page/client-error-example/props.ts"),
    `export const props = (url: string) => ({
  throwError: true,
  title: "Client Error Example",
  url
});`
  );

  await writeFile(
    resolve(testDir, "src/page/client-error-example/page.tsx"),
    `import React from "react";
import { ClientErrorComponent } from "./ClientErrorComponent.client.js";

export function Page(props: any) {
  return (
    <>
      <title>{props.title}</title>
      <div>
        <ClientErrorComponent throwError={props.throwError} />
      </div>
    </>
  );
}`
  );

  await writeFile(
    resolve(testDir, "src/page/client-error-example/ClientErrorComponent.client.tsx"),
    `"use client";
import React from "react";
import { ErrorBoundary } from "../../components/ErrorBoundary.client.js";

function ThrowingComponent({ throwError }: { throwError: boolean }) {
  if (throwError) {
    throw new Error("Client component error");
  }
  return <div>No error</div>;
}

export function ClientErrorComponent({ throwError }: { throwError: boolean }) {
  return (
    <ErrorBoundary>
      <p>This should show a client error.</p>
      <ThrowingComponent throwError={throwError} />
    </ErrorBoundary>
  );
}`
  );
}
