import { test, expect } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, '../../../bidoof-template');

test.describe('HMR in bidoof-template', () => {
  
  test('page content is visible', async ({ page }) => {
    await page.goto('/todos/');
    
    // Verify the todo page loads
    await expect(page.locator('h1')).toContainText('Todo');
  });

  test('page updates without full reload when server component changes', async ({ page }) => {
    const pageFile = join(bidoofDir, 'src/page/todos/page.tsx');
    const originalContent = await readFile(pageFile, 'utf-8');
    
    try {
      await page.goto('/todos/');
      
      // Verify initial content
      await expect(page.locator('h1')).toContainText('Todo');
      
      // Store a value in window to detect full reload
      await page.evaluate(() => {
        (window as any).__hmrTestValue = 'still-here';
      });

      // Modify the page file - add a marker
      const updatedContent = originalContent.replace(
        '<h1>Todo',
        '<h1 data-testid="hmr-marker">HMR Updated Todo'
      );
      await writeFile(pageFile, updatedContent);

      // Wait for HMR update (look for the marker)
      await page.waitForSelector('[data-testid="hmr-marker"]', { timeout: 10000 });
      
      // Verify new content
      await expect(page.locator('h1')).toContainText('HMR Updated');

      // Verify the page wasn't fully reloaded (our test value should still exist)
      const testValue = await page.evaluate(() => (window as any).__hmrTestValue);
      expect(testValue).toBe('still-here');
      
    } finally {
      // Restore original file
      await writeFile(pageFile, originalContent);
    }
  });

  test('server action works', async ({ page }) => {
    await page.goto('/todos/');
    
    // Find the input and add a todo
    const input = page.locator('input[type="text"]');
    await input.fill('E2E Test Todo');
    
    // Submit the form (press Enter or click add button)
    await input.press('Enter');
    
    // Wait for the new todo to appear
    await expect(page.locator('text=E2E Test Todo')).toBeVisible({ timeout: 5000 });
  });

  test('todo toggle persists', async ({ page }) => {
    await page.goto('/todos/');
    
    // Find a todo checkbox and click it
    const checkbox = page.locator('input[type="checkbox"]').first();
    const initialChecked = await checkbox.isChecked();
    
    await checkbox.click();
    
    // Wait a moment for the action
    await page.waitForTimeout(500);
    
    // Verify it toggled
    const newChecked = await checkbox.isChecked();
    expect(newChecked).toBe(!initialChecked);
  });
});
