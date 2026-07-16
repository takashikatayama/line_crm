const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    user_id TEXT PRIMARY KEY,
    display_name TEXT,
    followed_at TEXT NOT NULL,
    unfollowed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    faq_matched INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT NOT NULL,
    keywords TEXT NOT NULL,
    answer TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS custom_field_defs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );

  CREATE TABLE IF NOT EXISTS custom_field_values (
    user_id TEXT NOT NULL,
    field_id INTEGER NOT NULL,
    value TEXT,
    PRIMARY KEY (user_id, field_id)
  );
`);

function addColumnIfMissing(table, column, definition) {
  const exists = db
    .prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`)
    .get(column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing('messages', 'faq_matched', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('messages', 'handled', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('customers', 'memo', 'TEXT');
addColumnIfMissing('customers', 'needs_follow_up', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('customers', 'tags', 'TEXT');

// One-time seed: carry over the old faqs.json sample entries so existing
// FAQ behavior doesn't disappear when switching to DB-backed management.
const faqCount = db.prepare('SELECT COUNT(*) AS n FROM faqs').get().n;
if (faqCount === 0) {
  const seedPath = path.join(__dirname, 'faqs.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const insertFaq = db.prepare('INSERT INTO faqs (label, keywords, answer, active) VALUES (@label, @keywords, @answer, 1)');
    for (const faq of seed) {
      insertFaq.run({ label: faq.label, keywords: faq.keywords.join(','), answer: faq.answer });
    }
  }
}

// Seed the two custom fields named explicitly in the original カルテ spec
// (readme.md Step 5), so the feature isn't an empty shell out of the box.
const customFieldCount = db.prepare('SELECT COUNT(*) AS n FROM custom_field_defs').get().n;
if (customFieldCount === 0) {
  const insertField = db.prepare('INSERT INTO custom_field_defs (name) VALUES (?)');
  insertField.run('髪質・頭皮状態');
  insertField.run('購入履歴');
}

module.exports = db;
