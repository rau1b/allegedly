// toCsvRow turns an order into one CSV line: id,date,amount
function toCsvRow(order) {
  const d = order.placedAt;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return [order.id, y + '-' + m + '-' + day, order.amount].join(',');
}

module.exports = { toCsvRow };
