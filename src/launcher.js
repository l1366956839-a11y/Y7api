const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, execFileSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');

// ─── Determine EXE directory (where user double-clicked) ───
const exeDir = path.dirname(process.execPath);

// ─── Temp extraction area (system temp, auto-cleaned on next run) ───
const stamp = crypto.createHash('md5').update(exeDir).digest('hex').slice(0, 8);
const tempRoot = path.join(os.tmpdir(), 'Y7st-runtime-' + stamp);
const upstreamDir = path.join(tempRoot, 'Infinite-Canvas');
const shellDir = path.join(tempRoot, 'shell');
const proxyExe = path.join(shellDir, 'proxy.exe');
const logDir = path.join(tempRoot, 'logs');
const runtimeVersionFile = path.join(tempRoot, '.runtime-version');
const EMBED_VERSION = '2026-07-17-v3';

// ─── User-facing output folder (next to EXE) ───
const outputDir = path.resolve(process.env.Y7ST_OUTPUT_DIR || path.join(exeDir, 'output'));

const upstreamPort = Number(process.env.UPSTREAM_PORT || 3000);
const shellPort = Number(process.env.SHELL_PORT || 8080);

// ─── Embedded payloads (injected by build script) ───
// EMBED_PROXY_BLOB, EMBED_SHELL_CSS, EMBED_SHELL_JS, EMBED_WELCOME_HTML, EMBED_LOGO_JPG
// EMBED_UPSTREAM_TAR

function ensureDirs() {
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(shellDir, { recursive: true });
  fs.mkdirSync(path.join(shellDir, 'public'), { recursive: true });
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
  // data is base64 of zip
  const buf = Buffer.from(data, 'base64');
  const tmpFile = path.join(tempRoot, '_upstream.zip');
  fs.writeFileSync(tmpFile, buf);
  // Use PowerShell Expand-Archive (native on Windows 10+)
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${tmpFile}' -DestinationPath '${targetDir}' -Force`], { stdio: ['ignore', 'ignore', 'pipe'] });
    console.log(`[Y7api] extracted upstream project → ${targetDir}`);
  } catch (e) {
    throw new Error(`Failed to extract upstream zip: ${e.message}`);
  }
  fs.rmSync(tmpFile, { force: true });
}

function fail(message) {
  const fullMessage = `[Y7api] ${message}`;
  console.error(fullMessage);
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
  // Re-extract only when version changes or critical files are missing
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

  // Write proxy.exe
  if (typeof EMBED_PROXY_BLOB !== 'undefined' && EMBED_PROXY_BLOB) {
    extractBase64('proxy.exe', EMBED_PROXY_BLOB, proxyExe);
  }

  // Write shell public assets
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

  // Extract upstream project zip
  if (typeof EMBED_UPSTREAM_ZIP !== 'undefined' && EMBED_UPSTREAM_ZIP) {
    extractZip(EMBED_UPSTREAM_ZIP, tempRoot);
  }

  fs.writeFileSync(runtimeVersionFile, EMBED_VERSION, 'utf8');
}

function waitForPort(port, timeoutMs = 120000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const socket = new (require('net').Socket)();
      socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); retry(); });
      socket.once('timeout', () => { socket.destroy(); retry(); });
      socket.connect(port, '127.0.0.1');
    };
    const retry = () => {
      if (Date.now() - started > timeoutMs) reject(new Error(`等待端口 ${port} 超时`));
      else setTimeout(probe, 500);
    };
    probe();
  });
}

function logStream(file) {
  return fs.createWriteStream(file, { flags: 'a' });
}

function startUpstream() {
  const log = logStream(path.join(logDir, 'upstream.log'));
  const bundledPython = path.join(upstreamDir, 'python', 'python.exe');
  const pythonCandidates = [
    process.env.PYTHON_EXE,
    bundledPython,
    'python'
  ].filter(Boolean);
  const pythonExe = pythonCandidates.find((candidate) => {
    if (candidate === 'python' || (!candidate.includes('\\') && !candidate.includes('/'))) return true;
    return fs.existsSync(candidate);
  });
  console.log(`[Y7api] Starting upstream: ${pythonExe} main.py (cwd=${upstreamDir})`);
  const child = spawn(pythonExe, ['main.py'], {
    cwd: upstreamDir,
    windowsHide: true,
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
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
  if (needsExtract()) {
    selfExtract();
    checkExtracted();
    if (process.exitCode) return;
  } else {
    ensureDirs();
  }

  // Ensure runtime/output dirs in upstream
  fs.mkdirSync(path.join(upstreamDir, 'output'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'assets', 'input'), { recursive: true });
  fs.mkdirSync(path.join(upstreamDir, 'assets', 'output'), { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  const upstream = startUpstream();
  try {
    await waitForPort(upstreamPort);
  } catch (error) {
    upstream.kill();
    return fail(`原项目启动失败：${error.message}，详见 logs/upstream.log`);
  }
  const proxy = startProxy();
  try {
    await waitForPort(shellPort);
    console.log(`[Y7st / Y7api] started: http://127.0.0.1:${shellPort}/`);
    console.log(`[Y7api] output dir: ${outputDir}`);
    openBrowser();
  } catch (error) {
    proxy.kill();
    upstream.kill();
    return fail(`外壳启动失败：${error.message}，详见 logs/shell.log`);
  }
  const shutdown = () => { proxy.kill(); upstream.kill(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => fail(error.stack || error.message));