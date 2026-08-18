const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const launcher = fs.readFileSync(path.join(root, 'src', 'launcher.js'), 'utf8');
const upstream = fs.readFileSync(path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas', 'main.py'), 'utf8');

test('launcher uses HTTP health checks and passes an EXE-adjacent user data root to Infinite-Canvas', () => {
  assert.match(launcher, /Y7ST_USER_DATA_DIR/);
  assert.match(launcher, /path\.join\(exeDir, 'Y7st'\)/);
  assert.match(launcher, /Y7ST_RUNTIME_DIR/);
  assert.match(launcher, /function waitForHealthyServer/);
  assert.match(launcher, /\/api\/providers/);
  assert.match(launcher, /function verifyRuntimeDependencies/);
  assert.match(launcher, /function startStageTimer/);
  assert.match(launcher, /stageTimer\.end\('extract'/);
  assert.match(launcher, /stageTimer\.end\('dependency-check'/);
  assert.match(launcher, /stageTimer\.end\('upstream-health'/);
  assert.match(launcher, /stageTimer\.end\('shell-health'/);
  assert.match(launcher, /Y7ST_PORT: String\(upstreamPort\)/);
  assert.match(launcher, /fastapi/);
  assert.match(launcher, /uvicorn/);
  assert.match(launcher, /httpx/);
  assert.match(launcher, /PIL/);
  assert.match(launcher, /websockets/);
  const electronMain = fs.readFileSync(path.join(root, 'src', 'electron-main.js'), 'utf8');
  assert.match(electronMain, /requestSingleInstanceLock/);
  assert.match(electronMain, /Y7ST_USER_DATA_DIR: userDataDir/);
  assert.match(electronMain, /Y7ST_RUNTIME_DIR: path\.join\(userDataDir, 'runtime'\)/);
  assert.match(electronMain, /findAvailablePort/);
  assert.match(electronMain, /UPSTREAM_PORT: String\(upstreamPort\)/);
  assert.match(electronMain, /SHELL_PORT: String\(shellPort\)/);
  assert.match(electronMain, /electron-error\.log/);
  assert.match(electronMain, /writeElectronError/);
  const windowControls = fs.readFileSync(path.join(root, 'src', 'window-controls.js'), 'utf8');
  assert.match(windowControls, /shellPort/);
  assert.match(windowControls, /loadURL\(buildNativeStartupPage\(shellPort/);
  assert.doesNotMatch(windowControls, /loadFile\(path\.join\(__dirname, '\.\.', 'public', 'welcome\.html'\)\)/);
  assert.doesNotMatch(windowControls, /const PORT = 8080/);
});

test('Infinite-Canvas resolves mutable state from Y7ST_USER_DATA_DIR', () => {
  assert.match(upstream, /USER_DATA_DIR\s*=\s*os\.path\.abspath\(os\.getenv\("Y7ST_USER_DATA_DIR"/);
  assert.match(upstream, /OUTPUT_DIR\s*=\s*os\.path\.join\(USER_DATA_DIR, "output"\)/);
  assert.match(upstream, /ASSETS_DIR\s*=\s*os\.path\.join\(USER_DATA_DIR, "assets"\)/);
  assert.match(upstream, /DATA_DIR\s*=\s*os\.path\.join\(USER_DATA_DIR, "data"\)/);
  assert.match(upstream, /GLOBAL_CONFIG_FILE\s*=\s*os\.path\.join\(USER_DATA_DIR, "global_config\.json"\)/);
});
