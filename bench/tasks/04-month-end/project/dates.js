// addMonths(new Date(2026, 0, 15), 1) is Feb 15 2026.
// If the target month is shorter, land on its last day: Jan 31 + 1 month is Feb 28.
// Keeps the time of day. Never changes the date passed in.
function addMonths(date, n) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + n);
  return d;
}

module.exports = { addMonths };
