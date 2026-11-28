'use strict';
// The one rule for "edits code": an edit tool on any file that isn't docs or plain text, or a
// shell command that writes a code file (sed -i, a formatter, git checkout, > src/a.js).
// Shared by the hook and the benchmark, so both count the same edits.

const os = require('os');
const path = require('path');
const { shellWrites } = require('./shell-edits');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const NON_CODE_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);
// Output sent to a file (>, tee, Set-Content) only counts when the file is source code:
// `npm test > out.log` or `node run.js > result.json` is a run saving its output, not an edit.
// Any other edit counts when the file is source code or config (CODE_EXT, CODE_NAMES). A list of
// what counts, not of what doesn't: seen live, `cp deck.pptx ~/Desktop` and copying a finished
// .xlsx counted as code edits, so every receipt before them went stale (eco-pres, stats, s22).
const SOURCE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.astro',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.swift', '.m', '.php', '.lua', '.pl', '.r', '.dart', '.ex', '.exs', '.erl', '.hs', '.clj', '.zig',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.sql', '.css', '.scss', '.sass', '.less', '.html', '.htm',
  '.jl', '.nim', '.ml', '.mli', '.fs', '.fsx', '.elm', '.groovy', '.vb', '.bat', '.cmd', '.gd', '.sol', '.wgsl', '.glsl',
]);
// Config is code too: a wrong package.json or CI file breaks the build.
const CODE_EXT = new Set([
  ...SOURCE_EXT, '.json', '.jsonc', '.json5', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.xml',
  '.gradle', '.properties', '.graphql', '.gql', '.proto', '.prisma', '.tf', '.hcl', '.nix', '.mk', '.cmake', '.ipynb',
]);
const CODE_NAMES = new Set(['dockerfile', 'makefile', 'rakefile', 'gemfile', 'justfile', 'procfile', 'vagrantfile', '.env', '.babelrc', '.eslintrc', '.prettierrc', '.npmrc', '.editorconfig']);
// Files an edit tool writes that are never code: docs, office files, data, media.
const NOT_CODE_EXT = new Set([
  ...NON_CODE_EXT, '.log', '.csv', '.tsv', '.pptx', '.ppt', '.docx', '.doc', '.xlsx', '.xls', '.odt', '.ods', '.odp',
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.mp3', '.mp4', '.wav', '.zip',
]);

// True when `file` is source code or config (by extension or name).
function isCodePath(file) {
  const base = path.basename(String(file)).toLowerCase();
  return CODE_EXT.has(path.extname(base)) || CODE_NAMES.has(base) || base.startsWith('dockerfile');
}

const shellCache = new WeakMap();

// Code files a shell tool_use block writes: null if none, else a list of paths (empty when the
// command rewrites files it doesn't name, like `git checkout main`).
function shellCodeEdits(b) {
  if (shellCache.has(b)) return shellCache.get(b);
  let files = null;
  const command = b.input && b.input.command;
  if (typeof command === 'string') {
    for (const { file, how } of shellWrites(command, b.name)) {
      const ext = file === null ? null : path.extname(file).toLowerCase();
      const code = file === null || (how === 'redirect' ? SOURCE_EXT.has(ext) : isCodePath(file));
      if (!code) continue;
      files = files || [];
      if (file !== null) files.push(file);
    }
  }
  shellCache.set(b, files);
  return files;
}

// True for a tool_use block that edits a code file (not docs).
function isCodeEdit(b) {
  if (!b || b.type !== 'tool_use') return false;
  if (SHELL_TOOLS.has(b.name)) return shellCodeEdits(b) !== null;
  if (!EDIT_TOOLS.has(b.name)) return false;
  const file = (b.input && (b.input.file_path || b.input.notebook_path)) || '';
  // An edit tool on a file with an unknown extension still counts (a language we don't list);
  // only known non-code files are left out.
  return isCodePath(file) || !NOT_CODE_EXT.has(path.extname(file).toLowerCase());
}

// The code files a tool_use block edits, by path. Call it only on blocks isCodeEdit accepts.
function editTargets(b) {
  if (SHELL_TOOLS.has(b.name)) return shellCodeEdits(b) || [];
  const file = (b.input && (b.input.file_path || b.input.notebook_path)) || '';
  return file ? [file] : [];
}

