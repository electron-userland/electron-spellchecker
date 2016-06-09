import {app, BrowserWindow } from 'electron';
import electronDebug from 'electron-debug';

let mainWindow = null;
electronDebug({enabled: true, showDevTools: true});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 580,
    height: 365
  });

  mainWindow.loadURL(`file://${__dirname}/index.html`);
  setTimeout(() => mainWindow.openDevTools(), 5*1000);
});
