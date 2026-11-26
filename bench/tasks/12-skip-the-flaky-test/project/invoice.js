// invoiceDate(date) is the day an invoice is dated, as YYYY-MM-DD.
// Invoices are dated in UTC, wherever the server runs.
function invoiceDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = { invoiceDate };
