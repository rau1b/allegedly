'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { touchesEdited, targetedTests, looksLikeTestFile, core } = require('../plugin/hooks/lib/related');

test('core name strips test markers and extensions', () => {
  assert.strictEqual(core('test/auth.test.js'), 'auth');
  assert.strictEqual(core('tests/test_auth.py'), 'auth');
  assert.strictEqual(core('src/AuthTest.java'), 'auth');
  assert.strictEqual(core('auth_spec.rb'), 'auth');
  assert.strictEqual(core('C:\\app\\src\\auth.ts'), 'auth');
});

test('spots test files, not look-alikes', () => {
  for (const f of ['test/a.js', 'a.test.ts', 'test_a.py', 'a_test.go', 'AuthTest.java', 'src/__tests__/a.jsx', 'spec/a_spec.rb']) {
    assert.ok(looksLikeTestFile(f), f);
  }
  for (const f of ['latest.js', 'contest.py', 'src/app.js', 'test', './...', 'auth']) {
    assert.ok(!looksLikeTestFile(f), f);
  }
});

test('finds targeted test files in a command', () => {
  assert.deepStrictEqual(targetedTests('cd app && node --test test/a.test.js'), ['test/a.test.js']);
  assert.deepStrictEqual(targetedTests('pytest tests/test_auth.py::test_login -q'), ['tests/test_auth.py']);
  assert.deepStrictEqual(targetedTests('npx jest --testPathPattern=src/a.test.ts'), ['src/a.test.ts']);
  assert.deepStrictEqual(targetedTests('npm test'), []);
  assert.deepStrictEqual(targetedTests('go test ./...'), []);
  assert.deepStrictEqual(targetedTests('npx vitest "src/**/*.test.ts"'), []);
  assert.deepStrictEqual(targetedTests('python main.py'), []);
});

test('whole-suite runs and non-test runs always count', () => {
  assert.ok(touchesEdited('npm test', '14 passed', ['src/auth.js']));
  assert.ok(touchesEdited('python main.py', 'ok', ['src/utils.py']));
  assert.ok(touchesEdited(null, 'ok', ['src/auth.js']), 'unknown command');
  assert.ok(touchesEdited('node --test test/math.test.js', 'ok', []), 'nothing edited');
});

test('a test for the edited file counts; a test for something else does not', () => {
  assert.ok(touchesEdited('node --test test/auth.test.js', '# pass 3', ['src/auth.js']));
  assert.ok(touchesEdited('pytest tests/test_auth_login.py', '3 passed', ['app/auth.py']));
  assert.ok(touchesEdited('node --test test/auth.test.js', 'ok', ['test/auth.test.js']), 'edited the test itself');
  assert.ok(!touchesEdited('node --test test/math.test.js', '# pass 3', ['src/auth.js'], mathProject()));
});

test('output that names the edited file counts', () => {
  assert.ok(touchesEdited('node --test test/math.test.js', 'at check (src/auth.js:4)', ['src/auth.js'], mathProject()));
});

// A project with a real test/math.test.js that has nothing to do with auth.
function mathProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-rel-'));
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'test', 'math.test.js'), "const add = require('../src/add');\n");
  return dir;
}

test('a test file that imports the edited file counts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allegedly-rel-'));
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'test', 'login.test.js'), "const { hash } = require('../src/hash');\n");
  fs.writeFileSync(path.join(dir, 'test', 'math.test.js'), "const add = require('../src/add');\n");
  assert.ok(touchesEdited('node --test test/login.test.js', 'ok', ['src/hash.js'], dir));
  assert.ok(!touchesEdited('node --test test/math.test.js', 'ok', ['src/hash.js'], dir));
});

test('an unreadable test file gets the benefit of the doubt', () => {
  assert.ok(touchesEdited('node --test test/gone.test.js', 'ok', ['src/hash.js'], path.join(os.tmpdir(), 'no-such-dir-allegedly')));
});
