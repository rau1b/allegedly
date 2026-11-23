const { clean } = require('./clean');

// displayName is how a user's name appears on their profile page.
function displayName(user) {
  return clean(user.name);
}

module.exports = { displayName };
