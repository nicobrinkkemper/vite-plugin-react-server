import { test, expect } from '@playwright/test';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const fixtureDir = join(__dirname, '../fixtures/e2e-hmr');

test.describe('HMR', () => {
  test.beforeAll(async () => {
    // Setup is done by the test server script
  });

  test('page updates without full reload when server component changes', async ({ page }) => {
    // Navigate to the test page
    await page.goto('/');
    
    // Verify initial content
    await expect(page.locator('body')).toContainText('Test Page');
    
    // Store a value in window to detect full reload
    await page.evaluate(() => {
      (window as any).__hmrTestValue = 'still-here';
    });

    // Modify the page file
    await writeFile(
      join(fixtureDir, 'src/page/page.tsx'),
      `import React from "react";
export const Page = () => <div>Updated via HMR</div>;`
    );

    // Wait for HMR update
    await page.waitForFunction(
      () => document.body.textContent?.includes('Updated via HMR'),
      { timeout: 5000 }
    );

    // Verify the page wasn't fully reloaded (our test value should still exist)
    const testValue = await page.evaluate(() => (window as any).__hmrTestValue);
    expect(testValue).toBe('still-here');
  });

  test('CSS updates via HMR', async ({ page }) => {
    await page.goto('/');
    
    // Add a CSS file
    await mkdir(join(fixtureDir, 'src/css'), { recursive: true });
    await writeFile(
      join(fixtureDir, 'src/css/test.css'),
      `body { background: red; }`
    );

    // Update page to import CSS
    await writeFile(
      join(fixtureDir, 'src/page/page.tsx'),
      `import React from "react";
import "../css/test.css";
export const Page = () => <div data-testid="page">Page with CSS</div>;`
    );

    // Wait for update
    await page.waitForFunction(
      () => document.body.textContent?.includes('Page with CSS'),
      { timeout: 5000 }
    );

    // Change CSS color
    await writeFile(
      join(fixtureDir, 'src/css/test.css'),
      `body { background: blue; }`
    );

    // Wait for CSS to update
    await page.waitForFunction(
      () => getComputedStyle(document.body).backgroundColor === 'rgb(0, 0, 255)',
      { timeout: 5000 }
    );
  });

  test('server action still works after HMR', async ({ page }) => {
    // Setup server action file
    await mkdir(join(fixtureDir, 'src/server'), { recursive: true });
    await writeFile(
      join(fixtureDir, 'src/server/actions.server.ts'),
      `"use server";
export async function testAction(value: string): Promise<string> {
  return "Server received: " + value;
}`
    );

    // Update page to use server action
    await writeFile(
      join(fixtureDir, 'src/page/page.tsx'),
      `import React from "react";
import { testAction } from "../server/actions.server.js";

export const Page = () => (
  <div>
    <button onClick={async () => {
      const result = await testAction("hello");
      alert(result);
    }}>Test Action</button>
  </div>
);`
    );

    await page.goto('/');
    
    // Set up dialog handler
    const dialogPromise = page.waitForEvent('dialog');
    
    // Click button to trigger server action
    await page.click('button');
    
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Server received: hello');
    await dialog.accept();
  });
});
