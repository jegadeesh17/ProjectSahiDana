import { auditUserInput } from '../domain/audit';
import {
  auditExpansionCost,
  auditExpansionGain,
  auditExpansionKg,
  auditShoppingCost,
  auditShoppingKg,
  auditShoppingTotal,
} from '../domain/auditHerd';
import { displayAmount, isShownAmount, roundInrWhole } from '../domain/format';
import type { AnimalLabel, FeedItem, HerdExpansionItem, ShoppingLine, ShoppingList as ShoppingListData } from '../domain/types';
import { formatAmount, formatInr, formatInrWhole, formatNumber } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { feedLabel } from '../i18n/feedLabel';
import { bi, t } from '../i18n/strings';
import { useLang } from '../i18n/LanguageProvider';
import { FeedChip, FeedName } from './FeedName';
import { Fig } from './Fig';

interface Props {
  shopping: ShoppingListData;
  budgetInrPerDay: number;
  byId: Map<string, FeedItem>;
  labels: Map<string, AnimalLabel>;
  isDryHerd?: boolean;
  expansions?: HerdExpansionItem[];
  onAddBudget?: (deltaInr: number) => void;
}

interface RowProps {
  line: ShoppingLine;
  byId: Map<string, FeedItem>;
  labels: Map<string, AnimalLabel>;
}

function ShopRow({ line, byId, labels }: RowProps) {
  const feed = byId.get(line.feedId);
  if (!feed || !isShownAmount(line.kgPerDay)) return null;
  const amount = formatAmount(displayAmount(line.feedId, line.kgPerDay));
  const cost = formatInrWhole(roundInrWhole(line.costInrPerDay));
  return (
    <li className="c4-shop-row" data-feed={line.feedId}>
      <span className="c4-shop-name">
        <FeedChip feed={feed} />
        <FeedName feed={feed} />
      </span>
      <Fig audit={auditShoppingKg(line, feed, labels)} className="c4-shop-fig">
        {amount}
      </Fig>
      <Fig audit={auditShoppingCost(line, feed)} className="c4-shop-fig">
        {cost}
      </Fig>
    </li>
  );
}

interface ExpansionRowProps {
  item: HerdExpansionItem;
  byId: Map<string, FeedItem>;
  onAddBudget?: (deltaInr: number) => void;
}

function ExpansionRow({ item, byId, onAddBudget }: ExpansionRowProps) {
  const { lang } = useLang();
  const feed = byId.get(item.feedId);
  if (!feed || !isShownAmount(item.deltaKgPerDay)) return null;
  const amount = `+${formatAmount(displayAmount(item.feedId, item.deltaKgPerDay))}`;
  const cost = `(+₹${item.deltaCostInrPerDay})`;
  const localizedFeed = feedLabel(feed, lang);
  const ariaLabel = bi('c4_add_to_budget_aria', {
    feed: localizedFeed,
    cost: item.deltaCostInrPerDay,
    milk: formatNumber(item.deltaMilkL, 1),
  });

  return (
    <li className="c4-shop-row" data-feed={item.feedId}>
      <span className="c4-shop-name">
        <FeedChip feed={feed} />
        <FeedName feed={feed} />
      </span>
      <Fig audit={auditExpansionKg(item, feed)} className="c4-shop-fig">
        +{amount}
      </Fig>
      <Fig audit={auditExpansionCost(item, feed)} className="c4-shop-fig">
        ({cost})
      </Fig>
      <span className="c4-shop-gain">
        <BiRich
          id="c4_shop_gain"
          nodes={{
            l: (
              <Fig inline audit={auditExpansionGain(item, feed)}>
                {formatNumber(item.deltaMilkL, 1)}
              </Fig>
            ),
          }}
        />
      </span>
      <button
        type="button"
        className="btn btn-secondary c4-btn-add-budget"
        data-testid="btn-add-budget"
        onClick={() => onAddBudget?.(item.deltaCostInrPerDay)}
        aria-label={ariaLabel}
      >
        <Bi id="c4_add_to_budget" />
      </button>
    </li>
  );
}

/** "What to buy": all within-budget feeds consolidated, followed by beyond-budget expansions in "Then, if you can". */
export function ShoppingList({ shopping, budgetInrPerDay, byId, labels, isDryHerd, expansions, onAddBudget }: Props) {
  const showLater = Boolean(expansions && expansions.length > 0 && !isDryHerd);
  const empty = shopping.buyFirst.length === 0 && !showLater;
  const budgetText = formatInr(budgetInrPerDay, budgetInrPerDay % 1 === 0 ? 0 : 2);
  return (
    <section className="c4-card" aria-labelledby="c4-shop-h" data-c4="shopping">
      <h2 id="c4-shop-h" className="c4-section-title">
        <Bi id="c4_shop_title" />
      </h2>

      {empty ? (
        <p className="c4-none">
          <Bi id="c4_shop_none" />
        </p>
      ) : (
        <>
          {shopping.buyFirst.length > 0 && (
            <div className="c4-group c4-group-first" data-group="first">
              <h3 className="c4-group-title">
                <Bi id="c4_shop_first" />
              </h3>
              <ul className="c4-shop-list">
                {shopping.buyFirst.map((line) => (
                  <ShopRow key={line.feedId} line={line} byId={byId} labels={labels} />
                ))}
              </ul>
            </div>
          )}

          {showLater && (
            <div className="c4-group" data-group="later">
              <h3 className="c4-group-title">
                <Bi id="c4_shop_later" />
              </h3>
              <ul className="c4-shop-list">
                {expansions!.map((item) => (
                  <ExpansionRow
                    key={item.feedId}
                    item={item}
                    byId={byId}
                    onAddBudget={onAddBudget}
                  />
                ))}
              </ul>
            </div>
          )}

          <p className="c4-shop-total" data-testid="shop-total">
            <BiRich
              id="c4_shop_total"
              nodes={{
                a: (
                  <Fig inline audit={auditShoppingTotal(shopping)}>
                    {formatInrWhole(roundInrWhole(shopping.totalInr))}
                  </Fig>
                ),
                b: (
                  <Fig inline audit={auditUserInput('herd-budget', t('label_budget'), budgetText, budgetInrPerDay)}>
                    {formatInrWhole(roundInrWhole(budgetInrPerDay))}
                  </Fig>
                ),
              }}
            />
          </p>
        </>
      )}
    </section>
  );
}

