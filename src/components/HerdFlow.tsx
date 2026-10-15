// Change 4 clickable prototype: the 3-screen herd flow (Your animals, Feed you already have, Your plan).
// Rendered only when the URL has ?c4. It runs on the mock `planHerdPrototypeMock`, so the plan is a canned fixture.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { MAX_ANIMALS, EMPTY_COUNTERS, nextAnimalLabel } from '../domain/herdPlan';
import type { LabelCounters } from '../domain/herdPlan';
import type { BreedStandard, FeedItem, HerdAnimal, HerdAnimalProfile, HomeFeed, Species } from '../domain/types';
import { breedById, breedPrefill } from '../domain/breeds';
import { EMPTY_CARD, validateBudget, validateHomeFeed } from '../domain/validation';
import type { AnimalCardDraft, HomeFeedDraft } from '../domain/validation';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { bi } from '../i18n/strings';
import { useHashStep } from '../lib/hashRoute';
import type { Step } from '../lib/hashRoute';
import { loadHerdFixtures, planHerdPrototypeMock } from '../services/planHerdPrototypeMock';
import type { HerdExampleId, HerdFixture, PrototypePlanResult } from '../services/planHerdPrototypeMock';
import { getInitialBreeds, getInitialFeeds } from '../services/rationService';
import { AnimalsScreen } from './AnimalsScreen';
import { ConnectivityBanner } from './ConnectivityBanner';
import { HerdPlanView, buildPlanSummary } from './HerdPlan';
import { HomeFeedsScreen } from './HomeFeedsScreen';
import { LanguageToggle } from './LanguageToggle';
import { StepBar, StepIndicator } from './StepNav';
import { Badge } from './ui/badge';

