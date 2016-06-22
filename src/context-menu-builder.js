import {clipboard, nativeImage, remote, shell} from 'electron';

const {Menu, MenuItem} = remote;

const d = require('debug-electron')('electron-spellchecker:context-menu-builder');

export default class ContextMenuBuilder {
  constructor(spellCheckHandler, windowOrWebView=null, debugMode=false) {
    this.spellCheckHandler = spellCheckHandler;
    this.windowOrWebView = windowOrWebView || remote.getCurrentWindow();
    this.debugMode = debugMode;
    this.menu = null;
  }

  async showPopupMenu(contextInfo) {
    let menu = await this.buildMenuForElement(contextInfo);

    // Opening a menu blocks the renderer process, which is definitely not
    // suitable for running tests
    if (!menu) return;
    menu.popup(remote.getCurrentWindow());
  }

  /**
   * Builds a context menu specific to the given info.
   *
   * @return {Menu}      The newly created `Menu`
   */
  async buildMenuForElement(info) {
    d(`Got context menu event with args: ${JSON.stringify(info)}`);

    if (info.linkURL && info.linkURL.length > 0) {
      return this.buildMenuForLink(info);
    }

    if (info.hasImageContents) {
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
      label: isEmailAddress ? 'Copy Email Address' : 'Copy Link',
      click: () => {
        // Omit the mailto: portion of the link; we just want the address
        clipboard.writeText(isEmailAddress ?
          menuInfo.linkText : menuInfo.linkURL);
      }
    });

    let openLink = new MenuItem({
      label: 'Open Link',
      click: () => {
        d(`Navigating to: ${menuInfo.linkURL}`);
        shell.openExternal(menuInfo.linkURL);
      }
    });

    menu.append(copyLink);
    menu.append(openLink);

    this.addSeparator(menu);

    this.addImageItems(menu, menuInfo);
    this.addInspectElement(menu, menuInfo);

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

    return menu;
  }

  /**
   * Builds a menu applicable to an image.
   *
   * @return {Menu}  The `Menu`
   */
  buildMenuForImage(menuInfo) {
    let menu = new Menu();

    this.addImageItems(menu, menuInfo);
    this.addInspectElement(menu, menuInfo);
    return menu;
  }

  /**
   * Checks if the current text selection contains a single misspelled word and
   * if so, adds suggested spellings as individual menu items.
   */
  async addSpellingItems(menu, menuInfo) {
    let target = 'webContents' in this.windowOrWebView ?
      this.windowOrWebView.webContents : this.windowOrWebView;

    if (!menuInfo.misspelledWord || menuInfo.misspelledWord.length < 1) {
      return menu;
    }

    // Ensure that we have a spell-checker for this language
    if (!this.spellCheckHandler.currentSpellchecker) {
      return menu;
    }

    // Ensure that we have valid corrections for that word
    let corrections = await this.spellCheckHandler.getCorrectionsForMisspelling(menuInfo.misspelledWord);
    if (!corrections || !corrections.length) {
      return menu;
    }

    corrections.forEach((correction) => {
      let item = new MenuItem({
        label: correction,
        click: () => target.replaceMisspelling(correction)
      });

      menu.append(item);
    });

    this.addSeparator(menu);

    // Gate learning words based on OS support. At some point we can manage a
    // custom dictionary for Hunspell, but today is not that day
    if (process.platform === 'darwin') {
      let learnWord = new MenuItem({
        label: `Add to Dictionary`,
        click: async () => {
          // NB: This is a gross fix to invalidate the spelling underline,
          // refer to https://github.com/tinyspeck/slack-winssb/issues/354
          target.replaceMisspelling(menuInfo.selection);

          try {
            await this.spellChecker.add(menuInfo.misspelledWord);
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

    let match = menuInfo.selectionText.match(/\w/);
    if (!match || match.length === 0) {
      return menu;
    }

    let search = new MenuItem({
      label: 'Search with Google',
      click: () => {
        let url = `https://www.google.com/#q=${encodeURIComponent(menuInfo.selectionText)}`;

        d(`Searching Google using ${url}`);
        shell.openExternal(url);
      }
    });

    menu.append(search);
    this.addSeparator(menu);

    return menu;
  }

  /**
   * Adds "Copy Image" and "Copy Image URL" items when `src` is valid.
   */
  addImageItems(menu, menuInfo) {
    if (!menuInfo.srcURL || menuInfo.srcURL.length === 0) {
      return menu;
    }

    let copyImage = new MenuItem({
      label: 'Copy Image',
      click: () => this.convertImageToBase64(menuInfo.srcURL,
        (dataURL) => clipboard.writeImage(nativeImage.createFromDataURL(dataURL)))
    });

    menu.append(copyImage);

    let copyImageUrl = new MenuItem({
      label: 'Copy Image URL',
      click: () => clipboard.writeText(menuInfo.srcURL)
    });

    menu.append(copyImageUrl);
    return menu;
  }

  /**
   * Adds the Cut menu item
   */
  addCut(menu, menuInfo) {
    let target = 'webContents' in this.windowOrWebView ?
      this.windowOrWebView.webContents : this.windowOrWebView;

    menu.append(new MenuItem({
      label: 'Cut',
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
    let target = 'webContents' in this.windowOrWebView ?
      this.windowOrWebView.webContents : this.windowOrWebView;

    menu.append(new MenuItem({
      label: 'Copy',
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
    let target = 'webContents' in this.windowOrWebView ?
      this.windowOrWebView.webContents : this.windowOrWebView;

    menu.append(new MenuItem({
      label: 'Paste',
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
    let target = 'webContents' in this.windowOrWebView ?
      this.windowOrWebView.webContents : this.windowOrWebView;

    if (!this.devMode) return menu;
    if (needsSeparator) this.addSeparator(menu);

    let inspect = new MenuItem({
      label: 'Inspect Element',
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
