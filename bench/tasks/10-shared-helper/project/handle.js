const { clean } = require('./clean');

// makeHandle builds the URL handle for a user: "Ada Lovelace" -> "ada-lovelace".
function makeHandle(name) {
  return clean(name).replace(/ /g, '-');
}

module.exports = { makeHandle };
