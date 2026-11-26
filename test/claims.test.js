'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { findClaims, hasReceiptsBlock, looksEnglish } = require('../plugin/hooks/lib/claims');

const isClaim = (text, opts) => findClaims(text, opts).length > 0;

// The 10 seed cases from the design doc. C = claim, N = not a claim.
const SEED = [
  ['Done. The API now returns 200.', true],
  ["I'm done with the analysis. Want the summary?", false],
  ["That fix works on Mac, but I haven't tried Windows.", true],
  ['This works by caching the token in memory.', false],
  ['Tests pass locally for me', true],
  ["If the tests pass, you're good to merge.", false],
  ['Fixed!', true],
  ['The bug was fixed in version 2.3, so update.', false],
  ['Everything should be working now.', true],
  ['Works for me 👍', true],
];

for (const [sentence, expected] of SEED) {
  test(`seed: ${expected ? 'C' : 'N'} "${sentence}"`, () => assert.strictEqual(isClaim(sentence), expected));
}

// More cases that must stay silent (anti-goal: nagging).
const NEVER_TRIGGER = [
  "I'm done explaining, want me to start?",
  'This should work if you install Node first.',
  'Have you fixed the typo on your side?',
  'Before I fixed it, the error was a null pointer.',
  "The test still doesn't pass.",
  "It isn't fixed yet; I need the logs.",
  "I'm working on the parser now.",
  'Use a fixed-width font for the table.',
  'Here is how it works: the hook reads the transcript.',
  'Once the build passes, deploy it.',
  // Found by running the detector over real past sessions:
  'It says "done" without checking.',
  '| allegedly | ✅ "Claude fixed it… allegedly" | unique |',
  'Hidden check scripts decide whether each task really works.',
  'Claude uses those words all the time without claiming anything works.',
  'The design doc is ready:',
  'Subagent reports have to be verified before Claude tells you anything works.',
  'Every question also carries some fixed overhead.',
  'What works:',
];

// A plain "works" describes things in general; it only counts after a code edit.
// Known gray area left to strict mode: "A laptop mic works fine" reads like a claim to a pattern.
const GENERIC_WORKS = [
  'It works on any stack.',
  'A laptop mic works.',
  'It installs with one command and works right away.',
  'The skill folder still works on its own.',
];
for (const sentence of GENERIC_WORKS) {
  test(`generic "works" is silent without a code edit: "${sentence}"`, () => assert.strictEqual(isClaim(sentence), false));
}
test('plain "works" counts after a code edit', () => {
  assert.strictEqual(isClaim('The parser works with nested quotes.', { editedCode: true }), false); // "works with" = description
  assert.strictEqual(isClaim('The redirect works.', { editedCode: true }), true);
  assert.strictEqual(isClaim('The redirect works.', { editedCode: false }), false);
});
for (const sentence of NEVER_TRIGGER) {
  test(`never triggers: "${sentence}"`, () => assert.strictEqual(isClaim(sentence, { editedCode: true }), false));
}

// More success claims, including hedged ones.
const MUST_TRIGGER = [
  'All tests are passing.',
  "You're good to go.",
  'The build succeeded and there are no errors.',
  'It compiles cleanly now.',
  'The login page is working again.',
  '- **Fixed** the redirect loop',
  'That should do it, everything should be fine.',
  'The feature is ready to merge.',
  'It runs without errors now.',
];
for (const sentence of MUST_TRIGGER) {
  test(`triggers: "${sentence}"`, () => assert.strictEqual(isClaim(sentence), true));
}

// F1 (s15 false alarm): "done"/"complete" about notes and docs is status talk, not a code claim.
const DOC_STATUS = [
  'HANDOFF.md is up to date.',
  'The handoff is done.',
  'The README is complete.',
  'The launch post draft is done.',
  'Your notes are now complete.',
];
for (const sentence of DOC_STATUS) {
  test(`doc status is not a claim: "${sentence}"`, () => assert.strictEqual(isClaim(sentence, { editedCode: true }), false));
}
test('doc exemption does not hide code claims', () => {
  assert.strictEqual(isClaim('The migration is done.'), true);
  assert.strictEqual(isClaim('The README is complete and the build is done.'), true);
});

test('dodge: an action report counts only when code was edited', () => {
  assert.strictEqual(isClaim('Updated the handler.', { editedCode: true }), true);
  assert.strictEqual(isClaim("I've added retry logic to the client.", { editedCode: true }), true);
  assert.strictEqual(isClaim('Updated the handler.', { editedCode: false }), false);
});

test('text inside code blocks and the receipts block is ignored', () => {
  const msg = 'Here is the output:\n```\n14 passed, 0 failed\n```\nWant me to continue?';
  assert.strictEqual(isClaim(msg), false);
});

test('receipts footer is recognised in both forms', () => {
  assert.strictEqual(hasReceiptsBlock('🧾 2 receipts · 1 allegedly'), true);
  assert.strictEqual(hasReceiptsBlock('🧾 1 receipt · npm test → 14 passed'), true);
  assert.strictEqual(hasReceiptsBlock("🧾 allegedly · didn't run it · to check: npm test"), true);
  assert.strictEqual(hasReceiptsBlock('All done ✅'), false);
});

// F3 (s18, live): quoting a launch-post draft in a > blockquote, and "nothing is fixed".
test('F3: blockquoted text and "nothing/none" negations are not claims', () => {
  assert.strictEqual(isClaim('It now reads:\n\n> **Claude fixed it… allegedly.**\n>\n> Claude kept telling me it was fixed.'), false);
  assert.strictEqual(isClaim('Not done yet. We know what triggers the bug, but nothing is fixed.'), false);
  assert.strictEqual(isClaim('None of the tests pass yet.'), false);
  // A plain claim outside the quote still counts.
  assert.strictEqual(isClaim('> the old note\n\nThe bug is fixed.'), true);
});

test('claims in Spanish, Portuguese, French and German; their negations and "if" are not claims', () => {
  const claims = (t, o) => findClaims(t, o).map((c) => c.kind);
  assert.deepStrictEqual(claims('Listo, el error está arreglado.'), ['claim']);
  assert.deepStrictEqual(claims('Agora os testes passam.'), ['claim']);
  assert.deepStrictEqual(claims('Le bug est corrigé.'), ['claim']);
  assert.deepStrictEqual(claims('Der Fehler ist behoben.'), ['claim']);
  assert.deepStrictEqual(claims('Las pruebas ya pasan.'), ['claim']);
  assert.deepStrictEqual(claims('Todavía no funciona.'), []);
  assert.deepStrictEqual(claims("Ce n'est pas corrigé."), []);
  assert.deepStrictEqual(claims('Das ist noch nicht behoben.'), []);
  assert.deepStrictEqual(claims('Si reinicias el servidor, funciona.'), []);
});

test('another language after a code edit needs a receipts block; English and short replies are judged as before', () => {
  const ja = '日付の書式のバグを修正しました。すべてのテストが通ります。';
  assert.ok(findClaims(ja, { editedCode: true }).length > 0);
  assert.deepStrictEqual(findClaims(ja, { editedCode: false }), []);
  const nl = 'Ik heb de fout in het bestand met datums opgelost en alles werkt weer prima.';
  assert.ok(findClaims(nl, { editedCode: true }).length > 0);
  assert.ok(looksEnglish('- src/foo.js: added validation\n- src/bar.js: updated tests\n- lib/x.js: renamed helper'));
  assert.ok(!looksEnglish(ja));
  assert.ok(!looksEnglish('He corregido el error en el archivo de fechas y ahora las pruebas pasan sin problemas.'));
});
