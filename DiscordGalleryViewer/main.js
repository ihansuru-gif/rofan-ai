const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const fs = require('fs');
const path = require('path');

const DISCORD_URL = 'https://discord.com/app';
let mainWindow = null;
let pipWindow = null;
let focusMode = false;
let pipCaptureEnabled = false;

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function discordUserAgent() {
  const chrome = process.versions.chrome || '150.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function isUsable(win) {
  return Boolean(win && !win.isDestroyed());
}

async function injectViewer() {
  if (!isUsable(mainWindow)) return;
  try {
    await mainWindow.webContents.insertCSS(readAsset('focus.css'), { cssOrigin: 'user' });
    await mainWindow.webContents.executeJavaScript(readAsset('inject.js'), true);
    await setFocusMode(focusMode);
    await setPiPCapture(pipCaptureEnabled);
  } catch (error) {
    console.error('[DGV] injection failed:', error);
  }
}

async function setFocusMode(enabled) {
  focusMode = Boolean(enabled);
  if (!isUsable(mainWindow)) return focusMode;

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

async function setPiPCapture(enabled) {
  pipCaptureEnabled = Boolean(enabled);
  if (!isUsable(mainWindow)) return pipCaptureEnabled;

  try {
    await mainWindow.webContents.executeJavaScript(
      `window.__DGV__ && window.__DGV__.setPiPCapture(${JSON.stringify(pipCaptureEnabled)});`,
      true
    );
  } catch (error) {
    console.error('[DGV] PiP capture toggle failed:', error);
  }
  return pipCaptureEnabled;
}

function notifyPiPState() {
  if (isUsable(mainWindow)) {
    mainWindow.webContents.send('dgv:pip-state', isUsable(pipWindow));
  }
}

async function createPiPWindow() {
  if (isUsable(pipWindow)) {
    pipWindow.show();
    pipWindow.focus();
    return true;
  }

  pipWindow = new BrowserWindow({
    width: 720,
    height: 405,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#000000',
    show: false,
    title: 'Discord Gallery Viewer - PiP',
    webPreferences: {
      preload: path.join(__dirname, 'pip-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  pipWindow.setAlwaysOnTop(true, 'floating');
  pipWindow.setMenuBarVisibility(false);

  pipWindow.once('ready-to-show', () => {
    if (isUsable(pipWindow)) pipWindow.showInactive();
  });

  pipWindow.on('closed', () => {
    pipWindow = null;
    setPiPCapture(false);
    notifyPiPState();
  });

  await pipWindow.loadFile(path.join(__dirname, 'pip.html'));
  await setPiPCapture(true);
  notifyPiPState();
  return true;
}

function closePiPWindow() {
  if (isUsable(pipWindow)) {
    pipWindow.close();
  } else {
    pipWindow = null;
    setPiPCapture(false);
    notifyPiPState();
  }
  return false;
}

async function togglePiPWindow() {
  if (isUsable(pipWindow)) return closePiPWindow();
  return createPiPWindow();
}

function sanitizeFrameBatch(payload) {
  const input = Array.isArray(payload) ? payload : [];
  return input.slice(0, 12).filter((frame) => {
    return typeof frame === 'string' &&
      frame.length <= 1_500_000 &&
      /^data:image\/jpeg;base64,/i.test(frame);
  });
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
      backgroundThrottling: false,
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
    if (isUsable(pipWindow)) pipWindow.close();
    mainWindow = null;
  });

  mainWindow.loadURL(DISCORD_URL);
}

ipcMain.handle('dgv:toggle-focus', () => setFocusMode(!focusMode));
ipcMain.handle('dgv:set-focus', (_event, enabled) => setFocusMode(enabled));
ipcMain.handle('dgv:get-focus', () => focusMode);
ipcMain.handle('dgv:toggle-pip', (event) => {
  if (!isUsable(mainWindow) || event.sender !== mainWindow.webContents) return false;
  return togglePiPWindow();
});
ipcMain.handle('dgv:get-pip', () => isUsable(pipWindow));
ipcMain.handle('dgv:reload', () => {
  if (isUsable(mainWindow)) mainWindow.webContents.reload();
});

ipcMain.on('dgv:pip-frames', (event, frames) => {
  if (!isUsable(mainWindow) || event.sender !== mainWindow.webContents || !isUsable(pipWindow)) return;
  pipWindow.webContents.send('dgv:pip-frames', sanitizeFrameBatch(frames));
});

ipcMain.on('dgv:pip-close', (event) => {
  if (isUsable(pipWindow) && event.sender === pipWindow.webContents) closePiPWindow();
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
