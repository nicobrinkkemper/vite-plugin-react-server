import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSharedBuild, findFilesByPattern, readFileContent } from './shared-build.js';
import { setupTodoTestProject } from '../setup.js';

describe('Server Actions Simple Build Test (Cross-Environment)', () => {
  let build: any;

  beforeAll(async () => {
    build = await getSharedBuild('server-actions-simple', {
      setupProject: setupTodoTestProject,
      pages: [], // No SSG to avoid rendering TodoList component
    });
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it('should NOT output server action files in client folder', () => {
    const serverActionFilesInClient = findFilesByPattern(build.clientFiles, 'actions.server');
    if(serverActionFilesInClient.length > 0) {
      console.log('Server action files found in client folder:', serverActionFilesInClient);
    }
    expect(serverActionFilesInClient.length).toBe(0);
  });

  it('should NOT output server action files in static folder', () => {
    const serverActionFilesInStatic = findFilesByPattern(build.staticFiles, 'actions.server');
    if(serverActionFilesInStatic.length > 0) {
      console.log('Server action files found in static folder:', serverActionFilesInStatic);
    }
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it('should output server action files in server folder', () => {
    const serverActionFilesInServer = findFilesByPattern(build.serverFiles, 'actions.server');
    if(serverActionFilesInServer.length === 0) {
      console.log('No server action files found in server folder. Available server files:', build.serverFiles);
    }
    expect(serverActionFilesInServer.length).toBeGreaterThan(0);
  });

  it('should include server action files in server folder', async () => {
    const serverActionFiles = findFilesByPattern(build.serverFiles, 'actions.server');
    expect(serverActionFiles.length).toBeGreaterThan(0);
    
    // Check that server action files contain the expected transformed content
    for (const file of serverActionFiles) {
      const content = await readFileContent(file);
      // Server actions are transformed to use registerServerReference
      expect(content).toContain('registerServerReference');
      expect(content).toContain('react-server-dom-esm/server');
    }
  });

  it('should have proper file structure in all environments', () => {
    // All environments should have some files
    expect(build.clientFiles.length).toBeGreaterThan(0);
    expect(build.staticFiles.length).toBeGreaterThan(0);
    expect(build.serverFiles.length).toBeGreaterThan(0);
    
    // Check that we have the expected file types
    const hasClientComponents = build.clientFiles.some(f => f.includes('TodoList.client'));
    const hasServerActions = build.serverFiles.some(f => f.includes('actions.server'));
    
    expect(hasClientComponents).toBe(true);
    expect(hasServerActions).toBe(true);
  });
});

