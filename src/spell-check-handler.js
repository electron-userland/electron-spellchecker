import {AsyncSubject, Disposable, Observable, Scheduler, SerialDisposable, Subject} from 'rx';
import {Spellchecker} from '@paulcbetts/spellchecker';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';
import pify from 'pify';
import {spawn} from 'spawn-rx';

import DictionarySync from './dictionary-sync';
import {normalizeLanguageCode} from './utility';

const d = require('debug')('electron-spellchecker:spell-check-handler');
let cld = null;
let fallbackLocaleTable = null;

const validLangCode = /[a-z]{2}[_][A-Z]{2}/;

function fromEventCapture(element, name) {
  return Observable.create((subj) => {
    const handler = function(...args) {
      if (args.length > 1) {
        subj.onNext(args);
      } else {
        subj.onNext(args[0] || true);
      }
    };

    element.addEventListener(name, handler, true);
    return Disposable.create(() => element.removeEventListener(name, handler, true));
  });
}

export default class SpellCheckHandler {
  constructor(dictionarySync=null, localStorage=null) {
    this.dictionarySync = dictionarySync || new DictionarySync();
    this.switchToLanguage = new Subject();
    this.currentSpellchecker = null;
    this.currentSpellcheckerLanguage = null;
    this.localStorage = localStorage || window.localStorage;

    this.disp = new SerialDisposable();

    if (process.platform === 'darwin') {
      // NB: OS X does automatic language detection, we're gonna trust it
      this.currentSpellchecker = new Spellchecker();
      return;
    }
  }

  async loadDictionaryForLanguageWithAlternatives(langCode, cacheOnly=false) {
    this.fallbackLocaleTable = this.fallbackLocaleTable || require('./fallback-locales');
    let lang = langCode.substring(0, 2);

    let alternatives = [langCode, await this.getLikelyLocaleForLanguage(lang), this.fallbackLocaleTable[lang]];

    d(`Requesting to load ${langCode}, alternatives are ${JSON.stringify(alternatives)}`);
    return await Observable.of(...alternatives)
      .concatMap((l) => {
        return Observable.defer(() => 
            Observable.fromPromise(this.dictionarySync.loadDictionaryForLanguage(l, cacheOnly)))
          .map((d) => ({language: l, dictionary: d}))
          .catch(() => Observable.just(null));
      })
      .filter((x) => x !== null)
      .take(1)
      .toPromise();
  }

  attachToInput(inputText=null) {
    cld = cld || pify(require('cld'));

    let input = inputText || addEventListener(document.body, 'input')
      .flatMap((e) => {
        if (!e.target || !e.target.value) return Observable.empty();
        return Observable.just(e.target.value);
      });

    let disp = input
      .flatMap((text) =>
        Observable.fromPromise(cld.listen(text))
          .catch(() => Observable.empty()))
      .subscribe((lang) => console.log(`Language is ${lang}`));

    this.disp.setDisposable(disp);
    return disp;
  }

  async getLikelyLocaleForLanguage(language) {
    let lang = language.toLowerCase();
    if (!this.likelyLocaleTable) this.likelyLocaleTable = await SpellCheckHandler.buildLikelyLocaleTable();

    if (this.likelyLocaleTable[lang]) return this.likelyLocaleTable[lang];
    this.fallbackLocaleTable = this.fallbackLocaleTable || require('./fallback-locales');

    return this.fallbackLocaleTable[lang];
  }

  static async buildLikelyLocaleTable() {
    let localeList = [];

    if (process.platform === 'linux') {
      let locales = await spawn('locale', ['-a'])
        .catch(() => Observable.just(null))
        .reduce((acc,x) => { acc.push(...x.split('\n')); return acc; }, [])
        .toPromise();

      d(`Raw Locale list: ${JSON.stringify(locales)}`);

      localeList = locales.reduce((acc, x) => {
        let m = x.match(validLangCode);
        if (!m) return acc;

        acc.push(m[0]);
        return acc;
      }, []);
    }

    if (process.platform === 'win32') {
      localeList = getInstalledKeyboardLanguages();
    }

    if (process.platform === 'darwin') {
      fallbackLocaleTable = fallbackLocaleTable || require('./fallback-locales');

      // NB: OS X will return lists that are half just a language, half
      // language + locale, like ['en', 'pt_BR', 'ko']
      localeList = this.spellchecker.getAvailableDictionaries()
        .map((x => {
          if (x.length === 2) return fallbackLocaleTable[x];
          return normalizeLanguageCode(x);
        }));
    }

    d(`Filtered Locale list: ${JSON.stringify(localeList)}`);

    // Some distros like Ubuntu make locale -a useless by dumping
    // every possible locale for the language into the list :-/
    let counts = localeList.reduce((acc,x) => {
      let k = x.substring(0,2);
      acc[k] = acc[k] || [];
      acc[k].push(x);

      return acc;
    }, {});

    d(`Counts: ${JSON.stringify(counts)}`);

    let ret = Object.keys(counts).reduce((acc, x) => {
      if (counts[x].length > 1) return acc;

      d(`Setting ${x}`);
      acc[x] = normalizeLanguageCode(counts[x][0]);

      return acc;
    }, {});

    // NB: LANG has a Special Place In Our Hearts
    if (process.platform === 'linux' && process.env.LANG) {
      let m = process.env.LANG.match(validLangCode);
      if (!m) return ret;

      ret[m[0].substring(0, 2)] = normalizeLanguageCode(m[0]);
    }

    d(`Result: ${JSON.stringify(ret)}`);
    return ret;
  }

  async switchLanguage(langCode) {
    let actualLang;
    let dict = null;
    
    try {
      let {dictionary, language} = await this.loadDictionaryForLanguageWithAlternatives(langCode);
      actualLang = language;  dict = dictionary;
    } catch (e) {
      d(`Failed to load dictionary ${langCode}: ${e.message}`);
      throw e;
    }
    
    // NB: If we set the spellchecker inside the spellchecker callout itself, we 
    // will segfault
    await new Promise((req) => setTimeout(req, 0));
    
    d(`Setting current spellchecker to ${actualLang}, requested language was ${langCode}`);
    this.currentSpellchecker = new Spellchecker();
    this.currentSpellchecker.setDictionary(actualLang, dict);
  }

  dispose() {
    this.disp.dispose();
  }
}
