import './support';
import {normalizeLanguageCode} from '../src/utility';

describe('The Utility file', function() {

  describe('normalizeLanguageCode method', function() {
    it('should consider all of these valid', function() {
      ['en-us', 'en-US', 'de_de', 'de_DE'].map((x) => normalizeLanguageCode(x));
    });
  });
});
