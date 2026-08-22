const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');

const DISCORD_URL = 'https://discord.com/app';
let mainWindow = null;
let focusMode = false;

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function discordUserAgent() {
  const chrome = process.versions.chrome || '140.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

async function injectViewer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    await mainWindow.webContents.insertCSS(readAsset('focus.css'), { cssOrigin: 'user' });
    await mainWindow.webContents.executeJavaScript(readAsset('inject.js'), true);
    await setFocusMode(focusMode);
  } catch (error) {
    console.error('[DGV] injection failed:', error);
  }
}

async function setFocusMode(enabled) {
  focusMode = Boolean(enabled);
  if (!mainWindow || mainWindow.isDestroyed()) return focusMode;

  try {
    await mainWindow.webContents.executeJavaScript(
      `window.__DGV__ && window.__DGV__.setFocusMode(${JSON.stringify(focusMode)});`,
      true
    );
  } catch (error) {
    console.error('[DGV] focus toggle failed:', error);
  }
  return focusMode;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'Discord Gallery Viewer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      partition: 'persist:discord-gallery-viewer'
    }
  });

  mainWindow.webContents.setUserAgent(discordUserAgent());

  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl || webContents.getURL();
    const isDiscord = /^https:\/\/(?:[\w-]+\.)?discord\.com\//i.test(origin);
    const allowed = new Set(['media', 'fullscreen', 'notifications']);
    callback(Boolean(isDiscord && allowed.has(permission)));
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const isDiscord = /^https:\/\/(?:[\w-]+\.)?discord\.com\/?/i.test(requestingOrigin || '');
    return Boolean(isDiscord && ['media', 'fullscreen', 'notifications'].includes(permission));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(?:[\w-]+\.)?discord\.com\//i.test(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', injectViewer);
  mainWindow.webContents.on('dom-ready', () => {
    setTimeout(injectViewer, 500);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F10') {
      event.preventDefault();
      setFocusMode(!focusMode);
      return;
    }

    if (input.key === 'Escape' && focusMode) {
      event.preventDefault();
      setFocusMode(false);
      return;
    }

    if (input.key === 'F11') {
      event.preventDefault();
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(DISCORD_URL);
}

ipcMain.handle('dgv:toggle-focus', () => setFocusMode(!focusMode));
ipcMain.handle('dgv:set-focus', (_event, enabled) => setFocusMode(enabled));
ipcMain.handle('dgv:get-focus', () => focusMode);
ipcMain.handle('dgv:reload', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.reload();
});

app.whenReady().then(() => {
  session.defaultSession.setUserAgent(discordUserAgent());
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
