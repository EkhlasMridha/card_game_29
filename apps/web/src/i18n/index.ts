import { en, type Messages } from './en';

/**
 * Minimal localisation layer. UI text is looked up by key so a Bangla
 * dictionary (bn.ts with the same keys) can be added without touching
 * gameplay code: add it to `dictionaries` and expose a language setting.
 */
const dictionaries: Record<string, Messages> = { en };
let current: Messages = en;

export function setLanguage(lang: string): void {
  current = dictionaries[lang] ?? en;
}

export function t(key: keyof Messages, params?: Record<string, string | number>): string {
  let text: string = current[key] ?? en[key] ?? String(key);
  if (params) for (const [k, v] of Object.entries(params)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
}
