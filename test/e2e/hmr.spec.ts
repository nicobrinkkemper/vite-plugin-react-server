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

  test('server component change triggers RSC refetch (not full reload)', async ({ page }) => {
    const pageFile = join(bidoofDir, 'src/page/page.tsx');
    const originalContent = await readFile(pageFile, 'utf-8');
    
    try {
      await page.goto('/');
      
      // Verify initial content
      await expect(page.locator('h1')).toContainText('vite-plugin-react-server demo');
      
      // Click the counter a few times to set client state
      const counter = page.locator('button', { hasText: 'Click count:' });
      await counter.click();
      await counter.click();
      await counter.click();
      await expect(counter).toContainText('Click count: 3');
      
      // Listen for the RSC HMR console log
      const hmrLogs: string[] = [];
      page.on('console', (msg) => {
        if (msg.text().includes('[RSC HMR]')) {
          hmrLogs.push(msg.text());
        }
      });
      
      // Modify the server component — add a visible marker
      const updatedContent = originalContent.replace(
        'vite-plugin-react-server demo',
        'vite-plugin-react-server demo (HMR TEST)'
      );
      await writeFile(pageFile, updatedContent);
      
      // Wait for the RSC HMR update to apply
      await expect(page.locator('h1')).toContainText('HMR TEST', { timeout: 15000 });
      
      // CRITICAL: Client state must be preserved — this proves RSC refetch,
      // not a full page reload (which would reset the counter to 0)
      await expect(counter).toContainText('Click count: 3');
      
      // Verify the RSC HMR hook fired (not a full page reload)
      expect(hmrLogs.some(log => log.includes('Server component updated'))).toBe(true);
      
    } finally {
      await writeFile(pageFile, originalContent);
    }
  });

  test('server component change updates todos page', async ({ page }) => {
    const pageFile = join(bidoofDir, 'src/page/todos/page.tsx');
    const originalContent = await readFile(pageFile, 'utf-8');
    
    try {
      await page.goto('/todos/');
      
      // Verify initial content
      await expect(page.locator('h1')).toContainText('Todo');
      
      // Verify the marker doesn't exist yet
      await expect(page.locator('[data-testid="hmr-marker"]')).toHaveCount(0);

      // Modify the server component — add a visible marker element
      const updatedContent = originalContent.replace(
        '<Link to="/" className={styles["Link"]}> back </Link>',
        '<Link to="/" className={styles["Link"]}> back </Link>\n      <div data-testid="hmr-marker">HMR Updated</div>'
      );
      await writeFile(pageFile, updatedContent);
      
      // Wait for the update
      await page.waitForSelector('[data-testid="hmr-marker"]', { timeout: 15000 });
      await expect(page.locator('[data-testid="hmr-marker"]')).toContainText('HMR Updated');
      
    } finally {
      await writeFile(pageFile, originalContent);
    }
  });

  test('useRscHmr hook registers listener', async ({ page }) => {
    // Register console listener BEFORE navigation so we catch early logs
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));
    
    await page.goto('/');
    // Give React time to mount and run effects
    await page.waitForTimeout(2000);
    
    // The useRscHmr hook logs when it starts listening
    expect(consoleLogs.some(log => log.includes('[RSC HMR] Listening'))).toBe(true);
  });

  test('import.meta.hot is preserved in compiled useRscHmr', async ({ page }) => {
    // This test catches the bug where import.meta.hot was stripped during
    // the plugin's library build, making useRscHmr a dead no-op function.
    // If import.meta.hot was stripped, the useEffect body becomes just "return;"
    // and no "[RSC HMR] Listening" log is emitted.
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // The hook should log "Listening" — this proves import.meta.hot exists
    // and the useEffect body wasn't dead-code-eliminated
    const listening = consoleLogs.some(log => log.includes('[RSC HMR] Listening'));
    expect(listening).toBe(true);
  });

  test('CSS change applies without page reload', async ({ page }) => {
    const cssFile = join(bidoofDir, 'src/css/home.module.css');
    const originalContent = await readFile(cssFile, 'utf-8');
    
    try {
      await page.goto('/');
      
      // Click counter to set client state
      const counter = page.locator('button', { hasText: 'Click count:' });
      await counter.click();
      await counter.click();
      await expect(counter).toContainText('Click count: 2');
      
      // Change a CSS value
      const updatedContent = originalContent.replace(
        'font-size: 50px',
        'font-size: 60px'
      );
      await writeFile(cssFile, updatedContent);
      
      // Wait for style to apply
      await page.waitForTimeout(2000);
      
      // Client state should be preserved (CSS HMR doesn't reload)
      await expect(counter).toContainText('Click count: 2');
      
    } finally {
      await writeFile(cssFile, originalContent);
    }
  });

  test('client component change does not trigger RSC refetch', async ({ page }) => {
    const clientFile = join(bidoofDir, 'src/components/Counter.client.tsx');
    const originalContent = await readFile(clientFile, 'utf-8');
    
    try {
      await page.goto('/');
      
      // Listen for RSC HMR events — should NOT fire for client components
      const rscHmrLogs: string[] = [];
      page.on('console', (msg) => {
        if (msg.text().includes('[RSC HMR] Server component updated') && !msg.text().includes('.css')) {
          rscHmrLogs.push(msg.text());
        }
      });
      
      // Modify the client component — change button text
      const updatedContent = originalContent.replace(
        'Click count:',
        'Clicks:'
      );
      await writeFile(clientFile, updatedContent);
      
      // Wait for update to process
      await page.waitForTimeout(3000);
      
      // RSC HMR should NOT have fired — client changes are handled by
      // React Fast Refresh or Vite's native HMR, not RSC refetch
      expect(rscHmrLogs).toHaveLength(0);
      
    } finally {
      await writeFile(clientFile, originalContent);
    }
  });

    test('server action works', async ({ page }) => {
    await page.goto('/todos/');
    
    // Use unique name to avoid conflicts with leftover test data
    const todoName = `E2E-${Date.now()}`;
    
    // Find the input and add a todo
    const input = page.locator('input[type="text"]');
    await input.fill(todoName);
    
    // Submit the form
    await input.press('Enter');
    
    // Wait for the new todo to appear
    await expect(page.locator(`text=${todoName}`)).toBeVisible({ timeout: 5000 });
    
    // Clean up: delete the todo we just added
    const todoItem = page.locator('li', { hasText: todoName });
    await todoItem.locator('button', { hasText: '×' }).click();
    await expect(todoItem).not.toBeVisible({ timeout: 10000 });
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
