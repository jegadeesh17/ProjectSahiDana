import type { ReactNode } from 'react';
import type { AuditMeta } from '../domain/types';
import { biText } from '../i18n/strings';
import { useAudit } from './AuditDrawer';

interface FigProps {
  audit: AuditMeta | null;
  children: ReactNode;
  /** Inline figures inside a sentence keep line height; table figures get a 44px target. */
  inline?: boolean;
  className?: string;
  'data-lang-exempt'?: string;
}

/** A tappable figure: opens the fine-print sheet with its source or solver constraint. */
export function Fig({ audit, children, inline = false, className, 'data-lang-exempt': langExempt }: FigProps) {
  const { open } = useAudit();
  if (!audit) return <span className={`num ${className ?? ''}`}>{children}</span>;
  return (
    <button
      type="button"
      className={`fig${inline ? ' fig-inline' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => open(audit)}
      aria-haspopup="dialog"
      aria-label={`${audit.formattedValue}: ${biText(audit.label)}`}
      data-lang-exempt={langExempt}
    >
      {children}
    </button>
  );
}
