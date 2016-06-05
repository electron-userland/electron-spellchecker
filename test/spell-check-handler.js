import './support';
import path from 'path';

import DictionarySync from '../src/dictionary-sync';
import SpellCheckHandler from '../src/spell-check-handler';

let testCount = 0;

describe('The Spell Check Handler Class', function() {
  describe('buildLikelyLocaleTable method', function() {
    it('should have en in the list', async function() {
      let result = await SpellCheckHandler.buildLikelyLocaleTable();
      console.log(JSON.stringify(result));

      expect(result['en']).to.be.ok;
    });
  });

  describe('the setLanguage method', function() {
    this.timeout(30*1000);

    beforeEach(function() {
      this.tempCacheDir = path.join(__dirname, `__dict_sync_${testCount++}`);
      this.sync = new DictionarySync(this.tempCacheDir);
      this.fixture = new SpellCheckHandler(this.sync);
    });

    afterEach(function() {
      console.log(this.tempCacheDir);
      //rimraf.sync(this.tempCacheDir);
    });

    it.only('should load a bunch of common languages', async function() {
      await this.fixture.switchLanguage('en-US');

      expect(this.fixture.currentSpellchecker.isMisspelled('bucket')).not.to.be.ok;
      expect(this.fixture.currentSpellchecker.isMisspelled('Eimer')).to.be.ok;

      await this.fixture.switchLanguage('de-DE');

      expect(this.fixture.currentSpellchecker.isMisspelled('bucket')).to.be.ok;
      expect(this.fixture.currentSpellchecker.isMisspelled('Eimer')).not.to.be.ok;
    });
  });
});
