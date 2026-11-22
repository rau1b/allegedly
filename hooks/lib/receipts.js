'use strict';
// Checks that each `verified` receipt quotes real tool output from after the last code edit.
// A receipt is `command → output`. The output part must appear in one tool result (case,
// whitespace and colour codes ignored). `…` or `...` may skip text, but every piece must
// still appear, in order, in that same result.
//
// The tool call behind a matching result matters too:
//   forged - Claude printed the text itself (echo "14 passed"), so it proves nothing
//   weak   - the output came only from reading or listing files (ls, cat, Read), not a run

const { touchesEdited } = require('./related');

const MIN_OUTPUT_CHARS = 3; // "ok" alone proves too little to match on

// Compact form: "🧾 1 receipt · npm test → 14 passed". The footer "🧾 2 receipts · 1 allegedly" has no arrow.
const COMPACT = /🧾\s*\d+\s+receipts?\s*·\s*(.+)$/;
// Table row: "  verified   Test passes   npm test auth → 14 passed". Columns are 2+ spaces apart.
const TABLE_ROW = /^\s*verified\s{2,}(.+?)\s{2,}(.+)$/;

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const ELLIPSIS = /…|\.{3}/;

// Tools that only read or list. Their output shows what a file says, not that code works.
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
// Shell commands that only display or list. A command made only of these (and neutral ones) is weak.
const READ_COMMANDS = new Set([
  'ls', 'dir', 'cat', 'type', 'head', 'tail', 'less', 'more', 'bat', 'wc', 'stat', 'file', 'tree',
  'find', 'grep', 'rg', 'ag', 'egrep', 'fgrep', 'pwd', 'which', 'where', 'whereis', 'echo', 'printf',
  'get-content', 'gc', 'get-childitem', 'gci', 'select-string', 'sls', 'write-output', 'write-host',
  'test-path', 'resolve-path', 'get-item', 'gi', 'jq', 'sort', 'uniq', 'cut', 'awk', 'sed',
]);
const READ_GIT = /^git\s+(?:status|log|diff|show|branch|ls-files|blame|remote)\b/;
const NEUTRAL_COMMANDS = new Set(['cd', 'set-location', 'pushd', 'popd', 'export', 'set', 'true', ':', 'clear', 'cls']);
// Ways to print text you typed yourself.
const PRINTERS = /\b(?:echo|printf|print|puts|write-output|write-host|console\.log)\b|\bcat\s*<<|\bcat\s*>|\bout-host\b/i;

