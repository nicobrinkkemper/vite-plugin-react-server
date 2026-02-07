import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupErrorBoundaryTestProject } from '../setup.js';
import { getSharedBuild, cleanupSharedBuilds, SharedBuildResult } from './shared-build.js';

describe('Error Boundaries (Cross-Environment)', () => {
  let buildResult: SharedBuildResult;

  beforeAll(async () => {
    buildResult = await getSharedBuild('error-boundaries-test-project', 'error-boundaries', {
      setupProject: setupErrorBoundaryTestProject,
      pages: ['/'],
    });
  });

  afterAll(async () => {
    // Cleanup is handled globally at the end of the test suite
  });

  it('should generate error boundary components in static output', () => {
    // Verify that error boundary components are included in the static build
    const errorBoundaryFiles = buildResult.staticFiles().filter(([f]) => 
      f.includes('error-boundary') || f.includes('ErrorBoundary')
    );
    expect(errorBoundaryFiles.length).toBeGreaterThan(0);
  });

  it('should include error handling in server build output', () => {
    // Verify that server build includes error handling components
    const errorHandlingFiles = buildResult.serverFiles().filter(([f]) => 
      f.includes('error') || f.includes('Error')
    );
    expect(errorHandlingFiles.length).toBeGreaterThan(0);
  });

  it('should handle error boundary components correctly', async () => {
    // Test that error boundary components are properly included in the build
    const errorBoundaryFiles = buildResult.staticFiles().filter(([f]) => 
      f.includes('ErrorBoundary') || f.includes('error-boundary')
    );
    expect(errorBoundaryFiles.length).toBeGreaterThan(0);
  });


});
