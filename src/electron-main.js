const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const http = require('http');

let root;
let resourcesRoot;
let coreExe;
let iconPath;
const port = 8080;
let core;
let mainWindow;

function resolvePaths() {
  // Portable builds: NSIS sets PORTABLE_EXECUTABLE_DIR to the real EXE dir.
  // Dev/dir builds: app.getPath('exe') gives the real executable path.
  // Fallback: process.execPath (may be temp dir in portable, hence the check above).
  const exePath = app.getPath('exe');
  root = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(exePath);
  resourcesRoot = process.resourcesPath || path.join(path.dirname(exePath), 'resources');
  coreExe = path.join(resourcesRoot, 'Y7st-core.exe');
  iconPath = path.join(resourcesRoot, 'Y7api.ico');
}

function startCore() {
  const outputDir = path.join(root, 'Y7st');
  fs.mkdirSync(outputDir, { recursive: true });
  core = spawn(coreExe, [], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      Y7ST_OUTPUT_DIR: outputDir,
      NO_BROWSER: '1',
      NO_ERROR_WINDOW: '1'
    },
    stdio: 'ignore'
  });
  core.once('error', (error) => {
    dialog.showErrorBox('Y7st 启动失败', error.message);
    app.quit();
  });
}

function waitForServer(timeout = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${port}/canvas`, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve();
        retry();
      });
      req.setTimeout(1000, () => { req.destroy(); retry(); });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > timeout) reject(new Error('等待 Y7st 服务启动超时'));
      else setTimeout(probe, 500);
    };
    probe();
  });
}

async function createWindow() {
  await waitForServer();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'Y7api',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    show: false,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      devTools: false
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1:')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

app.whenReady().then(async () => {
  resolvePaths();
  startCore();
  try {
    await createWindow();
  } catch (error) {
    dialog.showErrorBox('Y7st 启动失败', error.message);
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (core && !core.killed) core.kill();
});
