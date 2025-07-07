import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTodoTestProject } from '../setup';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';

describe('Todo Server Actions', () => {
  const testDir = resolve(__dirname, "../fixtures/todo.test");

  beforeAll(async () => {
    await setupTodoTestProject(testDir);
  });

  afterAll(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch (error) {
    }
  });

  it('should handle todo operations', async () => {
    const { getTodos, addTodo, toggleTodo, deleteTodo } = await import(resolve(testDir, 'src/page/actions.server.js'));

    // Initial state should be empty
    const initialTodos = await getTodos();
    expect(initialTodos).toEqual([]);

    // Add a todo
    await addTodo('Test todo');
    const todosAfterAdd = await getTodos();
    expect(todosAfterAdd).toHaveLength(1);
    expect(todosAfterAdd[0]).toMatchObject({
      title: 'Test todo',
      completed: false
    });

    // Toggle todo
    await toggleTodo(todosAfterAdd[0].id);
    const todosAfterToggle = await getTodos();
    expect(todosAfterToggle[0].completed).toBe(true);

    // Delete todo
    await deleteTodo(todosAfterToggle[0].id);
    const todosAfterDelete = await getTodos();
    expect(todosAfterDelete).toHaveLength(0);
  });
}); 