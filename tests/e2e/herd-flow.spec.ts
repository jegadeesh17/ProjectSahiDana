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

    // In M2 (MAX_ANIMALS = 10), card remains open until 10 animals are listed
    await expect(page.locator('[data-c4="animal-card"]')).toBeVisible();

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
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
    await expect(page.locator('.c4-budget input.num')).toHaveValue('400');

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
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
    await expect(page.locator('.c4-budget input.num')).toHaveValue('400');

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

  test('Closing audit drawer with Close button allows single page.goBack() to navigate to #/feeds (AC-C4-1.22, AC-C4-R5, ARCHITECTURE line 1317)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-example="cow_buffalo"]').click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // Tap season line figure to open drawer
    const seasonFig = page.locator('[data-c4="season-line"] .fig');
    await seasonFig.click();

    const drawer = page.locator('[data-audit-id="season-set"]');
    await expect(drawer).toBeVisible();

    // Close audit drawer using the Close button
    const closeBtn = drawer.getByRole('button', { name: 'Close' });
    await closeBtn.click();
    await expect(page.locator('[data-audit-id]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/result/);

    // Single page.goBack() must navigate directly back to #/feeds
    await page.goBack();
    await expect(page).toHaveURL(/#\/feeds/);
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

    // 1. cow_buffalo (Cow 1 + Buffalo 1, 400 budget) -> Solves
    await page.locator('[data-example="cow_buffalo"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page.locator('[data-c4="shopping"]')).toBeVisible();
    await expect(page.locator('[data-c4="cards"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="cards"]')).toContainText('Buffalo 1');

    // 2. Back and try straw_only (Cow 1 + Cow 2, 12kg home straw, 250 budget)
    await page.goto('/#/animals');
    await page.locator('[data-example="straw_only"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 2');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.locator('.c4-home-row')).toContainText('Wheat straw');
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page.locator('[data-c4="cards"]')).toContainText('From home');
    await expect(page.locator('[data-c4="cards"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="cards"]')).toContainText('Cow 2');

    // 3. Back and try tight_budget (Cow 1 + Buffalo 1, 200 budget) -> Budget prompt
    await page.goto('/#/animals');
    await page.locator('[data-example="tight_budget"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
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

  test('Screen 3 animal removal returns to screen 1 and drops plan (AC-C4-2.2)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-example="cow_buffalo"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);

    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // Verify 2 animal cards are displayed
    const cards = page.locator('.c4-acard');
    await expect(cards).toHaveCount(2);

    // Remove Cow 1
    const removeCow1 = page.locator('.c4-acard[data-animal="a1"]').getByRole('button', { name: /^Remove/i });
    await expect(removeCow1).toBeVisible();
    await removeCow1.click();

    // App navigates to #/animals
    await expect(page).toHaveURL(/#\/animals/);
    await expect(page.locator('h1#c4-title')).toHaveText('Your animals');

    // Cow 1 is gone, Buffalo 1 remains
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
    await expect(page.locator('[data-c4="animal-list"]')).not.toContainText('Cow 1');

    // Budget 400 is retained
    await expect(page.locator('.c4-budget input.num')).toHaveValue('400');

    // Go to #/feeds -> home feed is retained
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);
    await expect(page.locator('input[id*="kg-wheat_straw"]')).toHaveValue('10');

    // Recalculating produces plan with 1 animal (Buffalo 1)
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.locator('.c4-acard')).toHaveCount(1);
    await expect(page.locator('.c4-acard')).toContainText('Buffalo 1');
  });

  test('Adding up to 10 animals shows limit message and hides add-card (AC-C4-2.1, AC-C4-E5)', async ({ page }) => {
    await page.goto('/');

    for (let i = 1; i <= 9; i++) {
      const isCow = i % 2 === 1;
      await page.getByRole('button', { name: isCow ? 'Cow' : 'Buffalo', exact: true }).click();
      await page.locator('select').selectOption(isCow ? 'rathi' : 'murrah');
      await page.locator('input[id$="-milk"]').fill('5');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.locator('[data-c4="animal-card"]')).toBeVisible();
      await expect(page.locator('.c4-limit')).toHaveCount(0);
    }

    // Add 10th animal
    await page.getByRole('button', { name: 'Cow', exact: true }).click();
    await page.locator('select').selectOption('hariana');
    await page.locator('input[id$="-milk"]').fill('6');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // 10 animals listed, card hidden, limit message shown
    await expect(page.locator('.c4-list-row')).toHaveCount(10);
    await expect(page.locator('[data-c4="animal-card"]')).toHaveCount(0);
    await expect(page.locator('.c4-limit')).toContainText('You can add up to 10 animals');
  });

  test('Beyond-budget expansion journey with "+ Add to budget" auto-resolve and state retention (AC-C4-3.1, AC-C4-3.3, AC-C4-3.4, AC-C4-3.5, AC-C4-E14)', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Load tight_budget example (Cow 1 + Buffalo 1, 8kg wheat straw, budget 200)
    await page.locator('[data-example="tight_budget"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');
    await expect(page.locator('.c4-budget input.num')).toHaveValue('200');

    // 2. Next to #/feeds -> Verify home feed
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);
    await expect(page.locator('input[id*="kg-wheat_straw"]')).toHaveValue('8');

    // 3. Calculate ration -> Screen 3: #/result
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // 4. Verify "What to buy" contains within-budget feeds and data-group="later" renders expansion items
    const shopping = page.locator('[data-c4="shopping"]');
    await expect(shopping).toBeVisible();

    const withinBudgetGroup = shopping.locator('[data-group="first"]');
    await expect(withinBudgetGroup).toBeVisible();
    await expect(withinBudgetGroup.locator('.c4-shop-row')).not.toHaveCount(0);

    const laterGroup = shopping.locator('[data-group="later"]');
    await expect(laterGroup).toBeVisible();
    await expect(laterGroup).toContainText('Then, if you can');
    const expansionRows = laterGroup.locator('.c4-shop-row');
    await expect(expansionRows).not.toHaveCount(0);

    // Verify first expansion item has "+ Add to budget" button
    const firstAddBtn = laterGroup.locator('[data-testid="btn-add-budget"]').first();
    await expect(firstAddBtn).toBeVisible();
    await expect(firstAddBtn).toContainText('+ Add to budget');

    // Verify touch target >= 44x44 px (AC-C4-3.4)
    const btnBox = await firstAddBtn.boundingBox();
    expect(btnBox).not.toBeNull();
    expect(btnBox!.height).toBeGreaterThanOrEqual(44);
    expect(btnBox!.width).toBeGreaterThanOrEqual(44);

    // Verify accessible aria-label (AC-C4-3.4)
    const ariaLabel = await firstAddBtn.getAttribute('aria-label');
    expect(ariaLabel).toMatch(/Add .+ for ₹\d+\/day to budget for \+\d+(\.\d+)? L milk/);

    // Initial shop total reflects initial budget of 200
    const shopTotal = page.getByTestId('shop-total');
    await expect(shopTotal).toContainText('of your ₹200 a day');

    // Extract delta cost from aria-label
    const costMatch = ariaLabel!.match(/for ₹(\d+)\/day/);
    expect(costMatch).not.toBeNull();
    const deltaCost = Number(costMatch![1]);
    expect(deltaCost).toBeGreaterThan(0);
    const expectedNewBudget = 200 + deltaCost;

    // 5. Tap "+ Add to budget"
    await firstAddBtn.click();

    // 6. Verify total budget increases, herd plan re-solves, shop total updates to the new budget (AC-C4-3.5)
    await expect(shopTotal).toContainText(`of your ₹${expectedNewBudget} a day`);
    await expect(shopTotal).not.toContainText('of your ₹200 a day');

    // 7. Navigating back to Screen 2 retains the updated budget, and navigating to Screen 1 shows updated budget (AC-C4-E14)
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/feeds/);
    await expect(page.locator('input[id*="kg-wheat_straw"]')).toHaveValue('8');

    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page).toHaveURL(/#\/animals/);
    await expect(page.locator('.c4-budget input.num')).toHaveValue(String(expectedNewBudget));
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');

    // 8. Re-solve from Screen 1 -> Screen 2 -> Screen 3 retains new budget solve
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);
    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);
    await expect(page.getByTestId('shop-total')).toContainText(`of your ₹${expectedNewBudget} a day`);
  });

  test('Omission of "Then, if you can" at peak yield / breed cap when t* = 1.0 (AC-C4-3.6)', async ({
    page,
  }) => {
    await page.goto('/');

    // Load cow_buffalo example and set generous budget (e.g. 500) where t* = 1.0
    await page.locator('[data-example="cow_buffalo"]').click();
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');
    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Buffalo 1');

    const budgetInput = page.locator('.c4-budget input.num');
    await budgetInput.fill('500');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);

    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // Verify "What to buy" is displayed
    const shopping = page.locator('[data-c4="shopping"]');
    await expect(shopping).toBeVisible();
    await expect(shopping.locator('[data-group="first"]')).toBeVisible();

    // Verify data-group="later" is completely absent at peak genetic potential
    await expect(shopping.locator('[data-group="later"]')).toHaveCount(0);
  });

  test('Omission of "Then, if you can" for dry herds (AC-C4-E12)', async ({
    page,
  }) => {
    await page.goto('/');

    // Add dry animal: Cow, Hariana, milk = 0
    await page.getByRole('button', { name: 'Cow', exact: true }).click();
    await page.locator('select').selectOption('hariana');
    await page.locator('input[id$="-milk"]').fill('0');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    await expect(page.locator('[data-c4="animal-list"]')).toContainText('Cow 1');

    // Enter budget: 150
    const budgetInput = page.locator('.c4-budget input.num');
    await budgetInput.fill('150');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page).toHaveURL(/#\/feeds/);

    await page.getByRole('button', { name: 'Calculate ration' }).click();
    await expect(page).toHaveURL(/#\/result/);

    // Verify "What to buy" is displayed
    const shopping = page.locator('[data-c4="shopping"]');
    await expect(shopping).toBeVisible();
    await expect(shopping.locator('[data-group="first"]')).toBeVisible();

    // Verify "Then, if you can" is completely omitted for dry herds (AC-C4-E12)
    await expect(shopping.locator('[data-group="later"]')).toHaveCount(0);
  });
});

