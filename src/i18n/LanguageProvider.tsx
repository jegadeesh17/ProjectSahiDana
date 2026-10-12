import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from './lang';
import { getActiveLang, readStoredLang, setActiveLang, storeLang } from './lang';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextValue>({ lang: 'en', setLang: () => undefined });

export function useLang(): LanguageContextValue {
  return useContext(LanguageContext);
}

/** Owns the selected language: reads it once, keeps `bi()` and `<html lang>` in step, and saves each change. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => readStoredLang());
  // Plain-text callers (aria-labels, toasts, the copied summary) read the module value, so set it during render.
  if (getActiveLang() !== lang) setActiveLang(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setActiveLang(next);
    storeLang(next);
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
