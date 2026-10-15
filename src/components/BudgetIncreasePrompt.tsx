import type { BreedStandard, RationSolution } from '../domain/types';
import type { BudgetIncrease } from '../domain/rationPlan';
import { auditBreedCap, auditBudgetIncrease } from '../domain/auditMilk';
import { formatInr } from '../i18n/format';
import { BiRich } from '../i18n/Bi';
import { Fig } from './Fig';
import { litres1 } from '../domain/verdict';

interface BudgetIncreasePromptProps {
  increase: BudgetIncrease | null;
  solution: RationSolution;
  breed?: BreedStandard;
  todayMilk: number;
}

export function BudgetIncreasePrompt({
  increase,
  solution,
  breed,
  todayMilk,
}: BudgetIncreasePromptProps) {
  if (!increase) return null;

  return (
    <div className="budget-increase-prompt" data-testid="budget-increase-prompt">
      <p className="budget-prompt-text">
        <BiRich
          id="prompt_budget_increase"
          nodes={{
            extra: (
              <Fig inline audit={auditBudgetIncrease(solution, increase)}>
                {formatInr(increase.extraInrPerDay)}
              </Fig>
            ),
            target: breed ? (
              <Fig inline audit={auditBreedCap(breed, todayMilk)}>
                {litres1(increase.targetMilkLPerDay)}
              </Fig>
            ) : (
              <span className="num">{litres1(increase.targetMilkLPerDay)}</span>
            ),
          }}
        />
      </p>
    </div>
  );
}
