import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTodoTestProject } from '../setup.js';
import { getSharedBuild, readFileContent, cleanupSharedBuilds } from './shared-build.js';

describe('Server Action Integration (Cross-Environment)', () => {
  let staticFiles: string[];
  let serverFiles: string[];

  beforeAll(async () => {
    const buildResult = await getSharedBuild('server-action-integration', {
      setupProject: setupTodoTestProject,
      pages: ['/todos'],
    });
    
    staticFiles = buildResult.staticFiles;
    serverFiles = buildResult.serverFiles;
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it('should include server action references in RSC files', async () => {
    // Find RSC files and check for server action references
    const rscFiles = staticFiles.filter(f => f.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);
    
    let foundServerActions = false;
    for (const rscFile of rscFiles) {
      const content = await readFileContent(rscFile);
      if (content.includes('addTodo') || content.includes('toggleTodo') || content.includes('deleteTodo')) {
        foundServerActions = true;
        break;
      }
    }
    expect(foundServerActions).toBe(true);
  });

  it('should generate server action files in server build', () => {
    // Verify server actions are included in server build
    const serverActionFiles = serverFiles.filter(f => 
      f.includes('actions.server') || f.includes('server-actions')
    );
    expect(serverActionFiles.length).toBeGreaterThan(0);
  });

  it('should NOT include server actions in static build', () => {
    // Verify server actions are NOT included in static build
    const serverActionFilesInStatic = staticFiles.filter(f => 
      f.includes('actions.server') || f.includes('server-actions')
    );
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it('should handle client component references correctly', async () => {
    // Check that client components are properly referenced
    const rscFiles = staticFiles.filter(f => f.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);
    
    let foundClientComponents = false;
    for (const rscFile of rscFiles) {
      const content = await readFileContent(rscFile);
      if (content.includes('TodoList') || content.includes('"env":"Server"')) {
        foundClientComponents = true;
        break;
      }
    }
    expect(foundClientComponents).toBe(true);
  });

  it('should generate proper HTML structure for todo pages', async () => {
    // Check that HTML files are generated with proper structure
    const htmlFiles = staticFiles.filter(f => f.endsWith('.html'));
    expect(htmlFiles.length).toBeGreaterThan(0);
    
    for (const htmlFile of htmlFiles) {
      const content = await readFileContent(htmlFile);
      expect(content).toContain('<html');
      expect(content).toContain('</html>');
      expect(content).toContain('<head>');
      expect(content).toContain('<body>');
    }
  });

  it('should separate server and client concerns properly', () => {
    // Verify that server and client builds are properly separated
    const staticJsFiles = staticFiles.filter(f => f.endsWith('.js'));
    const serverJsFiles = serverFiles.filter(f => f.endsWith('.js'));
    
    expect(staticJsFiles.length).toBeGreaterThan(0);
    expect(serverJsFiles.length).toBeGreaterThan(0);
    
    // Server files should contain server-specific code
    const hasServerActions = serverJsFiles.some(f => f.includes('actions'));
    expect(hasServerActions).toBe(true);
  });

  it('should NOT include client components in server bundles', async () => {
    // Check that server bundles don't contain client-side code
    for (const serverFile of serverFiles) {
      if (serverFile.endsWith('.js')) {
        const content = await readFileContent(serverFile);
        expect(content).not.toContain('use client');
        expect(content).not.toContain('createRoot');
      }
    }
  });

  it('should NOT include server directives in server bundles', async () => {
    // Check that server bundles don't contain React directives
    for (const serverFile of serverFiles) {
      if (serverFile.endsWith('.js')) {
        const content = await readFileContent(serverFile);
        expect(content).not.toContain('use server');
        expect(content).not.toContain('useState');
      }
    }
  });

  it('should include registerServerReference in server bundles', async () => {
    // Check that server bundles contain proper server action registration
    let hasServerReference = false;
    for (const serverFile of serverFiles) {
      if (serverFile.endsWith('.js')) {
        const content = await readFileContent(serverFile);
        if (content.includes('registerServerReference')) {
          hasServerReference = true;
          break;
        }
      }
    }
    expect(hasServerReference).toBe(true);
  });
});
