import os from 'os';

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

/**
 * Returns true if we are using Hunspell and false if we are using system
 * dictionaries.
 *
 * @return {Bool}   False if using the system dictionary
 */
export function shouldUseHunspell() {
  if (process.platform === 'linux') return true;

  if (process.platform === 'darwin') return false;

  // For testing: used to ignore Win8 spellchecker even if it's available.
  if (process.env.SPELLCHECKER_PREFER_HUNSPELL) return true;

  let [major, minor] = os.release().split('.').map((part) => parseInt(part));

  // Win10 or greater?
  if (major > 6) return false;

  // Win8 or greater? We use system dictionary API
  if (major === 6 && minor >= 2) return false;

  return true;
}
