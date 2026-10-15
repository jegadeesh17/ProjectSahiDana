import { Pencil, Trash2 } from 'lucide-react';
import { auditUserInput } from '../domain/audit';
import { breedById, breedLabel, isNonDescript } from '../domain/breeds';
import { MAX_ANIMALS } from '../domain/herdPlan';
import type { BreedStandard, HerdAnimal } from '../domain/types';
import { formatLitres } from '../i18n/format';
import { Bi } from '../i18n/Bi';
import { useLang } from '../i18n/LanguageProvider';
import { bi, t } from '../i18n/strings';
import { Fig } from './Fig';
import { Button } from './ui/button';

interface Props {
  animals: HerdAnimal[];
  breeds: BreedStandard[];
  editingKey: string | null;
  onEdit: (key: string) => void;
  onRemove: (key: string) => void;
}

/** "Cow 1 · Rathi · 6 L" with Edit and Remove. Labels never renumber; at 10 animals the list says the limit is reached. */
export function AnimalList({ animals, breeds, editingKey, onEdit, onRemove }: Props) {
  const { lang } = useLang();
  if (animals.length === 0) return null;
  return (
    <section className="block c4-list-block" aria-labelledby="c4-list-h">
      <h2 id="c4-list-h" className="block-title c4-block-title">
        <Bi id="c4_list_heading" />
      </h2>
      <ul className="c4-list" data-c4="animal-list">
        {animals.map((a) => {
          const breed = breedById(a.profile.breedId, breeds);
          const name = a.label.species === 'cow' ? 'label_cow_n' : 'label_buffalo_n';
          const labelText = bi(name, { n: a.label.n });
          const milk = a.profile.milkYieldLitersPerDay;
          return (
            <li key={a.key} className="c4-list-row" data-editing={editingKey === a.key ? 'true' : undefined} data-animal={a.key}>
              <div className="c4-list-info">
                <p className="c4-list-name">
                  <Bi id={name} params={{ n: a.label.n }} />
                </p>
                <p className="c4-list-meta">
                  {breed && (isNonDescript(breed) ? <Bi id="c4_breed_desi" /> : <span lang={lang}>{breedLabel(breed, lang)}</span>)}
                  {' · '}
                  <Fig
                    inline
                    audit={auditUserInput(`milk-${a.key}`, t('c4_label_milk'), formatLitres(milk, milk % 1 === 0 ? 0 : 1), milk)}
                  >
                    {formatLitres(milk, milk % 1 === 0 ? 0 : 1)}
                  </Fig>
                </p>
              </div>
              <div className="c4-list-actions">
                <Button size="sm" onClick={() => onEdit(a.key)} aria-label={bi('c4_aria_edit', { animal: labelText })}>
                  <Pencil size={16} strokeWidth={2.25} aria-hidden="true" />
                  <Bi id="action_edit_animal" />
                </Button>
                <Button size="sm" variant="quiet" onClick={() => onRemove(a.key)} aria-label={bi('c4_aria_remove', { animal: labelText })}>
                  <Trash2 size={16} strokeWidth={2.25} aria-hidden="true" />
                  <Bi id="c4_action_remove" />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {animals.length >= MAX_ANIMALS && (
        <p className="c4-limit" role="status">
          <Bi id="c4_max_animals" />
        </p>
      )}
    </section>
  );
}
