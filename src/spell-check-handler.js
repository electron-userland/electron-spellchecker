import {CompositeDisposable, Disposable, Observable, Scheduler, SerialDisposable, Subject} from 'rx';
import {Spellchecker} from '@paulcbetts/spellchecker';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';
import {spawn} from 'spawn-rx';

import './custom-operators';
import DictionarySync from './dictionary-sync';
import {normalizeLanguageCode} from './utility';

const d = require('debug')('electron-spellchecker:spell-check-handler');
let cld = null;
let fallbackLocaleTable = null;
let webFrame = (process.type === 'renderer' ? 
  require('electron').webFrame :
  null);

const validLangCode = /[a-z]{2}[_][A-Z]{2}/;

// NB: This is to work around electron/electron#1005, where contractions
// are incorrectly marked as spelling errors. This lets people get away with
// incorrectly spelled contracted words, but it's the best we can do for now.
const contractions = [
  "ain't", "aren't", "can't", "could've", "couldn't", "couldn't've", "didn't", "doesn't", "don't", "hadn't",
  "hadn't've", "hasn't", "haven't", "he'd", "he'd've", "he'll", "he's", "how'd", "how'll", "how's", "I'd",
  "I'd've", "I'll", "I'm", "I've", "isn't", "it'd", "it'd've", "it'll", "it's", "let's", "ma'am", "mightn't",
  "mightn't've", "might've", "mustn't", "must've", "needn't", "not've", "o'clock", "shan't", "she'd", "she'd've",
  "she'll", "she's", "should've", "shouldn't", "shouldn't've", "that'll", "that's", "there'd", "there'd've",
  "there're", "there's", "they'd", "they'd've", "they'll", "they're", "they've", "wasn't", "we'd", "we'd've",
  "we'll", "we're", "we've", "weren't", "what'll", "what're", "what's", "what've", "when's", "where'd",
  "where's", "where've", "who'd", "who'll", "who're", "who's", "who've", "why'll", "why're", "why's", "won't",
  "would've", "wouldn't", "wouldn't've", "y'all", "y'all'd've", "you'd", "you'd've", "you'll", "you're", "you've"
];

