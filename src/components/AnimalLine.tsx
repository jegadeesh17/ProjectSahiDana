import { auditUserInput } from '../domain/audit';
import { breedById, breedLabel } from '../domain/breeds';
import type { AnimalProfile } from '../domain/types';
import { formatKg, formatLitres, formatPct } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { t } from '../i18n/strings';
import { Fig } from './Fig';

function Sep() {
  return (
    <span className="sep" aria-hidden="true">
      ·
    </span>
  );
}

/** The ruled spec row: Buffalo · 450 kg · 8 L · 6.5% fat. Each number opens the fine print as "entered by you". */
export function AnimalLine({ profile }: { profile: Omit<AnimalProfile, 'isConfirmed'> | null }) {
  const { lang } = useLang();
  if (!profile) {
    return (
      <p className="animalline-empty">
        <Bi id="label_animal_empty" />
      </p>
    );
  }
  const breed = breedById(profile.breedId);
  const milkDecimals = profile.milkYieldLitersPerDay % 1 === 0 ? 0 : 1;
  const weight = formatKg(profile.bodyWeightKg, 0);
  const milk = formatLitres(profile.milkYieldLitersPerDay, milkDecimals);
  const fat = formatPct(profile.milkFatPct, 1);
  return (
    <div className="animalline">
      <p className="animalline-species">
        <Bi id={profile.species === 'cow' ? 'label_cow' : 'label_buffalo'} />
        {breed && (
          <>
            <Sep />
            <span className="animalline-breed">{breedLabel(breed, lang)}</span>
          </>
        )}
      </p>
      <p className="animalline-nums">
        <Fig inline audit={auditUserInput('in-weight', t('label_weight'), weight, profile.bodyWeightKg)}>
          {weight}
        </Fig>
        <Sep />
        <Fig inline audit={auditUserInput('in-milk', t('label_milk'), milk, profile.milkYieldLitersPerDay)}>
          {milk}
        </Fig>
        {profile.milkYieldLitersPerDay > 0 && (
          <>
            <Sep />
            <Fig inline audit={auditUserInput('in-fat', t('label_fat'), fat, profile.milkFatPct)}>
              {fat}
            </Fig>
            <span className="animalline-fat">
              <Bi id="label_fat_short" />
            </span>
          </>
        )}
      </p>
    </div>
  );
}
