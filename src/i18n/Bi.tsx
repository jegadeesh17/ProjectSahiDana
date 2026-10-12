import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { BiParams, BiText, StringId } from './strings';
import { strings, t } from './strings';
import { useLang } from './LanguageProvider';

export { bi, biText, t } from './strings';

type BiProps = ({ id: StringId; params?: BiParams; text?: never } | { text: BiText; id?: never; params?: never }) & {
  className?: string;
};

/** Renders one string in the selected language (Hindi or English). Used for every visible string. */
export function Bi(props: BiProps) {
  const { lang } = useLang();
  const { className } = props;
  const pair: BiText = props.text ?? t(props.id as StringId, props.params);
  const key = props.id ?? 'text';
  return (
    <span data-bi={key} lang={lang} className={`bi${className ? ` ${className}` : ''}`}>
      {pair[lang]}
    </span>
  );
}

/** One string with its {tokens} replaced by React nodes (for example tappable figures), in the selected language. */
export function BiRich({ id, nodes, className }: { id: StringId; nodes: Record<string, ReactNode>; className?: string }) {
  const { lang } = useLang();
  const parts = strings[id][lang].split(/\{(\w+)\}/g);
  return (
    <span data-bi={id} lang={lang} className={`bi bi-rich${className ? ` ${className}` : ''}`}>
      {parts.map((part, i) => (i % 2 === 1 ? <Fragment key={i}>{nodes[part] ?? `{${part}}`}</Fragment> : part))}
    </span>
  );
}
