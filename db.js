const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      followed_at TIMESTAMPTZ NOT NULL,
      unfollowed_at TIMESTAMPTZ,
      memo TEXT,
      needs_follow_up BOOLEAN NOT NULL DEFAULT FALSE,
      tags TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      faq_matched BOOLEAN NOT NULL DEFAULT FALSE,
      handled BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      keywords TEXT NOT NULL,
      answer TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS custom_field_defs (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      user_id TEXT NOT NULL,
      field_id INTEGER NOT NULL REFERENCES custom_field_defs(id),
      value TEXT,
      PRIMARY KEY (user_id, field_id)
    );
  `);

  // One-time seed: carry over the old faqs.json sample entries so existing
  // FAQ behavior doesn't disappear on a fresh database.
  const { rows: [{ n: faqCount }] } = await pool.query('SELECT COUNT(*) AS n FROM faqs');
  if (Number(faqCount) === 0) {
    const seedPath = path.join(__dirname, 'faqs.json');
    if (fs.existsSync(seedPath)) {
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      for (const faq of seed) {
        await pool.query(
          'INSERT INTO faqs (label, keywords, answer, active) VALUES ($1, $2, $3, TRUE)',
          [faq.label, faq.keywords.join(','), faq.answer]
        );
      }
    }
  }

  // Seed the two custom fields named explicitly in the original カルテ spec
  // (readme.md Step 5), so the feature isn't an empty shell out of the box.
  const { rows: [{ n: customFieldCount }] } = await pool.query('SELECT COUNT(*) AS n FROM custom_field_defs');
  if (Number(customFieldCount) === 0) {
    await pool.query('INSERT INTO custom_field_defs (name) VALUES ($1), ($2)', ['髪質・頭皮状態', '購入履歴']);
  }
}

module.exports = { pool, migrate };
