const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setTooltipWidth: (width) => ipcRenderer.send('set-tooltip-width', width)
});