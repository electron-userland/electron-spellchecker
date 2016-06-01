import {Disposable, Observable, Scheduler, SerialDisposable, Subject} from 'rx';
import {Spellchecker} from '@paulcbetts/spellchecker';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';
import pify from 'pify';
import {spawn} from 'spawn-rx';

import DictionarySync from './dictionary-sync';
import {normalizeLanguageCode} from './utility';

const d = require('debug')('electron-spellchecker:spell-check-handler');
let cld = null;

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
  constructor(dictionarySync=null) {
    this.dictionarySync = dictionarySync || new DictionarySync();
    this.switchToLanguage = new Subject();
    this.currentSpellchecker = null;
    this.currentSpellcheckerLanguage = null;
    
    this.disp = new SerialDisposable();
    
    if (process.platform === 'darwin') {
      // NB: OS X does automatic language detection, we're gonna trust it
      this.currentSpellchecker = new Spellchecker();
      return;
    }
    
    this.switchToLanguage
      .flatMap((lang) => 
        this.dictionarySync.loadDictionaryForLanguage(lang)
          .map((dict) => ({ language: lang, dictionary: dict }))
          .catch((e) => {
            d(`Failed to load dictionary ${lang}: ${e.message}`);
            return Observable.just(null);
          }))
      .where((x) => x !== null)
      .observeOn(Scheduler.default)
      .subscribe((ld) => {
        this.currentSpellchecker = new Spellchecker();
        this.currentSpellchecker.setLanguage(ld.language, ld.dictionary);
      });
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
  
  getLikelyLocaleForLanguage(language) {
    //if (this.likely)
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
      
    d(`Filtered Locale list: ${JSON.stringify(localeList)}`);
    
    // Some operating systems like Ubuntu make locale -a useless by dumping
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
    if (process.env.LANG) {
      let m = process.env.LANG.match(validLangCode);
      if (!m) return ret;
      
      ret[m[0].substring(0, 2)] = normalizeLanguageCode(m[0]);
    }
      
    d(`Result: ${JSON.stringify(ret)}`);
    return ret;
  }
  
  dispose() {
    this.disp.dispose();
  }
}
