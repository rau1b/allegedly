const { toCents } = require('./parse');
const { discountCents } = require('./discount');
const { formatCents } = require('./format');

// invoice builds the printable lines for an order.
// lines: [{ name, price: "19.99", qty }]. Refund lines have a negative price.
// percentOff: a whole-order discount in percent.
function invoice(lines, percentOff = 0) {
  let subtotal = 0;
  const out = lines.map((l) => {
    const cents = toCents(l.price) * l.qty;
    subtotal += cents;
    return `${l.name}: ${formatCents(cents)}`;
  });
  const off = discountCents(subtotal, percentOff);
  if (off) out.push(`Discount: ${formatCents(-off)}`);
  out.push(`Total: ${formatCents(subtotal - off)}`);
  return out;
}

module.exports = { invoice };
