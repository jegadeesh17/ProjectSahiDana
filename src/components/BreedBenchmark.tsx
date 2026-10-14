import { auditBreedCap, auditBreedFat, formatBreedFat } from '../domain/auditMilk';
import { CAP_BASIS_STRING, isNonDescript } from '../domain/breeds';
import type { BreedStandard } from '../domain/types';
import { formatLitres } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { Fig } from './Fig';

interface Props {
  breed: BreedStandard;
  /** The milk the user entered, so the audit can say when it is used as the cap (OQ15). */
  todayMilk: number | null;
}

/** What the sources say about this breed: the milk cap with its basis, and the fat percent (or that none is cited). */
export function BreedBenchmark({ breed, todayMilk }: Props) {
  const fat = formatBreedFat(breed);
  const fatAudit = auditBreedFat(breed);
  return (
    <div className="benchmark" data-benchmark={breed.id}>
      <p className="benchmark-title">
        <Bi id={isNonDescript(breed) ? 'label_benchmark_national' : 'label_benchmark_breed'} />
      </p>
      <dl className="benchmark-grid">
        <div>
          <dt>
            <Bi id={isNonDescript(breed) ? 'label_milk_cap_national' : 'label_milk_cap_benchmark'} />
          </dt>
          <dd>
            <Fig audit={auditBreedCap(breed, todayMilk)}>{formatLitres(breed.milkCapLPerDay, 2)}</Fig>
            <span className="benchmark-unit">
              <Bi id="label_per_day" />
            </span>
            <span className="benchmark-basis">
              <Bi id={CAP_BASIS_STRING[breed.capBasis]} />
            </span>
          </dd>
        </div>
        <div>
          <dt>
            <Bi id="label_breed_fat" />
          </dt>
          <dd>
            {fat !== null && fatAudit ? (
              <Fig audit={fatAudit}>{fat}</Fig>
            ) : (
              <span className="benchmark-basis">
                <Bi id="label_not_cited" />
              </span>
            )}
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        <Bi id="hint_tap_benchmark" />
      </p>
    </div>
  );
}
