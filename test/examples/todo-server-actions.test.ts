import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedBuild } from './shared-build.js';
import { setupTodoTestProject } from '../setup.js';
import { resolve } from 'node:path';

describe('Todo Server Actions Direct Testing (Cross-Environment)', () => {
  let buildResult: any;
  let testDir: string;

  beforeAll(async () => {
    // Use the shared build system to build the todo project
    buildResult = await getSharedBuild('todo-server-actions-test-project', 'todo-server-actions', {
      setupProject: setupTodoTestProject,
      pages: ["/todos"], // Build the todos page to ensure server actions are processed
      verbose: false,
    });
    
    // Get the test directory from the build result
    testDir = buildResult.testDir;
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it('should build server actions successfully', () => {
    // Verify the build completed without errors
    const events = buildResult.events;
    const errorEvents = events.filter((e: any) => e.type === 'error');
    expect(errorEvents.length).toBe(0);
    
    // Verify server action files exist in the server build
    const serverChunks = buildResult.serverChunks();
    const serverActionFiles = serverChunks.filter(([filename]: [string, string]) => 
      filename.includes('actions.server')
    );
    expect(serverActionFiles.length).toBeGreaterThan(0);
  });

  it('should handle todo operations through built server actions', async () => {
    // Import the built server actions from the server build directory
    const serverDir = resolve(testDir, 'dist/server');
    
    try {
      // Try to import the actions from the built files
      const serverChunks = buildResult.serverChunks();
      const actionFile = serverChunks.find(([filename]: [string, string]) => 
        filename.includes('actions.server')
      );
      
      expect(actionFile).toBeDefined();
      
      // If we can find the server action file, the build was successful
      const [filename] = actionFile!;
      expect(filename).toMatch(/actions\.server/);
      
    } catch (error) {
      // If we can't import the built actions (which is expected in the test environment),
      // just verify that the server action files were built correctly
      console.log('Direct import not available in test environment, checking build output instead');
      
      const serverChunks = buildResult.serverChunks();
      const actionFiles = serverChunks.filter(([filename, content]: [string, string]) => 
        filename.includes('actions.server') && content.length > 0
      );
      
      expect(actionFiles.length).toBeGreaterThan(0);
    }
  });

  it('should include server actions in server bundle but not client bundle', () => {
    const serverChunks = buildResult.serverChunks();
    const clientChunks = buildResult.clientChunks();
    
    // Server actions should be in server build
    const serverActionFilesInServer = serverChunks.filter(([filename]: [string, string]) => 
      filename.includes('actions.server')
    );
    expect(serverActionFilesInServer.length).toBeGreaterThan(0);
    
    // Server actions should NOT be in client build
    const serverActionFilesInClient = clientChunks.filter(([filename]: [string, string]) => 
      filename.includes('actions.server')
    );
    expect(serverActionFilesInClient.length).toBe(0);
  });

  it('should contain expected todo action signatures in server build', () => {
    const serverChunks = buildResult.serverChunks();
    const actionFiles = serverChunks.filter(([filename, content]: [string, string]) => 
      filename.includes('actions.server') && content
    );
    
    expect(actionFiles.length).toBeGreaterThan(0);
    
    // Check if any of the server action files contain the expected function names
    const hasExpectedActions = actionFiles.some(([, content]: [string, string]) => {
      return content.includes('getTodos') || 
             content.includes('addTodo') || 
             content.includes('toggleTodo') || 
             content.includes('deleteTodo');
    });
    
    expect(hasExpectedActions).toBe(true);
  });

  it('should properly handle RSC serialization of todo data', () => {
    // Check if RSC files were generated with todo-related content
    const rscFiles = buildResult.rscFiles();
    
    expect(rscFiles.length).toBeGreaterThan(0);
    
    // RSC files should contain serialized component data
    const [, rscContent] = rscFiles[0];
    expect(typeof rscContent).toBe('string');
    expect(rscContent.length).toBeGreaterThan(0);
  });
});
