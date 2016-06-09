import './support';
import path from 'path';
import rimraf from 'rimraf';
import {ReactiveTest, TestScheduler} from 'rx';

import DictionarySync from '../src/dictionary-sync';
import SpellCheckHandler from '../src/spell-check-handler';

let testCount = 0;

describe('The Spell Check Handler Class', function() {
  beforeEach(function() {
    this.tempCacheDir = path.join(__dirname, `__spell_check${testCount++}`);
    this.sync = new DictionarySync(this.tempCacheDir);
    this.fixture = new SpellCheckHandler(this.sync);
  });

  afterEach(function() {
    //console.log(this.tempCacheDir);
    rimraf.sync(this.tempCacheDir);
  });

  describe('buildLikelyLocaleTable method', function() {
    it('should have en in the list', async function() {
      let result = await SpellCheckHandler.buildLikelyLocaleTable();
      console.log(JSON.stringify(result));

      expect(result['en']).to.be.ok;
    });
  });

  describe('the setLanguage method', function() {
    this.timeout(30*1000);

    it('should load a bunch of common languages', async function() {
      await this.fixture.switchLanguage('en-US');

      expect(this.fixture.currentSpellchecker.isMisspelled('bucket')).not.to.be.ok;
      expect(this.fixture.currentSpellchecker.isMisspelled('Eimer')).to.be.ok;

      await this.fixture.switchLanguage('de-DE');

      expect(this.fixture.currentSpellchecker.isMisspelled('bucket')).to.be.ok;
      expect(this.fixture.currentSpellchecker.isMisspelled('Eimer')).not.to.be.ok;
    });
  });

  describe('the attachToInput method', function() {
    it('should use TestScheduler correctly', function() {
      let scheduler = new TestScheduler();
      let input = scheduler.createHotObservable(
        ReactiveTest.onNext(250, 'This is a test of a long english sentence')
      );

      let items = [];
      input.subscribe((x) => items.push(x));

      expect(items.length).to.equal(0);

      scheduler.advanceTo(100);
      expect(items.length).to.equal(0);

      scheduler.advanceTo(300);
      expect(items.length).to.equal(1);
    });

    it.only('should detect the simple case of pasting in a long string', async function() {
      this.timeout(15 * 1000);

      let scheduler = new TestScheduler();
      let input = scheduler.createHotObservable(
        ReactiveTest.onNext(250, 'This is a test of a long english sentence')
      );

      this.fixture.scheduler = scheduler;
      this.fixture.attachToInput(input);

      expect(this.fixture.currentSpellcheckerLanguage).not.to.be.ok;
      
      scheduler.advanceTo(10 *1000);
      await this.fixture.currentSpellcheckerChanged.take(1).toPromise();

      expect(this.fixture.currentSpellcheckerLanguage).to.equal('en-US');
    });
  });
});
