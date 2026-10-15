import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import examples from './data/prototypeExamples.json';
import { AnimalLine } from './components/AnimalLine';
import { AnimalProfileForm } from './components/AnimalProfileForm';
import { AuditProvider } from './components/AuditDrawer';
import { BudgetField } from './components/BudgetField';
import { ConnectivityBanner } from './components/ConnectivityBanner';
import type { ExplainState } from './components/ExplanationCard';
import { FeedSelector } from './components/FeedSelector';
import type { PrefillState } from './components/FreeTextExtractor';
import { FreeTextExtractor } from './components/FreeTextExtractor';
import { LanguageToggle } from './components/LanguageToggle';
import type { ConnectionMode, ExampleKey } from './components/PrototypeStatesPanel';
import { PrototypeStatesPanel } from './components/PrototypeStatesPanel';
import { RationResultsPanel } from './components/RationResultsPanel';
import { StatusPill } from './components/StatusPill';
import { DEMO_CASES, PRESET_BUFFALO, PRESET_STRAW } from './domain/presets';
import type { DemoKey, Preset } from './domain/presets';
import { buildSummary } from './domain/summary';
import type {
  AnimalProfile,
  BreedStandard,
  ExplanationRequestContext,
  ExtractionResponse,
  FeedItem,
  RationSolveOutcome,
  RequirementResult,
  SelectedFeedInput,
} from './domain/types';
import { LlmError } from './domain/types';
import { EMPTY_ANIMAL, todayCostInr, validateAnimal, validateFeed } from './domain/validation';
import type { AnimalDraft, FeedDraft } from './domain/validation';
import { buildTemplateExplanation } from './domain/verifier';
import { Bi } from './i18n/Bi';
import { LanguageProvider, useLang } from './i18n/LanguageProvider';
import { formatInrPerKg } from './i18n/format';
import { feedLabel } from './i18n/feedLabel';
import { bi } from './i18n/strings';
import type { StringId } from './i18n/strings';
import type { MockExplainMode, MockLlmMode } from './services/mockAdapter';
import { getInitialBreeds, getInitialFeeds, mockControls, rationService } from './services/rationService';

type Profile = Omit<AnimalProfile, 'isConfirmed'>;

interface SolveResult {
  profile: Profile;
  requirement: RequirementResult;
  outcome: RationSolveOutcome;
}

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

function toInputs(drafts: FeedDraft[]): { inputs: SelectedFeedInput[]; allValid: boolean } {
  const inputs: SelectedFeedInput[] = [];
  let allValid = true;
  for (const d of drafts) {
    const { input } = validateFeed(d);
    if (input) inputs.push(input);
    else allValid = false;
  }
  return { inputs, allValid };
}

function animalIncomplete(d: AnimalDraft): boolean {
  if (d.species === '' || d.weight.trim() === '' || d.milk.trim() === '') return true;
  return d.milk.trim() !== '0' && d.fat.trim() === '';
}