const TITLE = { animals: 'c4_screen_animals', feeds: 'c4_screen_feeds', result: 'c4_screen_result' } as const;
/** How long "Calculating…" stays on screen. The real solver replaces the wait with its own time. */
const CALCULATING_MS = 350;

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function HerdFlow() {
  const { lang } = useLang(); // re-render the whole flow when the language changes, so plain-text labels follow it
  const online = useOnline();
  const [step, go, back] = useHashStep();
  const library: FeedItem[] = useMemo(() => getInitialFeeds(), []);
  const breeds: BreedStandard[] = useMemo(() => getInitialBreeds(), []);

  const [animals, setAnimals] = useState<HerdAnimal[]>([]);
  const [counters, setCounters] = useState<LabelCounters>(EMPTY_COUNTERS);
  const [nextKey, setNextKey] = useState(1);
  const [draft, setDraft] = useState<AnimalCardDraft>(EMPTY_CARD);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [herdBudget, setHerdBudget] = useState('');
  const [homeFeeds, setHomeFeeds] = useState<HomeFeedDraft[]>([]);
  const [result, setResult] = useState<PrototypePlanResult | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [fixtures, setFixtures] = useState<HerdFixture[] | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const calcTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadHerdFixtures().then((f) => alive && setFixtures(f));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => () => {
    if (calcTimer.current !== null) window.clearTimeout(calcTimer.current);
  }, []);

  const showToast = useCallback((text: string) => setToast({ text, key: Date.now() }), []);

  /** Every edit makes a calculated plan stale, so it is dropped rather than shown against changed inputs (AC-C4-1.22). */
  const clearPlan = useCallback(() => {
    setResult(null);
  }, []);

  const budgetValue = validateBudget(herdBudget).value;
  const homeInputs: HomeFeed[] = homeFeeds.flatMap((d) => {
    const { input } = validateHomeFeed(d);
    return input ? [input] : [];
  });
  const homeValid = homeInputs.length === homeFeeds.length;

  // Guards: screens 2 and 3 need an animal and a budget; screen 3 needs a plan.
  useEffect(() => {
    if ((step === 'feeds' || step === 'result') && (animals.length === 0 || budgetValue === null)) go('animals', { replace: true });
    else if (step === 'result' && result === null && !calculating) go('feeds', { replace: true });
  }, [step, animals.length, budgetValue, result, calculating, go]);

  // A new screen starts at the top with the focus on its title. The ref keeps StrictMode's double effect from focusing on load.
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    window.scrollTo(0, 0);
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  // ---- screen 1 --------------------------------------------------------------------------------
  const submitCard = (profile: HerdAnimalProfile, d: AnimalCardDraft) => {
    const breed = breedById(profile.breedId, breeds);
    const pf = breed ? breedPrefill(breed) : null;
    const weightSource = d.weightTyped ? 'typed' : 'breed';
    const fatSource = d.fatTyped ? 'typed' : pf?.fatIsMidpoint ? 'breed_midpoint' : 'breed';
    if (editingKey !== null) {
      setAnimals((list) => list.map((a) => (a.key === editingKey ? { ...a, profile, weightSource, fatSource, isConfirmed: true } : a)));
      setEditingKey(null);
    } else {
      if (animals.length >= MAX_ANIMALS) return;
      const { label, counters: nextCounters } = nextAnimalLabel(counters, profile.species);
      setCounters(nextCounters);
      setAnimals((list) => [...list, { key: `a${nextKey}`, label, profile, weightSource, fatSource, isConfirmed: true }]);
      setNextKey((n) => n + 1);
    }
    setDraft(EMPTY_CARD);
    clearPlan();
  };

  const editAnimal = (key: string) => {
    const a = animals.find((x) => x.key === key);
    if (!a) return;
    setEditingKey(key);
    setDraft({
      species: a.profile.species,
      breedId: a.profile.breedId,
      weight: String(a.profile.bodyWeightKg),
      milk: String(a.profile.milkYieldLitersPerDay),
      fat: String(a.profile.milkFatPct),
      weightTyped: a.weightSource === 'typed',
      fatTyped: a.fatSource === 'typed',
    });
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-c4="animal-card"]')?.scrollIntoView({ block: 'center' }));
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft(EMPTY_CARD);
  };

  const removeAnimal = (key: string) => {
    setAnimals((list) => list.filter((a) => a.key !== key));
    if (editingKey === key) cancelEdit();
    clearPlan();
  };

  const onBudgetChange = (text: string) => {
    setHerdBudget(text);
    clearPlan();
  };

  const loadExample = (id: HerdExampleId) => {
    const fixture = fixtures?.find((f) => f.id === id);
    if (!fixture) return;
    const p = fixture.plan;
    const c: LabelCounters = { cow: 0, buffalo: 0 };
    for (const a of p.animals) c[a.label.species as Species] = Math.max(c[a.label.species as Species], a.label.n);
    setAnimals(p.animals.map((a) => ({ ...a })));
    setCounters(c);
    setNextKey(p.animals.length + 1);
    setHerdBudget(String(p.budgetInrPerDay));
    setHomeFeeds(p.homeFeeds.map((h) => ({ feedId: h.feedId, kg: String(h.kgPerDay) })));
    setEditingKey(null);
    setDraft(EMPTY_CARD);
    clearPlan();
    window.scrollTo({ top: 0 });
  };

  // ---- screen 2 --------------------------------------------------------------------------------
  const addHomeFeed = (feedId: string) => {
    if (homeFeeds.some((d) => d.feedId === feedId)) return;
    setHomeFeeds((list) => [...list, { feedId, kg: '' }]);
    clearPlan();
  };
  const setHomeKg = (feedId: string, kg: string) => {
    setHomeFeeds((list) => list.map((d) => (d.feedId === feedId ? { ...d, kg } : d)));
    clearPlan();
  };
  const removeHomeFeed = (feedId: string) => {
    setHomeFeeds((list) => list.filter((d) => d.feedId !== feedId));
    clearPlan();
  };

  const calculate = () => {
    if (budgetValue === null || animals.length === 0 || !homeValid || !fixtures || calculating) return;
    setCalculating(true);
    // Paint "Calculating…" first, then run the synchronous mock (the real solver is synchronous too).
    calcTimer.current = window.setTimeout(() => {
      calcTimer.current = null;
      setResult(planHerdPrototypeMock(animals, homeInputs, budgetValue, fixtures));
      setCalculating(false);
      go('result');
    }, CALCULATING_MS);
  };

  // ---- screen 3 --------------------------------------------------------------------------------
  const removeFromPlan = (key: string) => {
    removeAnimal(key);
    go('animals');
  };

  const copySummary = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildPlanSummary(result.plan, library));
      showToast(bi('toast_copied'));
    } catch {
      showToast(bi('toast_copy_failed'));
    }
  };

  const goBack = (to: Step) => back(to);

  return (
    <div className="app c4-app" data-c4="flow" data-step={step}>
      <header className="appbar">
        <div className="appbar-brand">
          <p className="brand" data-lang-exempt="brand">
            SahiDana
          </p>
          <p className="tagline">
            <Bi id="brand_tagline" />
          </p>
        </div>
        <LanguageToggle />
        <ConnectivityBanner online={online} />
      </header>

      <main className="c4-page" lang={lang}>
        <StepIndicator step={step} />

        <div className="c4-head">
          <h1 ref={titleRef} tabIndex={-1} className="c4-title" id="c4-title">
            <Bi id={TITLE[step]} />
          </h1>
          <Badge variant="neutral" className="c4-proto-pill">
            <Bi id="label_prototype" />
          </Badge>
        </div>

        {step === 'animals' && (
          <AnimalsScreen
            animals={animals}
            breeds={breeds}
            editingKey={editingKey}
            draft={draft}
            onDraftChange={setDraft}
            onSubmitCard={submitCard}
            onCancelEdit={cancelEdit}
            onEdit={editAnimal}
            onRemove={removeAnimal}
            herdBudget={herdBudget}
            onBudgetChange={onBudgetChange}
            onNext={() => go('feeds')}
            onExample={loadExample}
            examplesReady={fixtures !== null}
          />
        )}

        {step === 'feeds' && (
          <HomeFeedsScreen
            library={library}
            drafts={homeFeeds}
            onAdd={addHomeFeed}
            onKg={setHomeKg}
            onRemove={removeHomeFeed}
            onBack={() => goBack('animals')}
            onCalculate={calculate}
            calculating={calculating || fixtures === null}
          />
        )}

        {step === 'result' && result && (
          <>
            <HerdPlanView plan={result.plan} library={library} breeds={breeds} nearest={!result.exact} onRemoveAnimal={removeFromPlan} />
            <StepBar
              reasonId="c4-result-reason"
              onBack={() => goBack('feeds')}
              primary={
                <>
                  <Copy size={20} strokeWidth={2.25} aria-hidden="true" />
                  <Bi id="action_copy_summary" />
                </>
              }
              onPrimary={copySummary}
            />
          </>
        )}
      </main>

      {toast && (
        <p key={toast.key} className="toast" role="status">
          {toast.text}
        </p>
      )}
    </div>
  );
}
