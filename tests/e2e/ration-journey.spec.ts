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
    await expect(howToUse).toContainText('Balance ration');

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
    await expect(benchmark).toContainText('cited peak daily yield');
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
    await expect(page.getByRole('button', { name: 'Balance ration' })).toBeDisabled();

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

    // Toggle Show details on Feeds section to reveal and hide per-feed Max kg/day inputs (AC-6.3)
    const feedsDetailsToggle = page.locator('.block-head-actions button[aria-pressed]');
    await expect(feedsDetailsToggle).toHaveAttribute('aria-pressed', 'false');
    await feedsDetailsToggle.click();
    await expect(feedsDetailsToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(feedsDetailsToggle).toContainText('Hide details');
    await expect(page.locator('.feedrow').first().getByLabel('Max kg/day')).toBeVisible();
    await feedsDetailsToggle.click();
    await expect(feedsDetailsToggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.feedrow').first().getByLabel('Max kg/day')).toHaveCount(0);

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

    // 7. Balance ration offline, verify Explain is disabled with "Needs internet", toggle Show details, inspect cited & solver audit drawers, and copy summary (AC-5.1, AC-6.1, AC-6.2, AC-6.3, AC-8.1, AC-E3.1)
    const balanceBtn = page.getByRole('button', { name: 'Balance ration' });
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
});

