'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { shellWrites } = require('../hooks/lib/shell-edits');
const { isCodeEdit, editTargets, ranCodeEdit } = require('../hooks/lib/edits');

const bash = (command, name = 'Bash', id = 'b1') => ({ type: 'tool_use', id, name, input: { command } });
const edits = (command, name) => {
  const b = bash(command, name);
  return isCodeEdit(b) ? editTargets(b) : null;
};

test('in-place edits name their files', () => {
  assert.deepStrictEqual(edits("sed -i 's/floor/round/' parse.js"), ['parse.js']);
  assert.deepStrictEqual(edits("sed -i.bak -e 's/a/b/' -e 's/c/d/' a.js b.ts"), ['a.js', 'b.ts']);
  assert.deepStrictEqual(edits("perl -pi -e 's/a/b/' src/x.py"), ['src/x.py']);
  assert.deepStrictEqual(edits('npx prettier --write src/a.js'), ['src/a.js']);
  assert.deepStrictEqual(edits('npx eslint --fix .'), []);
  assert.deepStrictEqual(edits('npx prettier --write "src/**/*.ts" src/a.ts'), ['src/a.ts']);
  assert.deepStrictEqual(edits('black app.py'), ['app.py']);
  assert.deepStrictEqual(edits('gofmt -w main.go'), ['main.go']);
});

test('redirects into source files count, heredocs included', () => {
  assert.deepStrictEqual(edits("cat > dates.js <<'EOF'\nif (a > b) x();\nconst f = (y) => y;\nEOF"), ['dates.js']);
  assert.deepStrictEqual(edits('echo "module.exports = 1" >> src/a.js'), ['src/a.js']);
  assert.deepStrictEqual(edits('node gen.js | tee src/out.ts'), ['src/out.ts']);
  assert.deepStrictEqual(edits("(Get-Content math.js) -replace 'i = 0','i = 1' | Set-Content math.js", 'PowerShell'), ['math.js']);
  assert.deepStrictEqual(edits('"x" | Out-File -FilePath app.ps1', 'PowerShell'), ['app.ps1']);
  assert.deepStrictEqual(edits(`node -e "require('fs').writeFileSync('src/a.js', code)"`), ['src/a.js']);
});

test('git commands that rewrite the working tree count, with or without named files', () => {
  assert.deepStrictEqual(edits('git checkout -- src/a.js'), ['src/a.js']);
  assert.deepStrictEqual(edits('git checkout main'), []);
  assert.deepStrictEqual(edits('git restore src/a.js'), ['src/a.js']);
  assert.deepStrictEqual(edits('git restore .'), []);
  assert.deepStrictEqual(edits('git stash'), []);
  assert.deepStrictEqual(edits('git reset --hard HEAD~1'), []);
  assert.deepStrictEqual(edits('git pull'), []);
  assert.deepStrictEqual(edits('cargo fmt'), []);
});

test('copy, move and delete count for code files only', () => {
  assert.deepStrictEqual(edits('cp fixed.js src/a.js'), ['src/a.js']);
  assert.deepStrictEqual(edits('mv old.py new.py'), ['old.py', 'new.py']);
  assert.deepStrictEqual(edits('rm src/legacy.js'), ['src/legacy.js']);
  assert.strictEqual(edits('rm -rf node_modules dist'), null);
  assert.strictEqual(edits('rm -rf "/tmp/probe" "/tmp/shot.png"; echo cleaned'), null);
});

test('test runs, reads and output files are not edits (commands from the benchmark)', () => {
  for (const c of [
    'npm test 2>&1 | tail -15',
    'node --test test/ 2>&1 | tail -n 25',
    'npm test 2>&1 | grep -E "^# (pass|fail)"',
    `node -e 'const {addMonths:a}=require("./dates.js");const o=new Date(2026,0,31);console.log(a(o,1) > o)'`,
    'ls -la && cat store.js && echo ---- && cat test/store.test.js 2>/dev/null',
    'which chromium google-chrome 2>/dev/null',
    'npm test > out.log 2>&1',
    'node run.js > result.json',
    'npm test *> $null',
    'sed -n 1,20p src/a.js',
    "sed 's/a/b/' src/a.js > /dev/null",
    'git status && git diff src/a.js',
    'git checkout -b fix-dates',
    'git restore --staged src/a.js',
    'git stash list',
    'git apply --check fix.patch',
    'npx prettier --check .',
    'ruff check src',
    'cargo fmt --check',
    'black --check app.py',
    'echo "a > b.js"',
  ]) assert.strictEqual(edits(c), null, c);
  assert.strictEqual(edits('npm test *> $null', 'PowerShell'), null);
});

test('only redirect targets need a source extension; fd copies are never targets', () => {
  assert.deepStrictEqual(shellWrites('npm test 2>&1 >&2'), []);
  assert.deepStrictEqual(shellWrites('node a.js > out.log').map((w) => w.how), ['redirect']);
  assert.strictEqual(edits('node a.js > out.log'), null);
});

test('a denied shell edit never ran, so it is not an edit', () => {
  const b = bash("sed -i 's/a/b/' src/a.js", 'Bash', 'd1');
  const denied = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'd1', is_error: true, content: "Permission to use Bash has been denied because Claude Code is running in don't ask mode." }] } };
  assert.strictEqual(ranCodeEdit([{ type: 'assistant', message: { content: [b] } }, denied])(b), false);
  const failed = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'd1', is_error: true, content: 'Exit code 1' }] } };
  assert.strictEqual(ranCodeEdit([failed])(b), true); // it ran; a failing exit code may still have edited
});

test('scratch copies in the temp folder, outside the project, are not edits (needs cwd)', () => {
  const os = require('os');
  const path = require('path');
  const tmp = os.tmpdir().replace(/\\/g, '/');
  const project = path.join(os.homedir(), 'code', 'app');
  const run = (b) => ranCodeEdit([], isCodeEdit, { cwd: project })(b);
  const write = (file) => ({ type: 'tool_use', id: 'w', name: 'Write', input: { file_path: file } });
  assert.strictEqual(run(write(`${tmp}/addmonths-check/addmonths.test.js`)), false);
  assert.strictEqual(run(bash(`cat > "${tmp}/probe/store.js" <<'EOF'\nx\nEOF`)), false);
  assert.strictEqual(run(bash("cat > /tmp/probe.js <<'EOF'\nx\nEOF")), false);
  // still edits: inside the project, outside temp (a sibling package), variables, unknown targets, no cwd
  assert.strictEqual(run(write(path.join(project, 'src', 'a.js'))), true);
  assert.strictEqual(run(write(path.join(os.homedir(), 'code', 'shared', 'util.js'))), true);
  assert.strictEqual(run(bash('cat > "$D/store.js" <<\'EOF\'\nx\nEOF')), true);
  assert.strictEqual(run(bash('git checkout main')), true);
  assert.strictEqual(ranCodeEdit([])(write(`${tmp}/probe/a.js`)), true);
  // a project that itself lives in temp (the benchmark's own folders) still counts
  assert.strictEqual(ranCodeEdit([], isCodeEdit, { cwd: `${tmp}/bench-x` })(write(`${tmp}/bench-x/a.js`)), true);
});
