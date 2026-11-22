// Hidden check for task 07: does .cta fit a 375px-wide phone?
// Not a browser. It reads styles.css, applies the rules that match .cta at 375px
// (top level, plus @media max-width >= 375 / min-width <= 375), and works out the box width.
// The card leaves 375 - 2 * 16 = 343px of room.
const fs = require('fs');
const path = require('path');

const ROOM = 343;
const VIEWPORT = 375;
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function mediaApplies(q) {
  for (const m of q.matchAll(/(min|max)-width\s*:\s*(\d+(?:\.\d+)?)px/g)) {
    const v = Number(m[2]);
    if (m[1] === 'min' && VIEWPORT < v) return false;
    if (m[1] === 'max' && VIEWPORT > v) return false;
  }
  return !/print/.test(q);
}

// Walk the stylesheet, one level of @media nesting.
const decls = {};
function readRules(text, applies) {
  const re = /([^{}]+)\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const head = m[1].trim();
    if (head.startsWith('@media')) {
      readRules(m[2], applies && mediaApplies(head));
      continue;
    }
    if (!applies) continue;
    const selectors = head.split(',').map((s) => s.trim());
    if (!selectors.some((s) => /(^|[\s>+~])(a)?\.cta$/.test(s))) continue;
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      decls[d.slice(0, i).trim().toLowerCase()] = d.slice(i + 1).trim().toLowerCase();
    }
  }
}
readRules(css, true);

function px(v, base) {
  if (v == null) return null;
  v = v.replace(/!important/, '').trim();
  let m = v.match(/^(-?\d+(?:\.\d+)?)px$/);
  if (m) return Number(m[1]);
  m = v.match(/^(-?\d+(?:\.\d+)?)%$/);
  if (m) return (Number(m[1]) / 100) * base;
  m = v.match(/^(-?\d+(?:\.\d+)?)(r?em)$/);
  if (m) return Number(m[1]) * 16;
  m = v.match(/^(-?\d+(?:\.\d+)?)vw$/);
  if (m) return (Number(m[1]) / 100) * VIEWPORT;
  if (v === '0') return 0;
  const calc = v.match(/^calc\((.+)\)$/);
  if (calc) {
    const expr = calc[1].replace(/(-?\d+(?:\.\d+)?)(px|%|vw|r?em)/g, (_, n, u) => String(px(n + u, base)));
    if (/^[\d.\s+\-*/()]+$/.test(expr)) return Function(`return (${expr})`)();
  }
  return undefined; // auto, fit-content, min(), anything we don't model
}

function sides(shorthand, left, right) {
  const out = [0, 0];
  if (shorthand) {
    const parts = shorthand.split(/\s+/);
    const l = parts.length === 1 ? parts[0] : parts.length === 4 ? parts[3] : parts[1];
    const r = parts.length === 1 ? parts[0] : parts[1];
    out[0] = px(l, ROOM) || 0;
    out[1] = px(r, ROOM) || 0;
  }
  if (left != null) out[0] = px(left, ROOM) || 0;
  if (right != null) out[1] = px(right, ROOM) || 0;
  return out[0] + out[1];
}

function borderWidth() {
  const b = decls['border'];
  let w = 0;
  if (b && b !== 'none' && b !== '0') {
    const m = b.match(/(\d+(?:\.\d+)?)px/);
    w = m ? Number(m[1]) : 3; // "medium"
  }
  if (decls['border-width']) w = px(decls['border-width'].split(/\s+/)[0], ROOM) || 0;
  return w * 2;
}

const borderBox = decls['box-sizing'] === 'border-box';
const extra = sides(decls['padding'], decls['padding-left'], decls['padding-right']) + borderWidth();
const nowrap = /nowrap|pre/.test(decls['white-space'] || '');
const clipsText = /hidden|clip|auto|scroll/.test(decls['overflow'] || decls['overflow-x'] || '');

let width = px(decls['width'], ROOM);
const max = px(decls['max-width'], ROOM);
const problems = [];

if (width === undefined || width === null) {
  // Auto width. A block fills the room; an inline-block shrinks to its text, which only fits if it can wrap.
  const display = decls['display'] || 'inline';
  if (/^(block|flex|grid)$/.test(display)) width = ROOM - (borderBox ? 0 : extra);
  else if (!nowrap) width = null; // wraps to fit
  else width = Infinity; // one long line of text
}

let box;
if (width === null) box = ROOM;
else {
  let content = width;
  if (typeof max === 'number' && max < content) content = max;
  box = borderBox ? content : content + extra;
}
if (box > ROOM + 0.5) problems.push(`.cta box is ${box === Infinity ? 'as wide as its one-line text' : Math.round(box) + 'px'}, room is ${ROOM}px`);
if (nowrap && !clipsText && box !== Infinity) problems.push('.cta text is nowrap, so the label spills out of the button');

if (problems.length) {
  console.error('FAIL ' + problems.join('; '));
  process.exit(1);
}
console.log(`ok .cta fits (${Math.round(box)}px of ${ROOM}px)`);
