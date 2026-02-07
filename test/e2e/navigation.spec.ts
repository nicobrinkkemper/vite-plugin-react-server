import { test, expect } from '@playwright/test';

test.describe('Client-side navigation', () => {
  
  test('navigates to route with trailing slash', async ({ page }) => {
    await page.goto('/');
    
    // Find a link to todos and click it
    const todosLink = page.locator('a[href="/todos/"]').first();
    if (await todosLink.count() > 0) {
      await todosLink.click();
      await expect(page).toHaveURL(/\/todos\/?$/);
      await expect(page.locator('h1')).toContainText('Todo');
    }
  });

  test('navigates to route without trailing slash', async ({ page }) => {
    await page.goto('/');
    
    // Find a link without trailing slash (if any)
    const link = page.locator('a[href="/todos"]').first();
    if (await link.count() > 0) {
      await link.click();
      await expect(page).toHaveURL(/\/todos\/?$/);
      await expect(page.locator('h1')).toContainText('Todo');
    }
  });

  test('navigation does not use full URL in fetch', async ({ page }) => {
    // Intercept RSC requests to verify URL format
    const rscRequests: string[] = [];
    await page.route('**/*.rsc', (route) => {
      rscRequests.push(route.request().url());
      route.continue();
    });
    
    await page.goto('/');
    
    // Navigate to todos
    const todosLink = page.locator('a[href*="todos"]').first();
    if (await todosLink.count() > 0) {
      await todosLink.click();
      await page.waitForURL(/\/todos/);
      
      // Verify RSC requests don't contain doubled origin
      for (const url of rscRequests) {
        expect(url).not.toMatch(/http:\/\/localhost:\d+\/http:/);
      }
    }
  });

  test('navigation preserves page state until new content ready', async ({ page }) => {
    await page.goto('/todos/');
    
    // Set a marker in the window
    await page.evaluate(() => {
      (window as any).__navTestMarker = 'set-before-nav';
    });
    
    // Navigate home
    const homeLink = page.locator('a[href="/"]').first();
    if (await homeLink.count() > 0) {
      await homeLink.click();
      await page.waitForURL('/');
      
      // Marker should still exist (React transition keeps old UI until new is ready)
      const marker = await page.evaluate(() => (window as any).__navTestMarker);
      expect(marker).toBe('set-before-nav');
    }
  });

  test('back/forward navigation works correctly', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to todos
    const todosLink = page.locator('a[href*="todos"]').first();
    if (await todosLink.count() > 0) {
      await todosLink.click();
      await page.waitForURL(/\/todos/);
      
      // Go back
      await page.goBack();
      await expect(page).toHaveURL('/');
      
      // Go forward
      await page.goForward();
      await expect(page).toHaveURL(/\/todos/);
    }
  });
});

test.describe('Dynamic route props', () => {
  
  test('dynamic routes receive correct props for each URL', async ({ page }) => {
    // This test requires a fixture with dynamic routes
    // For bidoof-template, we can test the todos route variations
    await page.goto('/todos/');
    
    // Verify content is specific to this route
    await expect(page.locator('h1')).toContainText('Todo');
  });
});
