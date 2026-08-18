const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const { EMBED_VERSION } = require('./build-info');

// 在 Windows 上整棵进程树清理（避免 python / proxy 孤儿残留）。
function treeKill(pid) {
  if (!pid) return;
  try {
    execFileSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch { /* 进程可能已退出 */ }
}

// ─── Determine EXE directory (where user double-clicked) ───
const exeDir = path.dirname(process.execPath);

// ─── Temp extraction area (system temp, auto-cleaned on next run) ───
const stamp = crypto.createHash('md5').update(exeDir).digest('hex').slice(0, 8);
const tempRoot = path.resolve(process.env.Y7ST_RUNTIME_DIR || path.join(os.tmpdir(), 'Y7st-runtime-' + stamp));
const upstreamDir = path.join(tempRoot, 'Infinite-Canvas');
const shellDir = path.join(tempRoot, 'shell');
const proxyExe = path.join(shellDir, 'proxy.exe');
const logDir = path.join(tempRoot, 'logs');
const runtimeVersionFile = path.join(tempRoot, '.runtime-version');
const startupStatusFile = path.join(logDir, 'startup-status.json');
// EMBED_VERSION 来自 src/build-info.js（单一版本来源）

// ─── User data is always adjacent to the EXE, never inside the temp runtime ───
const userDataDir = path.resolve(process.env.Y7ST_USER_DATA_DIR || path.join(exeDir, 'Y7st'));
const outputDir = path.resolve(process.env.Y7ST_OUTPUT_DIR || path.join(userDataDir, 'output'));

const upstreamPort = Number(process.env.UPSTREAM_PORT || 3000);
const shellPort = Number(process.env.SHELL_PORT || 8080);

const PHASE_PROGRESS = {
  init: 8,
  extract: 45,
  'dependency-check': 62,
  ready: 100,
  error: 0
};

function writeStartupStatus(patch) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    let current = {};
    try { current = JSON.parse(fs.readFileSync(startupStatusFile, 'utf8')); } catch {}
    const phase = patch.phase != null ? patch.phase : current.phase;
    const progress = patch.progress != null
      ? patch.progress
      : (PHASE_PROGRESS[phase] != null ? PHASE_PROGRESS[phase] : current.progress);
    const next = {
      updated_at: new Date().toISOString(),
      ...current,
      ...patch,
      progress
    };
    fs.writeFileSync(startupStatusFile, JSON.stringify(next, null, 2), 'utf8');
  } catch {}
}

function appendLauncherLog(line) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'launcher.log'), `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch {}
}

function logStage(name, startedAt) {
  const elapsed = Date.now() - startedAt;
  const message = `[Y7api][perf] ${name}: ${elapsed}ms`;
  console.log(message);
  appendLauncherLog(message);
  return elapsed;
}

function startStageTimer() {
  const marks = new Map();
  return {
    begin(name) {
      marks.set(name, Date.now());
      writeStartupStatus({ phase: name, message: name, status: 'running' });
    },
    end(name) {
      const startedAt = marks.get(name);
      if (!startedAt) return 0;
      marks.delete(name);
      const elapsed = logStage(name, startedAt);
      writeStartupStatus({ phase: name, status: 'completed', elapsed_ms: elapsed });
      return elapsed;
    }
  };
}

function ensureDirs() {
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(shellDir, { recursive: true });
  fs.mkdirSync(path.join(shellDir, 'public'), { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
}

function writeFileSafe(target, content) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function extractBase64(name, data, target) {
  const buf = Buffer.from(data, 'base64');
  fs.writeFileSync(target, buf);
  console.log(`[Y7api] extracted ${name} → ${target} (${buf.length} bytes)`);
}

function extractZip(data, targetDir) {
  const buf = Buffer.from(data, 'base64');
  const tmpFile = path.join(tempRoot, '_upstream.zip');
  fs.writeFileSync(tmpFile, buf);
  try {
    execFileSync('tar.exe', ['-xf', tmpFile, '-C', targetDir], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    console.log(`[Y7api] extracted upstream project → ${targetDir} (tar)`);
  } catch (tarError) {
    try {
      execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmpFile}' -DestinationPath '${targetDir}' -Force`], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      console.log(`[Y7api] extracted upstream project → ${targetDir} (PowerShell fallback)`);
    } catch (powerShellError) {
      throw new Error(`Failed to extract upstream zip: ${powerShellError.message}; tar: ${tarError.message}`);
    }
  }
  fs.rmSync(tmpFile, { force: true });
}

