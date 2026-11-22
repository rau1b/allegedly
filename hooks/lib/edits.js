'use strict';
// The one rule for "edits code": an edit tool on any file that isn't docs or plain text.
// Shared by the hook and the benchmark, so both count the same edits.

const path = require('path');

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const NON_CODE_EXT = new Set(['.md', '.mdx', '.txt', '.rst', '.adoc']);

// True for a tool_use block that edits a code file (not docs).
function isCodeEdit(b) {
  if (!b || b.type !== 'tool_use' || !EDIT_TOOLS.has(b.name)) return false;
  const file = (b.input && (b.input.file_path || b.input.notebook_path)) || '';
  return !NON_CODE_EXT.has(path.extname(file).toLowerCase());
}

module.exports = { isCodeEdit, EDIT_TOOLS, NON_CODE_EXT };