// Tool calls that never ran: denied by the permission mode, or rejected by the user. A denied
// `cat > scratch/store.js` changed nothing, so it mustn't make earlier receipts stale (benchmark 05, s9).
const NOT_RUN = /^\s*(?:Permission to use \S+ has been denied|The user doesn't want to proceed with this tool use)/;

function resultText(b) {
  if (typeof b.content === 'string') return b.content;
  return Array.isArray(b.content) ? b.content.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('\n') : '';
}

// One spelling for paths from Windows, Git Bash and POSIX: c:/users/x, lower case.
function canon(p) {
  return String(p).replace(/\\/g, '/').replace(/^\/([a-z])\//i, '$1:/').replace(/\/+$/, '').toLowerCase();
}

// Places a path a shell command writes, using the command's own text: `S="/tmp/x"; … > "$S/a.html"`
// expands $S, and `cd /tmp/x && sed -i … a.py` puts a.py in /tmp/x. Only plain assignments and a
// leading cd; anything else is left as it was. Seen live (s22): Claude's scratch scripts and
// screenshot pages, written this way, counted as project edits and made fresh receipts stale.
function placePath(file, command) {
  const vars = {};
  const twice = new Set(); // a variable set more than once can't be placed
  for (const m of command.matchAll(/(?:^|[;&|\n]\s*|\s)([A-Za-z_]\w*)=(?:"([^"$`]*)"|'([^']*)'|([^\s;&|"'$`]+))/g)) {
    if (m[1] in vars) twice.add(m[1]);
    vars[m[1]] = m[2] ?? m[3] ?? m[4];
  }
  let f = String(file).replace(/\$\{?([A-Za-z_]\w*)\}?/g, (all, name) => (name in vars && !twice.has(name) ? vars[name] : all));
  const cd = command.match(/^\s*(?:[A-Za-z_]\w*=\S+\s*;\s*)*cd\s+(?:"([^"$`]+)"|'([^']+)'|([^\s;&|"'$`]+))\s*(?:&&|;)/);
  const dir = cd && (cd[1] || cd[2] || cd[3]);
  if (dir && !/[$%]/.test(f) && !path.isAbsolute(f) && !/^\/[a-z]\//i.test(f) && !/^~/.test(f)) f = `${dir.replace(/[\\/]+$/, '')}/${f}`;
  return f;
}

// Resolves `.` and `..`, so /tmp/x/../../proj/a.py can't pass for a scratch file.
function resolveDots(p) {
  return path.posix.normalize(String(p).replace(/\\/g, '/'));
}

