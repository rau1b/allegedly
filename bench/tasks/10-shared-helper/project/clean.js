// clean tidies user-typed text: trims it, squashes inner whitespace and lowercases it.
function clean(s) {
  return String(s).trim().replace(/\s+/g, ' ').toLowerCase();
}

module.exports = { clean };
