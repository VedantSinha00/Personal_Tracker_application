// Force-clear any stray flags that force Electron into "Node Mode"
delete process.env.ELECTRON_RUN_AS_NODE;

// Resilient import of Electron APIs
const electron = require('electron');
const path = require('path');

// Extract APIs (handle case where require('electron') might return a string in Node mode)
const { app, BrowserWindow, shell, ipcMain, Menu, MenuItem } = typeof electron === 'object' ? electron : require('electron');

// ── Application State ──────────────────────────────────────────────────────
let mainWindow;
let autoUpdater;
const protocolScheme = 'weekly-tracker';
let authUrlOnColdStart = null;
let isRendererReady = false;
let forceClose = false;

const fs = require('fs');
const settingsPath = path.join(app.getPath('userData'), 'window-settings.json');

function restoreWindowBounds() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (e) {
    console.warn('[settings] Failed to load window bounds:', e.message);
  }
  return { width: 1200, height: 800 };
}

function saveWindowBounds(bounds) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(bounds), 'utf8');
  } catch (e) {
    console.warn('[settings] Failed to save window bounds:', e.message);
  }
}

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

    ipcMain.handle('renderer-ready', () => {
      isRendererReady = true;
      if (authUrlOnColdStart) {
        mainWindow.webContents.send('auth-callback', authUrlOnColdStart.replace(/\/$/, ""));
        authUrlOnColdStart = null;
      }
    });

    ipcMain.handle('force-close', () => {
      forceClose = true;
      if (mainWindow) mainWindow.close();
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
  const bounds = restoreWindowBounds();

  mainWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
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

  if (bounds.isMaximized) {
    mainWindow.maximize();
  }

  mainWindow.loadFile('index.html');
  mainWindow.setIcon(path.join(__dirname, 'assets/logo.ico'));

  function saveCurrentBounds() {
    if (!mainWindow) return;
    try {
      const isMaximized = mainWindow.isMaximized();
      let savedBounds;
      if (isMaximized) {
        savedBounds = restoreWindowBounds();
        savedBounds.isMaximized = true;
      } else {
        savedBounds = mainWindow.getBounds();
        savedBounds.isMaximized = false;
      }
      saveWindowBounds(savedBounds);
    } catch (e) {}
  }

  mainWindow.on('resize', saveCurrentBounds);
  mainWindow.on('move', saveCurrentBounds);

  mainWindow.on('close', (e) => {
    saveCurrentBounds();
    if (!forceClose) {
      e.preventDefault();
      mainWindow.webContents.send('app-closing');
    }
  });

  // Spell-check context menu — shows correction suggestions on right-click
  mainWindow.webContents.on('context-menu', (event, params) => {
    if (!params.misspelledWord && params.dictionarySuggestions.length === 0) return;
    const menu = new Menu();
    for (const suggestion of params.dictionarySuggestions) {
      menu.append(new MenuItem({
        label: suggestion,
        click: () => mainWindow.webContents.replaceMisspelling(suggestion)
      }));
    }
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({
        label: 'Add to dictionary',
        click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }));
    }
    menu.popup();
  });

  // Handle external links.
  // SEC-06: default-deny. Only https URLs are handed to the system browser;
  // every other scheme (and any in-app window open) is blocked outright.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
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

  // 1b. Register as the handler for weekly-tracker:// so the OAuth deep-link
  // callback can return to the app. Without this, Windows shows "this file does
  // not have an app associated with it" and login can never complete.
  if (process.defaultApp && process.argv.length >= 2) {
    // Dev mode (electron .): point the registration at this script.
    app.setAsDefaultProtocolClient(protocolScheme, process.execPath, [path.resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(protocolScheme);
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
        const cleanUrl = urlArg.replace(/\/$/, "");
        if (isRendererReady) {
          mainWindow.webContents.send('auth-callback', cleanUrl);
        } else {
          authUrlOnColdStart = cleanUrl;
        }
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
    isRendererReady = false;
  });

  // 6. Lifecycle Events
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

// macOS Specific URL handler
app.on('open-url', (event, url) => {
  event.preventDefault();
  const cleanUrl = url.replace(/\/$/, "");
  if (mainWindow && mainWindow.webContents && isRendererReady) {
    mainWindow.webContents.send('auth-callback', cleanUrl);
    mainWindow.focus();
  } else {
    authUrlOnColdStart = cleanUrl;
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// START THE APP
initializeApp().catch(err => {
  console.error("Critical Startup Error:", err);
});
