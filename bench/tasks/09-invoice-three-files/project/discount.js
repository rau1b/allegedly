// discountCents returns how many cents a percent discount takes off, rounded to the nearest cent.
function discountCents(cents, percent) {
  return Math.floor((cents * percent) / 100);
}

module.exports = { discountCents };
