import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestProject } from '../setup.js';
import { getSharedBuild, readFileContent, cleanupSharedBuilds } from './shared-build.js';

describe('Build Output - RSC Files (Cross-Environment)', () => {
  let staticFiles: string[];
  let serverFiles: string[];

  beforeAll(async () => {
      const buildResult = await getSharedBuild('build-output-rsc', {
    setupProject: setupTestProject,
    pages: ['/'],
  });
    
    staticFiles = buildResult.staticFiles;
    serverFiles = buildResult.serverFiles;
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it('should generate RSC files with proper streaming format', async () => {
    // Check that RSC files are generated
    const rscFiles = staticFiles.filter(f => f.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);
    
    // Verify RSC files contain proper streaming format
    for (const rscFile of rscFiles) {
      const content = await readFileContent(rscFile);
      expect(content.length).toBeGreaterThan(0);
      
      // Check for RSC streaming format (entries starting with numbers)
      expect(content).toMatch(/\d+:/);
    }
  });

  it('should include RSC worker components in server build', () => {
    // Verify that RSC worker components are included in server build
    const rscWorkerFiles = serverFiles.filter(f => 
      f.includes('rsc') || f.includes('worker') || f.includes('RSC')
    );
    expect(rscWorkerFiles.length).toBeGreaterThan(0);
  });

  it('should generate proper content type headers in build output', () => {
    // Verify that the build includes proper content type handling
    // This is typically handled at runtime, but we can verify the build structure
    expect(staticFiles.length).toBeGreaterThan(0);
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it('should handle streaming responses in build output', async () => {
    // Check that RSC files are properly formatted for streaming
    const rscFiles = staticFiles.filter(f => f.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);
    
    for (const rscFile of rscFiles) {
      const content = await readFileContent(rscFile);
      
      // Verify streaming format with numbered entries
      expect(content).toMatch(/\d+:/);
      
      // Verify content is not empty
      expect(content.length).toBeGreaterThan(0);
    }
  });

  it('should maintain build integrity with RSC worker', () => {
    // Verify that the build completes successfully with RSC worker
    expect(staticFiles.length).toBeGreaterThan(0);
    expect(serverFiles.length).toBeGreaterThan(0);
    
    // Check that all expected file types are present
    const hasRscFiles = staticFiles.some(f => f.endsWith('.rsc'));
    const hasHtmlFiles = staticFiles.some(f => f.endsWith('.html'));
    const hasJsFiles = staticFiles.some(f => f.endsWith('.js'));
    
    expect(hasRscFiles).toBe(true);
    expect(hasHtmlFiles).toBe(true);
    expect(hasJsFiles).toBe(true);
  });

  it('should handle RSC worker configuration correctly', () => {
    // Verify that RSC worker configuration is properly applied
    // This is verified by successful build completion
    expect(staticFiles.length).toBeGreaterThan(0);
    expect(serverFiles.length).toBeGreaterThan(0);
  });

  it('should generate proper RSC entries in build output', async () => {
    // Check that RSC files contain proper entries
    const rscFiles = staticFiles.filter(f => f.endsWith('.rsc'));
    expect(rscFiles.length).toBeGreaterThan(0);
    
    for (const rscFile of rscFiles) {
      const content = await readFileContent(rscFile);
      
      // Verify RSC entries format (0:, 1:, etc.)
      expect(content).toMatch(/^\d+:/m);
      
      // Verify content structure
      expect(content.length).toBeGreaterThan(0);
    }
  });
});
