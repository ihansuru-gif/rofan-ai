const { contextBridge, ipcRenderer } = require('electron');

const MAX_FRAMES = 12;
const MAX_FRAME_LENGTH = 800_000;
const MAX_BATCH_LENGTH = 4_000_000;

function sendSafeFrames(frames) {
  if (!Array.isArray(frames) || frames.length > MAX_FRAMES) return;

  let total = 0;
  const safe = [];

  for (const frame of frames) {
    if (
      typeof frame !== 'string' ||
      frame.length > MAX_FRAME_LENGTH ||
      !/^data:image\/jpeg;base64,/i.test(frame)
    ) {
      continue;
    }

    total += frame.length;
    if (total > MAX_BATCH_LENGTH) return;
    safe.push(frame);
  }

  ipcRenderer.send('dgv:pip-frames', safe);
}

const homeApi = {
  openProvider: (provider, options = {}) => ipcRenderer.invoke('dgv:open-provider', provider, options)
};

const providerApi = {
  goHome: () => ipcRenderer.invoke('dgv:home'),
  getProvider: () => ipcRenderer.invoke('dgv:get-provider'),
  toggleFocus: () => ipcRenderer.invoke('dgv:toggle-focus'),
  setFocus: (enabled) => ipcRenderer.invoke('dgv:set-focus', Boolean(enabled)),
  getFocus: () => ipcRenderer.invoke('dgv:get-focus'),
  togglePiP: () => ipcRenderer.invoke('dgv:toggle-pip'),
  getPiP: () => ipcRenderer.invoke('dgv:get-pip'),
  sendPiPFrames: sendSafeFrames,
  onPiPState: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('dgv:pip-state', (_event, open) => callback(Boolean(open)));
  },
  reload: () => ipcRenderer.invoke('dgv:reload')
};

const isHomeDocument = globalThis.location?.protocol === 'data:';
contextBridge.exposeInMainWorld('screenShareGallery', isHomeDocument ? homeApi : providerApi);
