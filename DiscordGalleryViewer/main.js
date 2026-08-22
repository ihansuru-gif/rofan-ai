const { app, BrowserWindow, ipcMain, shell, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

const DISCORD_URL = 'https://discord.com/app';
const DEFAULT_JITSI_BASE = 'https://meet.jit.si';
const PARTITION = 'persist:discord-gallery-viewer';

const HOME_HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Screen Share Gallery</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#0b0d10;color:#f5f7fb;font-family:"Segoe UI",system-ui,sans-serif;display:grid;place-items:center;padding:32px}main{width:min(920px,100%)}h1{margin:0 0 8px;font-size:34px}.sub{margin:0 0 28px;color:#aeb4bd}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.card{border:1px solid #2b2f37;border-radius:18px;padding:22px;background:#15181e}.card h2{margin:0 0 8px;font-size:22px}.card p{margin:0 0 18px;color:#aeb4bd;line-height:1.55}button,input{font:inherit}button{min-height:46px;border:0;border-radius:12px;padding:0 16px;background:#f2f4f8;color:#111318;font-weight:800;cursor:pointer}label{display:block;margin:12px 0 6px;color:#d5d9e0;font-size:13px;font-weight:700}input{width:100%;min-height:44px;border:1px solid #363b45;border-radius:10px;padding:0 12px;background:#0f1116;color:#fff;outline:none}.row{display:flex;gap:10px;align-items:center;margin-top:14px}.row button{flex:1}details{margin-top:12px;color:#aeb4bd}summary{cursor:pointer}#status{min-height:24px;margin-top:16px;color:#ffb4b4}.hint{margin-top:24px;padding-top:18px;border-top:1px solid #242832;color:#9097a2;font-size:13px;line-height:1.6}@media(max-width:700px){.grid{grid-template-columns:1fr}}
</style></head><body><main><h1>Screen Share Gallery</h1><p class="sub">Discord와 Jitsi의 공유화면만 분할해서 보거나 PiP로 따로 뺄 수 있어요.</p><section class="grid"><article class="card"><h2>Discord</h2><p>기존 Discord 로그인 상태를 유지한 채 평소처럼 음성채널과 화면공유를 사용합니다.</p><button id="discord" type="button">Discord 열기</button></article><article class="card"><h2>Jitsi</h2><p>방 이름을 넣어 바로 회의에 들어갑니다. 같은 PiP 분할 기능을 사용합니다.</p><label for="room">방 이름</label><input id="room" maxlength="128" placeholder="예: webtoon-workroom" autocomplete="off"><details><summary>자체 Jitsi 서버 사용</summary><label for="base">Jitsi 주소</label><input id="base" value="https://meet.jit.si" inputmode="url"></details><div class="row"><button id="jitsi" type="button">Jitsi 방 입장</button></div></article></section><div id="status" role="status" aria-live="polite"></div><div class="hint"><b>F9 = 분할 PiP</b> · <b>F10 = 화면만 보기</b> · <b>F11 = 전체화면</b></div></main><script>
const status=document.getElementById('status'),room=document.getElementById('room'),base=document.getElementById('base');const setStatus=t=>status.textContent=t||'';document.getElementById('discord').addEventListener('click',async()=>{setStatus('');const r=await window.screenShareGallery.openProvider('discord');if(!r?.ok)setStatus(r?.error||'Discord를 열지 못했습니다.')});async function openJitsi(){setStatus('');const r=await window.screenShareGallery.openProvider('jitsi',{room:room.value,baseUrl:base.value});if(!r?.ok)setStatus(r?.error||'Jitsi 방을 열지 못했습니다.')}document.getElementById('jitsi').addEventListener('click',openJitsi);room.addEventListener('keydown',e=>{if(e.key==='Enter')openJitsi()});
</script></body></html>`;

let mainWindow = null;
let pipWindow = null;
let sourcePickerWindow = null;
let pendingDisplayRequest = null;
let displayRequestSerial = 0;
let currentProvider = 'home';
let currentProviderBase = null;
let focusMode = false;
let pipCaptureEnabled = false;
let lastFrameBatchAt = 0;

function readAsset(name) {
  return fs.readFileSync(path.join(__dirname, name), 'utf8');
}

function browserUserAgent() {
  const chrome = process.versions.chrome || '150.0.0.0';
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function isUsable(win) {
  return Boolean(win && !win.isDestroyed());
}

function isRemoteProvider() {
  return currentProvider === 'discord' || currentProvider === 'jitsi';
}

function isTrustedProviderUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return false;

    if (currentProvider === 'discord') {
      return url.protocol === 'https:' && /(^|\.)discord\.com$/i.test(url.hostname);
    }

    if (currentProvider === 'jitsi' && currentProviderBase) {
      return url.origin === currentProviderBase;
    }

    return false;
  } catch (_) {
    return false;
  }
}

function eventUrl(event) {
  return event?.senderFrame?.url || event?.sender?.getURL?.() || '';
}

function isMainSender(event) {
  return Boolean(isUsable(mainWindow) && event?.sender === mainWindow.webContents);
}

function isHomeSender(event) {
  return isMainSender(event) && currentProvider === 'home' && eventUrl(event).startsWith('data:text/html');
}

function isProviderSender(event) {
  return isMainSender(event) && isRemoteProvider() && isTrustedProviderUrl(eventUrl(event));
}

function sanitizeJitsiBase(raw) {
  const value = String(raw || DEFAULT_JITSI_BASE).trim();
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) {
    throw new Error('Jitsi 주소는 http/https만 사용할 수 있습니다.');
  }
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.origin;
}

function sanitizeRoom(raw) {
  const room = String(raw || '').trim();
  if (!room) throw new Error('Jitsi 방 이름을 입력해주세요.');
  if (room.length > 128) throw new Error('Jitsi 방 이름이 너무 깁니다.');
  return encodeURIComponent(room.replace(/[\\/]+/g, '-'));
}

async function injectViewer() {
  if (!isUsable(mainWindow) || !isRemoteProvider()) return;
  const url = mainWindow.webContents.getURL();
  if (!isTrustedProviderUrl(url)) return;

  try {
    await mainWindow.webContents.insertCSS(readAsset('focus.css'), { cssOrigin: 'user' });
    await mainWindow.webContents.executeJavaScript(readAsset('inject.js'), true);
    await mainWindow.webContents.executeJavaScript(
      `window.__DGV__ && window.__DGV__.setProvider(${JSON.stringify(currentProvider)});`,
      true
    );
    await setFocusMode(focusMode);
    await setPiPCapture(pipCaptureEnabled);
  } catch (error) {
    console.error('[SSG] injection failed:', error);
  }
}

async function setFocusMode(enabled) {
  focusMode = Boolean(enabled && isRemoteProvider());
  if (!isUsable(mainWindow) || !isTrustedProviderUrl(mainWindow.webContents.getURL())) return focusMode;

  try {
    await mainWindow.webContents.executeJavaScript(
      `window.__DGV__ && window.__DGV__.setFocusMode(${JSON.stringify(focusMode)});`,
      true
    );
  } catch (_) {}
  return focusMode;
}

async function setPiPCapture(enabled) {
  pipCaptureEnabled = Boolean(enabled && isRemoteProvider());
  if (!isUsable(mainWindow) || !isTrustedProviderUrl(mainWindow.webContents.getURL())) return pipCaptureEnabled;

  try {
    await mainWindow.webContents.executeJavaScript(
      `window.__DGV__ && window.__DGV__.setPiPCapture(${JSON.stringify(pipCaptureEnabled)});`,
      true
    );
  } catch (_) {}
  return pipCaptureEnabled;
}

function notifyPiPState() {
  if (isUsable(mainWindow)) {
    mainWindow.webContents.send('dgv:pip-state', isUsable(pipWindow));
  }
}

async function createPiPWindow() {
  if (!isRemoteProvider()) return false;
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
    title: 'Screen Share Gallery - PiP',
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
  pipWindow.webContents.send('dgv:pip-provider', currentProvider);
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
  const input = Array.isArray(payload) ? payload.slice(0, 12) : [];
  const output = [];
  let totalLength = 0;

  for (const frame of input) {
    if (
      typeof frame !== 'string' ||
      frame.length > 800_000 ||
      !/^data:image\/jpeg;base64,/i.test(frame)
    ) {
      continue;
    }

    totalLength += frame.length;
    if (totalLength > 4_000_000) break;
    output.push(frame);
  }

  return output;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function sourcePickerHtml(sources) {
  const cards = sources.map((source) => {
    const href = `ssg-select://source/${encodeURIComponent(source.id)}`;
    const thumb = source.thumbnail?.toDataURL?.() || '';
    const icon = source.appIcon?.toDataURL?.() || '';

    return `<a class="source" href="${href}"><img class="thumb" src="${thumb}" alt=""><span class="name">${icon ? `<img class="icon" src="${icon}" alt="">` : ''}<span>${escapeHtml(source.name)}</span></span></a>`;
  }).join('');

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>공유할 화면 선택</title><style>*{box-sizing:border-box}body{margin:0;background:#111318;color:#fff;font-family:"Segoe UI",system-ui,sans-serif}header{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#111318;border-bottom:1px solid #292d35}h1{margin:0;font-size:20px}a{color:inherit;text-decoration:none}.cancel{border:1px solid #3a404b;background:#1c2027;border-radius:10px;padding:10px 14px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:18px}.source{overflow:hidden;border:1px solid #303640;border-radius:12px;background:#171a20}.thumb{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#060708}.name{display:flex;gap:8px;align-items:center;padding:10px;min-height:48px}.name>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.icon{width:20px;height:20px;object-fit:contain}</style></head><body><header><h1>공유할 화면 또는 창 선택</h1><a class="cancel" href="ssg-select://cancel">취소</a></header><main>${cards || '<p>공유 가능한 화면을 찾지 못했습니다.</p>'}</main></body></html>`;
}

