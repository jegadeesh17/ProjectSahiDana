import { expect, test, type Page } from '@playwright/test';

/**
 * Allowed Latin tokens that legitimately appear inside Hindi strings/data:
 * - Metric & nutrient symbols (kg, DM, CP, ME, Ca, Mcal)
 * - Proper-noun acronyms & publication titles in source labels (AI, OpenRouter, DAHD, ICAR, NDDB, RCDF, CIRB, Buffalopedia, Down, To, Earth, Kisan, Tak)
 */
const ALLOWED_HI_LATIN = new Set([
  'kg',
  'DM',
  'CP',
  'ME',
  'Ca',
  'AI',
  'OpenRouter',
  'DAHD',
  'ICAR',
  'NDDB',
  'RCDF',
  'CIRB',
  'Buffalopedia',
  'Mcal',
  'Down',
  'To',
  'Earth',
  'Kisan',
  'Tak',
]);

async function assertLanguageIsolation(page: Page, lang: 'en' | 'hi', stateLabel: string) {
  const result = await page.evaluate(
    ({ allowedHiLatin }) => {
      const htmlLang = document.documentElement.lang;
      const fullText = document.body.textContent ?? '';
      const devaDigits = fullText.match(/[\u0966-\u096F]/g) ?? [];

      const clone = document.body.cloneNode(true) as HTMLElement;
      for (const exempt of clone.querySelectorAll('[data-lang-exempt]')) {
        exempt.remove();
      }
      const textParts: string[] = [];
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      let current = walker.nextNode();
      while (current) {
        if (current.nodeValue) textParts.push(current.nodeValue);
        current = walker.nextNode();
      }
      const attrs = [...clone.querySelectorAll<HTMLElement>('[aria-label],[title],[placeholder]')].flatMap((el) =>
        ['aria-label', 'title', 'placeholder'].map((a) => el.getAttribute(a) ?? ''),
      );
      const nonExemptText = [...textParts, ...attrs].join(' ');

      const devaMatches = nonExemptText.match(/[\u0900-\u097F]+/g) ?? [];
      const allowedSet = new Set(allowedHiLatin);
      const latinMatches = (nonExemptText.match(/[A-Za-z]{2,}/g) ?? []).filter((w) => !allowedSet.has(w));

      return {
        htmlLang,
        devaDigits,
        devaMatches,
        latinMatches,
      };
    },
    { allowedHiLatin: [...ALLOWED_HI_LATIN] },
  );

  expect(result.htmlLang, `${stateLabel}: <html lang>`).toBe(lang);
  expect(result.devaDigits, `${stateLabel}: Western Arabic digits only (AC-L1.3)`).toEqual([]);

  if (lang === 'en') {
    expect(result.devaMatches, `${stateLabel} (en): zero Devanagari outside [data-lang-exempt]`).toEqual([]);
  } else {
    expect(result.latinMatches, `${stateLabel} (hi): zero unexempted Latin words outside [data-lang-exempt]`).toEqual([]);
  }
}

async function switchLang(page: Page, lang: 'en' | 'hi') {
  const btn = page.locator(`.langtoggle-btn[lang="${lang}"]`);
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
}

test.describe('Language toggle, persistence, and offline self-hosted fonts (AC-L1.1, AC-E3.1)', () => {
  test('persists sahidana.lang across online and offline reloads and loads self-hosted Noto Sans Devanagari offline', async ({
    page,
    context,
  }) => {
    await page.goto('/');

    // Default is English
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.langtoggle-btn[lang="en"]')).toHaveAttribute('aria-pressed', 'true');

    // Switch to Hindi and verify localStorage persistence
    await switchLang(page, 'hi');
    const stored = await page.evaluate(() => window.localStorage.getItem('sahidana.lang'));
    expect(stored).toBe('hi');

    // Online reload preserves Hindi
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'hi');
    await expect(page.locator('.langtoggle-btn[lang="hi"]')).toHaveAttribute('aria-pressed', 'true');

    // Go offline and verify Noto Sans Devanagari is ready from local self-hosted assets
    await context.setOffline(true);
    const fontCheck = await page.evaluate(async () => {
      await document.fonts.ready;
      return document.fonts.check('16px "Noto Sans Devanagari"');
    });
    expect(fontCheck).toBe(true);

    // Offline interactions keep working in Hindi with zero Devanagari digits
    await page.locator('[data-preset="buffalo"]').click();
    await expect(page.locator('.solved')).toBeVisible();
    await assertLanguageIsolation(page, 'hi', 'offline-hindi-solved');

    await context.setOffline(false);
  });
});

