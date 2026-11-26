'use strict';
// Decides whether Claude's final message claims its work succeeded.
// v0.1 uses plain patterns (no model calls). Strict mode (v0.2) will add a model judge.

// Strong success claims.
const CLAIM_PATTERNS = [
  /\b(?:fixed|resolved)\b/,
  /^works\b/, // "Works for me"
  /\bworks\s+(?:now|again|fine|correctly|perfectly|great|as expected|for me)\b/,
  /\bworks\s+on\s+(?!any\b|all\b|every\b|(?:its|their|your|my|our)\s+own\b)\w/, // "works on Mac"
  /\b(?:everything|it all|all)\s+works\b/,
  /\b(?:runs|loads|starts)\s+(?:cleanly|fine|correctly|without\s+(?:any\s+)?errors)\b/,
  /\b(?:is|are|'s|now|be|been|all)\s+working\b/,
  /\bworking\s+(?:now|again|fine|correctly|as expected)\b/,
  /\b(?:tests?|specs?|checks?|suite|ci|build|lint(?:er)?|typecheck|everything|all)\b.{0,30}\b(?:pass(?:es|ed|ing)?|green|succeed(?:s|ed)?)\b/,
  /\bpass(?:es|ed|ing)?\s+(?:now|locally|again|cleanly)\b/,
  /\b(?:compiles|builds)\s+(?:cleanly|successfully|fine|without (?:errors|warnings))\b/,
  /\bbuild\s+succeed(?:s|ed)\b/,
  /\bno\s+(?:more\s+)?errors\b/,
  /\bshould\s+(?:now\s+)?(?:work|be\s+(?:working|fixed|good|fine|resolved|sorted))\b/,
  /\b(?:good to go|all set|ready to (?:use|go|merge|ship|deploy))\b/,
  /\b(?:is|are|now)\s+(?:complete|done)\b/,
  /^(?:all\s+)?done\b/,
  /^i'm\s+done\s*$/,
];

// Phrases that use a claim word without claiming success. Removed before matching.
const NOT_CLAIMS = [
  /\bworks\s+(?:by|like|as|with|when|in that|because)\b/g,
  /\bhow\s+(?:it|this|that)\s+works\b/g,
  /\bfixed\s+in\s+(?:version|v?\d|release|commit|pr\b|#)/g,
  /\bfixed[- ](?:width|size|point|price|cost|rate|number|position|height|length|set)\b/g,
  /\bdone\s+(?:with|\w+ing)\b/g,
  /\bworking\s+on\b/g,
  /\b(?:a|some|any)\s+fixed\b/g, // "some fixed overhead"
  /\b(?:something|anything|nothing|what)\s+works\b/g,
  // "The README is complete": status talk about notes and docs, not code (F1).
  /\b(?:[\w-]+\.(?:md|txt|rst)|notes?|docs?|documentation|readme|handoff|changelog|plan|draft|post|summary|write-?up|tracker|memo|outline)\s+(?:is|are)\s+(?:now\s+)?(?:complete|done)\b/g,
];

// A clause with any of these is not a success claim.
const SKIP_CLAUSE = [
  /^(?:if|when|once|unless|after|before|whether)\b/, // conditional or about the past
  /\b(?:if|unless|as long as|provided that|whether|before|until)\b/, // advice like "should work if you..."
  /\bwithout\b(?!\s+(?:any\s+)?(?:errors?|issues?|problems?|warnings?|failures?))/, // "without claiming anything works"
  /\b(?:not|never|no longer|cannot|nothing|none|neither|nor)\b|n't\b/, // negated: "doesn't work", "nothing is fixed"
  /\bstill\s+(?:fails?|failing|broken|errors?)\b/,
];

// Weaker signals that only count when the turn edited code:
// action reports that imply "done" without saying it, and a plain "works".
const GATED_PATTERNS = [
  /^(?:i(?:'ve| have)?\s+)?(?:just\s+|also\s+)?(?:updated|added|implemented|refactored|changed|rewrote|rewritten|removed|deleted|created|replaced|moved|renamed|patched|wired up|hooked up|migrated|cleaned up|adjusted|tweaked|modified|corrected|switched|converted|bumped|set up)\b/,
  /\bworks\b/,
];

// Success claims in Spanish, Portuguese, French and German. \b is ASCII-only in JS, so words are
// bounded with \p{L} lookarounds (corrigée, gelöst). Each language brings its own negations.
const W = (body) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, 'u');
const ANY_WORDS = String.raw`(?: \p{L}+){0,3}`; // "las pruebas ya pasan", "die Tests laufen jetzt durch"
const OTHER_CLAIMS = [
  W('arreglad[oa]s?|corregid[oa]s?|solucionad[oa]s?|resuelt[oa]s?|funciona(?:n)?'), // es
  W(`(?:pruebas|tests?)${ANY_WORDS} pasan`),
  W(`corrigid[oa]s?|consertad[oa]s?|resolvid[oa]s?|funcionam|testes${ANY_WORDS} passa(?:m|ram)`), // pt
  W(`corrigée?s?|réparée?s?|résolue?s?|fonctionne(?:nt)?|tests?${ANY_WORDS} passent`), // fr
  W(`behoben|repariert|gelöst|korrigiert|funktioniert|tests?${ANY_WORDS} (?:laufen durch|bestehen|sind grün)`), // de
];
// Negations, and "if"/"when" (advice, not a claim), in those four languages.
const OTHER_NEGATIONS = W(String.raw`no|nunca|ningún|ninguna|todavía no|aún no|não|nao|nem|ne|pas|jamais|nicht|kein\p{L}*|nie|niemals|si|se|wenn|falls|quand|cuando|quando`);

// Common English words. A reply of 8+ words with few of them is in another language.
const ENGLISH = new Set(('the a an and or but so to of in on at by from for with into as is are was were be been being it its this that these those there here i you we they my your our have has had do does did not no now then than all also only just one if can will would should could what which when how because since about up out more any each tests test passes passed works fixed added updated changed file files code run ran').split(' '));

function looksEnglish(text) {
  // Mostly non-Latin letters (Japanese, Chinese, Russian, Hindi …): not English, however few "words".
  const letters = text.match(/\p{L}/gu) || [];
  const latin = text.match(/\p{Script=Latin}/gu) || [];
  if (letters.length >= 10 && latin.length / letters.length < 0.5) return false;
  const words = text.toLowerCase().match(/\p{L}+/gu) || [];
  if (words.length < 8) return true; // too short to tell
  return words.filter((w) => ENGLISH.has(w)).length / words.length >= 0.12;
}

// A bare `allegedly · <claim> · to check: <step>` line counts too (user decision C, s10): it's the
// honest form, and Haiku wrote it without the 🧾 in the s9 benchmark (04, primer arm).
const RECEIPTS_FOOTER = /🧾\s*(?:\d+\s+receipts?\b|allegedly\b)|^[\s>*\-•]*allegedly\s*·[^\n]*·\s*to check:/im;

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks, including a receipts table
    .replace(/`[^`\n]*`/g, ' ') // inline code
    .replace(/"[^"\n]*"|“[^”\n]*”/g, ' ') // quoted text is talk about words, not a claim
    .split('\n')
    .filter(
      (line) =>
        !RECEIPTS_FOOTER.test(line) &&
        !/^\s*(?:verified|allegedly)\s{2,}/.test(line) &&
        !/^\s*\|/.test(line) && // markdown table rows
        !/^\s*>/.test(line) // blockquotes quote other text, like a draft (F3, s18)
    )
    .join('\n');
}

function sentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) =>
      s
        .replace(/^[\s>*\-•]+|^\d+[.)]\s+/g, '') // bullets, quotes, numbered lists
        .replace(/[*_]{1,2}/g, '') // bold and italic markers
        .trim()
    )
    .filter(Boolean);
}

function clauses(sentence) {
  return sentence
    .split(/,\s*(?:but|though|although|however|yet)\s+|;\s+|\s+but\s+|\s+-\s+|\s+—\s+/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// Returns the clauses that claim success, as [{ text, kind }] with kind 'claim' or 'gated'.
function findClaims(text, { editedCode = false } = {}) {
  const found = [];
  const prose = stripCode(String(text || ''));
  // Another language after a code edit: we can't read every language's claims, so ask for a 🧾 block.
  // The worst case is one send-back answered with an allegedly line.
  const foreign = !looksEnglish(prose);
  for (const sentence of sentences(prose)) {
    if (/\?\s*$/.test(sentence)) continue; // questions don't claim anything
    for (const clause of clauses(sentence)) {
      const lower = clause.toLowerCase().replace(/[’]/g, "'");
      if (SKIP_CLAUSE.some((re) => re.test(lower))) continue;
      let cleaned = lower;
      for (const re of NOT_CLAIMS) cleaned = cleaned.replace(re, ' ');
      const plain = cleaned.replace(/[.!,:;]+\s*$/, '').trim();
      if (CLAIM_PATTERNS.some((re) => re.test(plain))) found.push({ text: clause, kind: 'claim' });
      else if (OTHER_CLAIMS.some((re) => re.test(plain)) && !OTHER_NEGATIONS.test(plain)) found.push({ text: clause, kind: 'claim' });
      else if (editedCode && foreign) found.push({ text: clause, kind: 'gated' });
      else if (editedCode && GATED_PATTERNS.some((re) => re.test(plain))) found.push({ text: clause, kind: 'gated' });
    }
  }
  return found;
}

function hasReceiptsBlock(text) {
  return RECEIPTS_FOOTER.test(String(text || ''));
}

module.exports = { findClaims, hasReceiptsBlock, looksEnglish };
