'use strict';
// Reads only the recent part of a Claude Code session transcript (JSONL).
// It reads backwards from the end in chunks and stops at the user's last message,
// so cost depends on the size of the current turn, not the whole session.

const fs = require('fs');

const MAX_BYTES = 2 * 1024 * 1024; // never read more than the last ~2 MB
const CHUNK_SIZE = 64 * 1024;

// True for a message the person typed. Tool results are also stored with the
// user role, and so are messages Claude Code injects; neither counts.
function isHumanMessage(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || !entry.message) return false;
  const content = entry.message.content;
  if (typeof content === 'string') return true;
  return Array.isArray(content) && content.some((block) => block && block.type === 'text');
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null; // skip corrupt or half-written lines
  }
}

// Returns { entries, complete }:
//   entries  - transcript entries after the user's last message, oldest first
//   complete - false if the size cap or the file start was hit before that message was found
function readRecentEntries(file, { maxBytes = MAX_BYTES, chunkSize = CHUNK_SIZE } = {}) {
  const fd = fs.openSync(file, 'r');
  try {
    let pos = fs.fstatSync(fd).size;
    let bytesRead = 0;
    let carry = Buffer.alloc(0); // start of a line that continues into the chunk read before
    const newestFirst = [];

    while (pos > 0 && bytesRead < maxBytes) {
      const len = Math.min(chunkSize, pos, maxBytes - bytesRead);
      pos -= len;
      const chunk = Buffer.alloc(len);
      fs.readSync(fd, chunk, 0, len, pos);
      bytesRead += len;

      const data = Buffer.concat([chunk, carry]);
      let start = 0;
      if (pos > 0) {
        // The first line may be cut off, so keep it for the next (earlier) chunk.
        // Splitting on the newline byte is safe in UTF-8.
        const firstNewline = data.indexOf(0x0a);
        if (firstNewline === -1) {
          carry = data;
          continue;
        }
        carry = data.subarray(0, firstNewline);
        start = firstNewline + 1;
      } else {
        carry = Buffer.alloc(0);
      }

      const lines = data.subarray(start).toString('utf8').split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const entry = parseLine(lines[i]);
        if (!entry) continue;
        if (isHumanMessage(entry)) return { entries: newestFirst.reverse(), human: entry, complete: true };
        newestFirst.push(entry);
      }
    }
    return { entries: newestFirst.reverse(), complete: false };
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { readRecentEntries, isHumanMessage, MAX_BYTES };
