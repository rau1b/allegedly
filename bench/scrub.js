#!/usr/bin/env node
// Copies a benchmark results folder with private details removed, so it can be published.
// Usage: node bench/scrub.js bench/results/<stamp> bench/published/<name>
// - init lines keep only type, subtype, model, permissionMode (drops tools, plugins, skills, paths)
// - your home folder becomes ~ and your username becomes "user", in every form paths take in the logs
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP_INIT = ['type', 'subtype', 'model', 'permissionMode'];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeScrubber(home = os.homedir(), user = os.userInfo().username) {
  const plain = home.replace(/\\/g, '/');
  const forms = new Set([
    home.replace(/\\/g, '\\\\'), // JSON-escaped Windows path
    home.replace(/\//g, '\\\\'),
    home,
    plain,
    plain.replace(/^([A-Za-z]):/, '/$1'), // /c/Users/name (Git Bash)
    plain.replace(/^([A-Za-z]):/, '$1-').replace(/\//g, '-'), // C--Users-name (project dir names)
  ]);
  const homeRe = new RegExp([...forms].sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'gi');
  const userRe = user ? new RegExp(`\\b${escapeRe(user)}\\b`, 'gi') : null;

  return function scrubLine(line) {
    let out = line;
    try {
      const ev = JSON.parse(line);
      if (ev && ev.type === 'system' && ev.subtype === 'init') {
        out = JSON.stringify(Object.fromEntries(KEEP_INIT.filter((k) => k in ev).map((k) => [k, ev[k]])));
      }
    } catch {
      // not JSON: scrub as text
    }
    out = out.replace(homeRe, '~');
    if (userRe) out = out.replace(userRe, 'user');
    return out;
  };
}

function scrubDir(src, dst, scrubLine = makeScrubber()) {
  fs.mkdirSync(dst, { recursive: true });
  let files = 0;
  for (const name of fs.readdirSync(src)) {
    if (!/\.(jsonl|md|json)$/.test(name)) continue;
    const text = fs.readFileSync(path.join(src, name), 'utf8');
    fs.writeFileSync(path.join(dst, name), text.split('\n').map(scrubLine).join('\n'));
    files++;
  }
  return files;
}

module.exports = { makeScrubber, scrubDir };

if (require.main === module) {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.error('usage: node bench/scrub.js <results dir> <published dir>');
    process.exit(1);
  }
  console.log(`scrubbed ${scrubDir(src, dst)} files into ${dst}`);
}
