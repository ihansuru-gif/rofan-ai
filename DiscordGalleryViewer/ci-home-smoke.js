const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
let finished = false;

function fail(error) {
  if (finished) return;
  finished = true;
  console.error('SSG_HOME_SMOKE_FAIL', error?.stack || error);
  app.exit(1);
}

const watchdog = setTimeout(() => fail(new Error('home smoke timeout')), 15000);

require('./main.js');

app.whenReady().then(async () => {
  try {
    let win = null;
    for (let i = 0; i < 100; i += 1) {
      win = BrowserWindow.getAllWindows().find((item) => item.getTitle().includes('Screen Share Gallery'));
      if (win && !win.isDestroyed() && win.webContents.getURL().startsWith('data:text/html')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!win || win.isDestroyed()) throw new Error('production home window not created');
    win.hide();

    const result = await win.webContents.executeJavaScript(`({
      title: document.title,
      discordButton: Boolean(document.getElementById('discord')),
      jitsiButton: Boolean(document.getElementById('jitsi')),
      hasOpenProvider: typeof window.screenShareGallery?.openProvider === 'function',
      leaksProviderControls: typeof window.screenShareGallery?.togglePiP === 'function'
    })`, true);

    if (result.title !== 'Screen Share Gallery') throw new Error(`unexpected title: ${result.title}`);
    if (!result.discordButton || !result.jitsiButton) throw new Error('provider buttons missing');
    if (!result.hasOpenProvider) throw new Error('home preload API missing');
    if (result.leaksProviderControls) throw new Error('provider-only IPC leaked into home page');

    finished = true;
    clearTimeout(watchdog);
    console.log('SSG_HOME_SMOKE_OK');
    app.exit(0);
  } catch (error) {
    clearTimeout(watchdog);
    fail(error);
  }
}).catch(fail);
