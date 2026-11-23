// reportHeader is the first line of the daily report, e.g. "Report for 2026-03-05".
function reportHeader(date) {
  return `Report for ${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
}

module.exports = { reportHeader };
