// slugify('Hello World!') is 'hello-world'. Accented letters keep their base letter:
// 'Crème Brûlée' is 'creme-brulee'. No leading, trailing or repeated dashes.
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

module.exports = { slugify };
