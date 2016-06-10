import {CompositeDisposable, Observable} from 'rx';

const d = require('debug-electron')('electron-spellchecker:context-menu-listener');

export default class ContextMenuListener {
  constructor(handler, contextMenuEvent=null) {
    this.disp = new CompositeDisposable();
    
    contextMenuEvent = contextMenuEvent || Observable.fromEvent(window, 'contextmenu');

    this.disp.add(contextMenuEvent.subscribe((e) => {
      e.preventDefault();
      handler(this.getInformationForContextClick(e));
    }));
  }

  dispose() {
    this.disp.dispose();
  }

  getInformationForContextClick(e) {
    let tagName = e.target.tagName.toLowerCase();
    let className = e.target.className;
    let type = e.target.type;

    let selection = window.getSelection().toString();
    let hasSelectedText = (e.target.textContent && e.target.textContent.length && selection.length > 0);
    let parentLink = this.findParent(e.target, 'a');

    d(`Show context menu at ${tagName}, with class ${className}, with selected text ${selection}`);
    
    let menuInfo = {
      id: e.target.id,
      x: e.clientX,
      y: e.clientY,
      selection: selection
    };

    // Are we in a `textarea` or `input` field?
    if (tagName === 'textarea' || (tagName === 'input' && type === 'text')) {
      menuInfo.type = 'textInput';
      menuInfo.startIndex = e.target.selectionStart;
      menuInfo.endIndex = e.target.selectionEnd;
    } else if (tagName === 'a' || parentLink) {
      // Is this element or any of its parents an `a`?
      let href = e.target.href || parentLink.href;

      // Beware of empty links
      if (href && href.length) {
        menuInfo.type = 'link';
        menuInfo.href = href;
      }

      // `img` tags are often embedded within links, so set the source here
      let childImg = e.target.getElementsByTagName('img');
      if (childImg.length > 0) {
        menuInfo.src = childImg[0].src;
      }
    } else if (hasSelectedText) {
      // Was this a text element and do we have text selected?
      menuInfo.type = 'text';
    }

    // Check for standalone `img` tags
    if (tagName === 'img') {
      menuInfo.type = 'img';
      menuInfo.src = e.target.src;
    }

    return menuInfo;
  }

  findParent(element, tagName, classNames=[]) {
    tagName = tagName.toLowerCase();

    let predicate = (el) => {
      if (!el.tagName || el.tagName.toLowerCase() !== tagName) {
        return null;
      }

      if (!(classNames && classNames.length)) {
        return el;
      }

      if (classNames.find((className) => className === el.className)) {
        return el;
      }

      return null;
    };

    if (predicate(element)) return element;

    while (element && element.parentNode) {
      element = element.parentNode;
      if (predicate(element)) return element;
    }

    return null;
  }
}
