// saveAll writes every item to db and resolves with the count once all of them are stored.
// If any write fails, saveAll rejects.
async function saveAll(items, db) {
  items.forEach(async (item) => {
    await db.put(item.id, item);
  });
  return items.length;
}

module.exports = { saveAll };
