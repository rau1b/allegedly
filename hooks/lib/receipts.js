'use strict';
// Checks that each `verified` receipt quotes real tool output from after the last code edit.
// A receipt is `command → output`. The output part must appear in one tool result (case,
// whitespace and colour codes ignored). `…` or `...` may skip text, but every piece must
// still appear, in order, in that same result. If the output has `backticked` spans, only the
// spans are the quote and the text between them is commentary: `# pass 3`, `# fail 0` (exit 0).
//
// The tool call behind a matching result matters too:
//   forged - Claude printed the text itself (echo "14 passed"), so it proves nothing
//   weak   - the output came only from reading or listing files (ls, cat, Read), not a run

const { touchesEdited } = require('./related');

const MIN_OUTPUT_CHARS = 3; // "ok" alone proves too little to match on

// Compact form: "🧾 1 receipt · npm test → 14 passed". The footer "🧾 2 receipts · 1 allegedly" has no arrow.
const COMPACT = /🧾\s*(\d+)\s+receipts?\s*·\s*(.+)$/;
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
  const raw = receipt.slice(i + 1).trim();
  // Claude sometimes wraps the output in backticks; drop them.
  const output = raw.replace(/^`+|`+$/g, '').trim();
  // Seen in every benchmark run: several quoted fragments joined by ", " or " / " or " · ".
  return { command: receipt.slice(0, i).trim(), output, quoted: quotedSpans(raw) };
}

// The `backticked` spans of a receipt's output, leaving out spans inside a (prose aside).
// Seen in the 3-run benchmark (task 01): `# pass 1` · `# fail 0` (TAP output from `node --test`).
// Parentheses inside a span, like `ok 1 (2ms)`, are part of the quote. If every span sits in
// an aside, all of them count.
function quotedSpans(raw) {
  const all = [];
  const outside = [];
  let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '`') {
      const end = raw.indexOf('`', i + 1);
      if (end === -1) break;
      if (end > i + 1) {
        const span = raw.slice(i + 1, end);
        all.push(span);
        if (depth === 0) outside.push(span);
      }
      i = end;
    } else if (c === '(') depth++;
    else if (c === ')' && depth > 0) depth--;
  }
  return outside.length ? outside : all;
}

// One compact line can hold several receipts: "a → x · b → y". A " · " part with no arrow
// belongs to the receipt before it ("`# pass 1` · `# fail 0`"); an allegedly part and
// everything after it is not a receipt.
function splitCompact(body) {
  const groups = [];
  for (const part of body.split(/\s+·\s+/)) {
    if (/^allegedly\b/i.test(part.trim())) break;
    const last = groups[groups.length - 1];
    if (last === undefined || (part.includes('→') && last.includes('→'))) groups.push(part);
    else groups[groups.length - 1] = `${last} · ${part}`;
  }
  return groups;
}

// A header line alone, with the receipts as a list below it: "🧾 2 receipts" then "- npm test → …".
const HEADER = /🧾\s*(\d+)\s+receipts?\s*$/;
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s+(.+)$/;
const FENCE = /^\s*```/;

// A receipt that ends in "→" with its output in a fenced block on the next lines (seen in the
// isolated benchmark, task 01). Each line of the block is a quoted span, in order.
function fenceAfter(lines, i) {
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === '') j++;
  if (j >= lines.length || !FENCE.test(lines[j])) return null;
  const body = [];
  for (j += 1; j < lines.length && !FENCE.test(lines[j]); j++) if (lines[j].trim()) body.push(lines[j].trim());
  return { quoted: body, output: body.join('\n'), end: j };
}

function withFence(receipt, lines, i) {
  if (receipt.output !== '' || !/→\s*$/.test(receipt.raw)) return { receipt, end: i };
  const f = fenceAfter(lines, i);
  return f ? { receipt: { ...receipt, output: f.output, quoted: f.quoted }, end: f.end } : { receipt, end: i };
}

// True when position `at` of the line sits inside an inline `code span` (odd number of backticks before it).
function inCodeSpan(line, at) {
  return (line.slice(0, at).match(/`/g) || []).length % 2 === 1;
}