function normalize(s) {
  return String(s)
    .replace(ANSI, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function splitReceipt(receipt) {
  const i = receipt.indexOf('→');
  if (i === -1) return { command: receipt.trim(), output: '' };
  // Claude sometimes wraps the output in backticks; drop them.
  const output = receipt.slice(i + 1).trim().replace(/^`+|`+$/g, '').trim();
  return { command: receipt.slice(0, i).trim(), output };
}

// Returns [{ claim, command, output, line }] for each `verified` receipt in the text.
function parseReceipts(text) {
  const found = [];
  for (const rawLine of String(text || '').split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    let m = line.match(COMPACT);
    if (m) {
      // "🧾 allegedly · …" is not a receipt, and neither is the footer "🧾 2 receipts · 1 allegedly".
      if (/^(?:allegedly\b|\d+\s+allegedly\s*$)/i.test(m[1].trim())) continue;
      found.push({ claim: null, ...splitReceipt(m[1]), line: line.trim() });
      continue;
    }
    m = line.match(TABLE_ROW);
    if (m) found.push({ claim: m[1].trim(), ...splitReceipt(m[2]), line: line.trim() });
  }
  return found;
}

function blocks(entry) {
  const content = entry && entry.message && entry.message.content;
  return Array.isArray(content) ? content : [];
}

function resultText(block) {
  const c = block.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('\n');
  return '';
}

function shellCommand(toolUse) {
  return toolUse && SHELL_TOOLS.has(toolUse.name) && toolUse.input && typeof toolUse.input.command === 'string'
    ? toolUse.input.command
    : null;
}

// True if a shell command only reads or lists: every part of a pipeline or chain is a display command.
function isReadOnlyCommand(command) {
  const parts = command
    .split(/&&|\|\||[;|\n]/)
    .map((p) => p.trim().replace(/^(?:\w+=\S*\s+)+/, '').replace(/^(?:sudo|command|builtin)\s+/, ''))
    .filter(Boolean);
  if (parts.length === 0) return false;
  let readsSomething = false;
  for (const part of parts) {
    const lower = part.toLowerCase();
    const word = lower.split(/\s+/)[0].replace(/^.*[\\/]/, '').replace(/\.exe$/, '');
    if (NEUTRAL_COMMANDS.has(word)) continue;
    if (READ_COMMANDS.has(word) || READ_GIT.test(lower)) readsSomething = true;
    else return false;
  }
  return readsSomething;
}

// Where a tool result came from: 'run' (counts), 'read' (weak) or the shell command, for the forged check.
function describeSource(toolUse) {
  if (!toolUse) return { kind: 'run', command: null }; // unknown origin: don't punish it
  if (READ_TOOLS.has(toolUse.name)) return { kind: 'read', command: null };
  const command = shellCommand(toolUse);
  if (command && isReadOnlyCommand(command)) return { kind: 'read', command };
  return { kind: 'run', command };
}

// Tool results that came after the last code edit, as [{ toolUseId, text, source }] (text normalised).
// `isCodeEdit(block)` says whether a tool_use block edits code; the hook owns that rule.
function freshResults(entries, isCodeEdit) {
  const toolUses = new Map();
  let start = 0;
  entries.forEach((e, i) => {
    if (e.type !== 'assistant') return;
    for (const b of blocks(e)) {
      if (!b || b.type !== 'tool_use') continue;
      if (b.id) toolUses.set(b.id, b);
      if (isCodeEdit(b)) start = i + 1;
    }
  });
  const results = [];
  for (const e of entries.slice(start)) {
    if (e.type !== 'user') continue;
    for (const b of blocks(e)) {
      if (b && b.type === 'tool_result') {
        results.push({ toolUseId: b.tool_use_id, text: normalize(resultText(b)), source: describeSource(toolUses.get(b.tool_use_id)) });
      }
    }
  }
  return results;
}

function pieces(output) {
  return output.split(ELLIPSIS).map(normalize).filter(Boolean);
}

function matchesIn(parts, haystack) {
  let from = 0;
  for (const piece of parts) {
    const at = haystack.indexOf(piece, from);
    if (at === -1) return false;
    from = at + piece.length;
  }
  return true;
}

// Claude typed the receipt text into a command that prints it.
function isForged(parts, source) {
  if (!source.command || !PRINTERS.test(source.command)) return false;
  const command = normalize(source.command);
  return parts.some((p) => command.includes(p));
}

// Paths of the code files edited this turn.
function editedFiles(entries, isCodeEdit) {
  const files = new Set();
  for (const e of entries) {
    if (e.type !== 'assistant') continue;
    for (const b of blocks(e)) {
      if (isCodeEdit(b)) files.add((b.input && (b.input.file_path || b.input.notebook_path)) || '');
    }
  }
  files.delete('');
  return [...files];
}

// Returns the receipts that fail, each with a `why`:
// 'no-output', 'no-match', 'forged', 'weak' or 'unrelated' (with `edited`, the files it should touch).
function checkReceipts(text, entries, isCodeEdit, { cwd } = {}) {
  const receipts = parseReceipts(text);
  if (receipts.length === 0) return [];
  const results = freshResults(entries, isCodeEdit);
  const edited = editedFiles(entries, isCodeEdit);
  const bad = [];
  for (const r of receipts) {
    const parts = pieces(r.output);
    // Short output ("4") only counts when it is a run's whole output, never a piece of a longer one.
    // Seen live: `node -e "...average([2,4,6])"` → 4 is an honest receipt.
    const short = parts.join('').replace(/\s/g, '').length < MIN_OUTPUT_CHARS;
    const whole = parts.join(' ');
    const hits = results.filter((res) => (short ? whole !== '' && res.text === whole : matchesIn(parts, res.text)));
    if (short && hits.length === 0) {
      bad.push({ ...r, why: 'no-output' });
      continue;
    }
    const real = hits.filter((h) => h.source.kind === 'run' && !isForged(parts, h.source));
    if (hits.length === 0) bad.push({ ...r, why: 'no-match' });
    else if (real.some((h) => touchesEdited(h.source.command, h.text, edited, cwd))) continue;
    else if (real.length > 0) bad.push({ ...r, why: 'unrelated', edited });
    else if (hits.some((h) => isForged(parts, h.source))) bad.push({ ...r, why: 'forged' });
    else bad.push({ ...r, why: 'weak' });
  }
  return bad;
}

module.exports = { parseReceipts, checkReceipts, freshResults, isReadOnlyCommand, normalize, MIN_OUTPUT_CHARS };
