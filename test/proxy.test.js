const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const upstream = spawn(process.execPath, ['-e', `
const http=require('http');
const s=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<html><head></head><body>UPSTREAM</body></html>')}else if(req.url==='/image.png'){res.setHeader('content-type','image/png');res.end(Buffer.from([0,1,2,3,4,5]))}else{res.end('OK')}});
s.listen(39123,'127.0.0.1');
`], { stdio: 'ignore' });

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

function wait(port) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const loop = () => {
      const socket = new (require('net').Socket)();
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); if (Date.now() - start > 30000) reject(new Error('timeout')); else setTimeout(loop, 100); });
      socket.connect(port, '127.0.0.1');
    };
    loop();
  });
}

test('proxy injects Y7st shell into upstream HTML', async () => {
  await wait(39123);
  const proxy = spawn(process.execPath, ['src/proxy.js'], {
    cwd: root,
    env: { ...process.env, UPSTREAM_URL: 'http://127.0.0.1:39123', SHELL_PORT: '39124', NO_BROWSER: '1' },
    stdio: 'ignore'
  });
  try {
    await wait(39124);
    const welcome = await request('http://127.0.0.1:39124/');
        assert.equal(welcome.status, 302);
        assert.match(String(welcome.headers.location || ''), /\/canvas/);
        const proxied = await request('http://127.0.0.1:39124/canvas');
        assert.equal(proxied.status, 200);
        assert.match(proxied.body.toString('utf8'), /data-y7st-shell-injected/);
        assert.match(proxied.body.toString('utf8'), /__y7st__\/shell\.js/);
        assert.match(proxied.body.toString('utf8'), /UPSTREAM/);
    const image = await request('http://127.0.0.1:39124/image.png');
    assert.equal(image.status, 200);
    assert.equal(image.headers['content-type'], 'image/png');
    assert.deepEqual(image.body, Buffer.from([0, 1, 2, 3, 4, 5]));
    const proxySource = fs.readFileSync(path.join(root, 'src', 'proxy.js'), 'utf8');
    assert.match(proxySource, /const htmlProxy/);
    assert.match(proxySource, /const streamProxy/);
    assert.match(proxySource, /selfHandleResponse: true/);
    assert.match(proxySource, /function handleProxyError/);
    assert.match(proxySource, /typeof res\.status === 'function'/);
  } finally {
    proxy.kill();
    upstream.kill();
  }
});
