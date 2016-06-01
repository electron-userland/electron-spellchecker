
export function normalizeLanguageCode(langCode) {
  let [lang, locale] = langCode.split(/[-_]/);
  lang = lang.toLowerCase();    locale = locale.toUpperCase();

  if (!lang.match(/^[a-z]{2}$/) || locale.match(/^[A-Z]{2}$/)) {
    throw new Error(`${langCode} is not a valid language code`);
  }

  return `${lang}-${locale}`;
}
