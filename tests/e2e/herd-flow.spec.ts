import { expect, test } from '@playwright/test';

test.describe('Herd Flow (Change 4 Milestone 1: 3-screen flow for 1 animal)', () => {
  test('Journey C4-A: One animal, three screens from entry to plan copy (AC-C4-1.1, AC-C4-1.2, AC-C4-1.7, AC-C4-1.9, AC-C4-1.13)', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Initial redirect/normalization to #/animals
    await expect(page).toHaveURL(/#\/animals/);
    await expect(page.locator('h1#c4-title')).toHaveText('Your animals');

    // Next is disabled initially
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(nextBtn).toBeDisabled();

    // 2. Add animal: Cow, Hariana
    await page.getByRole('button', { name: 'Cow', exact: true }).click();
    const breedSelect = page.locator('select');
    await breedSelect.selectOption('hariana');

    // Verify typical hint and prefill
    await expect(page.locator('.c4-card-form')).toContainText('typical for this breed');
    const weightInput = page.locator('input[id$="-weight"]');
    await expect(weightInput).toHaveValue('325');

    // Enter today's milk: 5 L
    const milkInput = page.locator('input[id$="-milk"]');
    await milkInput.fill('5');

    // Submit card
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // Listed as Cow 1
    const animalList = page.locator('[data-c4="animal-list"]');
    await expect(animalList).toBeVisible();
    await expect(animalList).toContainText('Cow 1');
    await expect(animalList).toContainText('Hariana');

    // Card hidden because MAX_ANIMALS is 1 for M1
    await expect(page.locator('[data-c4="animal-card"]')).toHaveCount(0);

    // Still disabled without budget
    await expect(nextBtn).toBeDisabled();

    // 3. Enter daily budget
    const budgetInput = page.locator('.c4-budget input.num');
    await budgetInput.fill('150');
    await expect(nextBtn).toBeEnabled();

    // 4. Click Next -> Screen 2: #/feeds
    await nextBtn.click();
    await expect(page).toHaveURL(/#\/feeds/);
    await expect(page.locator('h1#c4-title')).toHaveText('Feed you already have');
    await expect(page.locator('.c4-page')).toContainText('Skip if you have nothing at home.');

    // Add a home feed: Wheat straw, 5 kg
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('Wheat straw');
    const addFeedBtn = page.locator('.c4-pick').filter({ hasText: 'Wheat straw' });
    await expect(addFeedBtn).toBeVisible();
    await addFeedBtn.click();

    const kgInput = page.locator('input[id*="kg-wheat_straw"]');
    await expect(kgInput).toBeVisible();
    await kgInput.fill('5');

    // 5. Calculate ration -> Screen 3: #/result
    const calcBtn = page.getByRole('button', { name: 'Calculate ration' });
    await expect(calcBtn).toBeEnabled();
    await calcBtn.click();

    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('h1#c4-title')).toHaveText('Your plan');

    // Season line with today's date
    const seasonLine = page.locator('[data-c4="season-line"]');
    await expect(seasonLine).toBeVisible();
    await expect(seasonLine.locator('.fig')).toBeVisible();

    // Shopping list
    const shopping = page.locator('[data-c4="shopping"]');
    await expect(shopping).toBeVisible();
    await expect(shopping).toContainText('What to buy');
    await expect(page.getByTestId('shop-total')).toContainText('of your ₹150 a day');

    // Animal card
    const cards = page.locator('[data-c4="cards"]');
    await expect(cards).toBeVisible();
    await expect(cards).toContainText('Cow 1');
    await expect(cards).toContainText('From home');

    // Show details toggle
    const detailsToggle = page.locator('.c4-details-toggle');
    await expect(detailsToggle).toBeVisible();
    await detailsToggle.click();
    await expect(page.locator('[data-details="true"]')).toBeVisible();
    await expect(page.locator('.nutrients')).toBeVisible();

    // Copy summary
    const copyBtn = page.getByRole('button', { name: 'Copy summary' });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await expect(page.locator('.toast')).toContainText('Summary copied');

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('Cow 1');
    expect(clipboard).toContain('What to buy');
  });

  test('Phone Back and Forward navigation preserves state across all 3 screens (AC-C4-1.1, AC-C4-E1)', async ({
    page,
  }) => {
    await page.goto('/');
    // Load example 1
    await page.locator('[data-example="cow_buffalo"]').click();
    await expect(page.locator('.c4-list-row')).toContainText('Buffalo 1');
    await expect(page.locator('.c4-budget input.num')).toHaveValue('220');

    // Next to #/feeds
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);

    // Calculate ration to #/result
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();

    // Go Back -> #/feeds
    await page.goBack();
    await expect(page).toHaveURL(/#\/feeds/);

    // Go Back -> #/animals
    await page.goBack();
    await expect(page).toHaveURL(/#\/animals/);
    await expect(page.locator('.c4-list-row')).toContainText('Buffalo 1');
    await expect(page.locator('.c4-budget input.num')).toHaveValue('220');

    // Go Forward -> #/feeds
    await page.goForward();
    await expect(page).toHaveURL(/#\/feeds/);

    // Go Forward -> #/result (plan restored)
    await page.goForward();
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();
  });

  test('Audit drawer closed by Back stays on the current screen (AC-C4-R5)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-example="cow_buffalo"]').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // Tap season line figure to open drawer
    const seasonFig = page.locator('[data-c4="season-line"] .fig');
    await seasonFig.click();

    const drawer = page.locator('[data-audit-id="season-set"]');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Cited source');

    // Phone Back closes drawer without leaving #/result
    await page.goBack();
    await expect(page.locator('[data-audit-id]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();
  });

  test('Works offline without network connection (AC-C4-1.34)', async ({ page, context }) => {
    await page.goto('/');
    await context.setOffline(true);

    // Status banner shows offline
    await expect(page.locator('.conn')).toContainText('Offline');

    // Load example and compute ration completely offline
    await page.locator('[data-example="straw_only"]').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);

    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();

    await context.setOffline(false);
  });

  test('All three deterministic examples load and solve correctly (AC-C4-1.25)', async ({ page }) => {
    await page.goto('/');

    // 1. cow_buffalo (Buffalo 1 Murrah 8L, 220 budget) -> Solves
    await page.locator('[data-example="cow_buffalo"]').click();
    await expect(page.locator('.c4-list-row')).toContainText('Buffalo 1');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();
    await expect(page.locator('[data-c4="cards"]')).toContainText('Buffalo 1');

    // 2. Back and try straw_only (Hariana cow, 5kg home straw, 150 budget)
    await page.goto('/#/animals');
    await page.locator('[data-example="straw_only"]').click();
    await expect(page.locator('.c4-list-row')).toContainText('Cow 1');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.c4-home-row')).toContainText('Wheat straw');
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page.locator('[data-c4="cards"]')).toContainText('From home');

    // 3. Back and try tight_budget (Sahiwal cow 10L, 80 budget) -> Budget prompt
    await page.goto('/#/animals');
    await page.locator('[data-example="tight_budget"]').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page.locator('[data-c4="budget-prompt"]')).toBeVisible();
  });

  test('At 375 px viewport, computed left/right padding of "Not needed today" equals "What to buy" (AC-C4-1.18, ARCHITECTURE)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Load straw_only (Hariana cow, 5 kg wheat straw)
    await page.locator('[data-example="straw_only"]').click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Add abundant berseem (35 kg), barley straw (10 kg), and sorghum stover (10 kg)
    const searchInput = page.locator('input[type="search"]');
    await searchInput.fill('Berseem');
    await page.locator('.c4-pick').filter({ hasText: 'Berseem' }).click();
    await page.locator('input[id*="kg-berseem"]').fill('35');

    await searchInput.fill('Barley straw');
    await page.locator('.c4-pick').filter({ hasText: 'Barley straw' }).click();
    await page.locator('input[id*="kg-barley_straw"]').fill('10');

    await searchInput.fill('Sorghum stover');
    await page.locator('.c4-pick').filter({ hasText: 'Sorghum stover' }).click();
    await page.locator('input[id*="kg-jowar_stover"]').fill('10');

    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    const shopping = page.locator('[data-c4="shopping"]');
    const notNeeded = page.locator('[data-c4="not-needed"]');

    await expect(shopping).toBeVisible();
    await expect(notNeeded).toBeVisible();

    const [shopPad, nnPad] = await Promise.all([
      shopping.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return { left: s.paddingLeft, right: s.paddingRight };
      }),
      notNeeded.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return { left: s.paddingLeft, right: s.paddingRight };
      }),
    ]);

    expect(nnPad.left).toBe(shopPad.left);
    expect(nnPad.right).toBe(shopPad.right);

    // Zero horizontal scrollbar at 375 px
    const hasHScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHScroll).toBe(false);
  });

  test('Every interactive control meets >= 44x44 px touch targets (AC-C4-1.31, ARCHITECTURE)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    // Screen 1 controls
    const screen1Selectors = [
      '.langtoggle-btn[lang="hi"]',
      '.langtoggle-btn[lang="en"]',
      '.c4-species-btn',
      '.c4-examples .btn-preset',
      '.c4-card-add',
    ];

    for (const sel of screen1Selectors) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box, `${sel} bounding box`).not.toBeNull();
      expect(box!.height, `${sel} height >= 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${sel} width >= 44px`).toBeGreaterThanOrEqual(44);
    }

    // Load example and check screen 2 controls
    await page.locator('[data-example="straw_only"]').click();
    await page.getByRole('button', { name: 'Next' }).click();

    const screen2Selectors = [
      '.c4-bar-back',
      '.c4-bar-primary',
      '.c4-home-head .btn-quiet',
      '.c4-pick',
    ];

    for (const sel of screen2Selectors) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box, `${sel} bounding box`).not.toBeNull();
      expect(box!.height, `${sel} height >= 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${sel} width >= 44px`).toBeGreaterThanOrEqual(44);
    }

    // Calculate ration and check screen 3 controls
    await page.getByRole('button', { name: 'Calculate ration' }).click();

    const screen3Selectors = [
      '[data-c4="season-line"] .fig',
      '.c4-details-toggle',
      '.c4-bar-primary',
    ];

    for (const sel of screen3Selectors) {
      const el = page.locator(sel).first();
      await expect(el).toBeVisible();
      const box = await el.boundingBox();
      expect(box, `${sel} bounding box`).not.toBeNull();
      expect(box!.height, `${sel} height >= 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${sel} width >= 44px`).toBeGreaterThanOrEqual(44);
    }
  });
});
