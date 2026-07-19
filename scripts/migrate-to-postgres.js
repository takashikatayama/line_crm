// One-time data copy: SQLite prototype (data.db) -> Postgres (DATABASE_URL).
// Run once after `db.js` has been switched to Postgres, before throwing away data.db.
require('dotenv').config();
const path = require('path');
const Database = require('better-sqlite3');
const { pool, migrate } = require('../db');

const sqlite = new Database(path.join(__dirname, '..', 'data.db'), { readonly: true });

async function resetSequence(table) {
  await pool.query(
    `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), (SELECT MAX(id) IS NOT NULL FROM ${table}))`,
    [table]
  );
}

async function main() {
  await migrate();

  await pool.query(
    'TRUNCATE customers, messages, faqs, custom_field_defs, custom_field_values RESTART IDENTITY CASCADE'
  );

  const customers = sqlite.prepare('SELECT * FROM customers').all();
  for (const c of customers) {
    await pool.query(
      `INSERT INTO customers (user_id, display_name, followed_at, unfollowed_at, memo, needs_follow_up, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [c.user_id, c.display_name, c.followed_at, c.unfollowed_at, c.memo, !!c.needs_follow_up, c.tags]
    );
  }

  const faqs = sqlite.prepare('SELECT * FROM faqs').all();
  for (const f of faqs) {
    await pool.query(
      'INSERT INTO faqs (id, label, keywords, answer, active) VALUES ($1, $2, $3, $4, $5)',
      [f.id, f.label, f.keywords, f.answer, !!f.active]
    );
  }
  await resetSequence('faqs');

  const fieldDefs = sqlite.prepare('SELECT * FROM custom_field_defs').all();
  for (const d of fieldDefs) {
    await pool.query('INSERT INTO custom_field_defs (id, name) VALUES ($1, $2)', [d.id, d.name]);
  }
  await resetSequence('custom_field_defs');

  const fieldValues = sqlite.prepare('SELECT * FROM custom_field_values').all();
  for (const v of fieldValues) {
    await pool.query(
      'INSERT INTO custom_field_values (user_id, field_id, value) VALUES ($1, $2, $3)',
      [v.user_id, v.field_id, v.value]
    );
  }

  const messages = sqlite.prepare('SELECT * FROM messages').all();
  for (const m of messages) {
    await pool.query(
      `INSERT INTO messages (id, user_id, text, timestamp, faq_matched, handled)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [m.id, m.user_id, m.text, m.timestamp, !!m.faq_matched, !!m.handled]
    );
  }
  await resetSequence('messages');

  console.log(`Copied: ${customers.length} customers, ${messages.length} messages, ${faqs.length} faqs, ${fieldDefs.length} custom fields, ${fieldValues.length} custom field values.`);
  await pool.end();
  sqlite.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
