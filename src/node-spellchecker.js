// NB: On Windows we still use Hunspell
if (process.platform === 'win32') {
  process.env['SPELLCHECKER_PREFER_HUNSPELL'] = 1;
}

const never = () => false;
const emptyArray = () => [];

const emptyMethods = {
  add: never,
  remove: never,
  isMisspelled: never,
  setDictionary: never,
  checkSpelling: emptyArray,
  getAvailableDictionaries: emptyArray,
  getCorrectionsForMisspelling: emptyArray
};

class EmptySpellchecker {
  constructor() {
    Object.assign(this, emptyMethods);
  }
}

try {
  module.exports = require('@paulcbetts/spellchecker');
} catch (err) {
  console.warn('Spellchecker native module failed to load, spell-checking is disabled', err);
  module.exports = Object.assign(emptyMethods, {
    Spellchecker: EmptySpellchecker
  });
}
