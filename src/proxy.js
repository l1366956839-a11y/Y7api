const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const dotenv = require('dotenv');
const { createProxyMiddleware, responseInterceptor } = require('http-proxy-middleware');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const app = express();
const host = process.env.SHELL_HOST || '127.0.0.1';
const port = Number(process.env.SHELL_PORT || 8080);
const target = process.env.UPSTREAM_URL || 'http://127.0.0.1:3000';
const productName = process.env.PRODUCT_NAME || 'Y7api';
const brandColor = process.env.BRAND_COLOR || '#ffffff';

function publicPath(name) {
  const root = process.isSea ? path.dirname(process.execPath) : path.resolve(__dirname, '..');
  const candidates = [
    path.join(root, 'public', name),
    path.join(root, 'shell', 'public', name),
    path.join(__dirname, '..', 'public', name),
    path.join(process.cwd(), 'public', name)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function asset(name) {
  const file = publicPath(name);
  if (!file) throw new Error(`Shell asset not found: ${name}`);
  return fs.readFileSync(file, 'utf8');
}

function injectHtml(buffer, proxyRes) {
  const contentType = String(proxyRes.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('text/html')) return buffer;
  const html = buffer.toString('utf8');
  if (html.includes('data-y7st-shell-injected')) return buffer;

  const style = asset('shell.css').replace(/<\//g, '<\\/');
  const script = `window.__Y7ST_SHELL__=${JSON.stringify({ productName, brandColor })};`;
  const injection = `<!-- data-y7st-shell-injected --><style id="y7st-shell-style">${style}</style><script>${script}</script><script src="/__y7st__/shell.js" defer></script>`;
  const result = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${injection}</head>`)
    : `${injection}${html}`;
  return Buffer.from(result, 'utf8');
}

function handleProxyError(error, req, res) {
  const method = req?.method || 'WS';
  const url = req?.url || '';
  console.error(`[Y7st proxy] ${method} ${url}: ${error.message}`);
  if (!res) return;
  if (typeof res.status === 'function') {
    if (!res.headersSent) res.status(502).send('Y7st 无法连接 Infinite-Canvas 原项目，请确认原项目已启动。');
    return;
  }
  try { res.end(); } catch {}
  try { res.destroy(); } catch {}
}

const sharedProxyOptions = {
  target,
  changeOrigin: false,
  pathRewrite: (pathName) => pathName === '/canvas' || pathName === '/canvas/' ? '/' : pathName,
  ws: true,
  xfwd: true,
  proxyTimeout: 600000,
  timeout: 600000,
  on: {
    error: handleProxyError
  }
};

const htmlProxy = createProxyMiddleware({
  ...sharedProxyOptions,
  selfHandleResponse: true,
  on: {
    ...sharedProxyOptions.on,
    proxyRes: responseInterceptor((buffer, proxyRes) => injectHtml(buffer, proxyRes))
  }
});

const streamProxy = createProxyMiddleware(sharedProxyOptions);

function wantsHtml(req) {
  const accept = String(req.headers.accept || '').toLowerCase();
  return accept.includes('text/html') || req.path === '/canvas' || req.path === '/canvas/';
}

app.disable('x-powered-by');
// Root used to serve welcome.html (duplicate entry page). Always go to canvas.
app.get('/', (req, res) => res.redirect(302, '/canvas'));
app.get('/__y7st__/shell.css', (req, res) => res.type('css').send(asset('shell.css')));
app.get('/__y7st__/shell.js', (req, res) => res.type('js').send(asset('shell.js')));
app.get('/__y7st__/logo.jpg', (req, res) => res.sendFile(publicPath('logo.jpg')));
app.get('/__y7st__/startup-status', (req, res) => {
  const file = path.join(path.dirname(process.cwd()), 'logs', 'startup-status.json');
  if (!fs.existsSync(file)) return res.json({ phase: 'init', status: 'running', message: '正在准备启动环境' });
  try {
    return res.json(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return res.json({ phase: 'init', status: 'running', message: '正在准备启动环境' });
  }
});
app.use((req, res, next) => (wantsHtml(req) ? htmlProxy : streamProxy)(req, res, next));

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => streamProxy.upgrade(req, socket, head));
server.listen(port, host, () => console.log(`Y7st shell listening at http://${host}:${port}; upstream=${target}`));
