// The selected language: one value, read by <Bi>, bi() and biText(). Default is English.
export type Lang = 'hi' | 'en';

export const LANG_STORAGE_KEY = 'sahidana.lang';

let active: Lang = 'en';

export function getActiveLang(): Lang {
  return active;
}

export function setActiveLang(lang: Lang): void {
  active = lang;
}

/** The saved choice, or English when nothing valid is saved or storage is unavailable. */
export function readStoredLang(): Lang {
  try {
    const value = window.localStorage.getItem(LANG_STORAGE_KEY);
    return value === 'hi' || value === 'en' ? value : 'en';
  } catch {
    // Storage can be blocked (private mode, locked-down browser): English is the documented fallback.
    return 'en';
  }
}

/** Saves the choice per device. A blocked write only means the choice lasts for this visit. */
export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Storage unavailable: the in-memory choice still applies until the page closes.
  }
}
