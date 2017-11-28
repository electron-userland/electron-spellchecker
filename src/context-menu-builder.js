import {clipboard, nativeImage, remote, shell} from 'electron';
import {truncateString, matchesWord} from './utility';

const {Menu, MenuItem} = remote;

let d = require('debug')('electron-spellchecker:context-menu-builder');

const contextMenuStringTable = {
  copyMail: () => `Copy Email Address`,
  copyLinkUrl: () => `Copy Link`,
  openLinkUrl: () => `Open Link`,
  copyImageUrl: () => `Copy Image URL`,
  copyImage: () => `Copy Image`,
  addToDictionary: () => `Add to Dictionary`,
  lookUpDefinition: ({word}) => `Look Up "${word}"`,
  searchGoogle: () => `Search with Google`,
  cut: () => `Cut`,
  copy: () => `Copy`,
  paste: () => `Paste`,
  inspectElement: () => `Inspect Element`,
};

/**
 * ContextMenuBuilder creates context menus based on the content clicked - this
 * information is derived from
 * https://github.com/electron/electron/blob/master/docs/api/web-contents.md#event-context-menu,
 * which we use to generate the menu. We also use the spell-check information to
 * generate suggestions.
 */
export default class ContextMenuBuilder {
  /**
   * Creates an instance of ContextMenuBuilder
   *
   * @param  {SpellCheckHandler} spellCheckHandler  The spell checker to generate
   *                                                recommendations for.
   * @param  {BrowserWindow|WebView} windowOrWebView  The hosting window/WebView
   * @param  {Boolean} debugMode    If true, display the "Inspect Element" menu item.
   * @param  {function} processMenu If passed, this method will be passed the menu to change
   *                                it prior to display. Signature: (menu, info) => menu
   */
  constructor(spellCheckHandler, windowOrWebView=null, debugMode=false, processMenu=(m) => m) {
    this.spellCheckHandler = spellCheckHandler;
    this.debugMode = debugMode;
    this.processMenu = processMenu;
    this.menu = null;
    this.stringTable = Object.assign({}, contextMenuStringTable);

    windowOrWebView = windowOrWebView || remote.getCurrentWebContents();

    let ctorName = Object.getPrototypeOf(windowOrWebView).constructor.name;
    if (ctorName === 'WebContents') {
      this.getWebContents = () => windowOrWebView;
    } else {
      // NB: We do this because at the time a WebView is created, it doesn't
      // have a WebContents, we need to defer the call to getWebContents
      this.getWebContents = 'webContents' in windowOrWebView ?
        () => windowOrWebView.webContents :
        () => windowOrWebView.getWebContents();
    }
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
   * Specify alternate string formatter for each context menu.
   * String table consist of string formatter as function instead per each context menu item,
   * allows to change string in runtime. All formatters are simply typeof () => string, except
   * lookUpDefinition provides word, ({word}) => string.
   *
   * @param {Object} stringTable The object contains string foramtter function for context menu.
   * It is allowed to specify only certain menu string as necessary, which will makes other string
   * fall backs to default.
   *
   */
  setAlternateStringFormatter(stringTable) {
    this.stringTable = Object.assign(this.stringTable, stringTable);
  }

  /**
   * Shows a popup menu given the information returned from the context-menu
   * event. This is probably the only method you need to call in this class.
   *
   * @param  {Object} contextInfo   The object returned from the 'context-menu'
   *                                Electron event.
   *
   * @return {Promise}              Completion
   */
  async showPopupMenu(contextInfo) {
    let menu = await this.buildMenuForElement(contextInfo);
    if (!menu) return;
    menu.popup(remote.getCurrentWindow(), { async: true });
  }

  /**
   * Builds a context menu specific to the given info that _would_ be shown
   * immediately by {{showPopupMenu}}. Use this to add your own menu items to
   * the list but use most of the default behavior.
   *
   * @return {Promise<Menu>}      The newly created `Menu`
   */
  async buildMenuForElement(info) {
    //d(`Got context menu event with args: ${JSON.stringify(info)}`);

    if (info.linkURL && info.linkURL.length > 0) {
      return this.buildMenuForLink(info);
    }

    if (info.hasImageContents && info.srcURL && info.srcURL.length > 1) {
      return this.buildMenuForImage(info);
    }

    if (info.isEditable || (info.inputFieldType && info.inputFieldType !== 'none')) {
      return await this.buildMenuForTextInput(info);
    }

    return this.buildMenuForText(info);
  }

  /**
   * Builds a menu applicable to a text input field.
   *
   * @return {Menu}  The `Menu`
   */
  async buildMenuForTextInput(menuInfo) {
    let menu = new Menu();

    await this.addSpellingItems(menu, menuInfo);
    this.addSearchItems(menu, menuInfo);

    this.addCut(menu, menuInfo);
    this.addCopy(menu, menuInfo);
    this.addPaste(menu, menuInfo);
    this.addInspectElement(menu, menuInfo);
    this.processMenu(menu, menuInfo);

    return menu;
  }

  /**
   * Builds a menu applicable to a link element.
   *
   * @return {Menu}  The `Menu`
   */
  buildMenuForLink(menuInfo) {
    let menu = new Menu();
    let isEmailAddress = menuInfo.linkURL.startsWith('mailto:');

    let copyLink = new MenuItem({
      label: isEmailAddress ? this.stringTable.copyMail() : this.stringTable.copyLinkUrl(),
      click: () => {
        // Omit the mailto: portion of the link; we just want the address
        clipboard.writeText(isEmailAddress ?
          menuInfo.linkText : menuInfo.linkURL);
      }
    });

    let openLink = new MenuItem({
      label: this.stringTable.openLinkUrl(),
      click: () => {
        //d(`Navigating to: ${menuInfo.linkURL}`);
        shell.openExternal(menuInfo.linkURL);
      }
    });

    menu.append(copyLink);
    menu.append(openLink);

    if (this.isSrcUrlValid(menuInfo)) {
      this.addSeparator(menu);
      this.addImageItems(menu, menuInfo);
    }

    this.addInspectElement(menu, menuInfo);
    this.processMenu(menu, menuInfo);

    return menu;
  }

  /**
   * Builds a menu applicable to a text field.
   *
   * @return {Menu}  The `Menu`
   */
  buildMenuForText(menuInfo) {
    let menu = new Menu();

    this.addSearchItems(menu, menuInfo);
    this.addCopy(menu, menuInfo);
    this.addInspectElement(menu, menuInfo);
    this.processMenu(menu, menuInfo);

    return menu;
  }

  /**
   * Builds a menu applicable to an image.
   *
   * @return {Menu}  The `Menu`
   */
  buildMenuForImage(menuInfo) {
    let menu = new Menu();

    if (this.isSrcUrlValid(menuInfo)) {
      this.addImageItems(menu, menuInfo);
    }
    this.addInspectElement(menu, menuInfo);
    this.processMenu(menu, menuInfo);

    return menu;
  }

  /**
   * Checks if the current text selection contains a single misspelled word and
   * if so, adds suggested spellings as individual menu items.
   */
  async addSpellingItems(menu, menuInfo) {
    let target = this.getWebContents();
    if (!menuInfo.misspelledWord || menuInfo.misspelledWord.length < 1) {
      return menu;
    }

    // Ensure that we have a spell-checker for this language
    if (!this.spellCheckHandler.currentSpellchecker) {
      return menu;
    }

    // Ensure that we have valid corrections for that word
    let corrections = await this.spellCheckHandler.getCorrectionsForMisspelling(menuInfo.misspelledWord);

    if (corrections && corrections.length) {
      corrections.forEach((correction) => {
        let item = new MenuItem({
          label: correction,
          click: () => target.replaceMisspelling(correction)
        });

        menu.append(item);
      });

      this.addSeparator(menu);
    }

    // Gate learning words based on OS support. At some point we can manage a
    // custom dictionary for Hunspell, but today is not that day
    if (process.platform === 'darwin') {
      let learnWord = new MenuItem({
        label: this.stringTable.addToDictionary(),
        click: async () => {
          // NB: This is a gross fix to invalidate the spelling underline,
          // refer to https://github.com/tinyspeck/slack-winssb/issues/354
          target.replaceMisspelling(menuInfo.selectionText);

          try {
            await this.spellCheckHandler.addToDictionary(menuInfo.misspelledWord);
          } catch (e) {
            d(`Failed to add entry to dictionary: ${e.message}`);
          }
        }
      });

      menu.append(learnWord);
    }

    return menu;
  }

  /**
   * Adds search-related menu items.
   */
  addSearchItems(menu, menuInfo) {
    if (!menuInfo.selectionText || menuInfo.selectionText.length < 1) {
      return menu;
    }

    let match = matchesWord(menuInfo.selectionText);
    if (!match || match.length === 0) {
      return menu;
    }

    if (process.platform === 'darwin') {
      let target = this.getWebContents();

      let lookUpDefinition = new MenuItem({
        label: this.stringTable.lookUpDefinition({word: truncateString(menuInfo.selectionText)}),
        click: () => target.showDefinitionForSelection()
      });

      menu.append(lookUpDefinition);
    }

    let search = new MenuItem({
      label: this.stringTable.searchGoogle(),
      click: () => {
        let url = `https://www.google.com/#q=${encodeURIComponent(menuInfo.selectionText)}`;

        //d(`Searching Google using ${url}`);
        shell.openExternal(url);
      }
    });

    menu.append(search);
    this.addSeparator(menu);

    return menu;
  }

  isSrcUrlValid(menuInfo) {
    return menuInfo.srcURL && menuInfo.srcURL.length > 0;
  }

  /**
   * Adds "Copy Image" and "Copy Image URL" items when `src` is valid.
   */
  addImageItems(menu, menuInfo) {
    let copyImage = new MenuItem({
      label: this.stringTable.copyImage(),
      click: () => this.convertImageToBase64(menuInfo.srcURL,
        (dataURL) => clipboard.writeImage(nativeImage.createFromDataURL(dataURL)))
    });

    menu.append(copyImage);

    let copyImageUrl = new MenuItem({
      label: this.stringTable.copyImageUrl(),
      click: () => clipboard.writeText(menuInfo.srcURL)
    });

    menu.append(copyImageUrl);
    return menu;
  }

  /**
   * Adds the Cut menu item
   */
  addCut(menu, menuInfo) {
    let target = this.getWebContents();
    menu.append(new MenuItem({
      label: this.stringTable.cut(),
      accelerator: 'CommandOrControl+X',
      enabled: menuInfo.editFlags.canCut,
      click: () => target.cut()
    }));

    return menu;
  }

  /**
   * Adds the Copy menu item.
   */
  addCopy(menu, menuInfo) {
    let target = this.getWebContents();
    menu.append(new MenuItem({
      label: this.stringTable.copy(),
      accelerator: 'CommandOrControl+C',
      enabled: menuInfo.editFlags.canCopy,
      click: () => target.copy()
    }));

    return menu;
  }

  /**
   * Adds the Paste menu item.
   */
  addPaste(menu, menuInfo) {
    let target = this.getWebContents();
    menu.append(new MenuItem({
      label: this.stringTable.paste(),
      accelerator: 'CommandOrControl+V',
      enabled: menuInfo.editFlags.canPaste,
      click: () => target.paste()
    }));

    return menu;
  }

  /**
   * Adds a separator item.
   */
  addSeparator(menu) {
    menu.append(new MenuItem({type: 'separator'}));
    return menu;
  }

  /**
   * Adds the "Inspect Element" menu item.
   */
  addInspectElement(menu, menuInfo, needsSeparator=true) {
    let target = this.getWebContents();
    if (!this.debugMode) return menu;
    if (needsSeparator) this.addSeparator(menu);

    let inspect = new MenuItem({
      label: this.stringTable.inspectElement(),
      click: () => target.inspectElement(menuInfo.x, menuInfo.y)
    });

    menu.append(inspect);
    return menu;
  }

  /**
   * Converts an image to a base-64 encoded string.
   *
   * @param  {String} url           The image URL
   * @param  {Function} callback    A callback that will be invoked with the result
   * @param  {String} outputFormat  The image format to use, defaults to 'image/png'
   */
  convertImageToBase64(url, callback, outputFormat='image/png') {
    let canvas = document.createElement('CANVAS');
    let ctx = canvas.getContext('2d');
    let img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      canvas.height = img.height;
      canvas.width = img.width;
      ctx.drawImage(img, 0, 0);

      let dataURL = canvas.toDataURL(outputFormat);
      canvas = null;
      callback(dataURL);
    };

    img.src = url;
  }
}
