const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { buildSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const dist = path.join(distDir());
const nodeExe = process.execPath;

function distDir() {
  return path.join(root, 'dist');
}

fs.mkdirSync(dist, { recursive: true });

function run(args) {
  execFileSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

// ─── Step 1: Build proxy.exe as a standalone SEA ───
function buildProxy() {
  const shellDist = path.join(dist, 'shell');
  fs.mkdirSync(shellDist, { recursive: true });
  const config = path.join(dist, 'proxy.sea-config.json');
  const blob = path.join(dist, 'proxy.blob');
  const tmp = path.join(dist, 'proxy.sea.js');
  const bundled = path.join(dist, 'proxy.bundle.js');
  const input = path.join(root, 'src', 'proxy.js');
  const output = path.join(shellDist, 'proxy.exe');

  buildSync({ entryPoints: [input], bundle: true, platform: 'node', target: 'node24', outfile: bundled, packages: 'bundle' });
  fs.copyFileSync(bundled, tmp);
  writeJson(config, { main: tmp, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false });
  run(['--experimental-sea-config', config]);
  fs.copyFileSync(nodeExe, output);
  run([path.join('node_modules', 'postject', 'dist', 'cli.js'), output, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'fce680ab2cc467b6e072b8b5df1996b2']);
  fs.rmSync(tmp, { force: true });
  fs.rmSync(bundled, { force: true });
  fs.rmSync(config, { force: true });
  fs.rmSync(blob, { force: true });
  console.log(`Built ${output} (${fs.statSync(output).size} bytes)`);
  return output;
}

// ─── Step 2: Build the single all-in-one Y7st.exe ───
function buildAllInOne() {
  const config = path.join(dist, 'launcher.sea-config.json');
  const blob = path.join(dist, 'launcher.blob');
  const tmp = path.join(dist, 'launcher.sea.js');
  const bundled = path.join(dist, 'launcher.bundle.js');
  const input = path.join(root, 'src', 'launcher.js');
  const output = path.join(dist, 'Y7st.exe');

  // Read all embedded assets
  const proxyExePath = path.join(dist, 'shell', 'proxy.exe');
  const shellCssPath = path.join(root, 'public', 'shell.css');
  const shellJsPath = path.join(root, 'public', 'shell.js');
  const welcomeHtmlPath = path.join(root, 'public', 'welcome.html');
  const logoJpgPath = path.join(root, 'public', 'logo.jpg');

  const proxyExe = fs.readFileSync(proxyExePath);
  const shellCss = fs.readFileSync(shellCssPath, 'utf8');
  const shellJs = fs.readFileSync(shellJsPath, 'utf8');
  const welcomeHtml = fs.readFileSync(welcomeHtmlPath, 'utf8');
  const logoJpg = fs.readFileSync(logoJpgPath);

  console.log(`[build] proxy.exe: ${(proxyExe.length/1048576).toFixed(1)} MB`);
  console.log(`[build] shell.css: ${shellCss.length} bytes`);
  console.log(`[build] shell.js: ${shellJs.length} bytes`);
  console.log(`[build] welcome.html: ${welcomeHtml.length} bytes`);
  console.log(`[build] logo.jpg: ${logoJpg.length} bytes`);

  // Create a .zip of the Infinite-Canvas upstream project (PowerShell can extract .zip natively)
  const upstreamDir = path.join(dist, 'Y7st-Portable', 'Infinite-Canvas');
  if (!fs.existsSync(path.join(upstreamDir, 'main.py'))) {
    throw new Error(`Upstream project not found at ${upstreamDir}. Run build first, then place Infinite-Canvas in dist/Y7st-Portable/`);
  }
  console.log(`[build] Creating zip of upstream project (${upstreamDir})...`);
  const zipPath = path.join(dist, 'upstream.zip');
  // Use PowerShell Compress-Archive (native on Windows)
  const psCmd = `Compress-Archive -Path '${upstreamDir}' -DestinationPath '${zipPath}' -Force`;
  execFileSync('powershell', ['-NoProfile', '-Command', psCmd], { stdio: 'inherit' });
  const upstreamZip = fs.readFileSync(zipPath);
  console.log(`[build] upstream.zip: ${(upstreamZip.length/1048576).toFixed(1)} MB`);

  // Generate the embedded-constants JS prefix
  console.log('[build] Generating embedded constants...');
  const embedPrefix = `// AUTO-GENERATED — do not edit
const EMBED_PROXY_BLOB = "${proxyExe.toString('base64')}";
const EMBED_SHELL_CSS = "${Buffer.from(shellCss).toString('base64')}";
const EMBED_SHELL_JS = "${Buffer.from(shellJs).toString('base64')}";
const EMBED_WELCOME_HTML = "${Buffer.from(welcomeHtml).toString('base64')}";
const EMBED_LOGO_JPG = "${Buffer.from(logoJpg).toString('base64')}";
const EMBED_UPSTREAM_ZIP = "${upstreamZip.toString('base64')}";
`;

  // Bundle launcher.js (without the embeds — they'll be prepended)
  buildSync({ entryPoints: [input], bundle: true, platform: 'node', target: 'node24', outfile: bundled, packages: 'bundle' });

  // Prepend the embedded constants to the bundled launcher
  const bundledCode = fs.readFileSync(bundled, 'utf8');
  fs.writeFileSync(tmp, embedPrefix + '\n' + bundledCode);

  writeJson(config, { main: tmp, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false });
  run(['--experimental-sea-config', config]);
  fs.copyFileSync(nodeExe, output);
  run([path.join('node_modules', 'postject', 'dist', 'cli.js'), output, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'fce680ab2cc467b6e072b8b5df1996b2']);

  fs.rmSync(tmp, { force: true });
  fs.rmSync(bundled, { force: true });
  fs.rmSync(config, { force: true });
  fs.rmSync(blob, { force: true });
  fs.rmSync(zipPath, { force: true });

  console.log(`\n✅ Built ${output} (${(fs.statSync(output).size/1048576).toFixed(1)} MB)`);
  console.log('Single EXE contains: proxy + shell assets + upstream project');
}

// Build proxy first, then build the all-in-one launcher
buildProxy();
buildAllInOne();