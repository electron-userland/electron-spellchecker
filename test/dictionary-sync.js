import './support';
import fs from 'fs';
import path from 'path';
import rimraf from 'rimraf';
import {getInstalledKeyboardLanguages} from 'keyboard-layout';

import DictionarySync from '../src/dictionary-sync';

let testCount = 0;

describe('The Dictionary Sync class', function() {
  beforeEach(function() {
    this.tempCacheDir = path.join(__dirname, `__dict_sync_${testCount++}`);
    this.fixture = new DictionarySync(this.tempCacheDir);
  });

  afterEach(function() {
    rimraf.sync(this.tempCacheDir);
  });

  describe('loadDictionaryForLanguage method', function() {
    this.timeout(60*1000);

    it('should download the German dictionary', async function() {
      let buf = await this.fixture.loadDictionaryForLanguage('de-DE');

      expect(buf.constructor.name).to.equal('Buffer');
      expect(buf.length > 1000).to.be.ok;
    });
  });

  describe('preloadDictionaries', function() {
    this.timeout(60*1000);

    it('should preload some dictionaries', async function() {
      let langFiles = await this.fixture.preloadDictionaries();

      expect(langFiles.length).to.equal(getInstalledKeyboardLanguages().length);
      for (let lang of langFiles) {
        expect(fs.existsSync(lang)).to.be.ok;
      }
    });
  });
});
