import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  function addAnimalForm(
    container: HTMLElement,
    species: 'cow' | 'buffalo',
    breedId: string,
    milk: string,
  ) {
    const speciesBtn = screen.getByRole('button', {
      name: species === 'cow' ? strings.label_cow.en : strings.label_buffalo.en,
    });
    fireEvent.click(speciesBtn);

    const breedSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(breedSelect, { target: { value: breedId } });

    const milkInput = container.querySelector('input[id$="-milk"]') as HTMLInputElement;
    fireEvent.change(milkInput, { target: { value: milk } });

    const addBtn = screen.getByRole('button', { name: t('c4_action_add_animal').en });
    fireEvent.click(addBtn);
  }

  // ---- 2. Add-animal card, list, and multi-animal limits (M2, AC-C4-2.1, AC-C4-E5) -------------
  describe('Add-animal card, list, and multi-animal limits (M2)', () => {
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

    it('card remains open when animals.length < 10, hidden when animals.length >= 10 with c4_max_animals message (AC-C4-2.1, AC-C4-E5)', () => {
      const { container } = render(<App />);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();

      // Add 9 animals: card must stay open and no limit message
      for (let i = 1; i <= 9; i++) {
        const species = i % 2 === 1 ? 'cow' : 'buffalo';
        const breed = i % 2 === 1 ? 'rathi' : 'murrah';
        addAnimalForm(container, species, breed, '5');
        expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();
        expect(container.textContent).not.toContain('You can add up to 10 animals');
      }

      expect(container.querySelectorAll('.c4-list-row').length).toBe(9);

      // Add 10th animal: card hidden, limit message shown
      addAnimalForm(container, 'cow', 'hariana', '6');
      expect(container.querySelectorAll('.c4-list-row').length).toBe(10);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeNull();
      expect(container.textContent).toContain('You can add up to 10 animals');

      // Edit an animal reopens the card
      const firstEditBtn = screen.getAllByRole('button', { name: /^Edit/i })[0];
      fireEvent.click(firstEditBtn);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();

      // Saving edit re-hides card
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_save').en }));
      expect(container.querySelector('[data-c4="animal-card"]')).toBeNull();
      expect(container.textContent).toContain('You can add up to 10 animals');

      // Remove one animal -> count drops to 9, card reopens, limit message disappears
      const firstRemoveBtn = screen.getAllByRole('button', { name: /^Remove/i })[0];
      fireEvent.click(firstRemoveBtn);
      expect(container.querySelectorAll('.c4-list-row').length).toBe(9);
      expect(container.querySelector('[data-c4="animal-card"]')).toBeTruthy();
      expect(container.textContent).not.toContain('You can add up to 10 animals');
    });

    it('monotonic animal labeling per species (AC-C4-2.1)', () => {
      const { container } = render(<App />);
      // Add Cow 1
      addAnimalForm(container, 'cow', 'rathi', '6');
      expect(container.textContent).toContain('Cow 1');

      // Add Cow 2
      addAnimalForm(container, 'cow', 'hariana', '5');
      expect(container.textContent).toContain('Cow 2');

      // Add Buffalo 1
      addAnimalForm(container, 'buffalo', 'murrah', '8');
      expect(container.textContent).toContain('Buffalo 1');

      // List has 3 animals: Cow 1, Cow 2, Buffalo 1
      const rows = container.querySelectorAll('.c4-list-row');
      expect(rows.length).toBe(3);

      // Remove Cow 1
      const removeCow1Btn = screen.getByRole('button', { name: /Remove.*Cow 1/i });
      fireEvent.click(removeCow1Btn);

      const rowsAfter = container.querySelectorAll('.c4-list-row');
      expect(rowsAfter.length).toBe(2);
      expect(container.textContent).not.toContain('Cow 1');
      expect(container.textContent).toContain('Cow 2');
      expect(container.textContent).toContain('Buffalo 1');

      // Add another Cow -> must be Cow 3 (not reusing Cow 1)
      addAnimalForm(container, 'cow', 'tharparkar', '4');
      expect(container.textContent).toContain('Cow 3');
      expect(container.textContent).not.toContain('Cow 1');
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

    it('omits "Then, if you can" completely for a dry herd (AC-C4-E12)', () => {
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

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={dryPlan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // "Then, if you can" group must be omitted completely for a dry herd
      expect(container.querySelector('[data-group="later"]')).toBeNull();
      expect(container.textContent).not.toContain('Then, if you can');
      expect(container.textContent).not.toContain('फिर, हो सके तो');
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

  async function navigateToScreen3(_container?: HTMLElement) {
    const nextBtn = screen.getByRole('button', { name: t('c4_action_next').en });
    fireEvent.click(nextBtn);

    const calcBtn = screen.getByRole('button', { name: strings.action_balance_ration.en });
    fireEvent.click(calcBtn);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }

  // ---- 5. Screen 3 multi-animal removal (AC-C4-2.2) --------------------------------------------
  describe('Screen 3 multi-animal removal (AC-C4-2.2)', () => {
    it('removal on screen 3 returns to screen 1 (#/animals), drops plan, retains remaining animals, budget, and home feeds (AC-C4-2.2)', async () => {
      const { container } = render(<App />);
      // Load example cow_buffalo (Cow 1, Buffalo 1, 10kg wheat straw, 400 budget)
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);

      await navigateToScreen3(container);

      // Verify on screen 3 with 2 animal cards
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Your plan');
      const cards = container.querySelectorAll('.c4-acard');
      expect(cards.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Buffalo 1');

      // Click remove on Cow 1
      const cow1Card = container.querySelector('.c4-acard[data-animal="a1"]') as HTMLElement;
      expect(cow1Card).toBeTruthy();
      const removeBtn = cow1Card.querySelector('button.btn-quiet') as HTMLButtonElement;
      expect(removeBtn).toBeTruthy();
      fireEvent.click(removeBtn);

      // Returns to screen 1 (#/animals)
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Your animals');
      expect(window.location.hash).toBe('#/animals');

      // Remaining animal (Buffalo 1) is kept, Cow 1 is removed
      const rows = container.querySelectorAll('.c4-list-row');
      expect(rows.length).toBe(1);
      expect(container.textContent).toContain('Buffalo 1');
      expect(container.textContent).not.toContain('Cow 1');

      // Budget is kept (400)
      const budgetInput = container.querySelector('.c4-budget input.num') as HTMLInputElement;
      expect(budgetInput.value).toBe('400');

      // Go to screen 2: home feeds are kept
      fireEvent.click(screen.getByRole('button', { name: t('c4_action_next').en }));
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Feed you already have');
      const strawInput = container.querySelector('input[id*="kg-wheat_straw"]') as HTMLInputElement;
      expect(strawInput).toBeTruthy();
      expect(strawInput.value).toBe('10');

      // Navigating directly to #/result is guarded back to #/feeds because plan was dropped
      act(() => {
        window.location.hash = '#/result';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Feed you already have');

      // Recalculating computes plan for remaining animal
      const calcBtn = screen.getByRole('button', { name: strings.action_balance_ration.en });
      fireEvent.click(calcBtn);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Your plan');
      const newCards = container.querySelectorAll('.c4-acard');
      expect(newCards.length).toBe(1);
      expect(container.textContent).toContain('Buffalo 1');
    });
  });

  // ---- 6. All 3 herd presets load and solve (AC-C4-2.11) ---------------------------------------
  describe('All 3 herd presets load and solve (AC-C4-2.11)', () => {
    it('cow_buffalo loads Cow 1 and Buffalo 1 and solves with both cards (AC-C4-2.11)', async () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);

      const rows = container.querySelectorAll('.c4-list-row');
      expect(rows.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Buffalo 1');
      const budgetInput = container.querySelector('.c4-budget input.num') as HTMLInputElement;
      expect(budgetInput.value).toBe('400');

      await navigateToScreen3(container);

      expect(container.querySelector('[data-c4="shopping"]')).toBeTruthy();
      const cards = container.querySelectorAll('.c4-acard');
      expect(cards.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Buffalo 1');
    });

    it('straw_only loads multi-animal herd and solves with shopping list (AC-C4-2.11)', async () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="straw_only"]') as HTMLButtonElement);

      const rows = container.querySelectorAll('.c4-list-row');
      expect(rows.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Cow 2');

      await navigateToScreen3(container);

      const shopping = container.querySelector('[data-c4="shopping"]');
      expect(shopping).toBeTruthy();
      expect(shopping?.querySelectorAll('.c4-shop-row').length).toBeGreaterThanOrEqual(1);
      const cards = container.querySelectorAll('.c4-acard');
      expect(cards.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Cow 2');
    });

    it('tight_budget loads multi-animal herd and shows budget prompt (AC-C4-2.11)', async () => {
      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="tight_budget"]') as HTMLButtonElement);

      const rows = container.querySelectorAll('.c4-list-row');
      expect(rows.length).toBe(2);
      expect(container.textContent).toContain('Cow 1');
      expect(container.textContent).toContain('Buffalo 1');

      await navigateToScreen3(container);

      expect(container.querySelector('[data-c4="budget-prompt"]')).toBeTruthy();
      expect(container.textContent).toContain('Add ₹');
    });
  });

  // ---- 7. Copy summary for multi-animal herd (AC-C4-2.14) -------------------------------------
  describe('Copy summary for multi-animal herd (AC-C4-2.14)', () => {
    it('includes all animal cards in screen-1 list order', async () => {
      let copiedText = '';
      const writeTextMock = vi.fn().mockImplementation((text: string) => {
        copiedText = text;
        return Promise.resolve();
      });
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      const { container } = render(<App />);
      fireEvent.click(container.querySelector('[data-example="cow_buffalo"]') as HTMLButtonElement);

      await navigateToScreen3(container);

      const copyBtn = screen.getByRole('button', { name: strings.action_copy_summary.en });
      fireEvent.click(copyBtn);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 10));
      });

      expect(writeTextMock).toHaveBeenCalled();
      expect(copiedText).toContain('Cow 1');
      expect(copiedText).toContain('Buffalo 1');
      const cow1Idx = copiedText.indexOf('Cow 1');
      const buffalo1Idx = copiedText.indexOf('Buffalo 1');
      expect(cow1Idx).toBeGreaterThan(-1);
      expect(buffalo1Idx).toBeGreaterThan(cow1Idx);
      expect(copiedText).toContain('What to buy');
      expect(copiedText).toContain('What to give each animal');
    });
  });

  // ---- 8. Milestone C4-M3: Beyond-budget expansion steps & interactive feed upgrade -----------
  describe('Milestone C4-M3: Beyond-budget expansion steps & interactive feed upgrade', () => {
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

    it('renders all within-budget feeds in "What to buy" without within-budget later split (AC-C4-3.1)', () => {
      const plan = planHerd([buffalo], [{ feedId: 'wheat_straw', kgPerDay: 4 }], 200, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      if (plan.status !== 'optimal') throw new Error('plan must be optimal');

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={plan} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      // Buy first group contains all within-budget bought feeds
      const firstGroup = container.querySelector('[data-group="first"]');
      expect(firstGroup).toBeTruthy();
      const firstRows = firstGroup?.querySelectorAll('.c4-shop-row');
      expect(firstRows?.length).toBe(plan.shopping.buyFirst.length);
      expect(firstRows?.length).toBeGreaterThan(0);

      // No within-budget feeds partitioned into later
      expect(plan.shopping.later.length).toBe(0);

      // Shopping total displays P(F) <= Bd
      const totalEl = container.querySelector('[data-testid="shop-total"]');
      expect(totalEl).toBeTruthy();
      expect(plan.shopping.totalInr).toBeLessThanOrEqual(200 + 1e-6);
    });

    it('renders "Then, if you can" with expansion details and accessible [+ Add to budget] button (AC-C4-3.3, AC-C4-3.4)', () => {
      const onAddBudget = vi.fn();
      const plan = planHerd([buffalo], [{ feedId: 'wheat_straw', kgPerDay: 4 }], 150, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      if (plan.status !== 'optimal') throw new Error('plan must be optimal');

      // Ensure expansion items are present
      expect(plan.expansionItems.length).toBeGreaterThan(0);
      const topItem = plan.expansionItems[0];

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView
              plan={plan}
              library={DEFAULT_FEED_LIBRARY as FeedItem[]}
              breeds={BREEDS}
              onRemoveAnimal={() => {}}
              onAddBudget={onAddBudget}
            />
          </AuditProvider>
        </LanguageProvider>,
      );

      const laterGroup = container.querySelector('[data-group="later"]');
      expect(laterGroup).toBeTruthy();
      expect(laterGroup?.textContent).toContain('Then, if you can');

      // Top expansion row rendered with feed name, delta kg, delta cost, and milk gain
      const expRows = laterGroup?.querySelectorAll('.c4-shop-row');
      expect(expRows?.length).toBe(plan.expansionItems.length);

      const firstRow = expRows?.[0];
      expect(firstRow?.getAttribute('data-feed')).toBe(topItem.feedId);
      expect(firstRow?.textContent).toContain(`(+₹${topItem.deltaCostInrPerDay})`);
      expect(firstRow?.textContent).toContain(`+`);
      expect(firstRow?.textContent).toContain('milk');

      // Interactive button
      const addBtn = firstRow?.querySelector('[data-testid="btn-add-budget"]') as HTMLButtonElement;
      expect(addBtn).toBeTruthy();
      expect(addBtn.textContent).toContain('+ Add to budget');
      expect(addBtn.getAttribute('aria-label')).toBe(`Add ₹${topItem.deltaCostInrPerDay}/day to budget for +${topItem.deltaMilkL} L milk`);

      // Touch target >= 44x44 px (btn class has min-height 48px, min-width 44px)
      expect(addBtn.classList.contains('c4-btn-add-budget')).toBe(true);
      expect(addBtn.classList.contains('btn')).toBe(true);

      // Tapping button triggers onAddBudget
      fireEvent.click(addBtn);
      expect(onAddBudget).toHaveBeenCalledWith(topItem.deltaCostInrPerDay);
    });

    it('omits "Then, if you can" when expansion items list is empty (AC-C4-3.6)', () => {
      const plan = planHerd([buffalo], [{ feedId: 'wheat_straw', kgPerDay: 4 }], 200, DEFAULT_FEED_LIBRARY as FeedItem[], BREEDS, 10, '2026-10-16');
      if (plan.status !== 'optimal') throw new Error('plan must be optimal');

      const planWithNoExpansions = {
        ...plan,
        expansionItems: [],
      };

      const { container } = render(
        <LanguageProvider>
          <AuditProvider>
            <HerdPlanView plan={planWithNoExpansions} library={DEFAULT_FEED_LIBRARY as FeedItem[]} breeds={BREEDS} onRemoveAnimal={() => {}} />
          </AuditProvider>
        </LanguageProvider>,
      );

      expect(container.querySelector('[data-group="later"]')).toBeNull();
      expect(container.textContent).not.toContain('Then, if you can');
    });

    it('tapping [+ Add to budget] updates budget and re-solves herd plan immediately (AC-C4-3.5, AC-C4-E14)', async () => {
      const { container } = render(<App />);
      // Load example tight_budget (Cow 1, Buffalo 1, 200 budget)
      fireEvent.click(container.querySelector('[data-example="tight_budget"]') as HTMLButtonElement);

      await navigateToScreen3(container);

      // On screen 3, verify "Then, if you can" and get the first add-to-budget button
      const laterGroup = container.querySelector('[data-group="later"]');
      expect(laterGroup).toBeTruthy();

      const addBtn = laterGroup?.querySelector('[data-testid="btn-add-budget"]') as HTMLButtonElement;
      expect(addBtn).toBeTruthy();

      // Read initial budget from total
      const initialTotal = container.querySelector('[data-testid="shop-total"]')?.textContent;

      // Click add to budget
      fireEvent.click(addBtn);

      // Immediately re-solves and updates Screen 3 view
      const updatedTotal = container.querySelector('[data-testid="shop-total"]')?.textContent;
      expect(updatedTotal).not.toBe(initialTotal);

      // Navigate back to Screen 2 and Screen 1 (AC-C4-E14)
      act(() => {
        window.location.hash = '#/feeds';
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Feed you already have');

      act(() => {
        window.location.hash = '#/animals';
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      expect(container.querySelector('h1#c4-title')?.textContent).toContain('Your animals');

      // Budget input on Screen 1 displays the updated budget > 200
      const budgetInput = container.querySelector('.c4-budget input.num') as HTMLInputElement;
      expect(Number(budgetInput.value)).toBeGreaterThan(200);
    });
  });
});
