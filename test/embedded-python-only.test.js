const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const launcher = fs.readFileSync(path.join(root, 'src', 'launcher.js'), 'utf8');

test('portable launcher uses embedded Python only (no system Python fallback)', () => {
  assert.match(launcher, /function startUpstream/);
  assert.match(launcher, /bundledPython/);
  assert.match(launcher, /内置 Python/);
  assert.match(launcher, /embedded Python only|Starting upstream with embedded Python only/);
  assert.doesNotMatch(launcher, /process\.env\.PYTHON_EXE/);
  assert.doesNotMatch(launcher, /pythonCandidates/);

  const start = launcher.indexOf('function startUpstream');
  const end = launcher.indexOf('function startProxy');
  const block = launcher.slice(start, end);

  // Must use embedded python.exe path.
  assert.match(block, /python\.exe/);
  assert.match(block, /spawn\(bundledPython/);

  // Must not fall back to bare system python command.
  assert.doesNotMatch(block, /spawn\(\s*['"]python['"]/);
  assert.doesNotMatch(block, /['"]python['"]\s*,\s*bundledPython/);
  assert.doesNotMatch(block, /bundledPython\s*,\s*['"]python['"]/);
});
