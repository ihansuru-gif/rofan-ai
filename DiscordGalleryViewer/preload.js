const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordGallery', {
  toggleFocus: () => ipcRenderer.invoke('dgv:toggle-focus'),
  setFocus: (enabled) => ipcRenderer.invoke('dgv:set-focus', Boolean(enabled)),
  getFocus: () => ipcRenderer.invoke('dgv:get-focus'),
  togglePiP: () => ipcRenderer.invoke('dgv:toggle-pip'),
  getPiP: () => ipcRenderer.invoke('dgv:get-pip'),
  sendPiPFrames: (frames) => ipcRenderer.send('dgv:pip-frames', frames),
  onPiPState: (callback) => {
    if (typeof callback !== 'function') return;
    ipcRenderer.on('dgv:pip-state', (_event, open) => callback(Boolean(open)));
  },
  reload: () => ipcRenderer.invoke('dgv:reload')
});