test.describe('One language at a time across every screen state and modal (AC-L1.2, AC-L1.3, AC-L1.4, AC-L1.6, AC-L1.7)', () => {
  test('enforces strict English and Hindi isolation across all 10 required screen states', async ({
    page,
    context,
  }) => {
    let extractMode: 'success' | 'error' = 'success';
    let explainMode: 'verified' | 'untraced' = 'verified';

    await page.route('**/api/llm', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.action === 'extract') {
        if (extractMode === 'error') {
          await route.fulfill({
            status: 429,
            contentType: 'application/json',
            body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Rate limited' } }),
          });
          return;
        }
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
            unmatchedFeeds: ['magic probiotic mix'],
          }),
        });
        return;
      }

      if (body.action === 'explain') {
        if (explainMode === 'untraced') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              action: 'explain',
              modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
              explanationText: 'This ration costs ₹999.99 per day.',
            }),
          });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            action: 'explain',
            modelUsed: 'meta-llama/llama-3.3-70b-instruct:free',
            explanationText:
              'Your 450 kg Murrah buffalo gives 8 L of milk a day at 6.5% fat. A budget of ₹299.50 per day supports 9.6 L of milk a day, up to the breed cap of 9.64 L.',
          }),
        });
        return;
      }

      await route.fallback();
    });

    await page.goto('/');

    // 1. Initial state
    await assertLanguageIsolation(page, 'en', '1-initial');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '1-initial');
    await switchLang(page, 'en');

    // 2. Validation error state (empty free-text error + invalid body weight error)
    await page.locator('.extractor button.disclosure').click();
    await page.getByRole('button', { name: 'Fill from description' }).click();
    await expect(page.locator('.extractor .field-error')).toBeVisible();

    const bodyWeightInput = page.getByLabel('Body weight');
    await bodyWeightInput.fill('100');
    await bodyWeightInput.blur();
    await expect(page.locator('.errors[role="alert"]')).toBeVisible();

    await assertLanguageIsolation(page, 'en', '2-validation-error');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '2-validation-error');
    await switchLang(page, 'en');

    // 3. Prefilled state (with matched feeds + unmatched feed resolution card)
    await page.locator('.extractor-body textarea').fill('450 kg Murrah buffalo giving 8 L milk, wheat straw, mustard cake, magic probiotic mix');
    await page.getByRole('button', { name: 'Fill from description' }).click();
    await expect(page.locator('.review')).toBeVisible();
    await expect(page.getByTestId('unmatched')).toBeVisible();

    await assertLanguageIsolation(page, 'en', '3-prefilled');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '3-prefilled');
    await switchLang(page, 'en');

    // Discard prefill to continue cleanly
    await page.getByRole('button', { name: 'Discard prefilled values' }).click();

    // 4. LLM error / fallback state in FreeTextExtractor
    extractMode = 'error';
    await page.getByRole('button', { name: 'Fill from description' }).click();
    await expect(page.locator('.extractor-body [role="alert"]')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '4a-extractor-llm-error');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '4a-extractor-llm-error');
    await switchLang(page, 'en');
    await page.locator('.extractor button.disclosure').click(); // close extractor

    // 5. Infeasible state (wheat straw only)
    await page.locator('[data-preset="straw"]').click();
    await expect(page.locator('#analysis[data-state="infeasible"]')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '5-infeasible');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '5-infeasible');
    await switchLang(page, 'en');

    // 6. Budget below maintenance state (daily budget = ₹30)
    await page.locator('[data-preset="buffalo"]').click();
    const budgetInput = page.getByRole('textbox', { name: 'Daily budget' });
    await budgetInput.fill('30');
    await page.getByRole('button', { name: 'Balance ration' }).click();
    await expect(page.locator('#analysis[data-state="shortfall"]')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '6-budget-below-maintenance');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '6-budget-below-maintenance');
    await switchLang(page, 'en');

    // 7. Solved state (details collapsed and expanded) + prototype fixture notice hidden in live mode
    await page.locator('[data-preset="buffalo"]').click();
    await expect(page.locator('.solved')).toBeVisible();
    await expect(page.locator('.frame-foot')).toHaveCount(0);

    await assertLanguageIsolation(page, 'en', '7a-solved-collapsed');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '7a-solved-collapsed');
    await switchLang(page, 'en');

    // Verify Plain-language explanation card in both fallback (untraced numbers) and verified states
    explainMode = 'untraced';
    await page.getByRole('button', { name: 'Explain' }).click();
    await expect(page.locator('section.explain[data-state="explain-fallback"]')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '4b-explain-fallback');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '4b-explain-fallback');
    await switchLang(page, 'en');

    explainMode = 'verified';
    await page.getByRole('button', { name: 'Explain' }).click();
    await expect(page.locator('section.explain[data-state="explain-verified"]')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '4c-explain-verified');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '4c-explain-verified');
    await switchLang(page, 'en');

    // Expand Show details
    await page.locator('.details-toggle').click();
    await expect(page.locator('#result-details')).toBeVisible();
    await assertLanguageIsolation(page, 'en', '7b-solved-expanded');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '7b-solved-expanded');
    await switchLang(page, 'en');

    // 8. Audit drawer state (solver figure + cited feed figure, plus DM constraint text check)
    await page.getByTestId('supports').locator('.supports-fig').click();
    const drawer = page.locator('[role="dialog"].sheet');
    await expect(drawer).toBeVisible();
    await assertLanguageIsolation(page, 'en', '8a-audit-drawer-solver');
    await drawer.getByRole('button', { name: 'Close' }).click();

    await switchLang(page, 'hi');
    await page.getByTestId('supports').locator('.supports-fig').click();
    await expect(drawer).toBeVisible();
    await assertLanguageIsolation(page, 'hi', '8a-audit-drawer-solver');
    await drawer.locator('.fp-head button').click();
    await switchLang(page, 'en');

    // Open a cited figure in Show details (40% roughage minimum)
    await page.locator('#result-details .fig').filter({ hasText: '40%' }).first().click();
    await expect(drawer).toBeVisible();
    await assertLanguageIsolation(page, 'en', '8b-audit-drawer-cited');
    await drawer.getByRole('button', { name: 'Close' }).click();

    await switchLang(page, 'hi');
    await page.locator('#result-details .fig').filter({ hasText: '40%' }).first().click();
    await expect(drawer).toBeVisible();
    await assertLanguageIsolation(page, 'hi', '8b-audit-drawer-cited');
    await drawer.locator('.fp-head button').click();
    await switchLang(page, 'en');

    // Open DM supplied figure in nutrient bars and verify legacy "(and ≥ 85% of the limit)" parenthetical is gone
    await page.locator('#result-details .nutrient').first().locator('.fig').first().click();
    await expect(drawer).toBeVisible();
    await expect(drawer).not.toContainText('85%');
    await drawer.getByRole('button', { name: 'Close' }).click();

    // 9. Copy confirmation & reactive toast translation across language switch
    await page.getByRole('button', { name: 'Copy summary' }).click();
    const toast = page.locator('.toast[role="status"]');
    await expect(toast).toContainText('Summary copied');
    await assertLanguageIsolation(page, 'en', '9-copy-toast-en');

    // Switch to Hindi while the toast is still visible: toast text must update immediately
    await switchLang(page, 'hi');
    await expect(toast).toContainText('सारांश कॉपी हो गया');
    await expect(toast).not.toContainText('Summary copied');
    await assertLanguageIsolation(page, 'hi', '9-copy-toast-hi');
    await switchLang(page, 'en');

    // 10. Offline state
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('.tag-offline').first()).toBeVisible();
    await assertLanguageIsolation(page, 'en', '10-offline');
    await switchLang(page, 'hi');
    await assertLanguageIsolation(page, 'hi', '10-offline');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  });
});

