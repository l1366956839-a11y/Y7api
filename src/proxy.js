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
const offset = process.env.INJECT_LAYOUT_OFFSET !== '0';

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

const proxy = createProxyMiddleware({
  target,
  changeOrigin: false,
  pathRewrite: (pathName) => pathName === '/canvas' || pathName === '/canvas/' ? '/' : pathName,
  ws: true,
  xfwd: true,
  selfHandleResponse: true,
  proxyTimeout: 600000,
  timeout: 600000,
  on: {
    proxyRes: responseInterceptor((buffer, proxyRes) => injectHtml(buffer, proxyRes)),
    error: (error, req, res) => {
      console.error(`[Y7st proxy] ${req.method} ${req.url}: ${error.message}`);
      if (res && !res.headersSent) res.status(502).send('Y7st 无法连接 Infinite-Canvas 原项目，请确认原项目已启动。');
    }
  }
});

app.disable('x-powered-by');
app.get('/', (req, res) => res.sendFile(publicPath('welcome.html')));
app.get('/__y7st__/shell.css', (req, res) => res.type('css').send(asset('shell.css')));
app.get('/__y7st__/shell.js', (req, res) => res.type('js').send(asset('shell.js')));
app.get('/__y7st__/logo.jpg', (req, res) => res.sendFile(publicPath('logo.jpg')));
app.use(proxy);

const server = http.createServer(app);
server.on('upgrade', (req, socket, head) => proxy.upgrade(req, socket, head));
server.listen(port, host, () => console.log(`Y7st shell listening at http://${host}:${port}; upstream=${target}; offset=${offset}`));
