const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'window-controls.js'), 'utf8');
const electronMain = fs.readFileSync(path.join(root, 'src', 'electron-main.js'), 'utf8');
const proxy = fs.readFileSync(path.join(root, 'src', 'proxy.js'), 'utf8');
const launcher = fs.readFileSync(path.join(root, 'src', 'launcher.js'), 'utf8');

test('single native startup page: shows immediately, only reveals enter button after ready, no auto-jump', () => {
  assert.match(main, /function buildNativeStartupPage/);
  assert.match(main, /data:text\/html;charset=UTF-8,/);
  assert.match(main, /正在准备启动环境/);
  assert.match(main, /id="enter"[^>]*hidden|class="primary" hidden/);
  assert.match(main, /enterBtn\.hidden=false|enterBtn\.hidden = false/);
  assert.match(main, /startup-status/);
  assert.match(main, /setProgress\(100/);
  assert.match(main, /countdownLeft=20/);
  assert.match(main, /loadLogoDataUrl|brand-logo|logo\.jpg/);
  assert.match(main, /已等待/);
  assert.match(main, /show: true/);
  assert.doesNotMatch(main, /buildDarkBootPage/);
  assert.match(main, /shellPort\+'\/canvas'|shellPort \+ '\/canvas'/);
  assert.doesNotMatch(main, /loadFile\(path\.join\(__dirname, '\.\.', 'public', 'welcome\.html'\)\)/);
  assert.match(proxy, /res\.redirect\(302, '\/canvas'\)/);
  assert.match(launcher, /progress:\s*100/);
  const createIdx = electronMain.indexOf('createMainWindow');
  const portsIdx = electronMain.indexOf('resolvePorts');
  const coreIdx = electronMain.indexOf('startCore');
  assert.ok(createIdx > -1 && portsIdx > -1 && coreIdx > -1);
  assert.ok(createIdx < portsIdx);
  assert.ok(portsIdx < coreIdx);
  assert.doesNotMatch(electronMain, /await createMainWindow\(/);
});