function fail(message) {
  const fullMessage = `[Y7api] ${message}`;
  console.error(fullMessage);
  writeStartupStatus({ phase: 'error', status: 'failed', message: String(message || '') });
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'error.log'), fullMessage + '\n', 'utf8');
  } catch (e) {}
  if (process.platform === 'win32' && process.env.NO_ERROR_WINDOW !== '1') {
    spawn('notepad.exe', [path.join(logDir, 'error.log')], { windowsHide: false });
  }
  process.exitCode = 1;
}

function checkExtracted() {
  if (!fs.existsSync(path.join(upstreamDir, 'main.py'))) return fail(`解压后找不到 main.py：${upstreamDir}`);
  if (!fs.existsSync(proxyExe)) return fail(`找不到代理程序：${proxyExe}`);
}

function needsExtract() {
  if (!fs.existsSync(proxyExe) || !fs.existsSync(path.join(upstreamDir, 'main.py'))) return true;
  if (!fs.existsSync(runtimeVersionFile)) return true;
  try {
    return fs.readFileSync(runtimeVersionFile, 'utf8').trim() !== EMBED_VERSION;
  } catch {
    return true;
  }
}

function selfExtract() {
  console.log('[Y7api] Self-extracting runtime assets...');
  ensureDirs();
  if (typeof EMBED_PROXY_BLOB !== 'undefined' && EMBED_PROXY_BLOB) {
    extractBase64('proxy.exe', EMBED_PROXY_BLOB, proxyExe);
  }
  if (typeof EMBED_SHELL_CSS !== 'undefined' && EMBED_SHELL_CSS) {
    writeFileSafe(path.join(shellDir, 'public', 'shell.css'), Buffer.from(EMBED_SHELL_CSS, 'base64'));
  }
  if (typeof EMBED_SHELL_JS !== 'undefined' && EMBED_SHELL_JS) {
    writeFileSafe(path.join(shellDir, 'public', 'shell.js'), Buffer.from(EMBED_SHELL_JS, 'base64'));
  }
  if (typeof EMBED_WELCOME_HTML !== 'undefined' && EMBED_WELCOME_HTML) {
    writeFileSafe(path.join(shellDir, 'public', 'welcome.html'), Buffer.from(EMBED_WELCOME_HTML, 'base64'));
  }
  if (typeof EMBED_LOGO_JPG !== 'undefined' && EMBED_LOGO_JPG) {
    writeFileSafe(path.join(shellDir, 'public', 'logo.jpg'), Buffer.from(EMBED_LOGO_JPG, 'base64'));
  }
  if (typeof EMBED_UPSTREAM_ZIP !== 'undefined' && EMBED_UPSTREAM_ZIP) {
    extractZip(EMBED_UPSTREAM_ZIP, tempRoot);
  }
  fs.writeFileSync(runtimeVersionFile, EMBED_VERSION, 'utf8');
}

function logStream(file) {
  return fs.createWriteStream(file, { flags: 'a' });
}

