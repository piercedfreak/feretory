const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('feretoryAPI', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  runScan: () => ipcRenderer.invoke('scan:run'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  choosePluginsDirectory: () => ipcRenderer.invoke('plugins:choose-directory'),
  reloadPlugins: () => ipcRenderer.invoke('plugins:reload'),
  clearDedupeHistory: () => ipcRenderer.invoke('dedupe:clear'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (targetPath) => ipcRenderer.invoke('shell:openPath', targetPath),
  onScanComplete: (callback) => {
    ipcRenderer.removeAllListeners('scan-complete');
    ipcRenderer.on('scan-complete', (_event, payload) => callback(payload));
  }
});
