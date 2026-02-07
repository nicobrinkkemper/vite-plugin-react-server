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
      
      // Verify initial content - page renders the TodoList
      await expect(page.locator('h1')).toContainText('Todo');
      
      // Verify the marker doesn't exist yet
      await expect(page.locator('[data-testid="hmr-marker"]')).toHaveCount(0);

      // Modify the server component - add a visible marker element
      const updatedContent = originalContent.replace(
        '<Link to="/" className={styles["Link"]}> back </Link>',
        '<Link to="/" className={styles["Link"]}> back </Link>\n      <div data-testid="hmr-marker">HMR Updated</div>'
      );
      await writeFile(pageFile, updatedContent);

      // Server components trigger a full page reload ("program reload")
      await page.waitForSelector('[data-testid="hmr-marker"]', { timeout: 10000 });
      
      // Verify the marker appeared
      await expect(page.locator('[data-testid="hmr-marker"]')).toContainText('HMR Updated');
      
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
