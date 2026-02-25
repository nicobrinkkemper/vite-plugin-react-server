import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedBuild, findFilesByPattern } from './shared-build.js';
import { setupTodoTestProject } from '../setup.js';

describe('Server Actions Simple Build Test (Cross-Environment)', () => {
  let build: any;

  beforeAll(async () => {
    build = await getSharedBuild('todo-test-project', 'server-actions-simple', {
      setupProject: setupTodoTestProject,
      pages: [], // No SSG to avoid rendering TodoList component
    });
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it('should NOT output server action files in client folder', () => {
    const serverActionFilesInClient = findFilesByPattern(build.clientFiles().map(([filename]) => filename), 'actions.server');
    if(serverActionFilesInClient.length > 0) {
      console.log('Server action files found in client folder:', serverActionFilesInClient);
    }
    expect(serverActionFilesInClient.length).toBe(0);
  });

  it('should NOT output server action files in static folder', () => {
    const serverActionFilesInStatic = findFilesByPattern(build.staticFiles().map(([filename]) => filename), 'actions.server');
    if(serverActionFilesInStatic.length > 0) {
      console.log('Server action files found in static folder:', serverActionFilesInStatic);
    }
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it('should output server action files in server folder', () => {
    const serverActionFilesInServer = findFilesByPattern(build.serverFiles().map(([filename]) => filename), 'actions.server');
    if(serverActionFilesInServer.length === 0) {
      console.log('No server action files found in server folder. Available server files:', build.serverFiles().map(([filename]) => filename));
    }
    expect(serverActionFilesInServer.length).toBeGreaterThan(0);
  });

  it('should include server action files in server folder', async () => {
    const serverActionFiles = findFilesByPattern(build.serverFiles().map(([filename]) => filename), 'actions.server');
    expect(serverActionFiles.length).toBeGreaterThan(0);
    
    // Check that server action files contain the expected transformed content
    for (const filename of serverActionFiles) {
      // Find the corresponding entry in the bundle to get content
      const bundleEntry = build.serverFiles().find(([fname]) => fname === filename);
      if (bundleEntry) {
        const [, content] = bundleEntry;
        // Server actions are transformed to use registerServerReference
        // The import may come from a vendored bundle chunk rather than a bare specifier
        expect(content).toContain('registerServerReference');
      }
    }
  });

  it('should have proper file structure in all environments', () => {
    // All environments should have some files
    expect(build.clientFiles().map(([filename]) => filename).length).toBeGreaterThan(0);
    expect(build.staticFiles().map(([filename]) => filename).length).toBeGreaterThan(0);
    expect(build.serverFiles().map(([filename]) => filename).length).toBeGreaterThan(0);
    
    // Check that we have the expected file types
    const hasClientComponents = build.clientFiles().map(([filename]) => filename).some(f => f.includes('TodoList.client'));
    const hasServerActions = build.serverFiles().map(([filename]) => filename).some(f => f.includes('actions.server'));
    
    expect(hasClientComponents).toBe(true);
    expect(hasServerActions).toBe(true);
  });
});