function finishDisplaySelection(sourceId) {
  if (!pendingDisplayRequest) return;

  const source = pendingDisplayRequest.sources.find((item) => item.id === sourceId);
  const callback = pendingDisplayRequest.callback;
  const audioRequested = Boolean(pendingDisplayRequest.request.audioRequested);
  pendingDisplayRequest = null;

  try {
    if (source) {
      callback({
        video: source,
        ...(audioRequested && process.platform === 'win32' ? { audio: 'loopback' } : {})
      });
    } else {
      callback({});
    }
  } catch (_) {}

  if (isUsable(sourcePickerWindow)) sourcePickerWindow.destroy();
  sourcePickerWindow = null;
}

function cancelDisplayRequest(invalidate = true) {
  if (invalidate) displayRequestSerial += 1;

  if (pendingDisplayRequest?.callback) {
    try {
      pendingDisplayRequest.callback({});
    } catch (_) {}
  }

  pendingDisplayRequest = null;

  if (isUsable(sourcePickerWindow)) {
    sourcePickerWindow.destroy();
  }
  sourcePickerWindow = null;
}

async function openSourcePicker(request, callback) {
  if (!isTrustedProviderUrl(request.securityOrigin || '')) {
    callback({});
    return;
  }

  cancelDisplayRequest();
  const requestSerial = ++displayRequestSerial;

  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  if (
    requestSerial !== displayRequestSerial ||
    !isRemoteProvider() ||
    !isTrustedProviderUrl(request.securityOrigin || '')
  ) {
    callback({});
    return;
  }

  pendingDisplayRequest = { callback, request, sources, requestSerial };

  sourcePickerWindow = new BrowserWindow({
    width: 820,
    height: 640,
    minWidth: 620,
    minHeight: 480,
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    title: '공유할 화면 선택',
    backgroundColor: '#111318',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  sourcePickerWindow.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith('ssg-select://')) return;
    event.preventDefault();

    try {
      const parsed = new URL(target);
      if (parsed.hostname === 'cancel') {
        cancelDisplayRequest();
      } else if (parsed.hostname === 'source') {
        finishDisplaySelection(decodeURIComponent(parsed.pathname.replace(/^\//, '')));
      }
    } catch (_) {
      cancelDisplayRequest();
    }
  });

  sourcePickerWindow.on('closed', () => {
    if (pendingDisplayRequest?.requestSerial === requestSerial) {
      try {
        pendingDisplayRequest.callback({});
      } catch (_) {}
      pendingDisplayRequest = null;
    }
    sourcePickerWindow = null;
  });

  await sourcePickerWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(sourcePickerHtml(sources))}`
  );
}

function configureSession(ses) {
  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details.requestingUrl || webContents.getURL();
    const allowed = new Set(['media', 'fullscreen', 'display-capture']);
    callback(Boolean(isTrustedProviderUrl(origin) && allowed.has(permission)));
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    return Boolean(
      isTrustedProviderUrl(requestingOrigin || '') &&
      ['media', 'fullscreen', 'display-capture'].includes(permission)
    );
  });

  ses.setDisplayMediaRequestHandler((request, callback) => {
    openSourcePicker(request, callback).catch((error) => {
      console.error('[SSG] display picker failed:', error);
      try {
        callback({});
      } catch (_) {}
    });
  });
}

async function showHome() {
  cancelDisplayRequest();
  currentProvider = 'home';
  currentProviderBase = null;
  focusMode = false;
  closePiPWindow();

  if (!isUsable(mainWindow)) return;

  mainWindow.setTitle('Screen Share Gallery');
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(HOME_HTML)}`);
}

