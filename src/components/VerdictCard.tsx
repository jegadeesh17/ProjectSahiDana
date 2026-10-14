import type { ReactNode } from 'react';
import { auditUserInput } from '../domain/audit';
import {
  auditBreedCap,
  auditBreedFat,
  auditGain,
  auditKeepCost,
  auditSaving,
  auditSupportedMilk,
  bindingName,
  feedLimitNames,
  formatBreedFat,
} from '../domain/auditMilk';
import { isNonDescript } from '../domain/breeds';
import type { AnimalProfile, BreedStandard, FeedItem, RationSolution } from '../domain/types';
import { limitingListText, litres1, litresNatural, verdictId } from '../domain/verdict';
import { formatInr, formatLitres, formatPct } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import type { BiText } from '../i18n/strings';
import { t } from '../i18n/strings';
import { Fig } from './Fig';

type Profile = Omit<AnimalProfile, 'isConfirmed'>;

interface Props {
  solution: RationSolution;
  profile: Profile;
  breed: BreedStandard;
  library: FeedItem[];
}

const TONE: Record<RationSolution['verdict']['kind'], 'good' | 'neutral' | 'warn'> = {
  gain: 'good',
  at_breed_level: 'neutral',
  above_breed_level: 'neutral',
  same_as_today: 'neutral',
  dry_animal: 'neutral',
  below_today: 'warn',
};

/** "This budget supports 9.6 L per day", with today's milk and the breed benchmark beside it (AC-5.1). */
export function SupportsHeadline({ solution, profile, breed, library }: Props) {
  const todayMilk = profile.milkYieldLitersPerDay;
  const today = litresNatural(todayMilk);
  return (
    <div className="supports" data-testid="supports">
      <p className="supports-label">
        <Bi id="label_supports" />
      </p>
      <p className="supports-figure">
        <Fig audit={auditSupportedMilk(solution, new Map(library.map((f) => [f.id, f])))} className="supports-fig">
          {litres1(solution.supportedMilkLPerDay)}
        </Fig>
        <span className="supports-unit">
          <Bi id="label_per_day" />
        </span>
      </p>
      <p className="supports-context num">
        <span>
          <Bi id="label_today_milk" />{' '}
          <Fig inline audit={auditUserInput('in-milk', t('label_milk'), today, todayMilk)}>
            {today}
          </Fig>
        </span>
        <span className="sep" aria-hidden="true">
          ·
        </span>
        <span>
          <Bi id={isNonDescript(breed) ? 'label_milk_cap_national' : 'label_milk_cap_benchmark'} />{' '}
          <Fig inline audit={auditBreedCap(breed, todayMilk)}>
            {formatLitres(solution.milkCapLPerDay, 2)}
          </Fig>
        </span>
      </p>
    </div>
  );
}

/** The room-for-improvement verdict as one sentence whose numbers open their working (AC-5.6 to 5.11, OQ14, OQ15). */
export function VerdictCard({ solution, profile, breed, library }: Props) {
  const { lang } = useLang();
  const v = solution.verdict;
  const todayMilk = profile.milkYieldLitersPerDay;
  const byId = new Map(library.map((f) => [f.id, f]));
  const supported = (
    <Fig inline audit={auditSupportedMilk(solution, byId)}>
      {litres1(solution.supportedMilkLPerDay)}
    </Fig>
  );
  const today = (
    <Fig inline audit={auditUserInput('in-milk', t('label_milk'), litresNatural(todayMilk), todayMilk)}>
      {litresNatural(todayMilk)}
    </Fig>
  );

  const nodes: Record<string, ReactNode> = {};
  switch (v.kind) {
    case 'gain':
      nodes.x = (
        <Fig inline audit={auditGain(solution, todayMilk, v.gainLPerDay)}>
          {litres1(v.gainLPerDay)}
        </Fig>
      );
      break;
    case 'at_breed_level':
    case 'above_breed_level':
      if (v.savingInrPerDay !== null) {
        nodes.z = (
          <Fig inline audit={auditSaving(solution, v.savingInrPerDay)}>
            {formatInr(v.savingInrPerDay)}
          </Fig>
        );
      }
      break;
    case 'below_today':
      nodes.s = supported;
      nodes.t = today;
      nodes.t2 = today;
      if (v.keepCostInrPerDay !== null) {
        nodes.b = (
          <Fig inline audit={auditKeepCost(solution, v.keepCostInrPerDay, todayMilk)}>
            {formatInr(v.keepCostInrPerDay)}
          </Fig>
        );
      } else {
        nodes.nutrients = limitingListText(v.limitingNutrients, lang);
      }
      break;
    case 'same_as_today':
      nodes.s = supported;
      break;
    case 'dry_animal':
      break;
  }

  const showCaveat = v.kind === 'gain' || v.kind === 'at_breed_level';
  const limitedBy: BiText[] = [bindingName(solution.bindingConstraint), ...feedLimitNames(solution, byId)];
  const fat = solution.fatComparison;
  const breedFat = formatBreedFat(breed);
  const breedFatAudit = auditBreedFat(breed);

  return (
    <div className="verdict" data-verdict={v.kind} data-tone={TONE[v.kind]} data-testid="verdict">
      <p className="verdict-text">
        <BiRich id={verdictId(v)} nodes={nodes} />
      </p>
      {showCaveat && (
        <p className="verdict-caveat">
          <Bi id="caveat_line" />
        </p>
      )}
      {v.kind === 'same_as_today' && (
        <p className="verdict-caveat">
          <Bi id="label_limited_by" />: <Bi text={limitedBy.reduce((a, b) => ({ hi: `${a.hi}, ${b.hi}`, en: `${a.en}, ${b.en}` }))} />
        </p>
      )}
      {fat && (
        <p className="verdict-fat num" data-testid="fat-line">
          {breedFat !== null && breedFatAudit ? (
            <BiRich
              id="fat_line_cited"
              nodes={{
                today: (
                  <Fig inline audit={auditUserInput('in-fat', t('label_fat'), formatPct(fat.todayFatPct, 1), fat.todayFatPct)}>
                    {formatPct(fat.todayFatPct, 1)}
                  </Fig>
                ),
                breed: (
                  <Fig inline audit={breedFatAudit}>
                    {breedFat}
                  </Fig>
                ),
              }}
            />
          ) : (
            <BiRich
              id="fat_line_uncited"
              nodes={{
                today: (
                  <Fig inline audit={auditUserInput('in-fat', t('label_fat'), formatPct(fat.todayFatPct, 1), fat.todayFatPct)}>
                    {formatPct(fat.todayFatPct, 1)}
                  </Fig>
                ),
              }}
            />
          )}
        </p>
      )}
    </div>
  );
}
