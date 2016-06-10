import './support';

import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';

import DictionarySync from '../src/dictionary-sync';

const d = require('debug-electron')('electron-spellchecker-test:dictionary-sync');

let testCount = 0;

describe('The Dictionary Sync class', function() {
  beforeEach(function() {
    this.tempCacheDir = path.join(__dirname, `__dict_sync_${testCount++}`);
    this.fixture = new DictionarySync(this.tempCacheDir);
  });

  afterEach(function() {
    //console.log(this.tempCacheDir);
    rimraf.sync(this.tempCacheDir);
  });

  describe('loadDictionaryForLanguage method', function() {
    this.timeout(60*1000);

    it('should download the German dictionary', async function() {
      let buf = await this.fixture.loadDictionaryForLanguage('de-DE');

      expect(buf.constructor.name).to.equal('Buffer');
      expect(buf.length > 1000).to.be.ok;
    });

    it('should throw when we a language that isnt real', async function() {
      let ret = null;
      try {
        ret = await this.fixture.loadDictionaryForLanguage('zz-ZZ');
      } catch (e) {
        return;
      }

      d(ret);
      d(typeof ret);
      fs.writeFileSync('./wtfisthisfile', ret);
      throw new Error("Didn't fail!");
    });

    it('should only have valid languages in the fallback locale list', async function() {
      return;
      /* NB: This test isn't super important, but it's interesting code so I left
       * it
      this.timeout(10 * 60 * 1000);
      let failedLangs = [];
      let downloadedLangs = 0;

      for (let lang of Object.values(fallbackLocales)) {
        try {
          await this.fixture.loadDictionaryForLanguage(lang);
          downloadedLangs++;
        } catch (e) {
          failedLangs.push(lang);
        }
      }

      if (failedLangs.length > 0) {
        console.log(`FAILED LANGUAGES: ${JSON.stringify(failedLangs)}`);
        throw new Error("Failed languages detected");
      }

      console.log(`Downloaded ${downloadedLangs} languages`);
      */
    });
  });

  describe('preloadDictionaries', function() {
    this.timeout(60*1000);

    it('should preload some dictionaries', async function() {
      if (process.platform === 'linux') return;

      let installedLangs = getInstalledKeyboardLanguages();
      if (!installedLangs || installedLangs.length < 1) return;

      let langFiles = await this.fixture.preloadDictionaries();

      expect(langFiles.length).to.equal(installedLangs.length);
      for (let lang of langFiles) {
        expect(fs.existsSync(lang)).to.be.ok;
      }
    });
  });
});
