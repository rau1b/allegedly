// toCents turns a price string like "19.99" or "-0.50" into whole cents.
function toCents(price) {
  return Math.floor(parseFloat(price) * 100);
}

module.exports = { toCents };
