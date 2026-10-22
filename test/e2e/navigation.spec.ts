import { test, expect } from '@playwright/test';

/**
 * Client-side navigation against the live Pokédex demo.
 * Uses `/pokedex/` (and a species dynamic route) — never silently skips when
 * a link is missing; that would hide a fixture/routing regression.
 */
test.describe('Client-side navigation', () => {

  test('navigates to route with trailing slash', async ({ page }) => {
    await page.goto('/');

    const pokedexLink = page.locator('a[href*="pokedex"]').first();
    await expect(pokedexLink).toBeVisible();
    await pokedexLink.click();
    await expect(page).toHaveURL(/\/pokedex\/?$/);
    await expect(page.locator('h1')).toContainText('Pokédex');
  });

  test('navigates to route without trailing slash', async ({ page }) => {
    // Direct navigation (no trailing slash) must resolve to the pokedex page.
    await page.goto('/pokedex');
    await expect(page).toHaveURL(/\/pokedex\/?$/);
    await expect(page.locator('h1')).toContainText('Pokédex');
  });

  test('navigation does not use full URL in fetch', async ({ page }) => {
    // Intercept RSC requests to verify URL format
    const rscRequests: string[] = [];
    await page.route('**/*.rsc', (route) => {
      rscRequests.push(route.request().url());
      route.continue();
    });

    await page.goto('/');

    const pokedexLink = page.locator('a[href*="pokedex"]').first();
    await expect(pokedexLink).toBeVisible();
    await pokedexLink.click();
    await page.waitForURL(/\/pokedex/);

    // Verify RSC requests don't contain doubled origin
    for (const url of rscRequests) {
      expect(url).not.toMatch(/http:\/\/localhost:\d+\/http:/);
    }
  });

  test('navigation preserves page state until new content ready', async ({ page }) => {
    await page.goto('/pokedex/');

    // Set a marker in the window
    await page.evaluate(() => {
      (window as Window & { __navTestMarker?: string }).__navTestMarker = 'set-before-nav';
    });

    // Navigate home
    const homeLink = page.locator('a[href="/"], a[href="/."]').first();
    await expect(homeLink).toBeVisible();
    await homeLink.click();
    await page.waitForURL(/\/?$/);

    // Marker should still exist (React transition keeps old UI until new is ready)
    const marker = await page.evaluate(
      () => (window as Window & { __navTestMarker?: string }).__navTestMarker,
    );
    expect(marker).toBe('set-before-nav');
  });

  test('back/forward navigation works correctly', async ({ page }) => {
    await page.goto('/');

    const pokedexLink = page.locator('a[href*="pokedex"]').first();
    await expect(pokedexLink).toBeVisible();
    await pokedexLink.click();
    await page.waitForURL(/\/pokedex/);

    await page.goBack();
    await expect(page).toHaveURL(/\/?$/);

    await page.goForward();
    await expect(page).toHaveURL(/\/pokedex/);
  });
});

test.describe('Dynamic route props', () => {

  test('dynamic routes receive correct props for each URL', async ({ page }) => {
    await page.goto('/pokedex/bulbasaur/');
    await expect(page.locator('h1')).toContainText(/bulbasaur/i);

    await page.goto('/pokedex/pikachu/');
    await expect(page.locator('h1')).toContainText(/pikachu/i);
  });
});
