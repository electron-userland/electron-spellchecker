import path from 'path';
import mkdirp from 'mkdirp';
import {getURLForHunspellDictionary} from './node-spellchecker';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';
import {Observable} from 'rx';

import {fs} from './promisify';
import {normalizeLanguageCode} from './utility';

const d = require('debug-electron')('electron-spellchecker:dictionary-sync');

const app = process.type === 'renderer' ?
  require('electron').remote.app :
  require('electron').app;

const {downloadFileOrUrl} =
  require('electron-remote').requireTaskPool(require.resolve('electron-remote/remote-ajax'));

export default class DictionarySync {
  constructor(cacheDir=null) {
    this.cacheDir = cacheDir || path.join(app.getPath('userData'), 'dictionaries');
    mkdirp.sync(this.cacheDir);
  }

  async loadDictionaryForLanguage(langCode, cacheOnly=false) {
    d(`Loading dictionary for language ${langCode}`);
    if (process.platform === 'darwin') return new Buffer([]);

    let lang = normalizeLanguageCode(langCode);
    let target = path.join(this.cacheDir, `${lang}.bdic`);

    let fileExists = false;
    try {
      if (fs.existsSync(target)) {
        fileExists = true;
        d(`Returning local copy: ${target}`);
        return await fs.readFile(target, {});
      }
    } catch (e) {
      d(`Failed to read file ${target}: ${e.message}`);
      throw e;
    }

    if (fileExists) {
      try {
        await fs.unlink(target);
      } catch (e) {
        d("Can't clear out file, bailing");
        throw e;
      }
    }

    let url = getURLForHunspellDictionary(lang);
    d(`Actually downloading ${url}`);
    await downloadFileOrUrl(url, target);

    if (cacheOnly) return target; return await fs.readFile(target, {});
  }

  preloadDictionaries(languageList=null) {
    return Observable.from(languageList || getInstalledKeyboardLanguages())
      .flatMap((x) => Observable.fromPromise(this.loadDictionaryForLanguage(x, true)))
      .reduce((acc,x) => { acc.push(x); return acc; }, [])
      .toPromise();
  }
}
