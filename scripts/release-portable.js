const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const electronDir = path.join(distDir, 'electron');
const winUnpackedDir = path.join(electronDir, 'win-unpacked');
const finalPortable = path.join(electronDir, 'Y7st.exe');
const finalCore = path.join(distDir, 'Y7st.exe');
const finalCoreCopy = path.join(distDir, 'Y7st-core.exe');
const defaultDeliveryDir = path.join(root, 'Y7st-最终交付');

function run(command, options = {}) {
  console.log(`\n> ${command}`);
  execFileSync(command, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    ...options
  });
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function ensure(file, message) {
  if (!fs.existsSync(file)) throw new Error(message || `Missing required file: ${file}`);
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function readUpstreamVersion() {
  const versionFile = path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas', 'VERSION');
  return fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : 'unknown';
}

function readUpstreamCommit() {
  const commitFile = path.join(root, 'dist', 'Y7st-Portable', 'Infinite-Canvas', 'UPSTREAM_COMMIT');
  const raw = fs.existsSync(commitFile) ? fs.readFileSync(commitFile, 'utf8').trim() : '';
  return raw || 'unknown';
}

function readEmbedVersion() {
  // 单一版本来源：src/build-info.js
  const info = require(path.join(root, 'src', 'build-info.js'));
  return info.EMBED_VERSION;
}

function versionedArtifactName(upstreamVersion, embedVersion) {
  const clean = (value) => String(value || 'unknown').replace(/[^0-9A-Za-z._-]+/g, '-');
  return `Y7st-${clean(upstreamVersion)}-${clean(embedVersion)}.exe`;
}

function parseArgs(argv) {
  const args = { deliveryDir: defaultDeliveryDir, skipBuild: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if ((arg === '--delivery-dir' || arg === '--release-dir') && argv[i + 1]) {
      args.deliveryDir = path.resolve(root, argv[++i]);
    } else if (arg === '--skip-build') {
      args.skipBuild = true;
    }
  }
  return args;
}

function writeDeliveryFiles(deliveryDir, exePath, hash, size) {
  const upstreamVersion = readUpstreamVersion();
  const embedVersion = readEmbedVersion();
  const buildTime = new Date().toISOString();
  const artifactName = path.basename(exePath);
  const commit = readUpstreamCommit();
  fs.writeFileSync(
    path.join(deliveryDir, 'SHA256.txt'),
    `${hash} *${artifactName}\n`,
    'utf8'
  );
  fs.writeFileSync(
    path.join(deliveryDir, '版本信息.txt'),
    [
      `文件名：${artifactName}`,
      `上游版本：${upstreamVersion}`,
      `上游 commit：${commit}`,
      `运行时版本：${embedVersion}`,
      `构建时间：${buildTime}`,
      `文件大小：${size} bytes`,
      `SHA256：${hash}`,
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(deliveryDir, '使用说明.txt'),
    [
      'Y7st / Y7api 便携版使用说明',
      '',
      '1. 双击 Y7st.exe 启动软件。',
      '2. 首次启动会解压内置运行环境，可能需要 1-2 分钟；后续会复用 Y7st/runtime，启动会明显变快。',
      '3. 运行数据、日志、缓存会保存在 EXE 同目录的 Y7st 文件夹。',
      '4. 如果启动失败，请把 Y7st/logs/electron-error.log 和 Y7st/runtime/logs 里的日志发给维护者。',
      '5. 如果生图提示 502 Bad Gateway，通常是上游供应商或中转网关临时不可用，可稍后重试或切换模型/供应商。',
      '',
      '—— 授权与署名 ——',
      '本程序是 hero8152/Infinite-Canvas（https://github.com/hero8152/Infinite-Canvas）的便携启动外壳。',
      '上游许可：仅限个人/公司内部使用，禁止商用（商用须获上游作者授权）；二次开发必须保持开源并署名原作者。',
      '随附 LICENSE 与 ATTRIBUTION.md，分发时请一并保留。',
      '',
      `上游版本：${upstreamVersion}`,
      `上游 commit：${commit}`,
      `运行时版本：${embedVersion}`,
      `文件名：${artifactName}`,
      `文件大小：${size} bytes`,
      `SHA256：${hash}`,
      '',
    ].join('\n'),
    'utf8'
  );
  // 分发需附带署名与许可原文
  copyFile(path.join(root, 'LICENSE'), path.join(deliveryDir, 'LICENSE.txt'));
  copyFile(path.join(root, 'ATTRIBUTION.md'), path.join(deliveryDir, 'ATTRIBUTION.md'));
}

function main() {
  const args = parseArgs(process.argv);
  const upstreamVersion = readUpstreamVersion();
  const embedVersion = readEmbedVersion();
  const deliveryDir = path.join(args.deliveryDir, `${upstreamVersion}-${embedVersion}`);
  const deliveryExe = path.join(deliveryDir, versionedArtifactName(upstreamVersion, embedVersion));

  if (!args.skipBuild) {
    run('npm test');
    run('node --check src/electron-main.js');
    run('node --check src/launcher.js');
    run('node --check src/proxy.js');
    run('node --check src/preload.js');
    run('node --check src/portable-paths.js');
    run('node --check src/window-controls.js');
    run('git diff --check');

    run('npm run build:core');
    ensure(finalCore, 'Core build did not produce dist/Y7st.exe');
    copyFile(finalCore, finalCoreCopy);

    if (!fs.existsSync(winUnpackedDir)) {
      run('npx electron-builder --win --dir --config electron-builder.yml');
    }

    const winUnpackedCore = path.join(winUnpackedDir, 'resources', 'Y7st-core.exe');
    ensure(winUnpackedCore, 'win-unpacked skeleton missing resources/Y7st-core.exe');
    copyFile(finalCoreCopy, winUnpackedCore);

    run('npx electron-builder --win portable --prepackaged dist/electron/win-unpacked --config electron-builder.yml');
  }

  ensure(finalPortable, 'Portable build did not produce dist/electron/Y7st.exe');
  fs.rmSync(deliveryDir, { recursive: true, force: true });
  fs.mkdirSync(deliveryDir, { recursive: true });
  copyFile(finalPortable, deliveryExe);
  const stat = fs.statSync(deliveryExe);
  const hash = sha256(deliveryExe);
  writeDeliveryFiles(deliveryDir, deliveryExe, hash, stat.size);

  console.log('\n=== Final Delivery ===');
  console.log(`Path: ${deliveryExe}`);
  console.log(`Size: ${stat.size} bytes`);
  console.log(`SHA256: ${hash}`);
  console.log(`Instructions: ${path.join(deliveryDir, '使用说明.txt')}`);
}

main();
