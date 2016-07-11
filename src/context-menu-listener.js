import {remote} from 'electron';
import {CompositeDisposable, Observable} from 'rx';

let d = require('debug-electron')('electron-spellchecker:context-menu-listener');

export default class ContextMenuListener {
  constructor(handler, windowOrWebView=null, contextMenuEvent=null) {
    this.disp = new CompositeDisposable();

    if (!contextMenuEvent) {
      windowOrWebView = windowOrWebView || remote.getCurrentWebContents();
      let target = 'webContents' in windowOrWebView ?
        windowOrWebView.webContents : windowOrWebView;

      contextMenuEvent = Observable.fromEvent(target, 'context-menu',
          (e,p) => { e.preventDefault(); return p; })
        .map((x) => JSON.parse(JSON.stringify(x)));
    }

    this.disp.add(contextMenuEvent.subscribe(handler));
  }
  
  static setLogger(fn) {
    d = fn;
  }

  dispose() {
    this.disp.dispose();
  }
}