function verifyRuntimeDependencies(pythonExe) {
  const checkScript = [
    '__import__("fastapi")',
    '__import__("uvicorn")',
    '__import__("httpx")',
    '__import__("PIL")',
    '__import__("websockets")',
    'print("OK")'
  ].join('; ');
  try {
    const output = execFileSync(pythonExe, ['-c', checkScript], {
      cwd: upstreamDir,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (output !== 'OK') throw new Error(`运行时依赖校验输出异常：${output}`);
  } catch (error) {
    throw new Error(`运行时依赖校验失败：${error.message}`);
  }
}

function hasRuntimeDependencies(pythonExe) {
  try {
    verifyRuntimeDependencies(pythonExe);
    return true;
  } catch (error) {
    console.warn(`[Y7api] Python runtime unavailable: ${pythonExe} (${error.message})`);
    return false;
  }
}

function startUpstream(stageTimer) {
  const log = logStream(path.join(logDir, 'upstream.log'));
  // Portable delivery must never depend on system Python.
  // Only the embedded runtime shipped inside Infinite-Canvas/python is allowed.
  const bundledPython = path.join(upstreamDir, 'python', 'python.exe');
  if (!fs.existsSync(bundledPython)) {
    throw new Error(`内置 Python 不存在：${bundledPython}。请重新下载完整版 Y7st.exe，不要依赖系统 Python。`);
  }
  stageTimer.begin('dependency-check');
  writeStartupStatus({ phase: 'dependency-check', status: 'running', message: '正在检查内置 Python 依赖', progress: 55 });
  try {
    verifyRuntimeDependencies(bundledPython);
  } catch (error) {
    throw new Error(`内置 Python 依赖不完整：${error.message || error}。请重新下载完整版 Y7st.exe（不使用系统 Python 兜底）。`);
  }
  stageTimer.end('dependency-check');
  writeStartupStatus({ phase: 'dependency-check', status: 'completed', message: '内置 Python 依赖检查通过', progress: 62 });
  console.log(`[Y7api] Starting upstream with embedded Python only: ${bundledPython} main.py (cwd=${upstreamDir})`);
  const child = spawn(bundledPython, ['main.py'], {
    cwd: upstreamDir,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      Y7ST_USER_DATA_DIR: userDataDir,
      Y7ST_OUTPUT_DIR: outputDir,
      // 让上游 uvicorn 绑定到探测用的端口，否则动态选端口（非 3000）时健康检查会永远失败。
      Y7ST_PORT: String(upstreamPort),
      Y7ST_HOST: '127.0.0.1'
    }
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => console.log(`[Y7api] upstream exited: ${code}`));
  return child;
}

function startProxy() {
  const log = logStream(path.join(logDir, 'shell.log'));
  const child = spawn(proxyExe, [], {
    cwd: shellDir,
    windowsHide: true,
    env: { ...process.env, UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}`, SHELL_PORT: String(shellPort) }
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('exit', (code) => console.log(`[Y7api] proxy exited: ${code}`));
  return child;
}

function openBrowser() {
  if (process.env.NO_BROWSER === '1') return;
  spawn('cmd.exe', ['/d', '/c', 'start', '', `http://127.0.0.1:${shellPort}/`], { windowsHide: true });
}

async function main() {
  const stageTimer = startStageTimer();
  writeStartupStatus({ phase: 'init', status: 'running', message: '正在准备启动环境', progress: 8 });
    if (needsExtract()) {
      stageTimer.begin('extract');
      writeStartupStatus({ phase: 'extract', status: 'running', message: '正在解压运行环境', progress: 20 });
      selfExtract();
      stageTimer.end('extract');
      writeStartupStatus({ phase: 'extract', status: 'completed', message: '运行环境解压完成', progress: 45 });
      checkExtracted();
      if (process.exitCode) return;
    } else {
      ensureDirs();
      writeStartupStatus({ phase: 'init', status: 'running', message: '检测到已解压运行环境，正在快速启动', progress: 30 });
    }
  fs.mkdirSync(path.join(upstreamDir, 'output'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'assets', 'input'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'assets', 'output'), { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const upstream = startUpstream(stageTimer);
  // 不做健康检查：上游和代理启动后直接报告就绪，让启动页自行探测
  const proxy = startProxy();
  // 等几秒让服务启动（首次冷启动可能 2-3 秒）
  await new Promise((r) => setTimeout(r, 4000));
  writeStartupStatus({ phase: 'ready', status: 'ready', message: '启动完成，可以进入画布', progress: 100 });
  console.log(`[Y7st / Y7api] started: http://127.0.0.1:${shellPort}/`);
  console.log(`[Y7api] output dir: ${outputDir}`);
  openBrowser();
  const shutdown = () => {
    treeKill(proxy && proxy.pid);
    treeKill(upstream && upstream.pid);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('exit', shutdown);
}

main().catch((error) => fail(error.stack || error.message));
