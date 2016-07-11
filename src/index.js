import ContextMenuBuilder from './context-menu-builder';
import ContextMenuListener from './context-menu-listener';
import DictionarySync from './dictionary-sync';
import SpellCheckHandler from './spell-check-handler';

function setGlobalLogger(fn) {
  for (let klass of [ContextMenuBuilder, ContextMenuListener, DictionarySync, SpellCheckHandler]) {
    klass.setLogger(fn);
  }
}

module.exports = {
  ContextMenuBuilder,
  ContextMenuListener,
  DictionarySync,
  SpellCheckHandler,
  setGlobalLogger
};
