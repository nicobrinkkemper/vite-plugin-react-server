import { resolve } from "path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestProject, setupLinkClientTSX } from "../setup.js";
import { doBuild } from "../doBuild.js";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { getCondition } from "vite-plugin-react-server/config";
import { getSharedBuild, cleanupSharedBuilds } from './shared-build.js';

describe("hash consistency test", () => {
  let buildResult: any;

  beforeAll(async () => {
    // Use shared build for the first build
    buildResult = await getSharedBuild('hash-consistency', {
      pages: [], // No pages = no SSG, just bundle building
    });
  });

  afterAll(async () => {
    // Don't cleanup shared builds since other tests might be using them
    // The cleanup will happen at the end of the test suite
  });

  it("should generate consistent hashes across all environments", async () => {
    // Use the shared build result for the first build
    const testDir = buildResult.testDir;

    // Find the Link.client files in all environments from the shared build events
    const staticFiles1 = buildResult.staticFiles.filter(f => f.includes('Link.client-'));
    const clientFiles1 = buildResult.clientFiles.filter(f => f.includes('Link.client-'));
    const serverFiles1 = buildResult.serverFiles.filter(f => f.includes('Link.client-'));
    
    const staticFile1 = staticFiles1[0];
    const clientFile1 = clientFiles1[0];
    const serverFile1 = serverFiles1[0];

    expect(staticFile1).toBeTruthy();
    expect(clientFile1).toBeTruthy();
    expect(serverFile1).toBeTruthy();

    // Extract hashes from filenames
    const getHashFromFilename = (filepath: string) => {
      const filename = filepath.split('/').pop() || '';
      const match = filename.match(/Link\.client-([^.]+)\.js/);
      return match ? match[1] : null;
    };

    const staticHash1 = getHashFromFilename(staticFile1);
    const clientHash1 = getHashFromFilename(clientFile1);
    const serverHash1 = getHashFromFilename(serverFile1);

    console.log("Original hashes:", { staticHash1, clientHash1, serverHash1 });

    // Verify all environments have the same hash
    expect(staticHash1).toBe(clientHash1);
    expect(clientHash1).toBe(serverHash1);
    expect(staticHash1).toBeTruthy();

    // Second build with modified content using shared build system
    const buildResult2 = await getSharedBuild('hash-consistency-modified', {
      setupProject: async (testDir: string) => {
        // First do the normal setup
        await setupTestProject(testDir);
        // Then modify the file
        await writeFile(
          resolve(testDir, "src/components/Link.client.tsx"),
          `"use client";
import React from 'react';

export function Link({ to, children }: { to: string, children: React.ReactNode }) {
  // Modified content for hash testing
  return <a href={to} className="modified-link">{children}</a>;
}`
        );
      },
      pages: [], // No pages = no SSG, just bundle building
    });

    // Find the new Link.client files from the second build
    const staticFiles2 = buildResult2.staticFiles.filter(f => f.includes('Link.client-'));
    const clientFiles2 = buildResult2.clientFiles.filter(f => f.includes('Link.client-'));
    const serverFiles2 = buildResult2.serverFiles.filter(f => f.includes('Link.client-'));
    
    const staticFile2 = staticFiles2[0];
    const clientFile2 = clientFiles2[0];
    const serverFile2 = serverFiles2[0];

    const staticHash2 = getHashFromFilename(staticFile2);
    const clientHash2 = getHashFromFilename(clientFile2);
    const serverHash2 = getHashFromFilename(serverFile2);

    console.log("Modified hashes:", { staticHash2, clientHash2, serverHash2 });

    // Verify all environments still have the same hash
    expect(staticHash2).toBe(clientHash2);
    expect(clientHash2).toBe(serverHash2);
    expect(staticHash2).toBeTruthy();

    // Verify the hash changed due to content modification
    expect(staticHash2).not.toBe(staticHash1);
    expect(clientHash2).not.toBe(clientHash1);
    expect(serverHash2).not.toBe(serverHash1);
  });
});
