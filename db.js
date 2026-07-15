const Database = require('better-sqlite3');
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
`);

const hasFaqMatchedColumn = db
  .prepare("SELECT 1 FROM pragma_table_info('messages') WHERE name = 'faq_matched'")
  .get();
if (!hasFaqMatchedColumn) {
  db.exec('ALTER TABLE messages ADD COLUMN faq_matched INTEGER NOT NULL DEFAULT 0');
}

module.exports = db;
