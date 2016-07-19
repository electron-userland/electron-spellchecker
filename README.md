# electron-spellchecker

![](https://img.shields.io/npm/dm/electron-spellchecker.svg) <a href="http://paulcbetts.github.io/electron-spellchecker/docs">![](http://paulcbetts.github.io/electron-spellchecker/docs/badge.svg)</a>

electron-spellchecker is a library to help you implement spellchecking in your Electron applications, as well as handle default right-click Context Menus (since spell checking shows up in them).  This library intends to solve the problem of spellchecking in a production-ready, international-friendly way.

electron-spellchecker:

* Spell checks in all of the languages that Google Chrome supports by reusing its dictionaries.
* Automatically detects the language the user is typing in and silently switches on the fly.
* Handles locale correctly and automatically (i.e. users who are from Australia should not be corrected for 'colour', but US English speakers should)
* Automatically downloads and manages dictionaries in the background. 

## Quick Start

```js
import {SpellCheckHandler, ContextMenuListener, ContextMenuBuilder} from 'electron-spellchecker';

window.spellCheckHandler = new SpellCheckHandler();
window.spellCheckHandler.attachToInput();

// Start off as US English, America #1 (lol)
window.spellCheckHandler.switchLanguage('en-US');

let contextMenuBuilder = new ContextMenuBuilder(window.spellCheckHandler);
let contextMenuListener = new ContextMenuListener((info) => {
  contextMenuBuilder.showPopupMenu(info);
});
```

## Language Auto-Detection

The spell checker will attempt to automatically check the language that the user is typing in and switch on-the fly. However, giving it an explicit hint by calling `switchLanguage`, or providing it a block of sample text via `provideHintText` will result in much better results.

Sample text should be text that is reasonably likely to be in the same language as the user typing - for example, in an Email reply box, the original Email text would be a great sample, or in the case of Slack, the existing channel messages are used as the sample text.

## Learning more

* Run `npm start` to start [the example application](https://github.com/paulcbetts/electron-spellchecker/tree/master/example) and play around.
* Read [the class documentation](https://github.com/paulcbetts/electron-spellchecker/tree/master/example) to learn more.
