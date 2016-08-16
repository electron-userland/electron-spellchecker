
/**
 * Normalizes language codes by case and separator. Unfortunately, different
 * platforms have slightly different standards for language codes (i.e. 'en_US' vs
 * 'en-us'). This method flattens them all to the way that Chromium uses internally
 *
 * @param  {String} langCode    The language code to normalize
 *
 * @return {String}             The language code in Chromium format.
 */
export function normalizeLanguageCode(langCode) {
  let [lang, locale] = langCode.split(/[-_]/);
  lang = lang.toLowerCase();    locale = locale.toUpperCase();

  if (!lang.match(/^[a-z]{2}$/) || !locale.match(/^[A-Z]{2}$/)) {
    throw new Error(`${langCode} is not a valid language code`);
  }

  return `${lang}-${locale}`;
}

/**
 * Truncates a string to a max length of 25. Will split on a word boundary and
 * add an ellipsis.
 *
 * @param  {String} string The string to truncate
 * @return {String}        The truncated string
 */
export function truncateString(string) {
  let match = string.match(/^.{0,25}[\S]*/);
  let length = match[0].length;
  let result = match[0].replace(/\s$/,'');
  if (length < string.length) result += "…";
  return result;
}
