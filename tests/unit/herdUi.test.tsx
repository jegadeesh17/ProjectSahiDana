import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/App';
import { AuditProvider } from '../../src/components/AuditDrawer';
import { HerdPlanView } from '../../src/components/HerdPlan';
import { LanguageProvider } from '../../src/i18n/LanguageProvider';
import { setActiveLang } from '../../src/i18n/lang';
import { strings, t } from '../../src/i18n/strings';
import { BREEDS } from '../../src/domain/breeds';
import { DEFAULT_FEED_LIBRARY } from '../../src/domain/solver';
import { planHerd } from '../../src/domain/herdPlan';
import type { FeedItem, HerdAnimal, HomeFeed } from '../../src/domain/types';

describe('herdUi (Change 4 Milestone 1 UI and 3-screen flow)', () => {
  beforeEach(() => {
    window.location.hash = '#/animals';
    window.localStorage.clear();
    setActiveLang('en');
    window.scrollTo = () => undefined;
    Element.prototype.scrollIntoView = () => undefined;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    setActiveLang('en');
    document.documentElement.lang = 'en';
  });

  // ---- 1. Screen 1 Gating and disabled Next (AC-C4-1.8, AC-C4-E1, AC-C4-E2) -------------------
  describe('Screen 1 gating lines and Next button', () => {
    it('shows both gating reasons when no animals and no budget are present (AC-C4-1.8, E1, E2)', () => {
      const { container } = render(<App />);
      const nextBtn = screen.getByRole('button', { name: t('c4_action_next').en }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);

      const reasons = container.querySelectorAll('.c4-bar-reason li');
      expect(reasons.length).toBe(2);
      expect(container.textContent).toContain('Add at least one animal');
      expect(container.textContent).toContain('Enter how much you can spend each day');
    });

    it('shows only budget gating reason when animal is added but budget is missing', () => {
      const { container } = render(<App />);
      // Add buffalo: select species, breed, enter milk, submit
      fireEvent.click(screen.getByRole('button', { name: strings.label_buffalo.en }));
      const breedSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(breedSelect, { target: { value: 'murrah' } });
      const milkInput = container.querySelector('input[id$="-milk"]') as HTMLInputElement;
      fireEvent.change(milkInput, { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_add_animal').en }));

      const nextBtn = screen.getByRole('button', { name: t('c4_action_next').en }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
      expect(container.textContent).not.toContain('Add at least one animal');
      expect(container.textContent).toContain('Enter how much you can spend each day');
    });

    it('shows field error when budget is 0 or negative', () => {
      const { container } = render(<App />);
      const budgetInput = container.querySelector('input[id*="input"].num') as HTMLInputElement;
      expect(budgetInput).toBeTruthy();

      fireEvent.change(budgetInput, { target: { value: '0' } });
      fireEvent.blur(budgetInput);

      expect(container.textContent).toContain('Budget must be a positive number in ₹/day');
      const nextBtn = screen.getByRole('button', { name: t('c4_action_next').en }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(true);
    });

    it('enables Next when at least 1 animal and positive budget exist', () => {
      const { container } = render(<App />);
      // Click Example 1 (cow_buffalo: 1 Murrah buffalo, 220 budget)
      const exBtn = container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement;
      fireEvent.click(exBtn);

      const nextBtn = screen.getByRole('button', { name: t('c4_action_next').en }) as HTMLButtonElement;
      expect(nextBtn.disabled).toBe(false);
      expect(container.querySelector('.c4-bar-reason')).toBeNull();
    });
  });

  // ---- 2. Add-animal card and list, hidden at 1 animal for M1 (AC-C4-1.2, AC-C4-1.6) ----------
  describe('Add-animal card, list, and single-animal limit (M1)', () => {
    it('prefills weight and fat with typical hint and midpoints (AC-C4-1.3, AC-C4-1.4)', () => {
      const { container } = render(<App />);
      // Select Cow, then pick Rathi
      fireEvent.click(screen.getByRole('button', { name: strings.label_cow.en }));
      const breedSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(breedSelect, { target: { value: 'rathi' } });

      const weightInput = container.querySelector('input[id$="-weight"]') as HTMLInputElement;
      const fatInput = container.querySelector('input[id$="-fat"]') as HTMLInputElement;
      expect(weightInput.value).toBe('295');
      expect(fatInput.value).toBe('3.85');

      expect(container.textContent).toContain('typical for this breed — change if you know');
      expect(container.textContent).toContain('calculated from cited range');
    });

    it('hides the add-animal card once 1 animal is listed in M1 (AC-C4-1.6)', () => {
      const { container } = render(<App />);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();

      // Load example 1
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);

      // Card must be hidden because 1 animal is listed and MAX_ANIMALS is 1
      expect(container.querySelector('[data-c4="animal-card"]')).toBeNull();
      expect(container.querySelector('.c4-list-row')).toBeTruthy();
      expect(container.textContent).toContain('Buffalo 1');
    });

    it('reopens the card on Edit and preserves key/label upon save', () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);

      const editBtn = screen.getByRole('button', { name: /^Edit/i });
      fireEvent.click(editBtn);

      // Card is reopened with editing values
      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();
      const milkInput = container.querySelector('input[id$="-milk"]') as HTMLInputElement;
      expect(milkInput.value).toBe('8');

      fireEvent.change(milkInput, { target: { value: '9' } });
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_save').en }));

      // Card is hidden again, milk updated to 9 L/day, label still Buffalo 1
      expect(container.querySelector('[data-c4="animal-card"]')).toBeNull();
      expect(container.textContent).toContain('Buffalo 1');
      expect(container.textContent).toMatch(/9\s*L/);
    });

    it('reopens the add card when the animal is removed', () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeNull();

      const removeBtn = screen.getByRole('button', { name: /^Remove/i });
      fireEvent.click(removeBtn);

      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();
      expect(container.querySelector('.c4-list-row')).toBeNull();
    });
  });

  // ---- 3. Screen 2 Home feeds (AC-C4-1.9, AC-C4-1.10, AC-C4-E4) -------------------------------
  describe('Screen 2 home feeds', () => {
    it('shows skip note, no price field, no season mark, no month selector (AC-C4-1.9)', () => {
      const { container } = render(<App />);
      // Load example with home feed (straw_only: 5 kg wheat straw)
      fireEvent.click(container.querySelector('[data-example="straw_only"]') as HTMLButtonElement);
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_next').en }));

      expect(container.textContent).toContain('Skip if you have nothing at home.');
      expect(container.textContent).toContain('Wheat straw');

      // Verify no price field, no season mark, no month control
      expect(container.querySelector('input[id*="price"]')).toBeNull();
      expect(container.querySelector('select[id*="month"]')).toBeNull();
      expect(container.textContent).not.toContain('In season');
      expect(container.textContent).not.toContain('Out of season');
    });

    it('disables Calculate ration when a home feed row has invalid kg (AC-C4-E4)', () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="straw_only"]') as HTMLButtonElement);
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_next').en }));

      const kgInput = container.querySelector('input[id*="kg-wheat_straw"]') as HTMLInputElement;
      fireEvent.change(kgInput, { target: { value: '0' } });
      fireEvent.blur(kgInput);

      expect(container.textContent).toContain('Enter kg per day for every feed, or remove it');
      const calcBtn = screen.getByRole('button', { name: strings.action_balance_ration.en }) as HTMLButtonElement;
      expect(calcBtn.disabled).toBe(true);
    });
  });

  // ---- 4. Screen 3 sections, units, season line, and plain words -----------------------------
  describe('Screen 3 HerdPlanView and display units', () => {
    const buffalo: HerdAnimal = {
      key: 'a1',
      label: { species: 'buffalo', n: 1 },
      profile: {
        species: 'buffalo',
        breedId: 'murrah',
        bodyWeightKg: 500,
        milkYieldLitersPerDay: 8,
        milkFatPct: 7.0,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    const cow: HerdAnimal = {
      key: 'a1',
      label: { species: 'cow', n: 1 },
      profile: {
        species: 'cow',
        breedId: 'hariana',
        bodyWeightKg: 325,
        milkYieldLitersPerDay: 5,
        milkFatPct: 4.5,
      },
      weightSource: 'typed',
      fatSource: 'typed',
      isConfirmed: true,
    };

    it('renders section order: season line -> shopping list -> cards -> not needed -> prompt (AC-C4-1.13-1.18, 1.30)', () => {
      const homeFeeds: HomeFeed[] = [
        { feedId: 'wheat_straw', kgPerDay: 5 },
        { feedId: 'mustard_cake', kgPerDay: 10 },
      ];
      // month 10 (October)
      const plan = planHerd([cow], homeFeeds, 150, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // Verify season line exists and contains date
      const seasonLine = container.querySelector('[data-c4="season-line"]');
      expect(seasonLine).toBeTruthy();
      expect(seasonLine?.textContent).toContain('16 October');

      // Verify shopping list section
      const shopping = container.querySelector('[data-c4="shopping"]');
      expect(shopping).toBeTruthy();
      expect(shopping?.textContent).toContain('What to buy');
      expect(shopping?.textContent).toContain('Buy first');

      // Total line
      const totalLine = container.querySelector('[data-testid="shop-total"]');
      expect(totalLine).toBeTruthy();
      expect(totalLine?.textContent).toMatch(/₹\d+ of your ₹150 a day/);

      // Animal cards
      const cards = container.querySelector('[data-c4="cards"]');
      expect(cards).toBeTruthy();
      expect(cards?.textContent).toContain('What to give each animal');
      expect(cards?.textContent).toContain('Cow 1');
      expect(cards?.textContent).toContain('From home');

      // Details collapsed by default, expandable
      const detailsToggle = container.querySelector('.details-toggle') as HTMLElement;
      expect(detailsToggle).toBeTruthy();
      expect(container.querySelector('[data-details="true"]')).toBeNull();
      fireEvent.click(detailsToggle);
      expect(container.querySelector('[data-details="true"]')).toBeTruthy();
      fireEvent.click(detailsToggle);
      expect(container.querySelector('[data-details="true"]')).toBeNull();
    });

    it('shows Nothing to buy today when buy list is empty (AC-C4-1.14a)', () => {
      const freeFeeds: HomeFeed[] = [
        { feedId: 'wheat_straw', kgPerDay: 5 },
        { feedId: 'maize_green', kgPerDay: 30 },
        { feedId: 'mustard_cake', kgPerDay: 4 },
        { feedId: 'bajra_grain', kgPerDay: 5 },
        { feedId: 'mineral_mix', kgPerDay: 0.15 },
        { feedId: 'common_salt', kgPerDay: 0.1 },
      ];
      const plan = planHerd([buffalo], freeFeeds, 200, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      expect(plan.shopping?.buyFirst.length).toBe(0);
      expect(plan.shopping?.later.length).toBe(0);

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      expect(container.textContent).toContain('Nothing to buy today');
      expect(container.querySelector('.c4-group-first')).toBeNull();
      expect(container.querySelector('[data-testid="shop-total"]')).toBeNull();
    });

    it('shows dry message for dry animal card (AC-C4-1.15)', () => {
      const dryCow: HerdAnimal = {
        key: 'a1',
        label: { species: 'cow', n: 1 },
        profile: {
          species: 'cow',
          breedId: 'hariana',
          bodyWeightKg: 350,
          milkYieldLitersPerDay: 0,
          milkFatPct: 0,
        },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      };
      const plan = planHerd([dryCow], [], 100, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      expect(container.textContent).toContain('keeps her healthy (dry)');
      expect(container.textContent).not.toContain('enough for about');
    });

    it('omits gain/milk element from later shop rows for a dry herd (AC-C4-1.14)', () => {
      const dryCow: HerdAnimal = {
        key: 'a1',
        label: { species: 'cow', n: 1 },
        profile: {
          species: 'cow',
          breedId: 'hariana',
          bodyWeightKg: 350,
          milkYieldLitersPerDay: 0,
          milkFatPct: 0,
        },
        weightSource: 'typed',
        fatSource: 'typed',
        isConfirmed: true,
      };
      const dryPlan = planHerd([dryCow], [], 100, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      if (dryPlan.status !== 'optimal') throw new Error('dryPlan must be optimal');

      const dryPlanWithLater = {
        ...dryPlan,
        shopping: {
          ...dryPlan.shopping,
          later: [
            {
              line: { feedId: 'mustard_cake', kgPerDay: 1.0, costInrPerDay: 30, priceInrPerKg: 30, perAnimalKg: [{ key: 'a1', kg: 1.0 }] },
              deltaMilkExactL: 0,
              deltaMilkL: 0,
              step: { k: 2, prefixFeedIds: ['wheat_straw', 'mustard_cake'], addedFeedIds: ['mustard_cake'], shareT: 0, totalMilkL: 0, purchaseCostInrPerDay: 50 },
              previous: { k: 1, prefixFeedIds: ['wheat_straw'], addedFeedIds: ['wheat_straw'], shareT: 0, totalMilkL: 0, purchaseCostInrPerDay: 20 },
            },
          ],
        },
      };

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={dryPlanWithLater} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      const laterGroup = container.querySelector('[data-group="later"]');
      expect(laterGroup).toBeTruthy();
      const laterRow = laterGroup?.querySelector('.c4-shop-row');
      expect(laterRow).toBeTruthy();

      // c4-shop-gain span must be omitted when isDryHerd is true
      expect(laterGroup?.querySelector('.c4-shop-gain')).toBeNull();
      expect(laterRow?.textContent).not.toContain('same milk');
      expect(laterRow?.textContent).not.toContain('उतना ही दूध');
    });

    it('enforces farmer display units on main view (AC-C4-1.19)', () => {
      const plan = planHerd([cow], [{ feedId: 'wheat_straw', kgPerDay: 5 }], 150, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // Main view text
      const mainText = container.textContent ?? '';

      // Every rupee amount is a whole integer (no ₹X.YY)
      const rupeeDecimals = mainText.match(/₹\d+\.\d+/g);
      expect(rupeeDecimals).toBeNull();

      // Mineral mix and salt must be in grams, not kg
      const mineralRow = container.querySelector('[data-feed="mineral_mix"]');
      const saltRow = container.querySelector('[data-feed="common_salt"]');
      if (mineralRow) {
        expect(mineralRow.textContent).toMatch(/\d+\s*g/);
        expect(mineralRow.textContent).not.toMatch(/\d+(\.\d+)?\s*kg/);
      }
      if (saltRow) {
        expect(saltRow.textContent).toMatch(/\d+\s*g/);
        expect(saltRow.textContent).not.toMatch(/\d+(\.\d+)?\s*kg/);
      }
    });

    it('passes plain-words scan on main view outside details (AC-C4-1.21)', () => {
      const plan = planHerd([cow], [{ feedId: 'wheat_straw', kgPerDay: 5 }], 150, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // Clone and remove details & audit drawer if any
      const clone = container.cloneNode(true) as HTMLElement;
      for (const el of clone.querySelectorAll('[data-details], .details, [role="dialog"]')) {
        el.remove();
      }
      const text = clone.textContent ?? '';

      // Must not contain DM, ME, CP, rung, binding, supported milk, Stage (case-insensitive word boundary)
      const forbidden = /\b(DM|ME|CP|rung|binding|supported milk|Stage)\b/i;
      expect(text.match(forbidden)).toBeNull();
    });

    it('opens audit drawer with exact unrounded value when numbers are tapped (AC-C4-1.20)', () => {
      const plan = planHerd([cow], [{ feedId: 'wheat_straw', kgPerDay: 5 }], 150, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // Tap the season line date
      const seasonFig = container.querySelector('[data-c4="season-line"] button.fig') as HTMLButtonElement;
      expect(seasonFig).toBeTruthy();
      act(() => {
        fireEvent.click(seasonFig);
      });

      const seasonDrawer = document.querySelector('[data-audit-id="season-set"]');
      expect(seasonDrawer).toBeTruthy();
      expect(seasonDrawer?.textContent).toContain('Cited source');

      // Tap an animal card kg figure
      const cardFig = container.querySelector('.c4-acard button.fig') as HTMLButtonElement;
      expect(cardFig).toBeTruthy();
      act(() => {
        fireEvent.click(cardFig);
      });

      const cardDrawer = document.querySelector('[data-audit-id^="card-kg-"]');
      expect(cardDrawer).toBeTruthy();
      expect(cardDrawer?.textContent).toContain('Solver output');
    });

    it('renders below_maintenance status with season line and shortfall prompt only (AC-C4-E3)', () => {
      const plan = planHerd([buffalo], [], 10, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      expect(plan.status).toBe('below_maintenance');

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      expect(container.querySelector('[data-c4="season-line"]')).toBeTruthy();
      expect(container.textContent).toContain('Spend at least');
      expect(container.querySelector('[data-c4="shopping"]')).toBeNull();
      expect(container.querySelector('[data-c4="cards"]')).toBeNull();
    });

    it('contains no AI controls on any screen (AC-C4-1.34)', () => {
      const { container } = render(<App />);
      // Screen 1: no free-text extractor, no explain button
      expect(container.querySelector('[data-testid="free-text-extractor"]')).toBeNull();
      expect(container.textContent).not.toContain('Fill from description');
      expect(container.textContent).not.toContain('Explain');
      expect(container.textContent).not.toContain('Explain in simple words');
    });
  });
});
