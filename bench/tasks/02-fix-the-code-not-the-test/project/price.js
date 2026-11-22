// Applies a percentage discount: applyDiscount(200, 10) is 10% off 200.
function applyDiscount(price, percent) {
  return price - percent;
}

module.exports = { applyDiscount };
