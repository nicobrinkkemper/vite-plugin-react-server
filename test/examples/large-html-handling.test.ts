import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { getSharedBuild, getHtmlContentFromEvents } from './shared-build.js';

// Generate a large component with many nested divs
const generateLargeComponent = (depth: number, width: number): string => {
  if (depth === 0) {
    return 'React.createElement("div", { className: "leaf", key: "leaf" }, "Content")';
  }
  const children: string[] = [];
  for (let i = 0; i < width; i++) {
    children.push(generateLargeComponent(depth - 1, width));
  }
  return `React.createElement("div", { className: "depth-${depth}", key: "depth-${depth}-${Math.random()}" }, [${children.join(',')}])`;
};

describe('Large HTML Handling (Cross-Environment)', () => {
  let buildResult: any;

  beforeAll(async () => {
    // Use the shared build system to test both client and server workflows
    buildResult = await getSharedBuild('large-html-test-project', 'large-html', {
      setupProject: async (testDir: string) => {
        const srcDir = join(testDir, 'src');
        await mkdir(srcDir, { recursive: true });
        await mkdir(join(srcDir, 'page'), { recursive: true });

        // Create a large React component
        const largeComponent = `
          import React from 'react';
          export default function LargePage() {
            return ${generateLargeComponent(4, 3)};
          }
        `;

        // Create index page that uses the large component
        const page = `
          import React from 'react';
          import LargePage from './LargePage';
          
          export function Page() {
            return React.createElement(LargePage);
          }
        `;
        
        // Create props file
        const props = `
          export function props() {
            return {
              name: 'John',
              age: 30,
              city: 'New York'
            }
          }
        `;

        // Write test files
        await writeFile(join(srcDir, 'page', 'LargePage.tsx'), largeComponent);
        await writeFile(join(srcDir, 'page','page.tsx'), page);
        await writeFile(join(srcDir, 'page','props.ts'), props);
        await writeFile(join(srcDir, 'page','test.module.css'), '.Test { color: red; }');

        // Add client entry point
        await writeFile(join(srcDir, 'client.tsx'), `"use client"
          import React from 'react';
        `);
        
        // Add server entry point
        await writeFile(join(srcDir, 'server.tsx'), `"use server"
          import React from 'react';
        `);

        // Add HTML template
        await writeFile(join(testDir, 'index.html'), `<!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8" />
              <title>Test App</title>
            </head>
            <body>
              <div id="root"></div>
              <script type="module" src="src/client.tsx"></script>
            </body>
          </html>
        `);
      },
      pages: ['/'],
      rscTimeout: 500,
      verbose: false,
    });
  });

  afterAll(async () => {
    // Cleanup is handled by the shared build utility
  });

  it('should handle large HTML output correctly in both workflows', async () => {
    const htmlContents = getHtmlContentFromEvents(buildResult.events);
    expect(htmlContents.length).toBeGreaterThan(0);
    const htmlContent = htmlContents[0];
    
    // Verify the HTML was generated correctly
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<div class="depth-3"');
    expect(htmlContent).toContain('<div class="leaf">Content</div>');
    
    // Count the number of divs to verify all content was rendered
    const divCount = (htmlContent.match(/<div/g) || []).length;
    expect(divCount).toBeGreaterThan(100); // Should have all our nested divs (3^4 + 3^3 + 3^2 + 3^1 + 1 = 121)
    
    // Verify structure
    expect(htmlContent).toMatch(/<div class="depth-3"[^>]*>.*<div class="depth-2"/);
    expect(htmlContent).toMatch(/<div class="depth-1"[^>]*>.*<div class="leaf"/);
    
    // Verify no malformed tags
    expect(htmlContent.match(/<div/g)?.length).toBe(htmlContent.match(/<\/div>/g)?.length);
  });

  it('should generate consistent large HTML across environments', async () => {
    // Verify that the build produces consistent results
    expect(buildResult.clientChunks().length).toBeGreaterThan(0);
    expect(buildResult.staticChunks().length).toBeGreaterThan(0);
    expect(buildResult.serverChunks().length).toBeGreaterThan(0);
    
    // Check that the large HTML content is properly generated
    const htmlContents = getHtmlContentFromEvents(buildResult.events);
    expect(htmlContents.length).toBeGreaterThan(0);
    
    // All HTML files should contain the large component structure
    for (const htmlContent of htmlContents) {
      expect(htmlContent).toContain('<div class="depth-3"');
      expect(htmlContent).toContain('<div class="leaf">Content</div>');
    }
  });

  it('should handle nested component structure correctly', async () => {
    const htmlContents = getHtmlContentFromEvents(buildResult.events);
    expect(htmlContents.length).toBeGreaterThan(0);
    const htmlContent = htmlContents[0];
    
    // Verify the nested structure is preserved
    expect(htmlContent).toContain('class="depth-4"');
    expect(htmlContent).toContain('class="depth-3"');
    expect(htmlContent).toContain('class="depth-2"');
    expect(htmlContent).toContain('class="depth-1"');
    expect(htmlContent).toContain('class="leaf"');
    
    // Verify the structure hierarchy
    const depth4Count = (htmlContent.match(/class="depth-4"/g) || []).length;
    const depth3Count = (htmlContent.match(/class="depth-3"/g) || []).length;
    const depth2Count = (htmlContent.match(/class="depth-2"/g) || []).length;
    const depth1Count = (htmlContent.match(/class="depth-1"/g) || []).length;
    const leafCount = (htmlContent.match(/class="leaf"/g) || []).length;
    
    // Should have the expected counts based on our 3^4 structure
    expect(depth4Count).toBe(1); // 3^0 = 1
    expect(depth3Count).toBe(3); // 3^1 = 3
    expect(depth2Count).toBe(9); // 3^2 = 9
    expect(depth1Count).toBe(27); // 3^3 = 27
    expect(leafCount).toBe(81); // 3^4 = 81
  });

  it('should complete build successfully with large content', async () => {
    // Verify that the build completed without errors
    const buildEvents = buildResult.events.filter(
      (e: any) =>
        e.type === "build.writeBundle.client" ||
        e.type === "build.writeBundle.static" ||
        e.type === "build.writeBundle.server"
    );
    expect(buildEvents.length).toBeGreaterThan(0);
    
    // Verify that file write events were generated
    const fileWriteEvents = buildResult.events.filter(
      (e: any) => e.type === "file.write.done"
    );
    expect(fileWriteEvents.length).toBeGreaterThan(0);
    
    // Verify both HTML and RSC files were generated
    const htmlEvents = fileWriteEvents.filter(
      (e: any) => e.data.fileType === "html"
    );
    const rscEvents = fileWriteEvents.filter(
      (e: any) => e.data.fileType === "rsc"
    );
    
    expect(htmlEvents.length).toBeGreaterThan(0);
    expect(rscEvents.length).toBeGreaterThan(0);
  });
});
