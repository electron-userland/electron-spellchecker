import path from 'path';
import mkdirp from 'mkdirp';
import {getURLForHunspellDictionary} from '@paulcbetts/spellchecker';
import {requireTaskPool} from 'electron-remote';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';
import {Observable} from 'rx';

import {fs} from './promisify';
import {normalizeLanguageCode} from './utility';

const d = require('debug')('electron-spellchecker:dictionary-sync');

const {downloadFileOrUrl} = process.type === 'browser' ?
  requireTaskPool(require.resolve('electron-remote/remote-ajax')) :
  require('electron-remote/remote-ajax');

export default class DictionarySync {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    mkdirp.sync(cacheDir);
  }

  async loadDictionaryForLanguage(langCode, cacheOnly=false) {
    if (process.platform === 'darwin') return new Buffer([]);

    let lang = normalizeLanguageCode(langCode);
    let target = path.join(this.cacheDir, `${lang}.bdic`);

    let fileExists = false;
    try {
      if (await fs.exists(target)) {
        fileExists = true;
        return await fs.readFileSync(target);
      }
    } catch (e) {
      d(`Failed to read file ${target}: ${e.message}`);
    }

    if (fileExists) {
      try {
        await fs.unlink(target);
      } catch (e) {
        d("Can't clear out file, bailing");
        return null;
      }
    }

    try {
      await downloadFileOrUrl(getURLForHunspellDictionary(lang), target);
    } catch (e) {
      d(`Failed to download file ${target}: ${e.message}`);
      try { fs.unlinkSync(target); } catch(e) {}
      return null;
    }

    if (cacheOnly) return target;
    return await fs.readFileSync(target);
  }

  preloadDictionaries() {
    return Observable.from(getInstalledKeyboardLanguages())
      .flatMap((x) => Observable.fromPromise(this.loadDictionaryForLanguage(x, true)))
      .reduce((acc,x) => { acc.push(x); return acc; }, [])
      .toPromise();
  }
}
