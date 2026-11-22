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
];

// A clause with any of these is not a success claim.
const SKIP_CLAUSE = [
  /^(?:if|when|once|unless|after|before|whether)\b/, // conditional or about the past
  /\b(?:if|unless|as long as|provided that|whether|before|until)\b/, // advice like "should work if you..."
  /\bwithout\b(?!\s+(?:any\s+)?(?:errors?|issues?|problems?|warnings?|failures?))/, // "without claiming anything works"
  /\b(?:not|never|no longer|cannot)\b|n't\b/, // negated: "doesn't work", "isn't fixed"
  /\bstill\s+(?:fails?|failing|broken|errors?)\b/,
];

// Weaker signals that only count when the turn edited code:
// action reports that imply "done" without saying it, and a plain "works".
const GATED_PATTERNS = [
  /^(?:i(?:'ve| have)?\s+)?(?:just\s+|also\s+)?(?:updated|added|implemented|refactored|changed|rewrote|rewritten|removed|deleted|created|replaced|moved|renamed|patched|wired up|hooked up|migrated|cleaned up|adjusted|tweaked|modified|corrected|switched|converted|bumped|set up)\b/,
  /\bworks\b/,
];

const RECEIPTS_FOOTER = /🧾\s*(?:\d+\s+receipts?\b|allegedly\b)/;

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
        !/^\s*\|/.test(line) // markdown table rows
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
  for (const sentence of sentences(stripCode(String(text || '')))) {
    if (/\?\s*$/.test(sentence)) continue; // questions don't claim anything
    for (const clause of clauses(sentence)) {
      const lower = clause.toLowerCase().replace(/[’]/g, "'");
      if (SKIP_CLAUSE.some((re) => re.test(lower))) continue;
      let cleaned = lower;
      for (const re of NOT_CLAIMS) cleaned = cleaned.replace(re, ' ');
      const plain = cleaned.replace(/[.!,:;]+\s*$/, '').trim();
      if (CLAIM_PATTERNS.some((re) => re.test(plain))) found.push({ text: clause, kind: 'claim' });
      else if (editedCode && GATED_PATTERNS.some((re) => re.test(plain))) found.push({ text: clause, kind: 'gated' });
    }
  }
  return found;
}

function hasReceiptsBlock(text) {
  return RECEIPTS_FOOTER.test(String(text || ''));
}

module.exports = { findClaims, hasReceiptsBlock };