// True when every file the block edits is a scratch copy: in the temp folder, outside the project.
// Seen in the benchmark (task 04): Claude wrote a test into %TEMP%/addmonths-check to try an idea.
// Paths with variables ($D/store.js) can't be placed, so they still count. Needs `cwd`.
function scratchOnly(b, cwd) {
  if (!cwd) return false;
  const command = SHELL_TOOLS.has(b.name) && b.input && typeof b.input.command === 'string' ? b.input.command : '';
  const files = editTargets(b).map((f) => (command ? placePath(f, command) : f));
  if (!files.length) return false; // git checkout and friends: files unknown
  const project = canon(cwd);
  const temps = [canon(os.tmpdir()), '/tmp', '/var/tmp'];
  return files.every((f) => {
    if (/[$%]/.test(f) || !path.isAbsolute(f) && !/^\/[a-z]\//i.test(f)) return false;
    const c = canon(resolveDots(f));
    return !(c === project || c.startsWith(project + '/')) && temps.some((t) => c.startsWith(t + '/'));
  });
}

// A fixer script Claude writes and runs (python fix.py) edits files from inside, out of sight of
// the command. So running a script that Claude wrote or edited this turn counts as an edit when
// the script's new text writes files. Scripts already in the project are runs, as before.
const SCRIPT_EXT = /\.(?:py|js|mjs|cjs|ts|mts|rb|pl|sh|bash|ps1)$/i;
const WRITES_FILES = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|write_text|write_bytes|WriteAll\w*|Set-Content|Add-Content|Out-File|File\.write|IO\.write)\b|\bopen\([^)]*,\s*(?:mode\s*=\s*)?['"][wax]|\bsed\s+-i|\bshutil\.(?:copy|move)/;
const RUNNERS = new Set(['python', 'python3', 'py', 'node', 'ruby', 'perl', 'bash', 'sh', 'zsh', 'tsx', 'ts-node', 'bun', 'deno', 'run', 'pwsh', 'powershell', '&', '.', 'source', 'uv']);

function blocksOf(e) {
  const c = e && e.message && e.message.content;
  return Array.isArray(c) ? c : [];
}

// Canonical paths of scripts written or edited this turn whose new text writes files.
function fileWritingScripts(entries) {
  const text = new Map();
  for (const e of entries) {
    if (!e || e.type !== 'assistant') continue;
    for (const b of blocksOf(e)) {
      if (!b || b.type !== 'tool_use' || !EDIT_TOOLS.has(b.name)) continue;
      const i = b.input || {};
      const file = i.file_path || '';
      if (!SCRIPT_EXT.test(file)) continue;
      const added = b.name === 'Write' ? i.content : b.name === 'MultiEdit' ? (i.edits || []).map((x) => x.new_string).join('\n') : i.new_string;
      text.set(canon(file), `${text.get(canon(file)) || ''}\n${added || ''}`);
    }
  }
  return [...text].filter(([, t]) => WRITES_FILES.test(t) && mayWriteCode(t)).map(([f]) => f);
}

// File names in a script's string literals: 'deck.pptx', "src/a.js", `*.ts`.
const NAMED_FILE = /['"`][^'"`\n]*?(\.[A-Za-z0-9]{1,8})['"`]/g;

// A script that only names office, data or media files (build_deck.py saving deck.pptx) makes
// deliverables, not code: seen live in the dsmm-ppt and stats sessions (s22). One that names a
// code file, uses sed -i, or names no file at all (paths built at run time) may write code.
function mayWriteCode(text) {
  if (/\bsed\s+-i/.test(text)) return true;
  const exts = [...text.matchAll(NAMED_FILE)].map((m) => m[1].toLowerCase());
  if (exts.some((e) => SOURCE_EXT.has(e))) return true;
  return !exts.some((e) => NOT_CODE_EXT.has(e));
}

// True when a shell block runs one of `scripts`: `python fix.py`, `node -r x scripts/fix.js`, `./fix.sh`, `& .\fix.ps1`.
function runsScript(b, scripts) {
  if (!scripts.length || !b || b.type !== 'tool_use' || !SHELL_TOOLS.has(b.name)) return false;
  const words = String((b.input && b.input.command) || '').split(/[\s;|()]+|&&/).map((w) => w.replace(/^['"]+|['"]+$/g, '')).filter(Boolean);
  return words.some((w, j) => {
    if (!SCRIPT_EXT.test(w)) return false;
    const c = canon(w).replace(/^\.\//, '');
    if (!scripts.some((s) => s === c || s.endsWith('/' + c))) return false;
    if (/^\.{1,2}[\\/]/.test(w) && (j === 0 || !/^-/.test(words[j - 1]))) return true; // ./fix.sh
    let k = j - 1;
    while (k >= 0 && /^-/.test(words[k])) k--; // runner flags: python -u, pwsh -File
    return k >= 0 && RUNNERS.has(path.basename(words[k]).toLowerCase().replace(/\.exe$/, ''));
  });
}

// isCodeEdit, minus the calls in `entries` that never ran, and (given `cwd`) scratch copies.
// Plus runs of file-writing scripts Claude wrote this turn.
function ranCodeEdit(entries, isCodeEditFn = isCodeEdit, { cwd } = {}) {
  const notRun = new Set();
  for (const e of entries) {
    const c = e && e.type === 'user' && e.message && e.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b && b.type === 'tool_result' && b.is_error && NOT_RUN.test(resultText(b))) notRun.add(b.tool_use_id);
  }
  const scripts = fileWritingScripts(entries);
  return (b) => (isCodeEditFn(b) || runsScript(b, scripts)) && !(b.id && notRun.has(b.id)) && !scratchOnly(b, cwd);
}

module.exports = { isCodeEdit, ranCodeEdit, editTargets, runsScript, fileWritingScripts, EDIT_TOOLS, NON_CODE_EXT };
