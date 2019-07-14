const { remote } = require('electron');
const { Observable } = require('rxjs/Observable');
const { Subscription } = require('rxjs/Subscription');
const { fromRemoteWindow } = require('@aabuhijleh/electron-remote');

require('rxjs/add/observable/fromEvent');
require('rxjs/add/operator/map');

let d = require('debug')('electron-spellchecker:context-menu-listener');

/**
 * ContextMenuListener will listen to the given window / WebView control and
 * invoke a handler function. This function usually will immediately turn around
 * and invoke {{showPopupMenu}} from {{ContextMenuBuilder}}.
 */
module.exports = class ContextMenuListener {
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
    this.sub = new Subscription();

    if (!contextMenuEvent) {
      windowOrWebView = windowOrWebView || remote.getCurrentWebContents();
      contextMenuEvent = fromRemoteWindow(windowOrWebView, 'context-menu', true).map(([x]) => x[1]);
    }

    this.sub.add(contextMenuEvent.subscribe(handler));
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
  unsubscribe() {
    this.sub.unsubscribe();
  }
}
