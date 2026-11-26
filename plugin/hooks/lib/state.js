'use strict';
// Remembers whether allegedly itself sent Claude back in the current stop cycle.
// Needed because stop_hook_active is also true when a different plugin's Stop hook
// blocked, and then our first block would wrongly be treated as a second miss.
//
// One tiny file per session in the temp folder. It holds no transcript content.

const fs = require('fs');
const os = require('os');
const path = require('path');

function stateDir() {
  return process.env.ALLEGEDLY_STATE_DIR || path.join(os.tmpdir(), 'allegedly');
}

function stateFile(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128);
  return path.join(stateDir(), `${safe}.blocked`);
}

// True if we already blocked in this stop cycle. null if we can't tell.
function weBlocked(sessionId) {
  const file = stateFile(sessionId);
  if (!file) return null;
  try {
    return fs.existsSync(file);
  } catch {
    return null;
  }
}

// Record our block. Returns false if it couldn't be saved.
function markBlocked(sessionId) {
  const file = stateFile(sessionId);
  if (!file) return false;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '');
    return true;
  } catch {
    return false;
  }
}

// A new stop cycle started (stop_hook_active is false): forget the last block.
function clearBlocked(sessionId) {
  const file = stateFile(sessionId);
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // not there, or not removable: both fine
  }
}

module.exports = { weBlocked, markBlocked, clearBlocked, stateFile };
