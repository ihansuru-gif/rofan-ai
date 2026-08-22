const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

app.disableHardwareAcceleration();

let mainWindow = null;
let pipWindow = null;
let focusMode = false;
let pipOpen = false;
let frameBatchCount = 0;
let finished = false;

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function usable(win) {
  return Boolean(win && !win.isDestroyed());
}

async function waitFor(win, expression, label, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!usable(win)) throw new Error(`${label}: window closed`);
    try {
      if (await win.webContents.executeJavaScript(`Boolean(${expression})`, true)) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: timeout`);
}

async function setCapture(enabled) {
  if (!usable(mainWindow)) return false;
  await mainWindow.webContents.executeJavaScript(
    `window.__DGV__ && window.__DGV__.setPiPCapture(${JSON.stringify(Boolean(enabled))})`,
    true
  );
  return Boolean(enabled);
}

async function createPiP() {
  if (usable(pipWindow)) return true;
  pipWindow = new BrowserWindow({
    width: 720,
    height: 405,
    minWidth: 320,
    minHeight: 180,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'pip-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  pipWindow.setAlwaysOnTop(true, 'floating');
  pipWindow.on('closed', () => {
    pipWindow = null;
    pipOpen = false;
    if (usable(mainWindow)) mainWindow.webContents.send('dgv:pip-state', false);
  });
  await pipWindow.loadFile(path.join(__dirname, 'pip.html'));
  pipOpen = true;
  mainWindow.webContents.send('dgv:pip-state', true);
  await setCapture(true);
  return true;
}

async function closePiP() {
  await setCapture(false).catch(() => {});
  if (usable(pipWindow)) pipWindow.close();
  pipWindow = null;
  pipOpen = false;
  if (usable(mainWindow)) mainWindow.webContents.send('dgv:pip-state', false);
  return false;
}

ipcMain.handle('dgv:home', () => true);
ipcMain.handle('dgv:get-provider', () => 'discord');
ipcMain.handle('dgv:toggle-focus', async () => {
  focusMode = !focusMode;
  await mainWindow.webContents.executeJavaScript(`window.__DGV__?.setFocusMode(${focusMode})`, true);
  return focusMode;
});
ipcMain.handle('dgv:set-focus', async (_event, enabled) => {
  focusMode = Boolean(enabled);
  await mainWindow.webContents.executeJavaScript(`window.__DGV__?.setFocusMode(${focusMode})`, true);
  return focusMode;
});
ipcMain.handle('dgv:get-focus', () => focusMode);
ipcMain.handle('dgv:toggle-pip', async () => pipOpen ? closePiP() : createPiP());
ipcMain.handle('dgv:get-pip', () => pipOpen);
ipcMain.handle('dgv:reload', () => false);
ipcMain.on('dgv:pip-frames', (_event, frames) => {
  if (!pipOpen || !usable(pipWindow) || !Array.isArray(frames)) return;
  frameBatchCount += 1;
  pipWindow.webContents.send('dgv:pip-frames', frames);
});
ipcMain.on('dgv:pip-close', () => closePiP());

function fail(error) {
  if (finished) return;
  finished = true;
  console.error('SSG_CI_SMOKE_FAIL', error?.stack || error);
  app.exit(1);
}

const watchdog = setTimeout(() => fail(new Error('functional smoke timeout')), 30000);

app.whenReady().then(async () => {
  try {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 800,
      show: false,
      paintWhenInitiallyHidden: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    await mainWindow.loadFile(path.join(__dirname, 'smoke.html'));
    await waitFor(mainWindow, `document.body.dataset.smokeReady === 'true'`, 'synthetic video setup');

    await mainWindow.webContents.insertCSS(readAsset('focus.css'), { cssOrigin: 'user' });
    await mainWindow.webContents.executeJavaScript(readAsset('inject.js'), true);
    await mainWindow.webContents.executeJavaScript(`window.__DGV__?.setProvider('discord')`, true);
    await waitFor(mainWindow, `window.__DGV__ && document.getElementById('dgv-pip-launcher')`, 'viewer injection');

    await mainWindow.webContents.executeJavaScript(`document.getElementById('dgv-pip-launcher').click()`, true);
    for (let i = 0; i < 100 && !usable(pipWindow); i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!usable(pipWindow)) throw new Error('PiP window was not created');

    await waitFor(pipWindow, `document.querySelectorAll('.tile').length === 4 && [...document.querySelectorAll('.tile img')].every(img => img.src.startsWith('data:image/jpeg;base64,'))`, '4-tile PiP render');
    if (!pipWindow.isAlwaysOnTop()) throw new Error('PiP always-on-top is disabled');

    pipWindow.setSize(560, 315);
    const bounds = pipWindow.getBounds();
    if (bounds.width !== 560 || bounds.height !== 315) throw new Error('PiP resize failed');

    const shapeOk = await pipWindow.webContents.executeJavaScript(
      `getComputedStyle(document.getElementById('grid')).getPropertyValue('--cols').trim() === '2' && getComputedStyle(document.getElementById('grid')).getPropertyValue('--rows').trim() === '2'`,
      true
    );
    if (!shapeOk) throw new Error('2x2 layout failed');

    await pipWindow.webContents.executeJavaScript(`document.querySelector('.tile').click()`, true);
    await waitFor(pipWindow, `document.getElementById('grid').dataset.expanded === 'true'`, 'tile expand');
    await pipWindow.webContents.executeJavaScript(`document.querySelector('.tile[data-expanded="true"]').click()`, true);
    await waitFor(pipWindow, `document.getElementById('grid').dataset.expanded === 'false'`, 'tile collapse');

    const before = frameBatchCount;
    await new Promise((resolve) => setTimeout(resolve, 1300));
    const delta = frameBatchCount - before;
    if (delta < 4) throw new Error(`frame cadence too low: ${delta} batches / 1.3s`);

    await mainWindow.webContents.executeJavaScript(`document.getElementById('dgv-launcher').click()`, true);
    await waitFor(mainWindow, `document.body.classList.contains('dgv-focus-mode') && document.querySelector('[data-dgv-call-root="true"]')`, 'focus mode on');
    await mainWindow.webContents.executeJavaScript(`window.__DGV__.setFocusMode(false)`, true);
    await waitFor(mainWindow, `!document.body.classList.contains('dgv-focus-mode')`, 'focus mode off');

    await closePiP();
    finished = true;
    clearTimeout(watchdog);
    console.log(`SSG_CI_SMOKE_OK tiles=4 frameBatches=${delta} alwaysOnTop=true resize=true focus=true`);
    app.exit(0);
  } catch (error) {
    clearTimeout(watchdog);
    fail(error);
  }
}).catch(fail);
