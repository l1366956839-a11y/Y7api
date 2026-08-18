const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'scripts', 'release-portable.js'), 'utf8');

test('release artifacts include upstream and runtime version information in names and metadata', () => {
  assert.match(script, /versionedArtifactName/);
  assert.match(script, /return `Y7st-\$\{clean\(upstreamVersion\)\}-\$\{clean\(embedVersion\)\}\.exe`/);
  assert.match(script, /构建时间/);
  assert.match(script, /版本信息\.txt/);
  assert.match(script, /deliveryDir.*version/);
});
