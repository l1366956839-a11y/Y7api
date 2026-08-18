const { BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { EMBED_VERSION } = require('./build-info');

function waitForServer(http, shellPort, timeout = 300000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${shellPort}/canvas`, (res) => {
        res.resume();
        if (res.statusCode >= 200 && res.statusCode < 500) return resolve();
        retry();
      });
      req.setTimeout(1000, () => { req.destroy(); retry(); });
      req.on('error', retry);
    };
    const retry = () => {
      if (Date.now() - started > timeout) reject(new Error(`等待 Y7st 服务启动超时（端口 ${shellPort}）`));
      else setTimeout(probe, 500);
    };
    probe();
  });
}

function loadLogoDataUrl() {
  const candidates = [
    path.join(process.resourcesPath || '', 'logo.jpg'),
    path.join(__dirname, '..', 'build', 'logo-splash.jpg'),
    path.join(process.resourcesPath || '', 'public', 'logo-splash.jpg'),
    path.join(__dirname, '..', 'public', 'logo.jpg')
  ];
  for (const file of candidates) {
    try {
      if (!file || !fs.existsSync(file)) continue;
      const buf = fs.readFileSync(file);
      if (buf.length > 24 * 1024) continue;
      const mime = file.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {}
  }
  return '';
}

function buildNativeStartupPage(shellPort, buildInfo = {}) {
  const logoDataUrl = loadLogoDataUrl();
  const logoHtml = logoDataUrl
    ? `<img class="brand-logo" src="${logoDataUrl}" alt="Y7api" />`
    : `<div class="logo-text">Y7</div>`;
  const versionText = String(buildInfo.embedVersion || EMBED_VERSION);
  const html = `<!doctype html>
<html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Y7api 正在启动</title>
<style>
html,body{margin:0;height:100%;background:#070a10;color:#eef4ff;font-family:system-ui,"Microsoft YaHei",sans-serif}
body{display:grid;place-items:center;background:radial-gradient(1200px 600px at 50% -10%,#132033 0%,#070a10 55%)}
.card{width:min(760px,94vw);padding:34px 36px 28px;border-radius:24px;background:linear-gradient(165deg,#141c28 0%,#0d131c 100%);border:1px solid #2b384c;box-shadow:0 24px 80px rgba(0,0,0,.55)}
.head{display:flex;gap:16px;align-items:center;margin-bottom:18px}
.brand-logo,.logo-text{width:72px;height:72px;border-radius:18px;background:#0a0f16;border:1px solid #334155;flex:0 0 auto;object-fit:contain}
.logo-text{display:grid;place-items:center;font-size:22px;font-weight:800}
.title{margin:0;font-size:30px;font-weight:800;letter-spacing:.04em}
.sub{margin:6px 0 0;color:#9fb2c9;line-height:1.65;font-size:14px}
.panel{margin-top:8px;padding:16px;border-radius:16px;background:rgba(8,12,18,.85);border:1px solid #243246}
.row{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
.lab{font-size:13px;color:#dbe7f8;font-weight:700}
.time{font-size:12px;color:#8ea2bb;font-variant-numeric:tabular-nums}
.status{margin:0 0 14px;color:#c7d5e8;line-height:1.65;font-size:13px;min-height:42px}
.progress{height:14px;border-radius:999px;background:#1a2433;overflow:hidden;border:1px solid #2f3f56}
.bar{height:100%;width:8%;background:linear-gradient(90deg,#38bdf8,#60a5fa,#e0f2fe);transition:width .25s ease;box-shadow:0 0 18px rgba(56,189,248,.35)}
.pctline{display:flex;justify-content:space-between;margin-top:10px;font-size:13px;color:#e8f1ff;font-weight:700;font-variant-numeric:tabular-nums}
.actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px}
button{display:inline-flex;align-items:center;justify-content:center;min-width:120px;padding:12px 20px;border-radius:12px;border:1px solid #3b4d66;background:#f8fafc;color:#0f172a;font-weight:750;cursor:pointer}
button.primary{background:linear-gradient(180deg,#7dd3fc,#38bdf8);border-color:#7dd3fc}
.muted{background:transparent;color:#dbe7f8}
.countdown{margin-top:14px;text-align:center;color:#9ec5ff;font-size:14px;min-height:22px;font-weight:650}
.foot{margin-top:14px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#7f91a8;font-size:12px;line-height:1.6}
</style></head><body>
<main class="card">
  <div class="head">
    ${logoHtml}
    <div>
      <h1 class="title">Y7api</h1>
      <p class="sub">Y7st 桌面启动器。首次启动会准备运行环境，可能需要 1-2 分钟，请不要关闭窗口。</p>
    </div>
  </div>
  <section class="panel">
    <div class="row"><span class="lab">启动进度</span><span class="time" id="elapsed">已等待 0 秒</span></div>
    <p id="status" class="status">正在准备启动环境…</p>
    <div class="progress"><div class="bar" id="bar"></div></div>
    <div class="pctline"><span id="phase">准备中</span><span id="pct">8%</span></div>
  </section>
  <div class="actions">
    <button id="enter" class="primary" hidden>进入软件</button>
    <button id="retry" class="muted" type="button">刷新状态</button>
    <button id="logs" class="muted" type="button">打开日志</button>
    <button id="diag" class="muted" type="button">导出诊断包</button>
  </div>
  <div id="countdown" class="countdown"></div>
  <div class="foot">
    <div>卡住时请查看 EXE 同目录 Y7st/logs 与 Y7st/runtime/logs</div>
    <div>版本 ${versionText}</div>
  </div>
</main>
<script>
const statusEl=document.getElementById('status');
const enterBtn=document.getElementById('enter');
const retryBtn=document.getElementById('retry');
const logsBtn=document.getElementById('logs');
const diagBtn=document.getElementById('diag');
const barEl=document.getElementById('bar');
const pctEl=document.getElementById('pct');
const phaseEl=document.getElementById('phase');
const elapsedEl=document.getElementById('elapsed');
const countdownEl=document.getElementById('countdown');
const shellPort=${JSON.stringify(shellPort)};
const startedAt=Date.now();
let ready=false,polling=false,progress=8,countdownTimer=null,countdownLeft=20;
const phaseText={
  init:'正在准备启动环境…',
  extract:'正在解压运行环境，首次启动会稍慢。',
  'dependency-check':'正在检查 Python 依赖…',
  'upstream-health':'正在启动本地服务…',
  'shell-health':'正在打开桌面外壳…',
  ready:'启动完成，可以进入软件。',
  error:'启动失败，请查看日志。'
};
const phaseLabel={
  init:'准备中',extract:'解压中','dependency-check':'检查依赖',
  'upstream-health':'启动服务','shell-health':'打开外壳',ready:'已完成',error:'失败'
};
const phaseProgress={init:8,extract:45,'dependency-check':62,'upstream-health':82,'shell-health':94,ready:100};
function enterApp(){
  if(!(ready&&progress>=100)) return;
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
  const target='http://127.0.0.1:'+shellPort+'/canvas';
  if(window.y7stWindow&&window.y7stWindow.navigateTo) window.y7stWindow.navigateTo(target);
  else location.href=target;
}
function startCountdown(){
  if(countdownTimer) return;
  countdownLeft=20;
  countdownEl.textContent='将在 '+countdownLeft+' 秒后自动进入软件（也可立即点击“进入软件”）';
  countdownTimer=setInterval(()=>{
    countdownLeft-=1;
    if(countdownLeft<=0){countdownEl.textContent='正在进入软件…';enterApp();return;}
    countdownEl.textContent='将在 '+countdownLeft+' 秒后自动进入软件（也可立即点击“进入软件”）';
  },1000);
}
function setProgress(v,phase){
  const next=Math.max(progress,Math.min(100,Number(v)||0));
  progress=next;
  barEl.style.width=next+'%';
  pctEl.textContent=Math.round(next)+'%';
  if(phase&&phaseLabel[phase]) phaseEl.textContent=phaseLabel[phase];
  if(next>=100&&ready){enterBtn.hidden=false;phaseEl.textContent='已完成';startCountdown();}
  else enterBtn.hidden=true;
}
function tickElapsed(){elapsedEl.textContent='已等待 '+Math.floor((Date.now()-startedAt)/1000)+' 秒';}
async function fetchStatus(){
  try{
    const r=await fetch('http://127.0.0.1:'+shellPort+'/__y7st__/startup-status',{cache:'no-store'});
    if(!r.ok) throw new Error(String(r.status));
    return await r.json();
  }catch{
    return {phase:'init',status:'running',message:'正在准备启动环境…',progress:Math.min(progress+1,18)};
  }
}
async function canvasReady(){
  try{
    const r=await fetch('http://127.0.0.1:'+shellPort+'/canvas',{cache:'no-store'});
    const t=await r.text();
    return r.ok && /data-y7st-shell-injected|<title>/i.test(t);
  }catch{return false;}
}
async function tick(){
  if(polling) return;
  polling=true;
  try{
    tickElapsed();
    if(!ready && await canvasReady()){
      ready=true;
      statusEl.textContent='启动完成，可以进入软件。';
      setProgress(100,'ready');
      return;
    }
    const info=await fetchStatus();
    if(!ready){
      statusEl.textContent=phaseText[info.phase]||info.message||'正在启动…';
      if(typeof info.progress==='number') setProgress(info.progress,info.phase);
      else if(phaseProgress[info.phase]!=null) setProgress(phaseProgress[info.phase],info.phase);
      else setProgress(Math.min(progress+1,96),info.phase);
    }
    if(info.phase==='error'||info.status==='failed'){
      statusEl.textContent=info.message||'启动失败，请查看 EXE 同目录 Y7st/logs 与 Y7st/runtime/logs。';
      phaseEl.textContent='失败';
      countdownEl.textContent='';
      if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
      return;
    }
  }finally{polling=false;}
  setTimeout(tick,700);
}
enterBtn.addEventListener('click',enterApp);
retryBtn.addEventListener('click',()=>{
  ready=false;enterBtn.hidden=true;progress=8;setProgress(8,'init');
  countdownEl.textContent='';
  if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;}
  statusEl.textContent='正在刷新状态…';tick();
});
diagBtn.addEventListener('click',async()=>{
  try{
    if(window.y7stWindow&&window.y7stWindow.exportDiagnostics){
      const r=await window.y7stWindow.exportDiagnostics();
      statusEl.textContent=r&&r.path?('诊断包已导出：'+r.path):'诊断包已导出';
    }else statusEl.textContent='当前版本不支持导出诊断包';
  }catch(e){statusEl.textContent='导出诊断包失败：'+(e&&e.message?e.message:e);}
});
logsBtn.addEventListener('click',async()=>{
  try{
    if(window.y7stWindow&&window.y7stWindow.openLogs) await window.y7stWindow.openLogs();
    else statusEl.textContent='请手动打开 EXE 同目录 Y7st/logs 与 Y7st/runtime/logs';
  }catch(e){statusEl.textContent='打开日志失败：'+(e&&e.message?e.message:e);}
});
setProgress(8,'init');
setInterval(tickElapsed,1000);
tick();
</script></body></html>`;
  return `data:text/html;charset=UTF-8,${encodeURIComponent(html)}`;
}

function createMainWindow({ http, iconPath, getMainWindow, setMainWindow, shellPort, embedVersion }) {
  const versionText = String(embedVersion || EMBED_VERSION);
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 920,
    minHeight: 640,
    title: 'Y7api',
    backgroundColor: '#070a10',
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    show: true,
    paintWhenInitiallyHidden: true,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      backgroundThrottling: false
    }
  });
  setMainWindow(mainWindow);
  mainWindow.on('closed', () => setMainWindow(null));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !url.startsWith('http://127.0.0.1:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show immediately with solid dark background, then load ONE continuous startup page.
  // Avoid multi-page handoff gaps after the portable unpack splash closes.
  if (!mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
  mainWindow.loadURL(buildNativeStartupPage(shellPort, { embedVersion: versionText })).catch(() => {});
  (async () => {
    try { await waitForServer(http, shellPort); } catch {}
  })();
  return mainWindow;
}

async function reloadStartupPage(mainWindow, shellPort, embedVersion) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  await mainWindow.loadURL(buildNativeStartupPage(shellPort, { embedVersion: String(embedVersion || EMBED_VERSION) }));
}

function registerWindowControls(getMainWindow, app, options = {}) {
  const getRoot = typeof options.getRoot === 'function' ? options.getRoot : () => '';
  app.on('second-instance', () => {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.on('browser-window-created', (_, win) => {
    win.on('maximize', () => win.webContents.send('y7st-window:maximized', true));
    win.on('unmaximize', () => win.webContents.send('y7st-window:maximized', false));
  });
  ipcMain.on('y7st-window:minimize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.on('y7st-window:maximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.maximize();
  });
  ipcMain.on('y7st-window:unmaximize', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.unmaximize();
  });
  ipcMain.on('y7st-window:close', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.close();
  });
  ipcMain.handle('y7st-window:is-maximized', () => {
    const mainWindow = getMainWindow();
    return Boolean(mainWindow && mainWindow.isMaximized());
  });
  ipcMain.handle('y7st-open-logs', async () => {
    const rootDir = getRoot() || path.dirname(app.getPath('exe'));
    const candidates = [
      path.join(rootDir, 'Y7st', 'logs'),
      path.join(rootDir, 'Y7st', 'runtime', 'logs')
    ];
    for (const dir of candidates) fs.mkdirSync(dir, { recursive: true });
    await shell.openPath(candidates[0]);
    return candidates[0];
  });
  ipcMain.handle('y7st-export-diagnostics', async () => {
    const rootDir = getRoot() || path.dirname(app.getPath('exe'));
    const userDataDir = path.join(rootDir, 'Y7st');
    const outDir = path.join(userDataDir, 'diagnostics');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outFile = path.join(outDir, `y7st-diagnostics-${stamp}.txt`);
    const readSafe = (filePath, max = 200000) => {
      try {
        if (!fs.existsSync(filePath)) return `(missing) ${filePath}`;
        const buf = fs.readFileSync(filePath);
        return buf.slice(Math.max(0, buf.length - max)).toString('utf8');
      } catch (e) {
        return `(read-failed) ${filePath}: ${e.message || e}`;
      }
    };
    const listSafe = (dirPath) => {
      try {
        if (!fs.existsSync(dirPath)) return [];
        return fs.readdirSync(dirPath).slice(0, 200);
      } catch {
        return [];
      }
    };
    const runtimeDir = path.join(userDataDir, 'runtime');
    const nl = String.fromCharCode(10);
    const sections = [];
    sections.push('Y7st Diagnostics');
    sections.push(`time=${new Date().toISOString()}`);
    sections.push(`root=${rootDir}`);
    sections.push(`userData=${userDataDir}`);
    sections.push(`runtime=${runtimeDir}`);
    sections.push(`platform=${process.platform} arch=${process.arch}`);
    sections.push(`versions=${JSON.stringify(process.versions)}`);
    sections.push('');
    sections.push('== runtime files ==');
    sections.push(String(listSafe(runtimeDir)));
    sections.push(String(listSafe(path.join(runtimeDir, 'logs'))));
    sections.push(String(listSafe(path.join(userDataDir, 'logs'))));
    sections.push('');
    const files = [
      path.join(userDataDir, 'logs', 'electron-error.log'),
      path.join(runtimeDir, 'logs', 'launcher.log'),
      path.join(runtimeDir, 'logs', 'shell.log'),
      path.join(runtimeDir, 'logs', 'upstream.log'),
      path.join(runtimeDir, 'logs', 'error.log'),
      path.join(runtimeDir, 'logs', 'startup-status.json'),
      path.join(runtimeDir, '.runtime-version')
    ];
    for (const f of files) {
      sections.push(`== ${f} ==`);
      sections.push(readSafe(f));
      sections.push('');
    }
    fs.writeFileSync(outFile, sections.join(nl), 'utf8');
    await shell.showItemInFolder(outFile);
    return { path: outFile };
  });
  ipcMain.on('y7st-window:navigate', (_, url) => {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed() && typeof url === 'string') {
      mainWindow.loadURL(url).catch(() => {});
    }
  });
}

module.exports = {
  waitForServer,
  createMainWindow,
  registerWindowControls,
  buildNativeStartupPage,
  reloadStartupPage,
  loadLogoDataUrl
};