async function openProvider(provider, options = {}) {
  if (!isUsable(mainWindow)) {
    return { ok: false, error: '창이 준비되지 않았습니다.' };
  }

  try {
    cancelDisplayRequest();
    focusMode = false;
    closePiPWindow();

    if (provider === 'discord') {
      currentProvider = 'discord';
      currentProviderBase = 'https://discord.com';
      mainWindow.setTitle('Screen Share Gallery - Discord');
      await mainWindow.loadURL(DISCORD_URL);
      return { ok: true };
    }

    if (provider === 'jitsi') {
      const base = sanitizeJitsiBase(options.baseUrl || DEFAULT_JITSI_BASE);
      const room = sanitizeRoom(options.room);
      currentProvider = 'jitsi';
      currentProviderBase = base;
      mainWindow.setTitle('Screen Share Gallery - Jitsi');
      await mainWindow.loadURL(`${base}/${room}`);
      return { ok: true };
    }

    throw new Error('지원하지 않는 서비스입니다.');
  } catch (error) {
    await showHome();
    return { ok: false, error: error?.message || String(error) };
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0b0d10',
    autoHideMenuBar: true,
    title: 'Screen Share Gallery',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
      backgroundThrottling: false,
      partition: PARTITION
    }
  });

  mainWindow.webContents.setUserAgent(browserUserAgent());
  configureSession(mainWindow.webContents.session);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedProviderUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            partition: PARTITION
          }
        }
      };
    }

    if (/^https?:/i.test(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-finish-load', injectViewer);
  mainWindow.webContents.on('dom-ready', () => {
    if (isRemoteProvider()) setTimeout(injectViewer, 700);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    if (input.key === 'F9' && isRemoteProvider()) {
      event.preventDefault();
      togglePiPWindow();
      return;
    }

    if (input.key === 'F10' && isRemoteProvider()) {
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
    cancelDisplayRequest();
    if (isUsable(pipWindow)) pipWindow.close();
    mainWindow = null;
  });

  showHome();
}

ipcMain.handle('dgv:open-provider', (event, provider, options) => {
  if (!isHomeSender(event)) {
    return { ok: false, error: '잘못된 요청입니다.' };
  }
  return openProvider(provider, options || {});
});

ipcMain.handle('dgv:home', (event) => {
  if (!isProviderSender(event)) return false;
  showHome();
  return true;
});

ipcMain.handle('dgv:get-provider', (event) => {
  if (!isMainSender(event)) return 'home';
  return currentProvider;
});

ipcMain.handle('dgv:toggle-focus', (event) => {
  if (!isProviderSender(event)) return false;
  return setFocusMode(!focusMode);
});

ipcMain.handle('dgv:set-focus', (event, enabled) => {
  if (!isProviderSender(event)) return false;
  return setFocusMode(enabled);
});

ipcMain.handle('dgv:get-focus', (event) => {
  return isProviderSender(event) ? focusMode : false;
});

ipcMain.handle('dgv:toggle-pip', (event) => {
  if (!isProviderSender(event)) return false;
  return togglePiPWindow();
});

ipcMain.handle('dgv:get-pip', (event) => {
  return isProviderSender(event) ? isUsable(pipWindow) : false;
});

ipcMain.handle('dgv:reload', (event) => {
  if (!isProviderSender(event)) return false;
  mainWindow.webContents.reload();
  return true;
});

ipcMain.on('dgv:pip-frames', (event, frames) => {
  if (!isProviderSender(event) || !isUsable(pipWindow)) return;

  const now = Date.now();
  if (now - lastFrameBatchAt < 80) return;
  lastFrameBatchAt = now;

  const safeFrames = sanitizeFrameBatch(frames);
  pipWindow.webContents.send('dgv:pip-frames', safeFrames);
});

ipcMain.on('dgv:pip-close', (event) => {
  if (isUsable(pipWindow) && event.sender === pipWindow.webContents) {
    closePiPWindow();
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
