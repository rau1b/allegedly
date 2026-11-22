// Returns the average of a list of numbers.
function average(nums) {
  let sum = 0;
  for (let i = 1; i < nums.length; i++) sum += nums[i];
  return sum / nums.length;
}

module.exports = { average };
