'use strict';
// Risk 22, partial fix: a receipt from a test run should touch the files Claude edited.
//
// Only judged when the command names specific test files ("node --test test/math.test.js").
// Whole-suite runs (npm test, pytest, go test ./...) and running the program itself
// always pass: we can't tell what they touch, and a false alarm costs more than a miss.
//
// A targeted test touches an edited file when any of these holds:
//   - its name matches (auth.test.js, test_auth.py, AuthTest.java ↔ auth.js / auth.py / Auth.java)
//   - it is the edited file
//   - the run's output mentions the edited file's name (stack traces, coverage)
//   - the test file on disk mentions the edited file's name (an import), read up to 256 KB

const fs = require('fs');
const path = require('path');

const MAX_TEST_FILE_BYTES = 256 * 1024;
const TEST_DIRS = new Set(['test', 'tests', 'spec', 'specs', '__tests__']);
const NEUTRAL = new Set(['cd', 'set-location', 'pushd', 'popd', 'export', 'set']);

function slash(p) {
  return String(p).replace(/\\/g, '/');
}

// "auth.test.js" -> "auth", "test_auth.py" -> "auth", "AuthTest.java" -> "auth"
function core(file) {
  return path.posix
    .basename(slash(file))
    .replace(/\..*$/, '') // drop every extension: auth.test.js -> auth
    .replace(/(?:Tests?|Spec)$/, '') // FooTest, FooSpec
    .replace(/^(?:test|spec)[_-]/i, '')
    .replace(/[_.-](?:test|spec)s?$/i, '')
    .toLowerCase();
}

function looksLikeTestFile(p) {
  const s = slash(p);
  if (!/\.[A-Za-z0-9]{1,6}$/.test(s)) return false; // a file, not a folder or a pattern
  const parts = s.split('/');
  const base = parts[parts.length - 1];
  if (parts.slice(0, -1).some((d) => TEST_DIRS.has(d.toLowerCase()))) return true;
  return /(?:^|[._-])(?:test|spec)s?(?:[._-]|$)/i.test(base) || /^test/i.test(base) || /[a-z](?:Tests?|Spec)\.\w+$/.test(base);
}

// Test files a shell command names, e.g. "cd app && node --test test/a.test.js" -> ["test/a.test.js"]
function targetedTests(command) {
  const found = [];
  for (const part of String(command || '').split(/&&|\|\||[;|\n]/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0 || NEUTRAL.has(words[0].toLowerCase())) continue;
    for (let w of words.slice(1)) {
      w = w.replace(/^['"]|['"]$/g, '');
      if (w.startsWith('-')) {
        const eq = w.indexOf('=');
        if (eq === -1) continue;
        w = w.slice(eq + 1);
      }
      w = w.replace(/::.*$/, '').replace(/:\d+(?::\d+)?$/, ''); // pytest node ids, file:line
      if (w.includes('*') || w.includes('...')) continue; // globs and go's ./... mean "many"
      if (looksLikeTestFile(w)) found.push(w);
    }
  }
  return found;
}

function sameCore(a, b) {
  if (a.length < 3 || b.length < 3) return a === b;
  return a === b || a.includes(b) || b.includes(a);
}

function testFileMentions(testPath, names, cwd) {
  try {
    const full = path.resolve(cwd || process.cwd(), testPath);
    const st = fs.statSync(full);
    if (!st.isFile() || st.size > MAX_TEST_FILE_BYTES) return false;
    const text = fs.readFileSync(full, 'utf8').toLowerCase();
    return names.some((n) => n.length >= 3 && text.includes(n));
  } catch {
    return true; // can't read it: don't punish
  }
}

// True if a run of `command` (with output `output`, already normalised) touches any edited file,
// or if we can't tell. `edited` is a list of file paths. `cwd` resolves the test paths.
function touchesEdited(command, output, edited, cwd) {
  if (!command || edited.length === 0) return true;
  const tests = targetedTests(command);
  if (tests.length === 0) return true; // whole suite or not a test run
  const editedCores = edited.map(core);
  const editedNames = edited.map((e) => path.posix.basename(slash(e)).toLowerCase());
  const out = String(output || '').toLowerCase();
  if (editedNames.some((n) => out.includes(n))) return true;
  return tests.some((t) => {
    const tc = core(t);
    if (editedCores.some((ec) => sameCore(tc, ec))) return true;
    if (edited.some((e) => slash(e).toLowerCase().endsWith(slash(t).replace(/^\.\//, '').toLowerCase()))) return true;
    return testFileMentions(t, [...editedCores, ...editedNames.map((n) => n.replace(/\.[^.]+$/, ''))], cwd);
  });
}

module.exports = { touchesEdited, targetedTests, looksLikeTestFile, core };