function receipt(claim, raw, line) {
  const { command, output, quoted } = splitReceipt(raw);
  return { claim, command, output, quoted, line: line.trim(), raw };
}

// Returns [{ claim, command, output, quoted, line }] for each `verified` receipt in the text.
function parseReceipts(text) {
  const found = [];
  const lines = String(text || '').split('\n').map((l) => l.replace(/\r$/, ''));
  const add = (r, i) => {
    const { receipt: done, end } = withFence(r, lines, i);
    delete done.raw;
    found.push(done);
    return end;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m = line.match(COMPACT);
    // A receipt quoted inside `backticks` is an example, not a receipt. Seen live (s11): prose
    // saying "its reply ended with `🧾 1 receipt · npm test → # pass 1`." was flagged no-match.
    if (m && inCodeSpan(line, m.index)) continue;
    if (m) {
      // "🧾 allegedly · …" is not a receipt, and neither is the footer "🧾 2 receipts · 1 allegedly".
      if (/^(?:allegedly\b|\d+\s+allegedly\s*$)/i.test(m[2].trim())) continue;
      let parts = splitCompact(m[2]);
      // "🧾 0 receipts · `npm test` not run (Bash denied)" promises nothing; arrowless parts are notes.
      if (Number(m[1]) === 0) parts = parts.filter((p) => p.includes('→'));
      const last = parts.pop();
      for (const one of parts) {
        const r = receipt(null, one, line);
        delete r.raw;
        found.push(r);
      }
      if (last !== undefined) i = add(receipt(null, last, line), i); // only the last can own a fenced block
      continue;
    }
    m = line.match(HEADER);
    if (m) {
      // Seen in the isolated benchmark (task 08): the hook found no receipts here and let it pass.
      const before = found.length;
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      for (; j < lines.length; j++) {
        const b = lines[j].match(BULLET);
        if (!b) break;
        if (/^`?allegedly\b/i.test(b[1].trim())) continue;
        // A bullet with no arrow is a note, not a receipt (3-run benchmark, task 08:
        // "- The earlier `node --test test/` run failed only because …").
        if (!b[1].includes('→')) continue;
        j = add(receipt(null, b[1], lines[j]), j);
      }
      // A header that promises receipts but lists none is a receipt with no output.
      if (found.length === before && Number(m[1]) > 0) found.push({ claim: null, command: '', output: '', quoted: [], line: line.trim() });
      i = j - 1;
      continue;
    }
    m = line.match(TABLE_ROW);
    if (m) i = add(receipt(m[1].trim(), m[2], line), i);
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

function pieces(receipt) {
  const spans = receipt.quoted && receipt.quoted.length ? receipt.quoted : [receipt.output];
  return spans.flatMap((t) => t.split(ELLIPSIS)).map(normalize).filter(Boolean);
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

// Test counts said in other words (decision 11). Seen in the isolated benchmark (task 03):
// the run printed TAP `# pass 3` / `# fail 0` and the receipt said `3 passed, 0 failed`.
// Only a receipt made entirely of count phrases gets this, and every number must match.
const COUNT_WORDS = { passed: 'pass', passing: 'pass', pass: 'pass', failed: 'fail', failing: 'fail', fail: 'fail', skipped: 'skip', skip: 'skip', total: 'tests', tests: 'tests', test: 'tests' };
// Also TAP's own lines glued into one quote: `# tests 3 · # pass 3 · # fail 0` (3-run benchmark, tasks 02, 05, 08).
const CLAIM_COUNT = /(\d+)\s+(passed|passing|failed|failing|skipped|total|tests?)\b|#\s*(pass|fail|skipped|skip|tests)\s+(\d+)\b/g;
const CLAIM_ONLY = /^(?:tests?:\s*)?(?:(?:\d+\s+(?:passed|passing|failed|failing|skipped|total|tests?)|#\s*(?:pass|fail|skipped|skip|tests)\s+\d+)(?:\s*(?:,|;|\/|·|and)\s*|\s+|$))+\.?$/;
// TAP (`# pass 3`), pytest (`3 passed`), jest (`tests: 3 passed, 3 total`), mocha (`3 passing`).
const RESULT_COUNT = /#\s*(pass|fail|skipped|tests)\s+(\d+)|(\d+)\s+(passed|passing|failed|failing|skipped|total)\b/g;

// { pass: 3, fail: 0 } if the receipt output is only count phrases, else null.
function countClaim(text) {
  const t = normalize(text);
  if (!CLAIM_ONLY.test(t)) return null;
  const counts = {};
  for (const m of t.matchAll(CLAIM_COUNT)) {
    if (m[1]) counts[COUNT_WORDS[m[2]]] = Number(m[1]);
    else counts[m[3] === 'skipped' ? 'skip' : m[3]] = Number(m[4]);
  }
  return Object.keys(counts).length ? counts : null;
}

// The last count of each kind in a tool result: the summary comes at the end.
function resultCounts(text) {
  const counts = {};
  for (const m of text.matchAll(RESULT_COUNT)) {
    if (m[1]) counts[m[1] === 'skipped' ? 'skip' : m[1]] = Number(m[2]);
    else counts[COUNT_WORDS[m[4]]] = Number(m[3]);
  }
  return counts;
}

// pytest and jest leave out zero counts ("3 passed in 0.1s"), so a claimed 0 may be missing,
// but only when some other claimed count is really there.
function countsMatch(claim, text) {
  const got = resultCounts(text);
  let seen = false;
  for (const [kind, n] of Object.entries(claim)) {
    if (got[kind] === undefined) {
      if (n !== 0) return false;
    } else if (got[kind] !== n) return false;
    else seen = true;
  }
  return seen;
}

// Claude typed the receipt text into a command that prints it. Forged when every quoted piece
// is in the command, or a piece with a number in it is (echo "14 passed"). A script that prints
// its own labels, console.log('time kept:', check()), isn't forged by the label alone: the
// values next to it were computed (benchmark 04, s10).
function isForged(parts, source, counts) {
  if (!source.command || !PRINTERS.test(source.command)) return false;
  const command = normalize(source.command);
  if (counts && countsMatch(counts, command)) return true;
  const typed = parts.filter((p) => command.includes(p));
  return typed.length > 0 && (typed.length === parts.length || typed.some((p) => /\d/.test(p)));
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
    const parts = pieces(r);
    // Short output ("4") only counts when it is a run's whole output, never a piece of a longer one.
    // Seen live: `node -e "...average([2,4,6])"` → 4 is an honest receipt.
    const short = parts.join('').replace(/\s/g, '').length < MIN_OUTPUT_CHARS;
    const whole = parts.join(' ');
    let hits = results.filter((res) => (short ? whole !== '' && res.text === whole : matchesIn(parts, res.text)));
    if (short && hits.length === 0) {
      bad.push({ ...r, why: 'no-output' });
      continue;
    }
    const counts = hits.length === 0 ? countClaim(whole) : null;
    if (counts) hits = results.filter((res) => countsMatch(counts, res.text));
    const real = hits.filter((h) => h.source.kind === 'run' && !isForged(parts, h.source, counts));
    // Nothing was run since the edit, only read or searched: "re-quote it" can't help, so say weak.
    // Seen in the isolated benchmark (task 07): a grep receipt with a mis-quoted span.
    const onlyReads = results.length > 0 && results.every((res) => res.source.kind === 'read');
    if (hits.length === 0) bad.push({ ...r, why: onlyReads ? 'weak' : 'no-match' });
    else if (real.some((h) => touchesEdited(h.source.command, h.text, edited, cwd))) continue;
    else if (real.length > 0) bad.push({ ...r, why: 'unrelated', edited });
    else if (hits.some((h) => isForged(parts, h.source, counts))) bad.push({ ...r, why: 'forged' });
    else bad.push({ ...r, why: 'weak' });
  }
  return bad;
}

module.exports = { parseReceipts, checkReceipts, freshResults, isReadOnlyCommand, normalize, countClaim, resultCounts, MIN_OUTPUT_CHARS };