test.describe('UI polish & harden pass (touch targets, focus restoration, reduced motion, desktop/mobile layout)', () => {
  test('meets 44x44px minimum touch targets and zero horizontal overflow at 390x844 mobile viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();
    // Open feeds editor on mobile by tapping the first collapsed feed chip
    await page.locator('.feedchip').first().click();
    // Set month to July so Berseem shows the tappable Out of season .pill-btn
    await page.locator('.library-controls select').selectOption('7');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    // Check mobile sticky balance bar
    const mobileBarPos = await page.locator('.balancebar').evaluate((el) => getComputedStyle(el).position);
    expect(mobileBarPos).toBe('sticky');

    // Check primary interactive controls for >= 44x44 px touch targets (including .pill-btn Out of season)
    const selectors = [
      '.langtoggle-btn[lang="hi"]',
      '.langtoggle-btn[lang="en"]',
      '[data-preset="buffalo"]',
      '.pill-btn',
      '.feedrow-head .btn-quiet',
      '.librow-act',
      '.balancebar .btn-primary',
      '.extractor button.disclosure',
    ];

    for (const sel of selectors) {
      const box = await page.locator(sel).first().boundingBox();
      expect(box, `${sel} bounding box`).not.toBeNull();
      expect(box!.height, `${sel} height >= 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `${sel} width >= 44px`).toBeGreaterThanOrEqual(44);
    }
  });

  test('renders two-column asymmetric workspace without nested scrollbar or sticky bar at 1440x900 desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();

    const layout = await page.evaluate(() => {
      const pageEl = document.querySelector('main.page')!;
      const analysis = document.querySelector('#analysis')!;
      const bar = document.querySelector('.balancebar')!;
      return {
        columns: getComputedStyle(pageEl).gridTemplateColumns.split(' ').length,
        analysisOverflowY: getComputedStyle(analysis).overflowY,
        barPosition: getComputedStyle(bar).position,
      };
    });

    expect(layout.columns).toBe(2);
    expect(layout.analysisOverflowY).toBe('visible');
    expect(layout.barPosition).toBe('static');
  });

  test('restores focus to the triggering .fig button when closing AuditDrawer via Escape, scrim, or Close button', async ({
    page,
  }) => {
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();

    const trigger = page.getByTestId('supports').locator('.supports-fig');
    const drawer = page.locator('[role="dialog"].sheet');

    // 1. Close via Escape key
    await trigger.focus();
    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    // 2. Close via scrim click
    await trigger.click();
    await expect(drawer).toBeVisible();
    await page.locator('.scrim').click({ position: { x: 10, y: 10 } });
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();

    // 3. Close via Close button
    await trigger.click();
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: 'Close' }).click();
    await expect(drawer).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('disables drawer and skeleton animations when prefers-reduced-motion: reduce is active', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();
    await page.getByTestId('supports').locator('.supports-fig').click();

    const drawerAnim = await page.locator('[role="dialog"].sheet').evaluate((el) => getComputedStyle(el).animationName);
    expect(drawerAnim).toBe('none');
  });

  test('verifies cross-lingual feed search parity, breed names, and season/price notes in the active language without reload (AC-L1.4, AC-L1.7, AC-L1.3)', async ({
    page,
  }) => {
    await page.goto('/');

    // Invalid stored language code falls back cleanly to English
    await page.evaluate(() => window.localStorage.setItem('sahidana.lang', 'invalid-code'));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Entering Devanagari digits into an input immediately normalizes to Latin digits (AC-L1.3)
    const weightInput = page.locator('input[id*="weight"]');
    await weightInput.fill('४५०');
    await expect(weightInput).toHaveValue('450');

    // Breed names from data/breeds.csv in English and Hindi (AC-L1.7)
    await page.getByRole('button', { name: 'Buffalo', exact: true }).click();
    const breedSelect = page.locator('fieldset select');
    await breedSelect.selectOption('murrah');
    await expect(breedSelect.locator('option[value="murrah"]')).toHaveText('Murrah');

    // Cross-lingual feed search in English mode (AC-L1.4)
    const searchInput = page.locator('input[type="search"]');
    for (const q of ['Mustard', 'Sarson', 'सरसों']) {
      await searchInput.fill(q);
      await expect(page.locator('.libgroup[data-vertical="agro_byproduct"] .librow-name')).toContainText(['Mustard cake']);
    }
    await searchInput.fill('');

    // Switch to Hindi without reload: form state stays intact and breed/group/month/feed names switch to Hindi
    await switchLang(page, 'hi');
    await expect(weightInput).toHaveValue('450');
    await expect(breedSelect.locator('option[value="murrah"]')).toHaveText('मुर्रा');
    for (const q of ['Mustard', 'Sarson', 'सरसों']) {
      await searchInput.fill(q);
      await expect(page.locator('.libgroup[data-vertical="agro_byproduct"] .librow-name')).toContainText(['सरसों खल']);
    }
    await searchInput.fill('');


    // Out-of-season note and price note from {en, hi} pair in AuditDrawer (AC-L1.7)
    await switchLang(page, 'en');
    await page.locator('.library-controls select').selectOption('7');
    const berseemRow = page.locator('.librow').filter({ hasText: 'Berseem' });
    await berseemRow.locator('[data-season="out"]').click();
    const drawer = page.locator('[role="dialog"].sheet');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Season: Berseem');
    await assertLanguageIsolation(page, 'en', 'season-note-drawer-en');
    await drawer.getByRole('button', { name: 'Close' }).click();

    // Re-open in Hindi mode
    await switchLang(page, 'hi');
    const berseemHiRow = page.locator('.librow').filter({ hasText: 'बरसीम' });
    await berseemHiRow.locator('[data-season="out"]').click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('बरसीम');
    await assertLanguageIsolation(page, 'hi', 'season-note-drawer-hi');
    await drawer.locator('.fp-head button').click();
    await switchLang(page, 'en');
  });


  test('meets WCAG 2.2 AA contrast ratio (>= 4.5:1) across key text and surface color pairs', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-preset="buffalo"]').click();

    const contrasts = await page.evaluate(() => {
      function parseRgb(color: string): [number, number, number] {
        const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
      }
      function relLum([r, g, b]: [number, number, number]): number {
        const chan = (c: number) => {
          const s = c / 255;
          return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
      }
      function ratio(fg: string, bg: string): number {
        const l1 = relLum(parseRgb(fg));
        const l2 = relLum(parseRgb(bg));
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
      }

      const root = getComputedStyle(document.documentElement);
      const resolveHex = (varName: string, prop: 'color' | 'backgroundColor') => {
        const probe = document.createElement('span');
        probe.style[prop] = `var(${varName})`;
        document.body.appendChild(probe);
        const computed = getComputedStyle(probe)[prop];
        probe.remove();
        return computed;
      };

      const cSurface = resolveHex('--c-surface', 'backgroundColor');
      const cGround = resolveHex('--c-ground', 'backgroundColor');
      const cTrack = resolveHex('--c-track', 'backgroundColor');
      const cText = resolveHex('--c-text', 'color');
      const cText2 = resolveHex('--c-text-2', 'color');
      const cAccent = resolveHex('--c-accent', 'backgroundColor');
      const cAccentInk = resolveHex('--c-accent-ink', 'color');
      const cAccentTint = resolveHex('--c-accent-tint', 'backgroundColor');
      const cWarnInk = resolveHex('--c-warn-ink', 'color');
      const cWarnTint = resolveHex('--c-warn-tint', 'backgroundColor');
      const cDangerInk = resolveHex('--c-danger-ink', 'color');
      const cDangerTint = resolveHex('--c-danger-tint', 'backgroundColor');

      void root;
      return {
        textOnSurface: ratio(cText, cSurface),
        textOnGround: ratio(cText, cGround),
        text2OnSurface: ratio(cText2, cSurface),
        text2OnGround: ratio(cText2, cGround),
        text2OnTrack: ratio(cText2, cTrack),
        surfaceOnAccent: ratio(cSurface, cAccent),
        accentInkOnTint: ratio(cAccentInk, cAccentTint),
        warnInkOnTint: ratio(cWarnInk, cWarnTint),
        dangerInkOnTint: ratio(cDangerInk, cDangerTint),
      };
    });

    for (const [pair, val] of Object.entries(contrasts)) {
      expect(val, `${pair} contrast ratio >= 4.5:1`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

