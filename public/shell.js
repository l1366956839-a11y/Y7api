(() => {
  const logoSrc = '/__y7st__/logo.jpg';
  const isWelcome = document.body.classList.contains('y7st-welcome');
  const isTopDocument = window.top === window.self;

  // 无边框 Electron 窗口里，注入的窗口栏会盖住页面顶部 28px。
  // 仅当实际存在 Electron 窗口桥（window.y7stWindow）时才打宿主标记，让 shell.css
  // 给 body 让出顶部高度；普通浏览器访问时不加类，避免出现没有窗口栏的多余顶距。
  function applyShellHost() {
    if (isTopDocument && !isWelcome && window.y7stWindow) {
      document.documentElement.classList.add('y7st-project-host');
    }
  }

  async function fetchStartupStatus() {
    try {
      const response = await fetch('/__y7st__/startup-status', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      return await response.json();
    } catch {
      return { phase: 'init', status: 'running', message: '正在准备启动环境' };
    }
  }

  async function pollCanvasReady(maxAttempts = 180) {
    for (let i = 0; i < maxAttempts; i += 1) {
      try {
        const response = await fetch('/canvas', { cache: 'no-store' });
        const text = await response.text();
        if (response.ok && /data-y7st-shell-injected|<title>/i.test(text)) return true;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return false;
  }

  function setupWelcomeStartupPanel() {
    if (!isWelcome) return;
    const panel = document.getElementById('y7st-startup-panel');
    const status = document.getElementById('y7st-startup-status');
    const enterLink = document.getElementById('y7st-enter-link');
    if (!panel || !status || !enterLink) return;

    let starting = false;
    let readyToEnter = false;
    let autoEnterTimer = null;
    const phaseText = {
      init: '正在准备启动环境…',
      extract: '正在解压运行环境，首次启动会稍慢。',
      'dependency-check': '正在检查 Python 依赖…',
      'upstream-health': '正在启动本地服务…',
      'shell-health': '正在打开桌面外壳…',
      ready: '启动完成。现在可以点击“进入软件”；如果 15 秒内未点击，将自动进入软件。',
      error: '启动失败，请查看日志。'
    };

    const showPanel = (message) => {
      panel.hidden = false;
      status.textContent = message;
    };

    const enterSoftware = (event) => {
      if (event) event.preventDefault();
      if (!readyToEnter) return;
      window.location.href = '/canvas';
    };

    const syncStageText = async () => {
      const info = await fetchStartupStatus();
      const phaseMessage = phaseText[info.phase] || info.message || '正在启动…';
      showPanel(phaseMessage);
      if (info.phase === 'ready' || info.status === 'ready') {
        readyToEnter = true;
        enterLink.hidden = false;
        if (!autoEnterTimer) {
          autoEnterTimer = setTimeout(() => { if (readyToEnter) window.location.href = '/canvas'; }, 15000);
        }
      }
      return info;
    };

    const startAndWait = async () => {
      if (starting) return;
      starting = true;
      enterLink.hidden = true;
      showPanel('正在检测本地服务状态。首次启动会解压内置运行环境，可能需要 1-2 分钟，请不要关闭窗口。');
      const fastReady = await pollCanvasReady(2);
      if (fastReady) {
        readyToEnter = true;
        enterLink.hidden = false;
        showPanel('启动完成后 15 秒没人点击则自动进入软件。');
        autoEnterTimer = setTimeout(() => { if (readyToEnter) window.location.href = '/canvas'; }, 15000);
        return;
      }
      for (let i = 0; i < 180; i += 1) {
        const ready = await pollCanvasReady(1);
        if (ready) {
          readyToEnter = true;
          enterLink.hidden = false;
          showPanel('启动完成后 15 秒没人点击则自动进入软件。');
          autoEnterTimer = setTimeout(() => { if (readyToEnter) window.location.href = '/canvas'; }, 15000);
          return;
        }
        const info = await syncStageText();
        if (info.phase === 'error' || info.status === 'failed') {
          starting = false;
          showPanel(info.message || '启动失败，请查看 EXE 同目录 Y7st/logs 与 Y7st/runtime/logs。');
          return;
        }
      }
      starting = false;
      showPanel('等待启动超时。请查看 EXE 同目录 Y7st/logs 与 Y7st/runtime/logs，并把日志发给维护者。');
    };

    enterLink.addEventListener('click', enterSoftware);
    setTimeout(() => { startAndWait(); }, 300);
  }

  function mountWindowBar() {
    if (!isTopDocument || isWelcome || document.getElementById('y7st-native-window-bar')) return;
    const bridge = window.y7stWindow;
    if (!bridge) return;
    const bar = document.createElement('div');
    bar.id = 'y7st-native-window-bar';
    bar.className = 'y7st-native-window-bar';
    bar.innerHTML = `
      <div class="y7st-native-window-brand">
        <img src="${logoSrc}" alt="Y7api" class="y7st-native-title-logo">
        <span class="y7st-native-title-text">Y7api</span>
      </div>
      <div class="y7st-native-window-controls">
        <button type="button" data-win="min" aria-label="最小化">—</button>
        <button type="button" data-win="max" aria-label="最大化">▢</button>
        <button type="button" data-win="close" class="close" aria-label="关闭">×</button>
      </div>`;
    document.body.prepend(bar);
    const maxBtn = bar.querySelector('[data-win="max"]');
    const sync = async () => {
      try {
        const isMax = await bridge.isMaximized();
        maxBtn.textContent = isMax ? '❐' : '▢';
      } catch {}
    };
    bar.querySelector('[data-win="min"]').addEventListener('click', () => bridge.minimize());
    maxBtn.addEventListener('click', async () => {
      try {
        const isMax = await bridge.isMaximized();
        if (isMax) bridge.unmaximize(); else bridge.maximize();
        setTimeout(sync, 30);
      } catch {}
    });
    bar.querySelector('[data-win="close"]').addEventListener('click', () => bridge.close());
    sync();
  }

  function init() {
    applyShellHost();
    setupWelcomeStartupPanel();
    mountWindowBar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();