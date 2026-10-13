import { useLang } from '../i18n/LanguageProvider';
import type { Lang } from '../i18n/lang';
import { LANGUAGE_LABELS, bi } from '../i18n/strings';

const OPTIONS: Lang[] = ['hi', 'en'];

/** Hindi / English switch in the app bar. Each label is written in its own language. */
export function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="langtoggle" role="group" aria-label={bi('label_language')}>
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className="langtoggle-btn"
          lang={option}
          data-lang-exempt="toggle"
          aria-pressed={lang === option}
          onClick={() => setLang(option)}
        >
          {LANGUAGE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
