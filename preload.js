const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Listen for the auth-callback from the main process.
   * This happens when a deep link (weekly-tracker://) is opened.
   */
  onAuthCallback: (callback) => {
    ipcRenderer.on('auth-callback', (_event, value) => callback(value));
  },
  
  /**
   * Open a URL in the default system browser.
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  /**
   * Check if we are running in Electron.
   */
  isElectron: true
});