function Workspace() {
  const [library, setLibrary] = useState<FeedItem[]>(() => getInitialFeeds());
  const [breeds, setBreeds] = useState<BreedStandard[]>(() => getInitialBreeds());
  const [animal, setAnimal] = useState<AnimalDraft>(EMPTY_ANIMAL);
  const [feeds, setFeeds] = useState<FeedDraft[]>([]);
  const [result, setResult] = useState<SolveResult | null>(null);
  const [explain, setExplain] = useState<ExplainState>({ kind: 'idle' });
  const [prefill, setPrefill] = useState<PrefillState | null>(null);
  const [text, setText] = useState('');
  const [animalOpen, setAnimalOpen] = useState(true);
  const [feedsOpen, setFeedsOpen] = useState(true);
  const [extractorOpen, setExtractorOpen] = useState(false);
  const [protoOpen, setProtoOpen] = useState(false);
  const [connection, setConnection] = useState<ConnectionMode>('auto');
  const [llm, setLlm] = useState<MockLlmMode>('ok');
  const [explainMode, setExplainMode] = useState<MockExplainMode>('verified');
  const [toast, setToast] = useState<{ render: () => string; key: number } | null>(null);

  useLang(); // re-render the whole workspace when the language changes, so plain-text labels follow it
  const browserOnline = useOnline();
  const online = connection === 'auto' ? browserOnline : connection === 'online';

  const showDemoStrip = useMemo(() => {
    if (typeof window === 'undefined') return true;
    return new URLSearchParams(window.location.search).has('demo') || import.meta.env.MODE === 'test';
  }, []);

  const analysisRef = useRef<HTMLElement>(null);
  const explainAbort = useRef<AbortController | null>(null);
  const scrollToResult = useRef(false);

  useEffect(() => {
    let alive = true;
    rationService.getFeedLibrary().then((items) => alive && setLibrary(items));
    rationService.getBreedLibrary().then((items) => alive && setBreeds(items));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    mockControls.behavior.llm = llm;
    mockControls.behavior.explain = explainMode;
  }, [llm, explainMode]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(id);
  }, [toast]);

  const showToast = useCallback((render: () => string) => setToast({ render, key: Date.now() }), []);

  const todayCost = useMemo(() => todayCostInr(feeds), [feeds]);
  const validation = useMemo(() => validateAnimal(animal, todayCost), [animal, todayCost]);
  // The animal without the budget: what the spec row and the requirement preview show while the budget is still blank.
  const animalOnly = useMemo(
    () => validateAnimal({ ...animal, budget: '1', budgetEdited: true }).profile,
    [animal],
  );
  const feedsValid = useMemo(() => toInputs(feeds).allValid, [feeds]);
  const liveRequirement = useMemo(
    () => (animalOnly ? rationService.computeRequirements({ ...animalOnly, isConfirmed: !prefill }) : null),
    [animalOnly, prefill],
  );

  const nextStep: StringId = prefill
    ? 'notice_next_confirm'
    : !animalOnly
      ? animalIncomplete(animal)
        ? 'notice_next_animal'
        : validation.errors.breed && !validation.errors.weight && !validation.errors.milk && !validation.errors.fat && !validation.errors.species
          ? 'notice_next_breed'
          : 'notice_next_fix'
      : feeds.length === 0
        ? 'notice_next_feeds'
        : !feedsValid
          ? 'notice_next_price'
          : !validation.profile
            ? 'notice_next_budget'
            : 'notice_next_balance';
  const canBalance = nextStep === 'notice_next_balance';

  /** Any edit makes the printed analysis stale, so it is cleared rather than left looking valid. */
  const clearResult = useCallback(() => {
    explainAbort.current?.abort();
    setResult(null);
    setExplain({ kind: 'idle' });
  }, []);

  const balance = useCallback(
    (animalDraft: AnimalDraft, feedDrafts: FeedDraft[], confirmed: boolean) => {
      const checked = validateAnimal(animalDraft, todayCostInr(feedDrafts));
      const { inputs: selected, allValid } = toInputs(feedDrafts);
      if (!checked.profile || !allValid || selected.length === 0) return;
      const profile: AnimalProfile = { ...checked.profile, isConfirmed: confirmed };
      const outcome = rationService.solveRation(profile, selected);
      // The requirement the result is checked against: at the supported milk, or at 0 L when there is no ration (E2, E7.1).
      const forMilk = outcome.status === 'optimal' ? outcome.supportedMilkLPerDay : 0;
      const requirement = rationService.computeRequirements({ ...profile, milkYieldLitersPerDay: forMilk });
      explainAbort.current?.abort();
      setExplain({ kind: 'idle' });
      setResult({ profile: checked.profile, requirement, outcome });
      setAnimalOpen(false);
      setFeedsOpen(false);
    },
    [],
  );

  // After Balance, bring the result card into view (it flows with the page on desktop) and move focus to it.
  useEffect(() => {
    if (!result || !scrollToResult.current) return;
    scrollToResult.current = false;
    analysisRef.current?.scrollIntoView({ block: 'start' });
    analysisRef.current?.focus({ preventScroll: true });
  }, [result]);

  const onBalance = () => {
    scrollToResult.current = true;
    balance(animal, feeds, !prefill);
  };

  const applyPreset = (preset: Preset) => {
    scrollToResult.current = true;
    setPrefill(null);
    setAnimal(preset.animal);
    setFeeds(preset.feeds);
    balance(preset.animal, preset.feeds, true);
  };

  const onDemo = (key: DemoKey) => {
    const found = DEMO_CASES.find((c) => c.key === key);
    if (found) applyPreset(found.preset);
  };

  const editAnimal = (next: AnimalDraft) => {
    setAnimal(next);
    clearResult();
  };
  const editFeeds = (next: FeedDraft[]) => {
    setFeeds(next);
    clearResult();
  };
  const addFeed = (feedId: string) => {
    const feed = library.find((f) => f.id === feedId);
    if (!feed || feeds.some((d) => d.feedId === feedId)) return;
    const priceStr = feed.defaultPriceInrPerKgAsFed !== null ? String(feed.defaultPriceInrPerKgAsFed) : '';
    editFeeds([...feeds, { feedId, price: priceStr, cap: '', current: '' }]);
    showToast(() =>
      feed.defaultPriceInrPerKgAsFed !== null
        ? `${bi('state_added')}: ${feedLabel(feed)} (${formatInrPerKg(feed.defaultPriceInrPerKgAsFed)})`
        : `${bi('state_added')}: ${feedLabel(feed)}`,
    );
  };
  const removeFeed = (feedId: string) => editFeeds(feeds.filter((d) => d.feedId !== feedId));

  // ---- extraction (E4, E5) -----------------------------------------------------------------------
  const onExtracted = (response: ExtractionResponse) => {
    const a = response.animal;
    setAnimal({
      species: a.species,
      breedId: response.breedId ?? '',
      weight: String(a.bodyWeightKg),
      milk: String(a.milkYieldLitersPerDay),
      fat: String(a.milkFatPct),
      budget: response.budgetInrPerDay === null ? '' : String(response.budgetInrPerDay),
      budgetEdited: response.budgetInrPerDay !== null,
    });
    setFeeds(
      response.matchedFeeds.flatMap((m) => {
        const feed = library.find((f) => f.id === m.feedId);
        if (!feed) return [];
        const resolvedPrice = m.priceInrPerKgAsFed ?? feed.defaultPriceInrPerKgAsFed;
        return [
          {
            feedId: m.feedId,
            price: resolvedPrice !== null ? String(resolvedPrice) : '',
            cap: m.maxKgAsFedPerDay === null ? '' : String(m.maxKgAsFedPerDay),
            current: '',
          },
        ];
      }),
    );
    setPrefill({ response, unmatched: response.unmatchedFeeds.map((name) => ({ name, resolution: null })) });
    clearResult();
    setAnimalOpen(true);
    setFeedsOpen(true);
  };

  const onConfirmPrefill = () => {
    if (!prefill) return;
    const mapped = prefill.unmatched.flatMap((u) => (u.resolution?.kind === 'map' ? [u.resolution.feedId] : []));
    const additions = mapped
      .filter((id, i) => mapped.indexOf(id) === i && !feeds.some((d) => d.feedId === id))
      .flatMap((id) => {
        const feed = library.find((f) => f.id === id);
        if (!feed) return [];
        const priceStr = feed.defaultPriceInrPerKgAsFed !== null ? String(feed.defaultPriceInrPerKgAsFed) : '';
        return [{ feedId: id, price: priceStr, cap: '', current: '' }];
      });
    setFeeds([...feeds, ...additions]);
    setPrefill(null);
    setExtractorOpen(false);
    showToast(() => bi('state_confirmed'));
  };

  const onDiscardPrefill = () => {
    setPrefill(null);
    setAnimal(EMPTY_ANIMAL);
    setFeeds([]);
    clearResult();
  };

  // ---- explain (E4, E6) --------------------------------------------------------------------------
  const contextFor = (r: SolveResult): ExplanationRequestContext | null =>
    r.outcome.status === 'optimal'
      ? {
          animal: { ...r.profile, isConfirmed: true },
          requirement: r.requirement,
          solution: r.outcome,
          feeds: library,
        }
      : null;

  const onExplain = async () => {
    if (!result) return;
    const ctx = contextFor(result);
    if (!ctx || !online) return;
    explainAbort.current?.abort();
    const controller = new AbortController();
    explainAbort.current = controller;
    setExplain({ kind: 'loading' });
    try {
      const res = await rationService.explainRation(ctx, { signal: controller.signal });
      setExplain({ kind: 'done', result: res });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setExplain({
        kind: 'done',
        result: {
          status: 'deterministic_fallback',
          template: buildTemplateExplanation(ctx),
          badge: { id: 'badge_template_fallback' },
          reason: 'llm_error',
          errorCode: err instanceof LlmError ? err.code : 'UPSTREAM_ERROR',
          flaggedNumbers: [],
        },
      });
    }
  };

  const onCopy = async () => {
    if (!result) return;
    const ctx = contextFor(result);
    if (!ctx) return;
    try {
      await navigator.clipboard.writeText(buildSummary(ctx));
      showToast(() => bi('toast_copied'));
    } catch {
      showToast(() => bi('toast_copy_failed'));
    }
  };

  const onExample = (key: ExampleKey) => {
    setText(examples[key]);
    setExtractorOpen(true);
  };

  const onReset = () => {
    explainAbort.current?.abort();
    setAnimal(EMPTY_ANIMAL);
    setFeeds([]);
    setResult(null);
    setExplain({ kind: 'idle' });
    setPrefill(null);
    setText('');
    setAnimalOpen(true);
    setFeedsOpen(true);
    setExtractorOpen(false);
    setConnection('auto');
    setLlm('ok');
    setExplainMode('verified');
    setToast(null);
  };

  const feedsCollapsed = !feedsOpen && feeds.length > 0 && !prefill;
  const animalCollapsed = !animalOpen && animalOnly !== null && !prefill;

  return (
    <div className="app">
      <a
        className="skip"
        href="#analysis"
        onClick={(e) => {
          e.preventDefault();
          analysisRef.current?.scrollIntoView({ block: 'start' });
          analysisRef.current?.focus();
        }}
      >
        <Bi id="label_skip" />
      </a>

      {showDemoStrip && (
        <PrototypeStatesPanel
          open={protoOpen}
          onOpenChange={setProtoOpen}
          connection={connection}
          onConnection={setConnection}
          llm={llm}
          onLlm={setLlm}
          explainMode={explainMode}
          onExplainMode={setExplainMode}
          onExample={onExample}
          onDemo={onDemo}
          onReset={onReset}
        />
      )}

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

      <main className="page">
        <p className="howto" data-testid="how-to-use">
          <strong className="howto-label">
            <Bi id="label_how_to_use" />
          </strong>{' '}
          <Bi id="notice_how_to_use" />
        </p>

        <div className="inputs">
          <section className="specrow lg:hidden" aria-label={bi('label_animal_line')}>
            <AnimalLine profile={animalOnly} />
            <div className="specrow-side">
              {prefill && <StatusPill id="stamp_unconfirmed" tone="warn" />}
              {animalOnly && !prefill && (
                <button type="button" className="btn btn-sm" aria-expanded={!animalCollapsed} onClick={() => setAnimalOpen(animalCollapsed)}>
                  <Bi id={animalCollapsed ? 'action_edit_animal' : 'action_done'} />
                </button>
              )}
            </div>
          </section>

          <section className="presets" aria-labelledby="demo-h">
            <h2 id="demo-h" className="presets-title">
              <Bi id="label_demo" />
            </h2>
            <div className="presets-row">
              <button type="button" className="btn btn-preset" onClick={() => applyPreset(PRESET_BUFFALO)} data-preset="buffalo">
                <span className="preset-name">
                  <Bi id="action_demo_buffalo" />
                </span>
                <span className="preset-note">
                  <Bi id="note_demo_solved" />
                </span>
              </button>
              <button type="button" className="btn btn-preset" onClick={() => applyPreset(PRESET_STRAW)} data-preset="straw">
                <span className="preset-name">
                  <Bi id="action_demo_straw" />
                </span>
                <span className="preset-note">
                  <Bi id="note_demo_infeasible" />
                </span>
              </button>
            </div>
          </section>

          <FreeTextExtractor
            online={online}
            library={library}
            open={extractorOpen}
            onOpenChange={setExtractorOpen}
            text={text}
            onTextChange={setText}
            prefill={prefill}
            onExtracted={onExtracted}
            onPrefillChange={setPrefill}
            onConfirm={onConfirmPrefill}
            onDiscard={onDiscardPrefill}
          />

          <div className={`collapsible${animalCollapsed ? ' is-collapsed' : ''}`}>
            <AnimalProfileForm draft={animal} errors={validation.errors} breeds={breeds} onChange={editAnimal} prefilled={prefill !== null} />
          </div>

          <BudgetField
            draft={animal}
            todayCost={todayCost}
            error={validation.errors.budget}
            prefilled={prefill !== null}
            onChange={(text) => editAnimal({ ...animal, budget: text, budgetEdited: true })}
            onUseToday={() => editAnimal({ ...animal, budget: '', budgetEdited: false })}
          />

          <FeedSelector
            library={library}
            drafts={feeds}
            collapsed={feedsCollapsed}
            prefilled={prefill !== null}
            onChange={editFeeds}
            onAdd={addFeed}
            onRemove={removeFeed}
            onOpen={() => setFeedsOpen(true)}
            onCollapse={() => setFeedsOpen(false)}
          />

          <div className="balancebar">
            {!canBalance && (
              <p className="balancebar-reason" id="balance-reason">
                <Bi id={nextStep} />
              </p>
            )}
            <button type="button" className="btn btn-primary" disabled={!canBalance} onClick={onBalance} aria-describedby={canBalance ? undefined : 'balance-reason'}>
              <Bi id="action_balance_ration" />
            </button>
          </div>
        </div>

        <RationResultsPanel
          ref={analysisRef}
          profile={result?.profile ?? animalOnly}
          requirement={result?.requirement ?? liveRequirement}
          outcome={result?.outcome ?? null}
          library={library}
          breeds={breeds}
          online={online}
          explain={explain}
          nextStep={nextStep}
          onExplain={onExplain}
          onCopy={onCopy}
          onAddFeed={addFeed}
        />
      </main>

      {toast && (
        <p key={toast.key} className="toast" role="status">
          {toast.render()}
        </p>
      )}
    </div>
  );
}

export function App() {
  return (
    <LanguageProvider>
      <AuditProvider>
        <Workspace />
      </AuditProvider>
    </LanguageProvider>
  );
}
