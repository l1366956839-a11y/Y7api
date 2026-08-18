const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const { resolvePortablePaths } = require('./portable-paths');
const {
  createMainWindow,
  registerWindowControls,
  reloadStartupPage
} = require('./window-controls');
const { EMBED_VERSION } = require('./build-info');

let root;
let resourcesRoot;
let coreExe;
let iconPath;
let core;
let mainWindow;
let upstreamPort = 3000;
let shellPort = 8080;

function setMainWindow(win) {
  mainWindow = win;
}

function getMainWindow() {
  return mainWindow;
}

function getRoot() {
  return root || path.dirname(app.getPath('exe'));
}

function resolvePaths() {
  const paths = resolvePortablePaths(app);
  root = paths.root;
  resourcesRoot = paths.resourcesRoot;
  coreExe = paths.coreExe;
  iconPath = paths.iconPath;
}

function writeElectronError(error) {
  try {
    const userDataDir = path.join(getRoot(), 'Y7st');
    const logDir = path.join(userDataDir, 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const file = path.join(logDir, 'electron-error.log');
    const message = [
      new Date().toISOString(),
      `root=${root || ''}`,
      `coreExe=${coreExe || ''}`,
      `upstreamPort=${upstreamPort}`,
      `shellPort=${shellPort}`,
      error && (error.stack || error.message || String(error)),
      ''
    ].join('\n');
    fs.appendFileSync(file, message, 'utf8');
    return file;
  } catch {
    return '';
  }
}

function showStartupError(error) {
  const logFile = writeElectronError(error);
  const suffix = logFile ? `\n\n日志：${logFile}` : '';
  dialog.showErrorBox('Y7st 启动失败', `${error.message || error}${suffix}`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`没有找到可用端口：${preferredPort}-${preferredPort + 49}`);
}

async function resolvePorts() {
  upstreamPort = await findAvailablePort(Number(process.env.UPSTREAM_PORT || 3000));
  shellPort = await findAvailablePort(Number(process.env.SHELL_PORT || 8080));
  if (shellPort === upstreamPort) shellPort = await findAvailablePort(shellPort + 1);
}

function startCore() {
  const userDataDir = path.join(root, 'Y7st');
  const outputDir = path.join(userDataDir, 'output');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  core = spawn(coreExe, [], {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      Y7ST_USER_DATA_DIR: userDataDir,
      Y7ST_OUTPUT_DIR: outputDir,
      Y7ST_RUNTIME_DIR: path.join(userDataDir, 'runtime'),
      UPSTREAM_PORT: String(upstreamPort),
      SHELL_PORT: String(shellPort),
      NO_BROWSER: '1',
      NO_ERROR_WINDOW: '1'
    },
    stdio: 'ignore'
  });
  core.once('error', (error) => {
    showStartupError(error);
    app.quit();
  });
}

app.disableHardwareAcceleration();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  registerWindowControls(getMainWindow, app, { getRoot });
  app.whenReady().then(async () => {
    try {
      resolvePaths();
      const preferredShellPort = Number(process.env.SHELL_PORT || 8080);
      try {
        createMainWindow({
          http,
          iconPath,
          getMainWindow,
          setMainWindow,
          shellPort: preferredShellPort,
          embedVersion: EMBED_VERSION
        });
      } catch (error) {
        showStartupError(error);
        app.quit();
        return;
      }
      await resolvePorts();
      if (shellPort !== preferredShellPort) {
        await reloadStartupPage(getMainWindow(), shellPort, EMBED_VERSION);
      }
      startCore();
    } catch (error) {
      showStartupError(error);
      app.quit();
    }
  });
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (core && !core.killed) core.kill();
});

module.exports = {
  findAvailablePort,
  isPortAvailable,
  writeElectronError
};
