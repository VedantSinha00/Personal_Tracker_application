// Force-clear any stray flags that force Electron into "Node Mode"
delete process.env.ELECTRON_RUN_AS_NODE;

// Resilient import of Electron APIs
const electron = require('electron');
const path = require('path');

// Extract APIs (handle case where require('electron') might return a string in Node mode)
const { app, BrowserWindow, shell, ipcMain } = typeof electron === 'object' ? electron : require('electron');

// ── Application State ──────────────────────────────────────────────────────
let mainWindow;
let autoUpdater;
const protocolScheme = 'weekly-tracker';
let authUrlOnColdStart = null;

// ── IPC Handlers ───────────────────────────────────────────────────────────
function registerIpcHandlers() {
  if (ipcMain && ipcMain.handle) {
    ipcMain.handle('open-external', async (event, url) => {
      if (url.startsWith('https://')) {
        await shell.openExternal(url);
        return true;
      }
      return false;
    });

    // Auto-update IPC
    ipcMain.handle('restart-app', () => {
      if (autoUpdater) autoUpdater.quitAndInstall();
    });
  }
}

// ── Auto Update Handling ───────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] Checking for update...');
  });
  autoUpdater.on('update-available', (info) => {
    console.log('[updater] Update available:', info.version);
    if (mainWindow) mainWindow.webContents.send('update-available', info);
  });
  autoUpdater.on('update-not-available', () => {
    console.log('[updater] Update not available.');
  });
  autoUpdater.on('error', (err) => {
    console.warn('[updater] Error in auto-updater:', err);
    if (mainWindow) mainWindow.webContents.send('update-error', err.message);
  });
  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[updater] Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[updater] Update downloaded');
    if (mainWindow) mainWindow.webContents.send('update-downloaded', info);
  });

  // Check for updates every hour
  setInterval(() => {
    autoUpdater.checkForUpdates();
  }, 60 * 60 * 1000);
}

// ── Window Creation ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#111111',
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets/logo.ico'),
    titleBarOverlay: {
      color: '#111111',
      symbolColor: '#7b7b7b',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: true
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setIcon(path.join(__dirname, 'assets/logo.ico'));

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// ── Root Initialization ───────────────────────────────────────────────────
/**
 * All Electron-dependent logic starts here to ensure the environment is ready.
 */
async function initializeApp() {
  // 1. Single Instance Lock
  const gotTheLock = app.requestSingleInstanceLock();
  if (!gotTheLock) {
    app.quit();
    return;
  }

  // 2. Deep Linking (Cold Start)
  if (process.platform === 'win32' || process.platform === 'linux') {
    const urlArg = process.argv.find(arg => arg.startsWith(`${protocolScheme}://`));
    if (urlArg) authUrlOnColdStart = urlArg;
  }

  // 3. Instance Events
  app.on('second-instance', (event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      const urlArg = commandLine.find(arg => arg.startsWith(`${protocolScheme}://`));
      if (urlArg) {
        mainWindow.webContents.send('auth-callback', urlArg.replace(/\/$/, ""));
      }
    }
  });

  // 4. App Ready
  await app.whenReady();

  registerIpcHandlers();

  // Initialize auto-updater only if packaged
  if (app.isPackaged) {
    try {
      const { autoUpdater: updater } = require('electron-updater');
      autoUpdater = updater;
      autoUpdater.logger = console;
      autoUpdater.autoDownload = true;
      setupAutoUpdater();
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      console.warn('[updater] Failed to initialize:', e.message);
    }
  }

  createWindow();

  // 5. Post-Load Logic
  mainWindow.webContents.on('did-finish-load', () => {
    if (authUrlOnColdStart) {
      mainWindow.webContents.send('auth-callback', authUrlOnColdStart.replace(/\/$/, ""));
      authUrlOnColdStart = null;
    }
  });

  // 6. Lifecycle Events
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// macOS Specific URL handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('auth-callback', url);
    mainWindow.focus();
  } else {
    authUrlOnColdStart = url;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// START THE APP
initializeApp().catch(err => {
  console.error("Critical Startup Error:", err);
});
