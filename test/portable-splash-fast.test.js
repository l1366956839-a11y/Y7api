const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'window-controls.js'), 'utf8');
const electronMain = fs.readFileSync(path.join(root, 'src', 'electron-main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'src', 'launcher.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');

test('portable splash diagnostics and version surface', () => {
  assert.match(builder, /splashImage:\s*build\/portable-splash\.bmp/);
  assert.match(main, /打开日志/);
  assert.match(main, /导出诊断包/);
  assert.match(main, /y7st-export-diagnostics|exportDiagnostics/);
  assert.match(preload, /exportDiagnostics/);
  assert.match(main, /y7st-open-logs|openLogs/);
  assert.match(main, /版本 \$\{versionText\}|版本 /);
  assert.match(main, /show: true/);
  assert.match(main, /backgroundColor: '#070a10'/);
  assert.match(main, /将在 /);
  assert.match(main, /countdownLeft=20/);
  assert.match(preload, /openLogs/);
  assert.match(electronMain, /require\('\.\/build-info'\)/);
  assert.match(launcher, /require\('\.\/build-info'\)/);
  assert.doesNotMatch(launcher, /const EMBED_VERSION = '[0-9]/);
  assert.doesNotMatch(electronMain, /const EMBED_VERSION = '[0-9]/);
  assert.match(launcher, /embedded Python only|内置 Python/);
  assert.doesNotMatch(launcher, /process\.env\.PYTHON_EXE/);
  assert.doesNotMatch(launcher, /pythonCandidates/);
  assert.doesNotMatch(main, /buildDarkBootPage/);
  assert.match(main, /setProgress\(100/);
  assert.match(main, /id="enter"[^>]*hidden|class="primary" hidden/);
  assert.doesNotMatch(electronMain, /createMainWindow\([\s\S]*?\)\.catch/);
  assert.match(electronMain, /try \{\s*createMainWindow\(/);
  assert.doesNotMatch(electronMain, /await createMainWindow\(/);
});
