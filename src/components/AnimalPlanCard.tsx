import { ChevronDown, Trash2 } from 'lucide-react';
import { auditBreedCap } from '../domain/auditMilk';
import { auditCoverage, auditRequirement, auditRoughageMin, auditSupplied } from '../domain/audit';
import { auditCardKg, auditHerdMilk, auditShare } from '../domain/auditHerd';
import { NUTRIENT_STRING_ID } from '../domain/feedNames';
import { displayAmount, isShownAmount } from '../domain/format';
import { formatNutrient, REQ_FIELD } from '../domain/nutrition';
import type { BreedStandard, FeedItem, HerdAnimal, HerdAnimalSolution, HerdLimit, HerdSolution, NutrientKey } from '../domain/types';
import { NUTRIENT_KEYS } from '../domain/types';
import { breedLabel, isNonDescript } from '../domain/breeds';
import { formatAmount, formatLitres, formatNumber, formatPct } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { bi } from '../i18n/strings';
import { FeedName } from './FeedName';
import { Fig } from './Fig';
import { StatusPill } from './StatusPill';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Button } from './ui/button';

interface Props {
  animal: HerdAnimal;
  sol: HerdAnimalSolution;
  shareT: number;
  limits: HerdLimit[];
  breed: BreedStandard | undefined;
  byId: Map<string, FeedItem>;
  /** Removing is offered from 2 animals up; it sends the user back to screen 1 (AC-C4-2.2). */
  canRemove: boolean;
  onRemove: () => void;
}

/** The bar scale runs 0 to 120% so the 100% mark sits inside the track, as on the Change 3 result. */
const SCALE_MAX = 120;

