const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('y7stWindow', {
  minimize: () => ipcRenderer.send('y7st-window:minimize'),
  maximize: () => ipcRenderer.send('y7st-window:maximize'),
  unmaximize: () => ipcRenderer.send('y7st-window:unmaximize'),
  close: () => ipcRenderer.send('y7st-window:close'),
  isMaximized: () => ipcRenderer.invoke('y7st-window:is-maximized'),
  openLogs: () => ipcRenderer.invoke('y7st-open-logs'),
  exportDiagnostics: () => ipcRenderer.invoke('y7st-export-diagnostics'),
  navigateTo: (url) => ipcRenderer.send('y7st-window:navigate', url)
});
