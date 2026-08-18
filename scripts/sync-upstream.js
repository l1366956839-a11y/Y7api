// 上游同步脚本 —— 纯 Node 实现，无需在 PATH 里安装 Python。
// 支持把上游钉到指定 ref/commit，并记录 commit SHA，便于回滚/复现/追溯。
// 用法：
//   node scripts/sync-upstream.js                      # 同步 upstream main (HEAD)
//   node scripts/sync-upstream.js --ref 4c9e…#    # 钉到某个 commit SHA
//   set UPSTREAM_REF=v1.2.0 && node scripts/sync-upstream.js   # 钉到 tag/分支
// 失败时不会留下"看似成功"的产物（非零退出码），便于 CI/本地拦截。

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const http = require('http');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const upstreamDir = path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas');
const repo = 'hero8152/Infinite-Canvas';
const defaultRef = 'main';

// conflictKeep = 本地有意保留、在同步时"不覆盖"的文件（本壳自行改造过的上游文件）。
// 请保持这份清单与 public/shell.js 及 test/upstream-contract.test.js 的契约同步。
const conflictKeep = new Set([
  'main.py',
  'static/js/canvas.js',
  'static/js/smart-canvas.js',
  'static/online.html'
]);

// ─── 参数：--ref 优先于 UPSTREAM_REF 环境变量，默认 main ───
//   --include-python：同步时也把内置 Python 运行时（上游 python/）复制进 dist，
//                    用于生成功能完整的打包产物（普通同步默认跳过 python/，保持轻量）。
let ref = process.env.UPSTREAM_REF || defaultRef;
let includePython = false;
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i] === '--ref' && process.argv[i + 1]) ref = process.argv[i + 1];
  if (process.argv[i] === '--include-python') includePython = true;
}

function ensureExists(target, message) {
  if (!fs.existsSync(target)) throw new Error(message || `Missing: ${target}`);
}

// 发起一次 GET，返回响应对象。
function httpGet(requestUrl, headers = {}) {
  const mod = requestUrl.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.get(requestUrl, { headers: { 'User-Agent': 'Hermes-Agent', ...headers } }, (res) => resolve(res));
    req.on('error', reject);
  });
}

// 下载二进制到文件（跟随最多 6 次重定向，用于 codeload → objects.githubusercontent.com）。
async function downloadToFile(requestUrl, destPath) {
  let current = requestUrl;
  for (let i = 0; i < 6; i += 1) {
    const res = await httpGet(current);
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      const loc = res.headers.location;
      res.resume();
      current = new URL(loc, current).href;
      continue;
    }
    if (res.statusCode >= 400) {
      res.resume();
      throw new Error(`下载失败 HTTP ${res.statusCode} (${current})`);
    }
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(destPath);
      res.pipe(ws);
      res.on('error', reject);
      ws.on('error', reject);
      ws.on('finish', resolve);
    });
    return;
  }
  throw new Error('重定向次数过多');
}

// 把 ref 解析为完整 commit SHA；失败返回 null（回退到按 ref 下载 zip）。
async function resolveCommitSha(value) {
  try {
    const url = `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(value)}`;
    const res = await httpGet(url, { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    const chunks = [];
    for await (const c of res) chunks.push(c);
    let payload = Buffer.concat(chunks).toString('utf8');
    try { payload = JSON.parse(payload).sha || ''; } catch { payload = ''; }
    return /^[0-9a-f]{40}$/i.test(payload) ? payload.toLowerCase() : null;
  } catch (error) {
    console.warn(`[sync] 无法将 ref='${value}' 解析为 commit SHA（${error.message}），将按 HEAD 下载。`);
    return null;
  }
}

function extractZip(zipFile, extractDir) {
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    // Windows 10+ 自带 tar.exe（bsdtar）可解压 .zip。
    execFileSync('tar.exe', ['-xf', zipFile, '-C', extractDir], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    return;
  } catch (tarError) { /* 回退到 PowerShell Expand-Archive */ }
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -Path '${zipFile}' -DestinationPath '${extractDir}' -Force`], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch (psError) {
    throw new Error(`解压上游 zip 失败：${psError.message}`);
  }
}

function latestExtractRoot(extractDir) {
  const children = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  if (!children.length) throw new Error('No extracted upstream directory found');
  return path.join(extractDir, children[0].name);
}

function walk(dir, callback, base = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, callback, base);
    else callback(full, path.relative(base, full).replace(/\\/g, '/'));
  }
}

function syncUpstream(sourceRoot) {
  const updated = [];
  const skipped = [];
  walk(sourceRoot, (source, rel) => {
    if (!rel) return;
    // 默认跳过 python/（运行时不在普通同步范围）；--include-python 时复制
    if (rel.startsWith('python/')) {
      if (includePython) {
        const dest = path.join(upstreamDir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(source, dest);
        updated.push(rel);
      } else {
        skipped.push(rel);
      }
      return;
    }
    if (conflictKeep.has(rel)) {
      skipped.push(rel);
      return;
    }
    const dest = path.join(upstreamDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    updated.push(rel);
  });
  return { updated, skipped };
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim() : '';
}

async function main() {
  ensureExists(upstreamDir, 'Missing dist/Y7st-Portable/Infinite-Canvas');
  const before = readText(path.join(upstreamDir, 'VERSION'));
  const beforeCommit = readText(path.join(upstreamDir, 'UPSTREAM_COMMIT'));

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'y7st-upstream-sync-'));
  let failed = false;
  let commitSha = null;
  try {
    console.log(`[sync] 解析 ref=${ref} ...`);
    commitSha = await resolveCommitSha(ref);

    const zipFile = path.join(tempDir, 'upstream.zip');
    const extractDir = path.join(tempDir, 'extract');
    const url = `https://codeload.github.com/${repo}/zip/${commitSha || ref}`;
    console.log(`[sync] 下载 ${commitSha || ref} ...`);
    await downloadToFile(url, zipFile);
    extractZip(zipFile, extractDir);
    const sourceRoot = latestExtractRoot(extractDir);
    const result = syncUpstream(sourceRoot);

    fs.writeFileSync(path.join(upstreamDir, 'UPSTREAM_COMMIT'), (commitSha || '') + '\n', 'utf8');
    const after = readText(path.join(upstreamDir, 'VERSION'));

    console.log('\n=== Upstream Sync Report ===');
    console.log(`Repo: ${repo}`);
    console.log(`Ref: ${ref}`);
    console.log(`Commit: ${commitSha || '(HEAD, not resolved)'}`);
    console.log(`Version: ${before || 'unknown'} -> ${after || 'unknown'}`);
    console.log(`Commit: ${beforeCommit || 'unknown'} -> ${commitSha || 'unknown'}`);
    console.log(`Updated: ${result.updated.length}`);
    console.log(`Skipped: ${result.skipped.length}`);
    if (result.skipped.length) {
      console.log('Skipped files:');
      for (const item of result.skipped) console.log(`  - ${item}`);
    }
  } catch (error) {
    failed = true;
    console.error(`\n[sync] 同步失败：${error.message}`);
    console.error('[sync] 未留下可用的上游产物，请修复后重试。');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  if (failed) process.exit(1);
  console.log('[sync] 同步完成。');
}

main();