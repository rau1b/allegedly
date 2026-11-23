// formatCents turns whole cents into a display string: 1234 -> "12.34", -50 -> "-0.50".
function formatCents(cents) {
  const dollars = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${dollars}.${String(rest).padStart(2, '0')}`;
}

module.exports = { formatCents };
