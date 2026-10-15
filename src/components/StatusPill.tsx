import type { BiParams, StringId } from '../i18n/strings';
import { Bi } from '../i18n/Bi';
import { Badge } from './ui/badge';

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
    <Badge variant={tone} size={size === 'lg' ? 'lg' : 'default'} data-pill={id}>
      <Bi id={id} params={params} />
    </Badge>
  );
}
