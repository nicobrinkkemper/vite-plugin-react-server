import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTodoTestProject } from '../setup.js';
import { doBuild } from '../doBuild.js';
import { testUserOptions } from '../test-config.js';
import { readdir, readFile, mkdir, rm } from 'fs/promises';
import { resolve, join } from 'node:path';

const testDir = resolve(__dirname, '../fixtures/client-server-action.test');

describe('Client Server Action Build Output', () => {
  let clientFiles: string[];
  let staticFiles: string[];
  let serverFiles: string[];
  let distDir: string;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTodoTestProject(testDir);

    // Run build once
    await doBuild({
      ...testUserOptions,
      projectRoot: testDir,
      Page: 'src/page/page.tsx',
      build: {
        pages: ['/todos'],
      },
    });

    // Get files from different folders
    distDir = resolve(testDir, 'dist');
    const getAllFiles = async (dir: string): Promise<string[]> => {
      const files = await readdir(dir, { withFileTypes: true });
      const paths = await Promise.all(
        files.map(async (file) => {
          const path = join(dir, file.name);
          if (file.isDirectory()) {
            return getAllFiles(path);
          }
          return path;
        })
      );
      return paths.flat();
    };

    const allFiles = await getAllFiles(distDir);
    
    // Separate files by folder type
    clientFiles = allFiles.filter(
      (f) => f.includes('/client/') && f.endsWith('.js') && !f.endsWith('.map')
    );
    staticFiles = allFiles.filter(
      (f) => f.includes('/static/') && f.endsWith('.js') && !f.endsWith('.map')
    );
    serverFiles = allFiles.filter(
      (f) => f.includes('/server/') && f.endsWith('.js') && !f.endsWith('.map')
    );
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should NOT output server action files in client folder', () => {
    const serverActionFilesInClient = clientFiles.filter(f => f.includes('.server.js'));
    if(serverActionFilesInClient.length > 0) {
      console.log('Server action files found in client folder:', serverActionFilesInClient);
    }
    expect(serverActionFilesInClient.length).toBe(0);
  });

  it('should NOT output server action files in static folder', () => {
    const serverActionFilesInStatic = staticFiles.filter(f => f.includes('.server.js'));
    if(serverActionFilesInStatic.length > 0) {
      console.log('Server action files found in static folder:', serverActionFilesInStatic);
    }
    expect(serverActionFilesInStatic.length).toBe(0);
  });

  it('should output server action files in server folder', () => {
    const serverActionFilesInServer = serverFiles.filter(f => f.includes('.server.js'));
    if(serverActionFilesInServer.length === 0) {
      console.log('No server action files found in server folder. Available server files:', serverFiles);
    }
    expect(serverActionFilesInServer.length).toBeGreaterThan(0);
  });

  it('should NOT include client component references in client files', async () => {
    let foundTodoList = false;
    let foundClientReference = false;
    let foundDirective = false;
    let esmImport = false;
    for (const file of clientFiles) {
      const content = await readFile(file, 'utf-8');
      if (content.includes('react-server-dom-esm/server')) {
        console.warn('ESM import found in', file);
        esmImport = true;
      }
      if (content.includes('TodoList')) {
        foundTodoList = true;
      } else {
        console.warn('TodoList not found in', file);
      }
      if (content.includes('registerClientReference')) {
        foundClientReference = true;
      }
      if (content.includes('"use client"')) {
        foundDirective = true;
      }
    }

    expect(foundTodoList).toBe(true);
    // NOT
    expect(foundDirective).toBe(false);
    expect(esmImport).toBe(false);
    expect(foundClientReference).toBe(false);
  });
}); 