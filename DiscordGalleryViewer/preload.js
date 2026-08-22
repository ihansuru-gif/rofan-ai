const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('discordGallery', {
  toggleFocus: () => ipcRenderer.invoke('dgv:toggle-focus'),
  setFocus: (enabled) => ipcRenderer.invoke('dgv:set-focus', Boolean(enabled)),
  getFocus: () => ipcRenderer.invoke('dgv:get-focus'),
  reload: () => ipcRenderer.invoke('dgv:reload')
});
