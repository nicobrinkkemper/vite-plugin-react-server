import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';
import { type PluginEvent, type FileWriteDoneEvent } from 'vite-plugin-react-server/types';
import { testUserOptions } from '../test-config.js';
import { doBuild } from './doBuild.js';

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

describe('large html handling', () => {
  const testDir = join(process.cwd(), 'test/fixtures/large-html.test');
  const srcDir = join(testDir, 'src');
  let events: PluginEvent[] = [];
  let htmlContent: string;
  beforeAll(async () => {
    // Create test project structure
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
      import LargePage from './LargePage.js';
      
      export function Page() {
        return React.createElement(LargePage);
      }
    `;
    // Create props file without unnecessary import
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
    // Add client entry point
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

    // build
    events = await doBuild({
      projectRoot: testDir,
      Page: ()=>"src/page/page.tsx",
      props: ()=>"src/page/props.ts",
      rscTimeout: 500,
      build: {
        pages: ["/"],
      },
    });

    // Get HTML content from file.write.done event
    const htmlDoneEvent = events.find(
      (e) =>
        e.type === "file.write.done" &&
        e.data.fileType === "html" &&
        e.data.route === '/'
    ) as FileWriteDoneEvent;
    
    if (htmlDoneEvent) {
      htmlContent = htmlDoneEvent.data.content;
    }
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('handles large HTML output correctly', async () => {
    testUserOptions.projectRoot = testDir;
    
    // Verify the HTML was generated correctly
    expect(htmlContent).toBeDefined();
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
});