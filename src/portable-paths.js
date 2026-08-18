const path = require('path');
const fs = require('fs');

// 便携版根目录探测 —— 去掉了过去的 PowerShell Get-CimInstance 慢调用。
// 优先级：
//   1) PORTABLE_EXECUTABLE_FILE / PORTABLE_EXECUTABLE_DIR
//      （electron-builder 的 portable 目标会设置，指向用户真正双击的那个 EXE，权威来源）
//   2) Y7ST_ROOT_DIR（可选，手动覆盖）
//   3) path.dirname(app.getPath('exe'))（覆盖 win-unpacked / 源码运行 / 非便携）
// 结果做模块级缓存，避免重复探测。

let cachedRoot = null;

function portableExecutableDir() {
  if (cachedRoot) return cachedRoot;
  let root = '';

  // 方案 1：electron-builder portable 环境变量（权威）
  const portableFile = process.env.PORTABLE_EXECUTABLE_FILE;
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableFile && portableFile.length) root = path.dirname(portableFile);
  else if (portableDir && portableDir.length) root = portableDir;

  // 方案 2：手动覆盖
  if (!root && process.env.Y7ST_ROOT_DIR && process.env.Y7ST_ROOT_DIR.length) {
    root = path.resolve(process.env.Y7ST_ROOT_DIR);
  }

  // 方案 3：由调用方传入的 exe 路径兜底（见 resolvePortablePaths）
  if (root && fs.existsSync(root)) cachedRoot = root;
  else cachedRoot = root || null;
  return cachedRoot;
}

function cacheRootFromExe(exePath) {
  if (cachedRoot) return cachedRoot;
  if (exePath) {
    const dir = path.dirname(exePath);
    if (fs.existsSync(dir)) {
      cachedRoot = dir;
      return cachedRoot;
    }
  }
  return null;
}

function resolvePortablePaths(app) {
  const exePath = app.getPath('exe');
  let root = portableExecutableDir() || cacheRootFromExe(exePath);
  if (!root) root = path.dirname(exePath);
  const resourcesRoot = process.resourcesPath || path.join(path.dirname(exePath), 'resources');
  return {
    root,
    resourcesRoot,
    coreExe: path.join(resourcesRoot, 'Y7st-core.exe'),
    iconPath: path.join(resourcesRoot, 'Y7api.ico')
  };
}

module.exports = {
  portableExecutableDir,
  resolvePortablePaths
};