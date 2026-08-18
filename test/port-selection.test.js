const net = require('net');
const test = require('node:test');
const assert = require('node:assert/strict');

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function findAvailablePort(preferredPort) {
  for (let port = preferredPort; port < preferredPort + 50; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`没有找到可用端口：${preferredPort}-${preferredPort + 49}`);
}

test('findAvailablePort skips an occupied preferred port', async () => {
  const blocker = net.createServer();
  await new Promise((resolve, reject) => {
    blocker.once('error', reject);
    blocker.listen(39500, '127.0.0.1', resolve);
  });
  try {
    const port = await findAvailablePort(39500);
    assert.equal(port, 39501);
  } finally {
    await new Promise((resolve) => blocker.close(resolve));
  }
});
