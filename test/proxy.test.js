const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const upstream = spawn(process.execPath, ['-e', `
const http=require('http');
const s=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<html><head></head><body>UPSTREAM</body></html>')}else{res.end('OK')}});s.listen(39123,'127.0.0.1');
`], { stdio: 'ignore' });

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

function wait(port) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const loop = () => {
      const socket = new (require('net').Socket)();
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', () => { socket.destroy(); if (Date.now() - start > 10000) reject(new Error('timeout')); else setTimeout(loop, 100); });
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
    assert.equal(welcome.status, 200);
    assert.match(welcome.body, /Y7api/);
    const proxied = await request('http://127.0.0.1:39124/canvas');
    assert.equal(proxied.status, 200);
    assert.match(proxied.body, /data-y7st-shell-injected/);
    assert.match(proxied.body, /__y7st__\/shell\.js/);
  } finally {
    proxy.kill();
    upstream.kill();
  }
});
