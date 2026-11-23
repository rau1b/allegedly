// reminderSubject is the subject line of the payment reminder email.
function reminderSubject(invoiceId, due) {
  const when = [due.getUTCFullYear(), due.getUTCMonth() + 1, due.getUTCDate()].join('-');
  return `Invoice ${invoiceId} is due on ${when}`;
}

module.exports = { reminderSubject };
