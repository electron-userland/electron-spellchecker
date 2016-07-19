import {remote} from 'electron';
import {CompositeDisposable, Observable} from 'rx';

let d = require('debug-electron')('electron-spellchecker:context-menu-listener');

/**
 * ContextMenuListener will listen to the given window / WebView control and 
 * invoke a handler function. This function usually will immediately turn around
 * and invoke {{showPopupMenu}} from {{ContextMenuBuilder}}.
 */
export default class ContextMenuListener {
  /**
   * Constructs a ContextMenuListener and wires up the events it needs to fire
   * the callback.
   *
   * @param  {Function} handler             The callback that will be invoked 
   *                                        with the 'context-menu' info.
   * @param  {BrowserWindow|WebView} windowOrWebView  The target, either a
   *                                                  BrowserWindow or a WebView
   * @param  {Observable<Object>} contextMenuEvent  Use this for simulating a
   *                                                ContextMenu event
   */
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
    
  /**
   * Override the default logger for this class. You probably want to use
   * {{setGlobalLogger}} instead
   * 
   * @param {Function} fn   The function which will operate like console.log
   */
  static setLogger(fn) {
    d = fn;
  }

  /**
   * Disconnect the events that we connected in the Constructor
   */
  dispose() {
    this.disp.dispose();
  }
}
