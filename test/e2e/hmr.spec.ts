import { test, expect, type Page } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const bidoofDir = join(__dirname, '../../../bidoof-template');

// The demo surfaces this spec drives (bidoof-template's Pokédex app):
// - `/pokedex/` — server page (src/page/pokedex/page.tsx) with the
//   PokemonSearch client island; its text input is the client-state marker
//   that must survive an RSC refetch.
// - `src/css/pokedex.module.css` — the page's stylesheet, for CSS HMR.
// - `/pokedex/bulbasaur/` — a species page whose FavoriteButton drives the
//   "use server" favorites action (persisted in the demo's SQLite db).

const collectRscHmrLogs = (page: Page): string[] => {
  const logs: string[] = [];
  page.on('console', (msg) => {
    if (msg.text().includes('[RSC HMR]')) logs.push(msg.text());
  });
  return logs;
};

test.describe('HMR in bidoof-template', () => {
  test('page content is visible', async ({ page }) => {
    await page.goto('/pokedex/');
    await expect(page.locator('h1')).toContainText('Pokédex');
  });

  test('server component change triggers RSC refetch (not full reload)', async ({ page }) => {
    const pageFile = join(bidoofDir, 'src/page/pokedex/page.tsx');
    const originalContent = await readFile(pageFile, 'utf-8');
    try {
      await page.goto('/pokedex/');
      await expect(page.locator('h1')).toContainText('Pokédex');

      // Client state: type into the search island's input. A full reload
      // would wipe it; an RSC refetch must not.
      const input = page.locator('input').first();
      await input.fill('pika');
      await expect(input).toHaveValue('pika');

      const hmrLogs = collectRscHmrLogs(page);

      const updatedContent = originalContent.replace(
        '<h1>Pokédex</h1>',
        '<h1>Pokédex (HMR TEST)</h1>',
      );
      expect(updatedContent).not.toBe(originalContent);
      await writeFile(pageFile, updatedContent);

      await expect(page.locator('h1')).toContainText('HMR TEST', { timeout: 15000 });
      await expect(input).toHaveValue('pika');
      expect(hmrLogs.some((log) => log.includes('Server component updated'))).toBe(true);
    } finally {
      await writeFile(pageFile, originalContent);
      // Drain the restore's refetch before ending — it must not bleed into
      // the next test's window (state-wiping remounts, stray HMR logs).
      try {
        await expect(page.locator('h1')).not.toContainText('HMR TEST', { timeout: 15000 });
      } catch {}
    }
  });

  test('server component change updates the home page', async ({ page }) => {
    const pageFile = join(bidoofDir, 'src/page/page.tsx');
    const originalContent = await readFile(pageFile, 'utf-8');
    try {
      await page.goto('/');
      await expect(page.locator('h1')).toContainText('Pokédex');
      await expect(page.locator('[data-testid="hmr-marker"]')).toHaveCount(0);

      // Inject a marker element right after the h1.
      const updatedContent = originalContent.replace(
        '<h1>Pokédex</h1>',
        '<h1>Pokédex</h1><p data-testid="hmr-marker">HMR Updated</p>',
      );
      expect(updatedContent).not.toBe(originalContent);
      await writeFile(pageFile, updatedContent);

      await expect(page.locator('[data-testid="hmr-marker"]')).toContainText('HMR Updated', {
        timeout: 15000,
      });
    } finally {
      await writeFile(pageFile, originalContent);
      // Same drain: wait for the marker to leave before the test ends.
      try {
        await expect(page.locator('[data-testid="hmr-marker"]')).toHaveCount(0, {
          timeout: 15000,
        });
      } catch {}
    }
  });

  test('useRscHmr hook registers listener', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));
    await page.goto('/');
    await expect
      .poll(() => consoleLogs.some((log) => log.includes('[RSC HMR] Listening')), {
        timeout: 10000,
      })
      .toBe(true);
  });

  test('CSS change applies without page reload', async ({ page }) => {
    // Regression guard (formerly a pinned expected-fail): dev delivers css as
    // <link> and a css edit cache-busts it via the kind:'css' event while the
    // client-owned module hot-swaps — the 3.10.x/3.11.0 fix line. The edit
    // must apply live with input state preserved and no reload.
    const cssFile = join(bidoofDir, 'src/css/pokedex.module.css');
    const originalContent = await readFile(cssFile, 'utf-8');
    try {
      await page.goto('/pokedex/');
      const input = page.locator('input').first();
      await input.fill('state-marker');

      const updatedContent = originalContent.replace(
        '.Header h1 {\n    margin: 0.5rem 0 0.25rem;\n}',
        '.Header h1 {\n    margin: 0.5rem 0 0.25rem;\n    font-size: 61px;\n}',
      );
      expect(updatedContent).not.toBe(originalContent);
      await writeFile(cssFile, updatedContent);

      await expect(page.locator('h1')).toHaveCSS('font-size', '61px', { timeout: 10000 });
      // Client state survived → style arrived over HMR, not a reload.
      await expect(input).toHaveValue('state-marker');
    } finally {
      await writeFile(cssFile, originalContent);
      // Drain the restore's own HMR cycle before the test ends — its css
      // event and refetch must not bleed into the next test's log window.
      try {
        await expect(page.locator('h1')).not.toHaveCSS('font-size', '61px', {
          timeout: 10000,
        });
      } catch {
        // Best-effort settle; the restore itself already happened above.
      }
    }
  });

  test('client component change does not trigger RSC refetch', async ({ page }) => {
    const clientFile = join(bidoofDir, 'src/components/PokemonSearch.client.tsx');
    const originalContent = await readFile(clientFile, 'utf-8');
    try {
      await page.goto('/pokedex/');
      await expect(page.locator('h1')).toContainText('Pokédex');

      const hmrLogs = collectRscHmrLogs(page);

      // A whitespace-only edit is enough to trigger the module's HMR path.
      await writeFile(clientFile, originalContent + '\n// hmr-touch\n');
      // Give Fast Refresh time to do its thing.
      await page.waitForTimeout(3000);

      // Fast Refresh handles a client module edit; the RSC pipeline must not
      // have refetched the flight for it.
      expect(hmrLogs.filter((log) => log.includes('Server component updated'))).toHaveLength(0);
    } finally {
      await writeFile(clientFile, originalContent);
    }
  });

  test('favorites server action works and persists', async ({ page }) => {
    await page.goto('/pokedex/bulbasaur/');
    const button = page.locator(
      '[aria-label="Add to favorites"], [aria-label="Remove from favorites"]',
    );
    await button.waitFor({ timeout: 15000 });
    const initialLabel = await button.getAttribute('aria-label');

    await button.click();
    const toggledLabel =
      initialLabel === 'Add to favorites' ? 'Remove from favorites' : 'Add to favorites';
    await expect(page.locator(`[aria-label="${toggledLabel}"]`)).toBeVisible({ timeout: 10000 });

    // Persisted server-side: the toggled state survives a full reload.
    await page.reload();
    await expect(page.locator(`[aria-label="${toggledLabel}"]`)).toBeVisible({ timeout: 15000 });

    // Restore so the run leaves the demo's db as it found it.
    await page.locator(`[aria-label="${toggledLabel}"]`).click();
    await expect(page.locator(`[aria-label="${initialLabel}"]`)).toBeVisible({ timeout: 10000 });
  });
});
