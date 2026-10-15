import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

test.describe('SahiDana M1 offline vertical-slice journey', () => {
  test('loads v1 catalogs, toggles English/Hindi with reload persistence, audits breed cap, searches across verticals, balances offline, toggles details, audits cited/solver figures, and copies summary', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    // 1. Verify initial English render and Round 4 one-line "How to use" banner (AC-1.1, AC-L1.1)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    const howToUse = page.getByTestId('how-to-use');
    await expect(howToUse).toBeVisible();
    await expect(howToUse).toContainText('How to use:');
    await expect(howToUse).toContainText('Calculate ration');
    await expect(howToUse).toContainText(
      'Enter your cow or buffalo, set a daily budget, add feeds, then tap “Calculate ration”',
    );

    // 2. Toggle English -> Hindi, verify persistence across reload, and switch back to English (AC-L1.1)
    const hiBtn = page.locator('.langtoggle-btn[lang="hi"]');
    const enBtn = page.locator('.langtoggle-btn[lang="en"]');
    await expect(enBtn).toHaveAttribute('aria-pressed', 'true');

    await hiBtn.click();
    await expect(hiBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(howToUse).toContainText('कैसे इस्तेमाल करें:');
    const storedLang = await page.evaluate(() => window.localStorage.getItem('sahidana.lang'));
    expect(storedLang).toBe('hi');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(howToUse).toContainText('कैसे इस्तेमाल करें:');

    await enBtn.click();
    await expect(enBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(howToUse).toContainText('How to use:');

    // 3. Select species and breed, and inspect the breed cap audit drawer (AC-2.1, AC-2.4, AC-6.1)
    await page.getByRole('button', { name: 'Buffalo', exact: true }).click();
    const breedSelect = page.getByLabel('Breed');
    await expect(breedSelect).toBeEnabled();
    await breedSelect.selectOption('murrah');

    const benchmark = page.locator('.benchmark[data-benchmark="murrah"]');
    await expect(benchmark).toBeVisible();
    await expect(benchmark).toContainText('9.64 L');
    await expect(benchmark).toContainText('Cited breed benchmark');
    await expect(benchmark).toContainText('cited daily yield, as reported');
    await expect(benchmark).toContainText('7.34%');

    await benchmark.locator('.fig').first().click();
    const breedDialog = page.locator('[role="dialog"][data-audit-id="breed-cap-murrah"]');
    await expect(breedDialog).toBeVisible();
    await expect(breedDialog).toContainText('Cited source');
    await expect(breedDialog).toContainText('ICAR-CIRB Buffalopedia');
    await expect(breedDialog).toContainText('Upper value of reported study means 7.1–9.64 kg/day');
    await expect(breedDialog).toContainText('9.64 L');
    await expect(breedDialog).toContainText('1 kg of milk ≈ 1 L (assumption)');
    await breedDialog.getByRole('button', { name: 'Close' }).click();
    await expect(breedDialog).toHaveCount(0);

    // 4. Verify v1 feed library vertical groups, multilingual search, and season month selector (AC-1.1, AC-3.1, AC-3.3, AC-3.4)
    const verticals = await page.locator('.libgroup').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-vertical')),
    );
    expect(verticals).toEqual(['indigenous_forage', 'crop_residue', 'agro_byproduct', 'mineral']);
    const totalFeeds = await page.locator('.librow').count();
    expect(totalFeeds).toBeGreaterThanOrEqual(25);

    const searchInput = page.getByLabel('Search feeds');
    for (const query of ['Mustard', 'Sarson', 'सरसों']) {
      await searchInput.fill(query);
      await expect(page.locator('.libgroup[data-vertical="agro_byproduct"] .librow')).toContainText([
        'Mustard cake',
      ]);
    }
    for (const query of ['Bhusa', 'भूसा']) {
      await searchInput.fill(query);
      await expect(page.locator('.libgroup[data-vertical="crop_residue"] .librow')).toContainText([
        'Wheat straw',
      ]);
    }
    await searchInput.fill('');

    const monthSelect = page.locator('.library-controls select');
    await monthSelect.selectOption('7');
    const berseemLibRow = page.locator('.librow').filter({ hasText: 'Berseem' });
    await expect(berseemLibRow.locator('[data-season="out"]')).toBeVisible();
    await monthSelect.selectOption('2');
    await expect(berseemLibRow.locator('[data-season="in"]')).toBeVisible();

    // 5. Enter animal profile (including invalid-input validation check), add feeds, enter today's ration and daily budget (AC-2.1, AC-3.2, AC-4.1, AC-4.2, AC-6.3, AC-E1.1)
    const bodyWeightInput = page.getByLabel('Body weight');
    await bodyWeightInput.fill('100');
    await bodyWeightInput.blur();
    await expect(page.locator('.errors[role="alert"]')).toContainText('150–800 kg');
    await expect(page.getByRole('button', { name: 'Calculate ration' })).toBeDisabled();

    await bodyWeightInput.fill('450');
    await page.getByLabel('Milk yield').fill('8');
    await page.getByLabel('Milk fat').fill('6.5');

    const feedsToAdd = [
      'Wheat straw',
      'Maize fodder (green)',
      'Pearl millet grain (bajra)',
      'Wheat bran',
      'Mustard cake',
      'Mineral mixture',
    ];
    for (const feedText of feedsToAdd) {
      const row = page.locator('.librow').filter({ hasText: feedText }).first();
      await row.locator('.librow-act').click();
    }
    await expect(page.locator('.feedrow')).toHaveCount(6);

    // Open feeds editor if collapsed
    const editFeedsBtn = page
      .locator('section.block')
      .filter({ has: page.locator('.librow') })
      .locator('.block-head-actions button')
      .filter({ hasText: 'Edit' });
    if (await editFeedsBtn.isVisible()) {
      await editFeedsBtn.click();
    }

    // Toggle Show details on Feeds section to reveal per-feed inputs (AC-6.3)
    const feedsDetailsToggle = page.locator('.block-head-actions button[aria-pressed]');
    await expect(feedsDetailsToggle).toHaveAttribute('aria-pressed', 'false');
    await feedsDetailsToggle.click();
    await expect(feedsDetailsToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(feedsDetailsToggle).toContainText('Hide details');
    await expect(page.locator('.feedrow').first().getByLabel('Today kg/day')).toBeVisible();

    const todayQuantities: [string, string][] = [
      ['Wheat straw', '4'],
      ['Maize fodder (green)', '20'],
      ['Pearl millet grain (bajra)', '4'],
      ['Wheat bran', '2'],
      ['Mustard cake', '2.5'],
      ['Mineral mixture', '0.1'],
    ];
    for (const [feedText, qty] of todayQuantities) {
      const row = page.locator('.feedrow').filter({ hasText: feedText }).first();
      await row.getByLabel('Today kg/day').fill(qty);
    }

    // Budget defaults to today's ration cost until edited (AC-4.2)
    await expect(page.locator('[data-pill="budget-default"]')).toBeVisible();
    const budgetInput = page.getByRole('textbox', { name: 'Daily budget' });
    await budgetInput.fill('250');
    await expect(page.locator('[data-pill="budget-default"]')).toHaveCount(0);

    // 6. Switch browser context offline and verify AI actions are disabled with "Needs internet" (AC-E3.1)
    await context.setOffline(true);
    await expect(page.locator('.appbar')).toContainText('Offline');

    const extractorDisclosure = page.locator('.extractor button.disclosure');
    await expect(extractorDisclosure).toContainText('Needs internet');
    await extractorDisclosure.click();
    const fillBtn = page.getByRole('button', { name: 'Fill from description' });
    await expect(fillBtn).toBeDisabled();
    await expect(page.locator('.extractor-body .tag-offline')).toContainText('Needs internet');

    // 7. Calculate ration offline, verify Explain is disabled with "Needs internet", toggle Show details, inspect cited & solver audit drawers, and copy summary (AC-5.1, AC-6.1, AC-6.2, AC-6.3, AC-8.1, AC-E3.1)
    const balanceBtn = page.getByRole('button', { name: 'Calculate ration' });
    await expect(balanceBtn).toBeEnabled();
    await balanceBtn.click();

    const analysis = page.locator('#analysis');
    await expect(analysis).toHaveAttribute('data-state', 'solved');
    await expect(page.getByTestId('supports')).toContainText('9.6 L');
    const verdict = page.getByTestId('verdict');
    await expect(verdict).toHaveAttribute('data-verdict', 'gain');
    await expect(verdict).toContainText('+1.6 L/day possible');
    await expect(page.getByTestId('fat-line')).toContainText('7.34%');

    const explainBtn = page.getByRole('button', { name: 'Explain' });
    await expect(explainBtn).toBeDisabled();
    await expect(page.locator('#explain-offline')).toContainText('Needs internet');

    // Inspect Stage 1 solver output audit drawer (AC-6.2)
    await page.getByTestId('supports').locator('.supports-fig').click();
    const solverDialog = page.locator('[role="dialog"][data-audit-id="supported-milk"]');
    await expect(solverDialog).toBeVisible();
    await expect(solverDialog).toContainText('Solver output');
    await expect(solverDialog).toContainText('Stage 1');
    await expect(solverDialog).toContainText('breed cap');
    await solverDialog.getByRole('button', { name: 'Close' }).click();
    await expect(solverDialog).toHaveCount(0);

    // Toggle Show details and inspect cited roughage minimum audit drawer (AC-6.1, AC-6.3)
    const detailsToggle = page.locator('.details-toggle');
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
    await detailsToggle.click();
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(detailsToggle).toContainText('Hide details');

    const resultDetails = page.locator('#result-details');
    await expect(resultDetails).toBeVisible();
    await expect(resultDetails).toContainText('ICAR 2013');
    await expect(resultDetails).toContainText('40%');
    await expect(resultDetails.locator('.nutrient')).toHaveCount(5);

    await resultDetails.locator('.fig').filter({ hasText: '40%' }).first().click();
    const roughageDialog = page.locator('[role="dialog"][data-audit-id="req-roughage"]');
    await expect(roughageDialog).toBeVisible();
    await expect(roughageDialog).toContainText('Cited source');
    await expect(roughageDialog).toContainText('ICAR 2013');
    await expect(roughageDialog).toContainText('p. 28');
    await roughageDialog.getByRole('button', { name: 'Close' }).click();
    await expect(roughageDialog).toHaveCount(0);

    await detailsToggle.click();
    await expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(resultDetails).toHaveCount(0);

    // Copy summary offline (AC-8.1)
    await page.getByRole('button', { name: 'Copy summary' }).click();
    await expect(page.locator('.toast[role="status"]')).toContainText('Summary copied');

    const clipboardText = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\u00A0/g, ' ');
    expect(clipboardText).toContain('SahiDana ration summary');
    expect(clipboardText).toContain('Buffalo, Murrah, 450 kg, 8 L per day, 6.5% fat');
    expect(clipboardText).toContain('Milk this budget supports: 9.6 L per day');
    expect(clipboardText).toContain('+1.6 L/day possible');
    expect(clipboardText).toContain('₹250.00');
    expect(clipboardText).toContain('Sources:');
  });

  for (const [lang, label, viewport] of [
    ['en', '375 px', { width: 375, height: 812 }],
    ['en', 'desktop', { width: 1280, height: 900 }],
    ['hi', '375 px', { width: 375, height: 812 }],
    ['hi', 'desktop', { width: 1280, height: 900 }],
  ] as const) {
    test(`orders the input column extractor, cow or buffalo, budget, feeds, balance button at ${label} in ${lang} (AC-C3-1.1, AC-C3-1.4)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      if (lang === 'hi') {
        await page.locator('.langtoggle-btn[lang="hi"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      }
      const budgetName = lang === 'en' ? 'Daily budget' : 'रोज़ का बजट';
      const balanceName = lang === 'en' ? 'Calculate ration' : 'राशन निकालें';

      const sections = [
        page.locator('.inputs .extractor'),
        page.locator('.inputs fieldset.block'),
        page.locator('.inputs section.block').filter({ has: page.getByRole('textbox', { name: budgetName }) }),
        page.locator('.inputs section.block').filter({ has: page.locator('.librow') }).first(),
        page.locator('.inputs .balancebar'),
      ];
      const handles = [];
      for (const section of sections) {
        await expect(section).toBeVisible();
        handles.push(await section.elementHandle());
      }

      // DOM order: each section follows the one before it.
      for (let i = 1; i < handles.length; i += 1) {
        const follows = await page.evaluate(
          ([a, b]) => Boolean(a!.compareDocumentPosition(b!) & Node.DOCUMENT_POSITION_FOLLOWING),
          [handles[i - 1], handles[i]],
        );
        expect(follows, `section ${i} follows section ${i - 1} in the DOM`).toBe(true);
      }

      // Visual order: each section starts lower than the one before it. Below 1024 px the balance bar is pinned to the
      // bottom of the screen, so its position is not comparable and only the four cards are checked.
      const tops: number[] = [];
      const visualCount = viewport.width >= 1024 ? sections.length : sections.length - 1;
      for (const section of sections.slice(0, visualCount)) tops.push((await section.boundingBox())!.y);
      for (let i = 1; i < tops.length; i += 1) {
        expect(tops[i], `section ${i} sits below section ${i - 1}`).toBeGreaterThan(tops[i - 1]);
      }

      // No feeds yet: the button is still disabled (AC-E1.2 through C3-M1).
      await expect(page.getByRole('button', { name: balanceName })).toBeDisabled();
    });
  }

  for (const [lang, label, viewport] of [
    ['en', '375 px', { width: 375, height: 812 }],
    ['en', 'desktop', { width: 1280, height: 900 }],
    ['hi', '375 px', { width: 375, height: 812 }],
    ['hi', 'desktop', { width: 1280, height: 900 }],
  ] as const) {
    test(`puts "Try an example" after the balance button and each demo still fills the form at ${label} in ${lang} (AC-C3-1.6)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      if (lang === 'hi') {
        await page.locator('.langtoggle-btn[lang="hi"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      }
      const title = lang === 'en' ? 'Try an example' : 'उदाहरण आज़माएँ';
      const section = page.locator('.inputs .presets');
      await expect(section.locator('.presets-title')).toHaveText(title);

      // DOM order: after the balance bar; nothing demo-like above the extractor.
      const afterBar = await page.evaluate(() => {
        const bar = document.querySelector('.inputs .balancebar')!;
        const presets = document.querySelector('.inputs .presets')!;
        const extractor = document.querySelector('.inputs .extractor')!;
        return {
          afterBar: Boolean(bar.compareDocumentPosition(presets) & Node.DOCUMENT_POSITION_FOLLOWING),
          afterExtractor: Boolean(extractor.compareDocumentPosition(presets) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
      });
      expect(afterBar.afterBar, 'section follows the balance bar in the DOM').toBe(true);
      expect(afterBar.afterExtractor, 'section is not above the extractor').toBe(true);

      await section.scrollIntoViewIfNeeded();
      const presetBox = (await section.boundingBox())!;
      if (viewport.width >= 1024) {
        // Desktop: visually under the Balance button.
        const barBox = (await page.locator('.inputs .balancebar').boundingBox())!;
        expect(presetBox.y, 'section sits below the balance button').toBeGreaterThanOrEqual(barBox.y + barBox.height - 1);
      } else {
        // Phones: before the result card, and the pinned bar does not cover it once scrolled to.
        const analysisBox = (await page.locator('#analysis').boundingBox())!;
        expect(presetBox.y, 'section is above the result card').toBeLessThan(analysisBox.y);
        await section.evaluate((el) => el.scrollIntoView({ block: 'end' }));
        const covered = await page.evaluate(() => {
          const bar = document.querySelector('.inputs .balancebar')!.getBoundingClientRect();
          const row = document.querySelector('.inputs .presets')!.getBoundingClientRect();
          return row.bottom > bar.top;
        });
        expect(covered, 'pinned bar does not cover the examples').toBe(false);
      }

      for (const key of ['buffalo', 'straw', 'tight-budget']) {
        const button = section.locator(`[data-preset="${key}"]`);
        await expect(button).toBeVisible();
        expect((await button.boundingBox())!.height, 'touch target >= 44 px').toBeGreaterThanOrEqual(44);
      }

      // Tapping the buffalo demo fills the form and shows the result.
      await section.locator('[data-preset="buffalo"]').click();
      await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');
      await expect(page.locator('.feedrow')).toHaveCount(7);
      if (lang === 'en') await expect(page.locator('.inputs').getByLabel('Body weight', { exact: true })).toHaveValue('450');
    });

    test(`fills the form from "Straw only" and shows the buy ladder at ${label} in ${lang} (AC-C3-2.7, AC-C3-2.8)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      if (lang === 'hi') {
        await page.locator('.langtoggle-btn[lang="hi"]').click();
        await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
      }
      const section = page.locator('.inputs .presets');
      await section.locator('[data-preset="straw"]').click();
      await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');
      const ladder = page.locator('[data-testid="buy-ladder"]');
      await expect(ladder).toBeVisible();
      const rung0 = ladder.locator('[data-rung="0"]');
      await expect(rung0).toBeVisible();
      if (lang === 'en') {
        await expect(rung0).toContainText('Your feeds alone: not balanced');
        await expect(page.locator('.inputs').getByLabel('Body weight', { exact: true })).toHaveValue('400');
      } else {
        await expect(rung0).toContainText('सिर्फ़ आपके चारे: संतुलित नहीं');
      }
      await expect(page.locator('.tag-buy').first()).toBeVisible();
    });
  }

  for (const [label, viewport] of [
    ['375 px', { width: 375, height: 812 }],
    ['desktop', { width: 1280, height: 900 }],
  ] as const) {
    test(`sets Today and This ration supports side by side with the benchmark line below, and no horizontal overflow, at ${label} (AC-C3-1.5)`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.locator('[data-preset="buffalo"]').click();
      await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');

      const supports = page.getByTestId('supports');
      const tiles = supports.locator('.supports-tile');
      await expect(tiles).toHaveCount(2);
      await expect(tiles.nth(0)).toContainText('Today');
      await expect(tiles.nth(1)).toContainText('This ration supports');

      const todayBox = (await tiles.nth(0).boundingBox())!;
      const supportedBox = (await tiles.nth(1).boundingBox())!;
      const benchmarkBox = (await supports.locator('.supports-context').boundingBox())!;

      // Same top offset, so neither tile wraps below the other; the second tile sits to the right of the first.
      expect(Math.abs(todayBox.y - supportedBox.y), 'tiles share the same top').toBeLessThanOrEqual(1);
      expect(supportedBox.x, 'second tile is to the right of the first').toBeGreaterThanOrEqual(todayBox.x + todayBox.width);
      expect(Math.abs(todayBox.width - supportedBox.width), 'tiles are equal width').toBeLessThanOrEqual(1);

      // The benchmark line sits below both tiles.
      const tilesBottom = Math.max(todayBox.y + todayBox.height, supportedBox.y + supportedBox.height);
      expect(benchmarkBox.y, 'benchmark line is below the tiles').toBeGreaterThanOrEqual(tilesBottom - 1);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      expect(overflow, 'no horizontal page overflow').toBe(false);
    });
  }

  test('verifies vercel.json routing, PWA precache manifest, and bundled woff2 font budget <= 300 KB', async () => {
    const rootDir = process.cwd();
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    expect(vercelConfig.rewrites).toEqual([
      { source: '/api/(.*)', destination: '/api/$1' },
      { source: '/((?!api/).*)', destination: '/index.html' },
    ]);

    const distDir = path.join(rootDir, 'dist');
    const assetsDir = path.join(distDir, 'assets');
    expect(fs.existsSync(path.join(distDir, 'sw.js'))).toBe(true);

    const swContent = fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8');
    expect(swContent).toContain('v1-data-');
    expect(swContent).toContain('.woff2');

    const assetFiles = fs.readdirSync(assetsDir);
    const woffFiles = assetFiles.filter((f) => f.endsWith('.woff'));
    expect(woffFiles).toEqual([]);

    const woff2Files = assetFiles.filter((f) => f.endsWith('.woff2'));
    expect(woff2Files.length).toBeGreaterThanOrEqual(4);
    const totalWoff2Bytes = woff2Files.reduce(
      (sum, f) => sum + fs.statSync(path.join(assetsDir, f)).size,
      0,
    );
    expect(totalWoff2Bytes).toBeGreaterThan(0);
    expect(totalWoff2Bytes).toBeLessThanOrEqual(300 * 1024);
  });

  test('calculates ration with zero own feeds, showing all-buy ration and buy ladder (AC-C3-2.1, AC-C3-2.6)', async ({
    page,
  }) => {
    await page.goto('/');
    // Enter animal profile
    await page.getByRole('button', { name: 'Buffalo', exact: true }).click();
    await page.getByLabel('Breed').selectOption('murrah');
    await page.getByLabel('Body weight').fill('450');
    await page.getByLabel('Milk yield').fill('8');
    await page.getByLabel('Milk fat').fill('6.5');
    await page.getByRole('textbox', { name: 'Daily budget' }).fill('250');

    // Feeds is empty (0 feeds). Button should be enabled (AC-C3-2.1).
    const calcBtn = page.getByRole('button', { name: 'Calculate ration' });
    await expect(calcBtn).toBeEnabled();
    await calcBtn.click();

    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');
    // All rows must have Buy tags since farmer has 0 own feeds (AC-C3-2.6)
    const buyTags = page.locator('.tag-buy');
    await expect(buyTags.first()).toBeVisible();
    const youHaveTags = page.locator('.tag-you-have');
    await expect(youHaveTags).toHaveCount(0);
    // Buy ladder is present
    await expect(page.locator('[data-testid="buy-ladder"]')).toBeVisible();
  });

  test('shows budget increase prompt and audits on tight-budget preset (AC-C3-2.12)', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('.inputs .presets');
    await section.locator('[data-preset="tight-budget"]').click();
    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');

    const prompt = page.locator('[data-testid="budget-increase-prompt"]');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText('Add ₹');
    await expect(prompt).toContainText('to your budget to reach');

    // Click extra budget figure to open audit drawer
    const figs = prompt.locator('.fig');
    await figs.first().click();
    const drawer = page.locator('[role="dialog"].sheet');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-audit-id', 'budget-increase');
    await expect(drawer).toContainText('Required budget increase');
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();
  });

  test('shows raise-by line and audit drawer on budget below maintenance (AC-C3-E7)', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();
    const budgetInput = page.getByRole('textbox', { name: 'Daily budget' });
    await budgetInput.fill('30');
    await page.getByRole('button', { name: 'Calculate ration' }).click();

    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'shortfall');
    const raiseAlert = page.locator('[data-testid="shortfall-raise"]');
    await expect(raiseAlert).toBeVisible();
    await expect(raiseAlert).toContainText('Raise the budget by at least ₹');

    // Click figure to open audit drawer
    await raiseAlert.locator('.fig').click();
    const drawer = page.locator('[role="dialog"].sheet');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-audit-id', 'raise-to-maintenance');
    await expect(drawer).toContainText('Maintenance cost − daily budget');
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();
  });
});

test.describe('SahiDana M2 online AI extraction & verified explanation journey', () => {
  test('shows OpenRouter privacy notice, extracts English and Hinglish descriptions into unconfirmed prefilled state, resolves unmatched feeds by mapping/dropping, and enforces mandatory confirmation before balancing (AC-2.2, AC-2.3, AC-E5.1, AC-L1.5)', async ({
    page,
  }) => {
    const extractRequests: Record<string, unknown>[] = [];
    await page.route('**/api/llm', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action === 'extract') {
        extractRequests.push(body);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            action: 'extract',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            animal: {
              species: 'buffalo',
              bodyWeightKg: 450,
              milkYieldLitersPerDay: 8,
              milkFatPct: 6.5,
            },
            breedId: 'murrah',
            budgetInrPerDay: 250,
            matchedFeeds: [
              { feedId: 'wheat_straw', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
              { feedId: 'mustard_cake', priceInrPerKgAsFed: null, maxKgAsFedPerDay: null },
            ],
            unmatchedFeeds: ['magic probiotic mix', 'mystery herbal tonic'],
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/');

    // 1. Open free-text extractor and verify OpenRouter privacy notice (AC-2.2)
    await page.locator('.extractor button.disclosure').click();
    const privacyNotice = page.locator('.extractor-body .notice');
    await expect(privacyNotice).toBeVisible();
    await expect(privacyNotice).toContainText('OpenRouter');
    await expect(privacyNotice).toContainText('Free models may log prompts');

    // 2. Enter English description first, verify unconfirmed prefill, and discard (AC-2.3, AC-L1.5)
    const textarea = page.locator('.extractor-body textarea');
    await textarea.fill(
      '450 kg Murrah buffalo giving 8 litres milk with 6.5% fat, wheat straw, mustard cake, magic probiotic mix and mystery herbal tonic, budget 250',
    );
    await page.getByRole('button', { name: 'Fill from description' }).click();
    expect(extractRequests.length).toBe(1);
    await expect(page.locator('.review')).toBeVisible();
    await page.getByRole('button', { name: 'Discard prefilled values' }).click();
    await expect(page.locator('.review')).toHaveCount(0);

    // 3. Enter Hinglish description and tap Fill from description (AC-2.3, AC-L1.5)
    await expect(textarea).toBeVisible();
    await textarea.fill(
      '450 kilo ki Murrah bhains 8 litre doodh deti hai, 6.5% fat, gehun ka bhusa, sarson khali, magic probiotic mix aur mystery herbal tonic, 250 rupaye roz',
    );
    await page.getByRole('button', { name: 'Fill from description' }).click();

    expect(extractRequests.length).toBe(2);
    expect(extractRequests[1].action).toBe('extract');

    // 4. Verify form is populated in unconfirmed prefilled state and Balance ration is blocked until confirmed (AC-2.3)
    const reviewPanel = page.locator('.review');
    await expect(reviewPanel).toBeVisible();
    await expect(reviewPanel).toContainText('Unconfirmed');
    await expect(page.getByLabel('Breed', { exact: true })).toHaveValue('murrah');
    await expect(page.getByRole('textbox', { name: 'Body weight' })).toHaveValue('450');
    await expect(page.getByRole('textbox', { name: 'Milk yield' })).toHaveValue('8');
    await expect(page.getByRole('textbox', { name: 'Milk fat' })).toHaveValue('6.5');
    await expect(page.getByRole('textbox', { name: 'Daily budget' })).toHaveValue('250');

    const balanceBtn = page.getByRole('button', { name: 'Calculate ration' });
    await expect(balanceBtn).toBeDisabled();
    await expect(page.locator('#balance-reason')).toContainText('confirm the prefilled values');

    // 5. Verify unmatched feeds section requires mapping or dropping before Confirm is enabled (AC-E5.1)
    const unmatchedGroup = page.getByTestId('unmatched');
    await expect(unmatchedGroup).toBeVisible();
    await expect(unmatchedGroup).toContainText('magic probiotic mix');
    await expect(unmatchedGroup).toContainText('mystery herbal tonic');

    const confirmBtn = page.getByRole('button', { name: 'Values are right, confirm' });
    await expect(confirmBtn).toBeDisabled();

    // Map 'magic probiotic mix' -> 'wheat_bran' and drop 'mystery herbal tonic'
    const unmatchedRows = unmatchedGroup.locator('.unmatched-row');
    await expect(unmatchedRows).toHaveCount(2);
    await unmatchedRows.nth(0).locator('select').selectOption('wheat_bran');
    await unmatchedRows.nth(1).getByRole('button', { name: 'Drop' }).click();

    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 6. After confirmation, prefill review closes, mapped feed is added, and Balance ration is enabled (AC-2.3, AC-E5.1)
    await expect(reviewPanel).toHaveCount(0);
    await expect(page.locator('.feedrow')).toHaveCount(3);
    await expect(balanceBtn).toBeEnabled();

    await balanceBtn.click();
    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');
  });

  test('verifies LLM explanation numbers, triggers single regeneration on untraced number, and keeps LLM body English in Hindi mode (AC-7.1, AC-E6.1, AC-L1.6)', async ({
    page,
  }) => {
    const explainRequests: Record<string, unknown>[] = [];
    await page.route('**/api/llm', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action === 'explain') {
        explainRequests.push(body);
        if (explainRequests.length === 1) {
          // Attempt 1 injects an untraced number 777.77
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              action: 'explain',
              modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
              explanationText:
                'Your 450 kg Murrah buffalo gives 8 L of milk a day. A budget of ₹299.50 supports 9.6 L a day with 777.77 kg of extra supplement.',
            }),
          });
          return;
        }
        // Attempt 2 returns only authorized numbers
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText:
              'Your 450 kg Murrah buffalo gives 8.8 L of milk a day at 6.5% fat. A budget of ₹251.20 per day supports 9.6 L of milk a day, up to the breed cap of 9.64 L.',
          }),
        });
        return;
      }
      await route.fallback();
    });

    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();
    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');

    await page.getByRole('button', { name: 'Explain' }).click();

    const explainSection = page.locator('section.explain[data-state="explain-verified"]');
    await expect(explainSection).toBeVisible();
    expect(explainRequests.length).toBe(2);
    expect(explainRequests[0].attempt).toBe(1);
    expect(explainRequests[1].attempt).toBe(2);
    expect(explainRequests[1].flaggedNumbers).toContain('777.77');

    await expect(page.getByTestId('flagged-notice')).toContainText('777.77');
    await expect(page.getByTestId('badge')).toContainText('All 6 numbers verified');
    await expect(explainSection.locator('.explain-text')).toHaveAttribute('lang', 'en');

    // Switch to Hindi mode: badge updates to Hindi with Latin digits, LLM explanation stays English (AC-L1.6)
    await page.locator('.langtoggle-btn[lang="hi"]').click();
    await expect(explainSection.locator('.explain-text')).toHaveAttribute('lang', 'en');
    await expect(explainSection.locator('.explain-text')).toContainText('Your 450 kg Murrah buffalo');
    await expect(page.getByTestId('badge')).toContainText('6');
  });

  test('handles HTTP 429 on extraction without blocking manual form and falls back to deterministic template on HTTP 429 during explanation (AC-E4.1, AC-E4.2)', async ({
    page,
  }) => {
    await page.route('**/api/llm', async (route) => {
      await route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'RATE_LIMITED', message: 'Rate limited by OpenRouter' },
        }),
      });
    });

    await page.goto('/');

    // 1. Extraction failure shows error alert while manual entry stays usable (AC-E4.1)
    await page.locator('.extractor button.disclosure').click();
    await page.locator('.extractor-body textarea').fill('450 kg Murrah buffalo giving 8 L milk');
    await page.getByRole('button', { name: 'Fill from description' }).click();

    const extractorAlert = page.locator('.extractor-body [role="alert"]');
    await expect(extractorAlert).toBeVisible();

    // Manual preset / entry still works
    await page.locator('[data-preset="buffalo"]').click();
    await expect(page.locator('#analysis')).toHaveAttribute('data-state', 'solved');

    // 2. Explanation failure falls back to deterministic citation-backed template (AC-E4.2)
    await page.getByRole('button', { name: 'Explain' }).click();
    const fallbackSection = page.locator('section.explain[data-state="explain-fallback"]');
    await expect(fallbackSection).toBeVisible();
    await expect(page.getByTestId('fallback-notice')).toBeVisible();
    await expect(fallbackSection.locator('.template li').first()).toBeVisible();
    await expect(page.getByTestId('badge')).toBeVisible();
  });
});