/** Nutrient coverage for one animal at its planned milk. */
function NutrientBars({ sol, byId }: { sol: HerdAnimalSolution; byId: Map<string, FeedItem> }) {
  const { solution, requirementAtS: req } = sol;
  const feedList = Array.from(byId.values());
  return (
    <ul className="nutrients">
      {NUTRIENT_KEYS.map((n: NutrientKey) => {
        const isDm = n === 'DM';
        const required = req.requirements[REQ_FIELD[n]];
        const supplied = solution.supplied[REQ_FIELD[n]];
        const coverage = solution.coveragePct[n];
        const fill = Math.min(coverage, SCALE_MAX) / SCALE_MAX;
        const met = isDm ? coverage <= 100 + 1e-6 : coverage >= 100 - 1e-6;
        return (
          <li key={n} className="nutrient" data-nutrient={n}>
            <div className="nutrient-head">
              <span className="nutrient-name">
                <span className="nutrient-abbr">{n}</span>
                <Bi id={NUTRIENT_STRING_ID[n]} />
              </span>
              <span className="nutrient-pct">
                <Fig audit={auditCoverage(n, solution, req)}>
                  {formatPct(coverage, 0)}
                </Fig>
              </span>
            </div>
            <div
              className="bar"
              data-met={String(met)}
              role="meter"
              aria-valuemin={0}
              aria-valuemax={SCALE_MAX}
              aria-valuenow={Math.round(Math.min(coverage, SCALE_MAX))}
              aria-label={`${n}: ${formatPct(coverage, 0)}`}
            >
              <span className={`bar-fill${isDm ? ' bar-fill-limit' : ''}`} style={{ width: `${fill * 100}%` }} />
              <span className="bar-mark" style={{ left: `${(100 / SCALE_MAX) * 100}%` }} aria-hidden="true" />
            </div>
            <dl className="nutrient-figs">
              <div>
                <dt>
                  <Bi id={isDm ? 'label_limit' : 'label_required'} />
                </dt>
                <dd>
                  <Fig audit={auditRequirement(n, req)}>
                    {formatNutrient(n, required)}
                  </Fig>
                </dd>
              </div>
              <div>
                <dt>
                  <Bi id={isDm ? 'label_used' : 'label_supplied'} />
                </dt>
                <dd>
                  <Fig audit={auditSupplied(n, solution, feedList, req)}>
                    {formatNutrient(n, supplied)}
                  </Fig>
                </dd>
              </div>
              <div className="nutrient-state">
                <StatusPill id={met ? (isDm ? 'state_within_limit' : 'state_met') : isDm ? 'label_over_limit' : 'state_short'} tone={met ? 'ok' : 'warn'} />
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

/** What the paravet reads: the share of the milk target, its cap, what limits it, roughage, and the nutrient bars. */
function ParavetDetails({ animal, sol, shareT, limits, breed, byId }: Pick<Props, 'animal' | 'sol' | 'shareT' | 'limits' | 'breed' | 'byId'>) {
  const { solution } = sol;
  const dry = sol.milkTargetLPerDay === 0;
  const limitText = limits[0]?.kind === 'milk_target' ? 'c4_det_limit_target' : 'c4_det_limit_budget';
  const mockBest: HerdSolution = {
    shareT,
    limits,
    animals: [sol],
    buyTotals: [],
    homeUse: [],
    purchaseCostInrPerDay: solution.totalCostInr,
    budgetInrPerDay: solution.budgetInrPerDay,
    costAtTargetInrPerDay: null,
    maintenanceCostInrPerDay: solution.maintenanceCostInrPerDay ?? 0,
    budgetTight: false,
    stage1Feasible: true,
    stage2Path: 'direct',
    stage3Applied: null,
    stage2PurchaseInrPerDay: solution.totalCostInr,
    solvedOn: new Date().toISOString(),
    sourceKey: 'SOLVER-HERD-LP-V1',
    status: 'optimal',
  };
  return (
    <div className="details" data-details="true">
      <dl className="detail-list c4-detail-list">
        {!dry && (
          <>
            <div className="detail-row">
              <dt>
                <Bi id="c4_det_share" />
              </dt>
              <dd>
                <Fig audit={auditShare(mockBest, [animal])}>
                  {formatPct(shareT * 100, 0)}
                </Fig>
                <span className="detail-note">
                  <Bi id="c4_det_limit" />: <Bi id={limitText} />
                </span>
              </dd>
            </div>
            <div className="detail-row">
              <dt>
                <Bi id="c4_det_target" />
              </dt>
              <dd>
                {breed ? (
                  <Fig audit={auditBreedCap(breed, animal.profile.milkYieldLitersPerDay)}>{formatLitres(sol.milkTargetLPerDay, 2)}</Fig>
                ) : (
                  <span className="num">{formatLitres(sol.milkTargetLPerDay, 2)}</span>
                )}
              </dd>
            </div>
          </>
        )}
        <div className="detail-row">
          <dt>
            <Bi id="c4_det_roughage" />
          </dt>
          <dd>
            <Fig audit={auditRoughageMin(solution.roughageMinSharePct)}>
              {formatPct(solution.roughageSharePct, 0)}
            </Fig>
            <span className="detail-note">
              <Bi id="label_roughage_min" params={{ min: formatPct(solution.roughageMinSharePct, 0) }} />
            </span>
          </dd>
        </div>
      </dl>
      <NutrientBars sol={sol} byId={byId} />
    </div>
  );
}

/** One animal's card: its feed lines tagged From home or Buy, the milk they support, and the collapsed paravet details. */
export function AnimalPlanCard({ animal, sol, shareT, limits, breed, byId, canRemove, onRemove }: Props) {
  const { lang } = useLang();
  const nameId = animal.label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n';
  const dry = sol.milkTargetLPerDay === 0 || sol.solution.verdict.kind === 'dry_animal';
  // Home feed first, then what is bought: the order a farmer fills the manger.
  const lines = sol.solution.feeds
    .filter((l) => isShownAmount(l.kgAsFed))
    .map((l, i) => ({ l, i }))
    .sort((a, b) => Number(b.l.source === 'home') - Number(a.l.source === 'home') || a.i - b.i)
    .map((x) => x.l);
  const labelText = bi(nameId, { n: animal.label.n });

  return (
    <article className="c4-acard" aria-labelledby={`c4-card-${animal.key}`} data-animal={animal.key}>
      <header className="c4-acard-head">
        <div>
          <h3 id={`c4-card-${animal.key}`} className="c4-acard-name">
            <Bi id={nameId} params={{ n: animal.label.n }} />
          </h3>
          {breed && (
            <p className="c4-acard-breed">
              {isNonDescript(breed) ? <Bi id="c4_breed_desi" /> : <span lang={lang}>{breedLabel(breed, lang)}</span>}
            </p>
          )}
        </div>
        {canRemove && (
          <Button size="sm" variant="quiet" onClick={onRemove} aria-label={bi('c4_aria_remove', { animal: labelText })}>
            <Trash2 size={16} strokeWidth={2.25} aria-hidden="true" />
            <Bi id="c4_action_remove" />
          </Button>
        )}
      </header>

      <ul className="c4-lines">
        {lines.map((l) => {
          const feed = byId.get(l.feedId);
          if (!feed) return null;
          const source = l.source === 'home' ? 'home' : 'buy';
          return (
            <li key={`${l.feedId}-${source}`} className="c4-line" data-feed={l.feedId} data-source={source}>
              <span className="c4-line-name">
                <FeedName feed={feed} />
              </span>
              <Fig audit={auditCardKg(animal.label, feed, l.kgAsFed, source)} className="c4-line-fig">
                {formatAmount(displayAmount(l.feedId, l.kgAsFed))}
              </Fig>
              <span className={`tag ${source === 'home' ? 'tag-you-have' : 'tag-buy'}`} data-tag={source}>
                <Bi id={source === 'home' ? 'c4_tag_home' : 'tag_buy'} />
              </span>
            </li>
          );
        })}
      </ul>

      <p className="c4-enough">
        {dry ? (
          <Bi id="c4_card_dry" />
        ) : (
          <BiRich
            id="c4_card_enough"
            nodes={{
              l: (
                <Fig inline audit={auditHerdMilk(animal.label, sol, shareT)}>
                  {formatNumber(sol.milkLPerDay, 1)}
                </Fig>
              ),
            }}
          />
        )}
      </p>

      <Accordion type="single" collapsible>
        <AccordionItem value="details">
          <AccordionTrigger className="btn btn-quiet details-toggle c4-details-toggle">
            <ChevronDown size={18} strokeWidth={2} aria-hidden="true" />
            <Bi id="c4_details" />
          </AccordionTrigger>
          <AccordionContent>
            <ParavetDetails animal={animal} sol={sol} shareT={shareT} limits={limits} breed={breed} byId={byId} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </article>
  );
}
