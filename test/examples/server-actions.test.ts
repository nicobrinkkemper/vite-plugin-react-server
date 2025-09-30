import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTodoTestProject } from '../setup.js';
import { getSharedBuild, SharedBuildResult } from './shared-build.js';

describe('Server Actions Build Output', () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    // Use the new shared build API
    buildResult = await getSharedBuild('todo-test-project', 'server-actions', {
      setupProject: setupTodoTestProject,
      pages: ['/todos'],
      verbose: false, // Enable verbose logging to debug server actions
    });
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it('should NOT output server action files in client folder', () => {
    const serverActionFilesInClient = buildResult
      .clientChunks()
      .filter(([filename]) => filename.includes('actions.server'));
    if(serverActionFilesInClient.length > 0) {
      console.log('Server action files found in client folder:', serverActionFilesInClient.map(([f]) => f));
    }
    expect(serverActionFilesInClient.length).toBe(0);
  });

  it('should NOT output server action files in static folder', () => {
    const serverActionFilesInStatic = buildResult
      .staticChunks()
      .filter(([filename]) => filename.includes('actions.server'));
    if(serverActionFilesInStatic.length > 0) {
      console.log('Server action files found in static folder:', serverActionFilesInStatic.map(([f]) => f));
    }
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it('should output server action files in server folder', () => {
    const serverActionFilesInServer = buildResult
      .serverChunks()
      .filter(([filename]) => filename.includes('actions.server'));
    if(serverActionFilesInServer.length === 0) {
      console.log('No server action files found in server folder. Available server files:', buildResult.serverChunks().map(([f]) => f));
    }
    expect(serverActionFilesInServer.length).toBeGreaterThan(0);
  });

  it('should NOT include client component references in client files', async () => {
    let foundTodoList = false;
    let foundClientReference = false;
    let foundDirective = false;
    let esmImport = false;
    
    for (const [filename, content] of buildResult.clientChunks()) {
      if (content && typeof content === 'string') {
        if (content.includes('react-server-dom-esm/server')) {
          console.warn('ESM import found in', filename);
          esmImport = true;
        }
        if (content.includes('TodoList')) {
          foundTodoList = true;
        }
        if (content.includes('registerClientReference')) {
          foundClientReference = true;
        }
        if (content.includes('"use client"')) {
          foundDirective = true;
        }
      }
    }

    // These should NOT be found in client files
    expect(foundClientReference).toBe(false);
    expect(foundDirective).toBe(false);
    expect(esmImport).toBe(false);
    expect(foundTodoList).toBe(true);
  });

  it('should include server action files in server folder', async () => {
    const serverActionFiles = buildResult
      .serverChunks()
      .filter(([filename]) => filename.includes('actions.server'));
    expect(serverActionFiles.length).toBeGreaterThan(0);
    
    // Check that server action files contain the expected transformed content
    for (const [filename, content] of serverActionFiles) {
      if (content && typeof content === 'string') {
        // Server actions are transformed to use registerServerReference
        expect(content).toContain('registerServerReference');
        expect(content).toContain('react-server-dom-esm/server');
      }
    }
  });

  it('should have proper file structure in all environments', () => {
    // All environments should have some files
    expect(buildResult.clientChunks().length).toBeGreaterThan(0);
    expect(buildResult.staticChunks().length).toBeGreaterThan(0);
    expect(buildResult.serverChunks().length).toBeGreaterThan(0);
    
    // Check that we have the expected file types
    const hasClientComponents = buildResult.clientChunks().some(([f]) => f.includes('TodoList.client'));
    const hasServerActions = buildResult.serverChunks().some(([f]) => f.includes('actions.server'));
    
    expect(hasClientComponents).toBe(true);
    expect(hasServerActions).toBe(true);
  });
});
