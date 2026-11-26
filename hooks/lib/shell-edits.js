'use strict';
// What files a shell command writes: sed -i, redirects, tee, Set-Content, cp/mv/rm, formatters,
// git commands that rewrite the working tree, and inline scripts that write a named file.
//
// Conservative on purpose. A test run mistaken for an edit would make every receipt from it look
// stale, so only clear write patterns count. A script we can't see into (python fix.py) never does.
//
// Returns [{ file, how }]: `how` is 'redirect' (output sent to a file, which may be a log) or
// 'direct' (the command changes that file). `file` is null when the command rewrites files we
// can't name, like `git checkout main` or `prettier --write .`. edits.js decides what counts as code.

const path = require('path');

const NULL_SINKS = /^(?:\/dev\/(?:null|stdout|stderr|tty)|nul|\$null|con)$/i;
// Wrappers that run the next word as the real command.
const WRAPPERS = new Set(['sudo', 'command', 'builtin', 'env', 'time', 'nohup', 'exec', 'npx', 'bunx', 'pnpx']);

// Drop heredoc bodies (`cat > a.js <<'EOF' … EOF`): their text is file content, not shell.
function stripHeredocs(cmd) {
  const lines = cmd.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const ends = [...lines[i].matchAll(/<<-?\s*(['"]?)([A-Za-z_]\w*)\1/g)].map((m) => m[2]);
    for (const end of ends) {
      while (i + 1 < lines.length && lines[i + 1].trim() !== end) i++;
      i++; // the terminator line
    }
  }
  return out.join('\n');
}

// Splits a command into simple commands: [{ words, redirects }]. Quotes are honoured, so a `>`
// inside `node -e "a > b"` is not a redirect. `ps` switches the escape character to a backtick.
function parse(command, ps) {
  const src = stripHeredocs(String(command));
  const cmds = [];
  let cur = { words: [], redirects: [] };
  let word = null; // null: no word started
  let pending = null; // 'out' | 'in': the next word is a redirect target
  const esc = ps ? '`' : '\\';

  const endWord = () => {
    if (word === null) return;
    if (pending === 'out') cur.redirects.push(word);
    else if (pending !== 'in') cur.words.push(word);
    pending = null;
    word = null;
  };
  const endCmd = () => {
    endWord();
    if (cur.words.length || cur.redirects.length) cmds.push(cur);
    cur = { words: [], redirects: [] };
    pending = null;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      word = (word || '') + src.slice(i + 1, end === -1 ? src.length : end);
      i = end === -1 ? src.length : end;
    } else if (c === '"') {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== '"') {
        if (src[j] === esc && j + 1 < src.length) j++;
        s += src[j++];
      }
      word = (word || '') + s;
      i = j;
    } else if (c === esc && next !== undefined && (ps || /[\s"'\\$&|;<>()`]/.test(next))) {
      word = (word || '') + next;
      i++;
    } else if (c === ' ' || c === '\t' || c === '\r') {
      endWord();
    } else if (c === '#' && word === null) {
      while (i + 1 < src.length && src[i + 1] !== '\n') i++; // comment
    } else if (c === '\n' || c === ';' || c === '|' || c === '(' || c === ')' || (c === '&' && next !== '>')) {
      if ((c === '|' || c === '&') && next === c) i++;
      endCmd();
    } else if (c === '>' || (c === '&' && next === '>')) {
      // A file descriptor right before it (2>, *>) belongs to the redirect, not the command.
      if (word !== null && /^(?:\d|\*)$/.test(word)) word = null;
      endWord();
      if (c === '&') i++;
      while (src[i + 1] === '>' || src[i + 1] === '|') i++;
      if (src[i + 1] === '&') {
        i++; // 2>&1, >&2: a copy of another stream, not a file
        while (/[\d-]/.test(src[i + 1] || '')) i++;
      } else pending = 'out';
    } else if (c === '<') {
      endWord();
      while (src[i + 1] === '<') i++;
      pending = 'in';
    } else {
      if (c === '$' && next === '(') {
        endCmd();
        i++;
        continue;
      }
      word = (word || '') + c;
    }
  }
  endCmd();
  return cmds;
}

function base(word) {
  return path.basename(String(word).replace(/\\/g, '/')).toLowerCase().replace(/\.(?:exe|cmd|bat)$/, '');
}

// Drops env assignments and wrappers (sudo, npx, pnpm exec, python -m …) so words[0] is the tool.
function unwrap(words) {
  let w = words.slice();
  for (;;) {
    while (w.length && /^[A-Za-z_]\w*=/.test(w[0])) w = w.slice(1);
    if (!w.length) return w;
    const name = base(w[0]);
    if (WRAPPERS.has(name)) {
      w = w.slice(1);
      while (w.length && w[0].startsWith('-')) w = w.slice(1); // npx --yes prettier
    }
    else if (['pnpm', 'yarn', 'npm', 'bun', 'uv', 'poetry', 'pipx'].includes(name) && ['exec', 'dlx', 'run', 'x'].includes(w[1])) w = w.slice(2);
    else if (/^(?:python[\d.]*|py)$/.test(name) && w[1] === '-m') w = w.slice(2);
    else return w;
  }
}

// Positional arguments: words that aren't flags, skipping the values of flags in `takesValue`.
function positionals(args, takesValue = new Set()) {
  const out = [];
  let rest = false;
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (rest) out.push(a);
    else if (a === '--') rest = true;
    else if (a.startsWith('-') && a.length > 1) {
      if (takesValue.has(a.toLowerCase())) k++;
    } else out.push(a);
  }
  return out;
}

const has = (args, ...flags) => args.some((a) => flags.some((f) => (f instanceof RegExp ? f.test(a) : a === f)));
const direct = (files) => (files.length ? files : [null]).map((file) => ({ file, how: 'direct' }));
// For formatters and git: a folder or glob (".", "src") means files we can't name.
const named = (files) => direct(files.map((f) => (path.extname(f) && !f.includes('*') ? f : null)));
const UNKNOWN = [{ file: null, how: 'direct' }];

// Flag value of a PowerShell parameter, by any of its names (-Path, -FilePath, -LiteralPath).
function psParam(args, names) {
  for (let k = 0; k < args.length - 1; k++) if (names.includes(args[k].toLowerCase())) return args[k + 1];
  return null;
}

const PS_VALUE_FLAGS = new Set(['-path', '-literalpath', '-filepath', '-destination', '-value', '-encoding', '-newname', '-itemtype', '-filter', '-include', '-exclude']);

function gitWrites(args) {
  const words = positionals(args, new Set(['-c', '-C']));
  const sub = words[0];
  const rest = args.slice(args.indexOf(sub) + 1);
  const pos = positionals(rest, new Set(['-b', '-B', '-c', '-C', '--orphan', '-s', '--source', '-m']));
  const dash = rest.indexOf('--');
  const paths = dash === -1 ? [] : rest.slice(dash + 1);
  switch (sub) {
    case 'checkout':
    case 'switch':
      if (!pos.length) return []; // git checkout -b new-branch: same files
      return paths.length ? named(paths) : UNKNOWN;
    case 'restore':
      if (has(rest, '--staged', '-S') && !has(rest, '--worktree', '-W')) return [];
      return named(pos);
    case 'reset':
      return has(rest, '--hard', '--merge', '--keep') ? UNKNOWN : [];
    case 'stash':
      return !pos.length || ['push', 'pop', 'apply', 'save', 'branch'].includes(pos[0]) ? UNKNOWN : [];
    case 'apply':
      return has(rest, '--check', '--stat', '--numstat', '--summary', '--cached') ? [] : UNKNOWN;
    case 'rm':
      return has(rest, '--cached') ? [] : direct(pos);
    case 'mv':
      return direct(pos);
    case 'clean':
      return has(rest, /^-\w*[fx]/, '--force') && !has(rest, /^-\w*n/, '--dry-run') ? UNKNOWN : [];
    case 'pull':
    case 'merge':
    case 'rebase':
    case 'cherry-pick':
    case 'revert':
    case 'am':
      return UNKNOWN;
    default:
      return [];
  }
}

// Formatters and fixers that rewrite files in place. Each returns null when this run only checks.
function formatterWrites(name, args) {
  const pos = positionals(args, new Set(['--config', '-c', '--ignore-path', '--parser', '--line-length', '-l', '--ext']));
  const on = (cond, files = pos) => (cond ? named(files) : null);
  switch (name) {
    case 'prettier':
      return on(has(args, '--write', '-w'));
    case 'eslint':
    case 'stylelint':
    case 'standard':
    case 'xo':
      return on(has(args, '--fix'));
    case 'black':
    case 'rustfmt':
      return on(!has(args, '--check', '--diff'));
    case 'isort':
      return on(!has(args, '--check-only', '--check', '-c', '--diff'));
    case 'autopep8':
    case 'yapf':
      return on(has(args, '-i', '--in-place'));
    case 'ruff':
      if (pos[0] === 'format') return on(!has(args, '--check', '--diff'), pos.slice(1));
      return on(has(args, '--fix'), pos[0] === 'check' ? pos.slice(1) : pos);
    case 'gofmt':
    case 'goimports':
    case 'shfmt':
      return on(has(args, '-w'));
    case 'clang-format':
      return on(has(args, '-i'));
    case 'rubocop':
      return on(has(args, '-a', '-A', /^--auto-?correct/));
    case 'ktlint':
      return on(has(args, '-F', '--format'));
    case 'swiftformat':
      return on(!has(args, '--lint', '--dryrun'));
    case 'biome':
      return on(has(args, '--write', '--apply', '--apply-unsafe', '--fix'), pos.slice(1));
    case 'dprint':
      return on(pos[0] === 'fmt', pos.slice(1));
    case 'php-cs-fixer':
      return on(pos[0] === 'fix' && !has(args, '--dry-run'), pos.slice(1));
    case 'go':
      return on(pos[0] === 'fmt' || pos[0] === 'fix', []);
    case 'cargo':
      return on((pos[0] === 'fmt' && !has(args, '--check')) || pos[0] === 'fix' || (pos[0] === 'clippy' && has(args, '--fix')), []);
    case 'dotnet':
      return on(pos[0] === 'format' && !has(args, '--verify-no-changes'), []);
    case 'terraform':
      return on(pos[0] === 'fmt' && !has(args, '-check'), []);
    case 'mix':
      return on(pos[0] === 'format' && !has(args, '--check-formatted'), []);
    default:
      return null;
  }
}

// The writes of one simple command.
function commandWrites(words, ps) {
  const w = unwrap(words);
  if (!w.length) return [];
  const name = base(w[0]);
  const args = w.slice(1);
  switch (name) {
    case 'sed': {
      if (!has(args, /^-[a-zA-Z]*i/, /^--in-place/)) return [];
      const pos = positionals(args, new Set(['-e', '-f', '--expression', '--file']));
      return direct(has(args, '-e', '-f', /^--expression/, /^--file/) ? pos : pos.slice(1));
    }
    case 'perl':
    case 'ruby': {
      if (!has(args, /^-[a-zA-Z]*i/)) return [];
      // -e, -pe, -pie take the script as the next word; without one, the first positional is a script file.
      const pos = [];
      let script = false;
      for (let k = 0; k < args.length; k++) {
        if (/^-[a-zA-Z]*[eE]$/.test(args[k])) (script = true), k++;
        else if (!args[k].startsWith('-')) pos.push(args[k]);
      }
      return direct(script ? pos : pos.slice(1));
    }
    case 'tee':
      return positionals(args).map((file) => ({ file, how: 'redirect' }));
    case 'tee-object': {
      const f = psParam(args, ['-filepath', '-path', '-literalpath']);
      return f ? [{ file: f, how: 'redirect' }] : [];
    }
    case 'set-content':
    case 'add-content':
    case 'out-file':
    case 'sc':
    case 'ac': {
      if ((name === 'sc' || name === 'ac') && !ps) return [];
      const f = psParam(args, ['-path', '-filepath', '-literalpath']) || positionals(args, PS_VALUE_FLAGS)[0];
      return f ? [{ file: f, how: 'redirect' }] : [];
    }
    case 'cp':
    case 'copy':
    case 'copy-item':
    case 'cpi': {
      const pos = positionals(args, new Set([...PS_VALUE_FLAGS, '-t', '--target-directory']));
      const dest = psParam(args, ['-destination', '-t', '--target-directory']) || pos.pop();
      if (!dest) return [];
      if (path.extname(dest)) return direct([dest]);
      return direct(pos.map((s) => path.join(dest, path.basename(s))));
    }
    case 'mv':
    case 'move':
    case 'move-item':
    case 'mi':
    case 'ren':
    case 'rename':
    case 'rename-item':
    case 'rm':
    case 'del':
    case 'erase':
    case 'unlink':
    case 'remove-item':
    case 'ri': {
      const named = ['-path', '-literalpath', '-destination', '-newname'].map((p) => psParam(args, [p])).filter(Boolean);
      return direct([...named, ...positionals(args, PS_VALUE_FLAGS)]).filter((x) => x.file !== null);
    }
    case 'git':
      return gitWrites(args);
    case 'patch':
      return has(args, '--dry-run') ? [] : UNKNOWN;
    default:
      return formatterWrites(name, args) || [];
  }
}

// Inline scripts that write a named file: node -e "fs.writeFileSync('a.js', …)", python -c "open('a.py','w')",
// [IO.File]::WriteAllText('a.js', …). Only the literal file name is seen; edits.js checks the extension.
const INLINE_WRITES = [
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile)\(\s*(['"`])([^'"`]+)\1/g,
  /\bopen\(\s*(['"])([^'"]+)\1\s*,\s*['"][wax]/g,
  /\[(?:System\.)?IO\.File\]::(?:Write|Append)All\w*\(\s*(['"])([^'"]+)\1/gi,
];

// Every file the command writes, as [{ file, how }]. `shell` is the tool name: 'Bash' or 'PowerShell'.
function shellWrites(command, shell = 'Bash') {
  const ps = shell === 'PowerShell';
  const out = [];
  for (const { words, redirects } of parse(command, ps)) {
    for (const r of redirects) if (!NULL_SINKS.test(r)) out.push({ file: r, how: 'redirect' });
    out.push(...commandWrites(words, ps));
  }
  for (const re of INLINE_WRITES) for (const m of String(command).matchAll(re)) out.push({ file: m[2], how: 'redirect' });
  return out.filter((x) => x.file === null || !NULL_SINKS.test(x.file));
}

module.exports = { shellWrites, parse };
