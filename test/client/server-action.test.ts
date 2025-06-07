import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTodoTestProject } from '../setup.js';
import { doBuild } from './doBuild.js';
import { testUserOptions } from '../test-config.js';
import { readdir, readFile, mkdir, rm } from 'fs/promises';
import { resolve, join } from 'path';

const testDir = resolve(__dirname, '../fixtures/client-server-action.test');

describe('Client Server Action Build Output', () => {
  let events: any[];
  let serverActionFiles: string[];
  let clientComponentFiles: string[];
  let distDir: string;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    await setupTodoTestProject(testDir);

    // Run build once
    try {
      events = await doBuild({
        ...testUserOptions,
        projectRoot: testDir,
        Page: 'src/page/page.tsx',
        build: {
          pages: ['/todos'],
        },
      });

      // Get server action files recursively
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
      serverActionFiles = allFiles.filter(
        (f) => f.endsWith('.server.js') && !f.endsWith('.map')
      );
      clientComponentFiles = allFiles.filter(
        (f) => f.includes('/components/') && !f.endsWith('.map')
      );
    } catch (error) {
      console.trace(error);
      throw error;
    }
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should output no server action files', () => {
    if(serverActionFiles.length > 0) {
      console.log(serverActionFiles);
    }
    expect(serverActionFiles.length).toBe(0);
  });

  it('should NOT include client component references', async () => {
    let foundTodoList = false;
    let foundClientReference = false;
    let foundDirective = false;
    let esmImport = false;
    for (const file of clientComponentFiles) {
      const content = await readFile(file, 'utf-8');
      if (content.includes('react-server-dom-esm/server')) {
        console.warn(file);
        esmImport = true;
      }
      if (content.includes('TodoList')) {
        foundTodoList = true;
      } else {
        console.warn(file);
      }
      if (content.includes('registerClientReference')) {
        foundClientReference = true;
      }
      if (content.includes('\"use client\"')) {
        foundDirective = true;
      } else {
        console.warn(file);
      }
    }

    expect(foundTodoList).toBe(true);
    // NOT
    expect(foundDirective).toBe(false);
    expect(esmImport).toBe(false);
    expect(foundClientReference).toBe(false);
  });
}); 