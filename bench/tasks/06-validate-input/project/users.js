class ValidationError extends Error {}

// createUser({ name, age }) returns { name, age } or throws a ValidationError.
// Rules:
//   name: a string that isn't empty after trimming.
//   age: a whole number from 0 to 150. It comes from a form, so it may be a number
//        or a numeric string like "42". The returned age is always a number.
function createUser(input) {
  return { name: input.name, age: input.age };
}

module.exports = { createUser, ValidationError };
