import { auditUserInput } from '../domain/audit';
import { auditShoppingCost, auditShoppingKg, auditShoppingTotal, auditStepGain } from '../domain/auditHerd';
import { displayAmount, isShownAmount, roundInrWhole } from '../domain/format';
import type { AnimalLabel, FeedItem, ShoppingLine, ShoppingList as ShoppingListData } from '../domain/types';
import { formatAmount, formatInr, formatInrWhole, formatNumber } from '../i18n/format';
import { Bi, BiRich } from '../i18n/Bi';
import { t } from '../i18n/strings';
import { FeedChip, FeedName } from './FeedName';
import { Fig } from './Fig';

interface Props {
  shopping: ShoppingListData;
  budgetInrPerDay: number;
  byId: Map<string, FeedItem>;
  labels: Map<string, AnimalLabel>;
}

interface RowProps {
  line: ShoppingLine;
  byId: Map<string, FeedItem>;
  labels: Map<string, AnimalLabel>;
  /** "Then, if you can" lines show the cost in brackets and end with the milk it adds. */
  gain?: ShoppingListData['later'][number];
}

function ShopRow({ line, byId, labels, gain }: RowProps) {
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
        {gain ? `(${cost})` : cost}
      </Fig>
      {gain && (
        <span className="c4-shop-gain">
          {gain.deltaMilkL > 0 ? (
            <BiRich
              id="c4_shop_gain"
              nodes={{
                l: (
                  <Fig inline audit={auditStepGain(gain, byId)}>
                    {formatNumber(gain.deltaMilkL, 1)}
                  </Fig>
                ),
              }}
            />
          ) : (
            <Bi id="c4_shop_same" />
          )}
        </span>
      )}
    </li>
  );
}

/** "What to buy": the Buy first group, the Then, if you can lines with the milk each adds, and the total against the budget. */
export function ShoppingList({ shopping, budgetInrPerDay, byId, labels }: Props) {
  const empty = shopping.buyFirst.length === 0 && shopping.later.length === 0;
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

          {shopping.later.length > 0 && (
            <div className="c4-group" data-group="later">
              <h3 className="c4-group-title">
                <Bi id="c4_shop_later" />
              </h3>
              <ul className="c4-shop-list">
                {shopping.later.map((step) => (
                  <ShopRow key={step.line.feedId} line={step.line} byId={byId} labels={labels} gain={step} />
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