const contractionMap = contractions.reduce((acc, word) => {
  acc[word.replace(/'.*/, '')] = true;
  return acc;
}, {});

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
  constructor(dictionarySync=null, localStorage=null, scheduler=null) {
    this.dictionarySync = dictionarySync || new DictionarySync();
    this.switchToLanguage = new Subject();
    this.currentSpellchecker = null;
    this.currentSpellcheckerLanguage = null;
    this.currentSpellcheckerChanged = new Subject();
    this.localStorage = localStorage || window.localStorage;
    this.scheduler = scheduler || Scheduler.default;
    this.shouldAutoCorrect = true;

    this.disp = new SerialDisposable();

    if (process.platform === 'darwin') {
      // NB: OS X does automatic language detection, we're gonna trust it
      this.currentSpellchecker = new Spellchecker();
      this.currentSpellcheckerLanguage = 'en-US';
      
      if (webFrame) {
        webFrame.setSpellCheckProvider(
          this.currentSpellcheckerLanguage, 
          this.shouldAutoCorrect, 
          { spellCheck: this.handleElectronSpellCheck.bind(this) });
      }
      return;
    }
  }

  async loadDictionaryForLanguageWithAlternatives(langCode, cacheOnly=false) {
    const localStorageKey =  'electronSpellchecker_alternatesTable';
    
    this.fallbackLocaleTable = this.fallbackLocaleTable || require('./fallback-locales');
    let lang = langCode.substring(0, 2);

    let alternatives = [langCode, await this.getLikelyLocaleForLanguage(lang), this.fallbackLocaleTable[lang]];
    let alternatesTable = JSON.parse(this.localStorage.getItem(localStorageKey) || '{}');
    
    if (langCode in alternatesTable) {
      return await this.dictionarySync.loadDictionaryForLanguage(alternatesTable[langCode]);
    }

    d(`Requesting to load ${langCode}, alternatives are ${JSON.stringify(alternatives)}`);
    return await Observable.of(...alternatives)
      .concatMap((l) => {
        return Observable.defer(() => 
            Observable.fromPromise(this.dictionarySync.loadDictionaryForLanguage(l, cacheOnly)))
          .map((d) => ({language: l, dictionary: d}))
          .do(({language}) => {
            alternatesTable[langCode] = language;
            this.localStorage.setItem(localStorageKey, JSON.stringify(alternatesTable));
          })
          .catch(() => Observable.just(null));
      })
      .filter((x) => x !== null)
      .take(1)
      .toPromise();
  }

  attachToInput(inputText=null) {
    // OS X has no need for any of this
    if (process.platform === 'darwin' && !inputText) {
      return Disposable.empty;
    }
    
    let input = inputText || fromEventCapture(document.body, 'input')
      .flatMap((e) => {
        if (!e.target || !e.target.value) return Observable.empty();
        return Observable.of(e.target.value);
      });
      
    // Here's how this works - basically the idea is, we want a notification
    // for when someone *starts* typing, but only at the beginning of a series
    // of keystrokes, we don't want to hear anything while they're typing, and
    // we don't want to hear about it when they're not typing at all, so we're
    // only calling getCurrentKeyboardLanguage when it makes sense.
    //
    // To do that, we're going to listen on event, then map that to an Observable
    // that returns a value then never ends. But! We're gonna *also* terminate that
    // Observable once the user stops typing (the takeUntil). Then, we're gonna
    // keep doing that forever (effectively waiting for the next inputEvent). The
    // startWith(true) makes sure that we have an initial value on startup, then we
    // map that
    let userStartedTyping = input
      .concatMap(() => Observable.return(true).concat(Observable.never()))
      .takeUntil(input.guaranteedThrottle(750, this.scheduler))
      .repeat()
      .startWith(true);
      
    let languageDetectionMatches = userStartedTyping
      .do(() => d('User started typing'))
      .flatMap(() => input.sample(2000, this.scheduler))
      .flatMap((text) => {
        d(`Attempting detection of ${text}`);
        return Observable.fromPromise(this.detectLanguageForText(text))
          .catch(() => Observable.empty());
      })
      .take(1)
      .repeat();

    let disp = new CompositeDisposable();
    disp.add(languageDetectionMatches
      .flatMap(async (langWithoutLocale) => {
        d(`Auto-detected language as ${langWithoutLocale}`);
        let lang = await this.getLikelyLocaleForLanguage(langWithoutLocale);
        if (lang !== this.currentSpellcheckerLanguage) await this.switchLanguage(lang);
        
        return lang;
      })
      .catch((e) => {
        d(`Failed to load dictionary: ${e.message}`);
        return Observable.empty();
      })
      .subscribe(async (lang) => {
        d(`New Language is ${lang}`);
      }));
      
    if (webFrame) {
      disp.add(this.currentSpellcheckerChanged
          .startWith(true)
          .observeOn(this.scheduler)
        .where(() => this.currentSpellchecker)
        .subscribe(() => {
          d('Actually installing spell check provider to Electron');
          
          webFrame.setSpellCheckProvider(
            this.currentSpellcheckerLanguage, 
            this.shouldAutoCorrect, 
            { spellCheck: this.handleElectronSpellCheck.bind(this) });
        }));
    }

    this.disp.setDisposable(disp);
    return disp;
  }
  
  handleElectronSpellCheck(text) {
    if (!this.currentSpellchecker) return true;
    if (contractionMap[text.toLocaleLowerCase()]) return true;
  
    d(`Checking spelling of ${text}`);
    return !this.currentSpellchecker.isMisspelled(text);
  }
  
  detectLanguageForText(text) {
    // NB: Unfortuantely cld marshals errors incorrectly, so we can't use pify
    cld = cld || require('cld');
    return new Promise((res,rej) => {
      cld.detect(text, (err, result) => {
        if (err) { rej(new Error(err.message)); return; }
        res(result.languages[0].code);
      });
    });
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
  
  async provideHintText(inputText) {
    let langWithoutLocale = null;
    try {
      langWithoutLocale = await this.detectLanguageForText(inputText);
    } catch (e) {
      d(`Couldn't detect language for text '${inputText}': ${e.message}, ignoring sample`);
      return;
    }
    
    let lang = await this.getLikelyLocaleForLanguage(langWithoutLocale);
    await this.switchLanguage(lang);
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
    
    d(`Setting current spellchecker to ${actualLang}, requested language was ${langCode}`);
    if (this.currentSpellcheckerLanguage !== actualLang) {
      d(`Creating node-spellchecker instance`);
      this.currentSpellchecker = new Spellchecker();
      this.currentSpellchecker.setDictionary(actualLang, dict);
      this.currentSpellcheckerLanguage = actualLang;
      this.currentSpellcheckerChanged.onNext(true);
    }
  }

  dispose() {
    this.disp.dispose();
  }
}
