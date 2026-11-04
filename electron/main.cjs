const { app, BrowserWindow, shell, Menu, ipcMain, screen, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { startModelServer } = require('./model-server.cjs');

const DEV_URL = process.env.GOOSETEXT_DEV_URL ?? '';
const isDev = !app.isPackaged;

let mainWindow = null;
let modelServer = null;

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.width === 'number') return parsed;
  } catch {
    /* первый запуск */
  }
  return { width: 1440, height: 920, maximized: false };
}

function writeWindowState(win) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try {
    const bounds = win.getNormalBounds();
    fs.writeFileSync(
      statePath(),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }),
    );
  } catch {
    /* не критично */
  }
}

/** Окно не должно открываться за пределами экрана (например, после смены монитора). */
function visibleBounds(saved) {
  const fallback = { width: 1440, height: 920 };
  if (typeof saved.x !== 'number' || typeof saved.y !== 'number') return { ...saved, ...fallback };
  try {
    const displays = screen.getAllDisplays();
    const visible = displays.some((display) => {
      const area = display.workArea;
      return (
        saved.x < area.x + area.width - 80 &&
        saved.x + saved.width > area.x + 80 &&
        saved.y < area.y + area.height - 80 &&
        saved.y + saved.height > area.y + 40
      );
    });
    if (visible) return saved;
  } catch {
    /* экран ещё не готов */
  }
  return { width: saved.width, height: saved.height, maximized: saved.maximized };
}

function createWindow() {
  const saved = visibleBounds(readWindowState());

  const win = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    x: saved.x,
    y: saved.y,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'GooseText',
    backgroundColor: '#ffffff',
    icon: path.join(__dirname, '..', 'assets', 'goosetext.ico'),
    autoHideMenuBar: true,
    // Своя строка заголовка: системная белая полоса не сочетается с тёмной темой.
    frame: false,
    titleBarStyle: 'hidden',
    thickFrame: true,
    roundedCorners: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  if (saved.maximized) win.maximize();

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('resize', () => writeWindowState(win));
  win.on('move', () => writeWindowState(win));
  win.on('close', () => writeWindowState(win));

  const notifyFullscreen = () => {
    if (!win.isDestroyed()) win.webContents.send('goosetext:fullscreen-changed', win.isFullScreen());
  };
  win.on('enter-full-screen', notifyFullscreen);
  win.on('leave-full-screen', notifyFullscreen);

  const notifyMaximized = () => {
    if (!win.isDestroyed()) win.webContents.send('goosetext:maximized-changed', win.isMaximized());
  };
  win.on('maximize', notifyMaximized);
  win.on('unmaximize', notifyMaximized);

  // F11 — привычная клавиша полноэкранного режима
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      event.preventDefault();
      win.setFullScreen(!win.isFullScreen());
    }
  });

  // внешние ссылки — в системном браузере, окно приложения не уводим
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL().split('#')[0];
    if (url.split('#')[0] === current) return;
    event.preventDefault();
    if (url.startsWith('http')) shell.openExternal(url);
  });

  win.webContents.on('did-finish-load', () => {
    win.setTitle('GooseText');
  });

  if (isDev && DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow = win;
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.setAppUserModelId('com.goosetext.desktop');
  Menu.setApplicationMenu(null);

  ipcMain.on('goosetext:quit', () => app.quit());
  ipcMain.handle('goosetext:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle('goosetext:toggle-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    const next = !win.isFullScreen();
    win.setFullScreen(next);
    return next;
  });

  ipcMain.handle('goosetext:get-fullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isFullScreen() : false;
  });

  ipcMain.on('goosetext:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.handle('goosetext:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return win.isMaximized();
  });

  ipcMain.handle('goosetext:is-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  });

  ipcMain.on('goosetext:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  // Цвет рамки окна под текущую тему — чтобы не было белой полосы при ресайзе.
  ipcMain.on('goosetext:set-background', (event, color) => {
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) {
      BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color);
    }
  });

  ipcMain.handle('goosetext:model-base', () => {
    return modelServer ? modelServer.url : null;
  });

  app.whenReady().then(async () => {
    // Микрофон нужен диктовке; остальные разрешения не выдаём.
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture');
    });

    try {
      modelServer = await startModelServer(path.join(app.getPath('userData'), 'model-cache'));
    } catch (error) {
      console.warn('Кэш моделей не запустился:', error);
    }

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('before-quit', () => {
    modelServer?.close();
    modelServer = null;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
