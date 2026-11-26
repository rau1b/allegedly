'use strict';
// The one rule for "edits code": an edit tool on any file that isn't docs or plain text, or a
// shell command that writes a code file (sed -i, a formatter, git checkout, > src/a.js).
// Shared by the hook and the benchmark, so both count the same edits.

const path = require('path');
const { shellWrites } = require('./shell-edits');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const NON_CODE_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);
// A shell command that changes a file directly (sed -i, rm, cp) counts unless the file is docs
// or one of these: logs, backups, images and archives. A file with no extension is usually a folder.
const NOT_CODE_EXT = new Set([...NON_CODE_EXT, '.log', '.out', '.err', '.tmp', '.bak', '.orig', '.rej', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz', '.tar', '.lock']);
// Output sent to a file (>, tee, Set-Content) only counts when the file is source code:
// `npm test > out.log` or `node run.js > result.json` is a run saving its output, not an edit.
const SOURCE_EXT = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx', '.vue', '.svelte', '.astro',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.c', '.h', '.cc', '.cpp', '.hpp', '.cs',
  '.swift', '.m', '.php', '.lua', '.pl', '.r', '.dart', '.ex', '.exs', '.erl', '.hs', '.clj', '.zig',
  '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.sql', '.css', '.scss', '.sass', '.less', '.html', '.htm',
]);

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
      const code = file === null || (how === 'redirect' ? SOURCE_EXT.has(ext) : ext !== '' && !NOT_CODE_EXT.has(ext));
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
  return !NON_CODE_EXT.has(path.extname(file).toLowerCase());
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

// isCodeEdit, minus the calls in `entries` that never ran.
function ranCodeEdit(entries, isCodeEditFn = isCodeEdit) {
  const notRun = new Set();
  for (const e of entries) {
    const c = e && e.type === 'user' && e.message && e.message.content;
    if (!Array.isArray(c)) continue;
    for (const b of c) if (b && b.type === 'tool_result' && b.is_error && NOT_RUN.test(resultText(b))) notRun.add(b.tool_use_id);
  }
  return (b) => isCodeEditFn(b) && !(b.id && notRun.has(b.id));
}

module.exports = { isCodeEdit, ranCodeEdit, editTargets, EDIT_TOOLS, NON_CODE_EXT };
