import './support';

import SpellCheckHandler from '../src/spell-check-handler';

describe('The Spell Check Handler Class', function() {
  describe('buildLikelyLocaleTable method', function() {
    it('should have en in the list', async function() {
      let result = await SpellCheckHandler.buildLikelyLocaleTable();
      console.log(JSON.stringify(result));
      
      expect(result['en']).to.be.ok;
    });
  });
});
