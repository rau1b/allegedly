const { clean } = require('./clean');

// findUsers returns the users whose name contains the query, ignoring case and extra spaces.
function findUsers(users, query) {
  const q = clean(query);
  return users.filter((u) => clean(u.name).includes(q));
}

module.exports = { findUsers };
