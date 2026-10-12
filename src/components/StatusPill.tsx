import type { BiParams, StringId } from '../i18n/strings';
import { Bi } from '../i18n/Bi';

interface StatusPillProps {
  id: StringId;
  params?: BiParams;
  /** ok = met or verified, danger = infeasible, warn = needs your attention, neutral = informational. */
  tone: 'ok' | 'danger' | 'warn' | 'neutral';
  size?: 'md' | 'lg';
}

/** Soft tinted status pill: a dot and a short bilingual label. Never rotated, outlined or animated. */
export function StatusPill({ id, params, tone, size = 'md' }: StatusPillProps) {
  return (
    <span className={`pill pill-${tone}${size === 'lg' ? ' pill-lg' : ''}`} data-pill={id}>
      <Bi id={id} params={params} />
    </span>
  );
}
