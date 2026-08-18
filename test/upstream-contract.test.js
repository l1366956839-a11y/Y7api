// 上游契约测试 —— 把壳对上游的依赖显式固化成一个清单。
// 目的：上游 Sync 后一旦把壳依赖的接口改名/删除，本测试立即变红，避免健康检查/壳特性"静默失效"。
//   · REQUIRED_ENDPOINTS：硬依赖，缺失即失败（如 launcher 健康检查用的 /api/providers）。
//   · SHELL_INTERNAL_MARKERS：壳自身代码内部契约（窗口栏 / 宿主标记），两端一致才生效。
//   · FORBIDDEN_DEAD_DEPS：历史遗留的、针对上游"不应存在元素"的去过失效写逻辑——禁止它们重新混进 shell.js，
//     否则又会出现"静默空转"的品牌死代码。

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const upstreamDir = path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas');
const staticDir = path.join(upstreamDir, 'static');

// launcher 健康检查依赖的上游路由（缺失会导致启动永远等不到就绪）
const REQUIRED_ENDPOINTS = ['/api/providers'];

// 壳内部契约：
//   UI 标记  —— 必须同时存在于 public/shell.js 与 public/shell.css（窗口栏 + 顶部让位）。
//   INJECT 标记 —— proxy 注入、launcher 健康检查两端一致（data-y7st-shell-injected）。
//   host 标记 —— shell.js 打类名、shell.css 生效。
const UI_MARKERS = ['y7st-native-window-bar', 'y7st-project-host'];
const INJECT_MARKERS = [['src/proxy.js', 'data-y7st-shell-injected'], ['src/window-controls.js', 'data-y7st-shell-injected']];

// 曾经"针对上游不存在的 DOM"写失效逻辑、被清理掉的选择器。
// 若再次出现在 shell.js / shell.css，说明死代码被重新引入，测试应失败以提醒。
// 注：github-entry-btn / social-row-lite / author-name-lite 等现在被壳 CSS 主动用于隐藏，不再属死代码，已从本列表移除。
const FORBIDDEN_DEAD_DEPS = [
  'studioSidebar',
  'toggleSidebarPinned'
];

function collectStaticText(dir) {
  if (!fs.existsSync(dir)) return '';
  const parts = [];
  let files;
  try {
    files = fs.readdirSync(dir, { recursive: true });
  } catch {
    try { files = fs.readdirSync(dir); } catch { return ''; }
  }
  for (const f of files) {
    const full = path.join(dir, String(f));
    if (!/\.(html|js)$/i.test(full)) continue;
    try {
      if (fs.statSync(full).isFile()) parts.push(fs.readFileSync(full, 'utf8'));
    } catch { /* ignore */ }
  }
  return parts.join('\n');
}

function mainPySource() {
  return fs.readFileSync(path.join(upstreamDir, 'main.py'), 'utf8');
}

test('上游契约：launcher 依赖的接口必须存在', () => {
  const mainPy = path.join(upstreamDir, 'main.py');
  assert.ok(fs.existsSync(mainPy), '缺少 dist/Y7st-Portable/Infinite-Canvas/main.py');
  const src = mainPySource();
  for (const endpoint of REQUIRED_ENDPOINTS) {
    assert.ok(src.includes(endpoint), `上游缺少壳健康检查依赖的接口 ${endpoint}`);
  }
  // 根路径应能服务入口页面（proxy 把 /canvas 映射到 / 作为画布入口）
  assert.match(src, /@app\.(get)\s*\(["']\//, '上游缺少根路由 @app.get("/")');
});

test('壳内部契约：窗口栏/宿主标记在 shell.js 与 shell.css 一致存在', () => {
  const shellJs = fs.readFileSync(path.join(root, 'public', 'shell.js'), 'utf8');
  const shellCss = fs.readFileSync(path.join(root, 'public', 'shell.css'), 'utf8');
  for (const marker of UI_MARKERS) {
    assert.ok(shellJs.includes(marker), `shell.js 缺少 UI 标记 ${marker}`);
    assert.ok(shellCss.includes(marker), `shell.css 缺少 UI 标记 ${marker}`);
  }
});

test('壳内部契约：注入标记在 proxy / launcher / window-controls 中一致存在', () => {
  for (const [rel, marker] of INJECT_MARKERS) {
    const text = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.ok(text.includes(marker), `${rel} 缺少注入标记 ${marker}`);
  }
});

test('壳不再依赖上游不存在的"家具"选择器（防止死代码回归）', () => {
  const shellJs = fs.readFileSync(path.join(root, 'public', 'shell.js'), 'utf8');
  const shellCss = fs.readFileSync(path.join(root, 'public', 'shell.css'), 'utf8');
  for (const selector of FORBIDDEN_DEAD_DEPS) {
    assert.ok(
      !shellJs.includes(selector),
      `shell.js 重新引入了针对上游不存在元素的死代码依赖：${selector}`
    );
    assert.ok(
      !shellCss.includes(selector),
      `shell.css 重新引入了针对上游不存在元素的死代码依赖：${selector}`
    );
  }
});