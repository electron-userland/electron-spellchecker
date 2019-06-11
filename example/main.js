const {app, BrowserWindow } = require('electron');
const electronDebug = require('electron-debug');
const path = require('path');

let mainWindow = null;
electronDebug({enabled: true, showDevTools: true});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 365,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadURL(`file://${__dirname}/index.html`);
  setTimeout(() => mainWindow.openDevTools(), 5*1000);
});
