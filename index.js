require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const Database = require('better-sqlite3');
const path = require('path');

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

// ── Database ──────────────────────────────────────────────────────────────────

const db = new Database('data.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id   TEXT,
    type      TEXT,
    text      TEXT,
    timestamp INTEGER,
    raw       TEXT
  );

  CREATE TABLE IF NOT EXISTS followers (
    user_id        TEXT PRIMARY KEY,
    display_name   TEXT,
    followed_at    INTEGER,
    unfollowed_at  INTEGER
  );
`);

const insertEvent = db.prepare(
  'INSERT INTO events (user_id, type, text, timestamp, raw) VALUES (?, ?, ?, ?, ?)'
);

const upsertFollower = db.prepare(
  'INSERT OR REPLACE INTO followers (user_id, display_name, followed_at, unfollowed_at) VALUES (?, ?, ?, NULL)'
);

const markUnfollowed = db.prepare(
  'UPDATE followers SET unfollowed_at = ? WHERE user_id = ?'
);

// ── LINE client ───────────────────────────────────────────────────────────────

const client = new line.Client(lineConfig);

// ── Express ───────────────────────────────────────────────────────────────────

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Webhook — LINE middleware handles signature verification and body parsing
app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
});

// Dashboard data API
app.get('/api/stats', (req, res) => {
  const followerCount = db
    .prepare('SELECT COUNT(*) AS count FROM followers WHERE unfollowed_at IS NULL')
    .get().count;

  const customers = db
    .prepare(
      'SELECT user_id, display_name, followed_at FROM followers WHERE unfollowed_at IS NULL ORDER BY followed_at DESC'
    )
    .all();

  const messages = db
    .prepare(
      'SELECT user_id, text, timestamp FROM events WHERE type = ? AND text IS NOT NULL ORDER BY timestamp DESC LIMIT 100'
    )
    .all('message');

  res.json({ followerCount, customers, messages });
});

// ── Event handler ─────────────────────────────────────────────────────────────

async function handleEvent(event) {
  const userId = event.source?.userId ?? null;
  const ts = event.timestamp;

  // Persist every event regardless of type
  insertEvent.run(userId, event.type, event.message?.text ?? null, ts, JSON.stringify(event));

  if (event.type === 'follow') {
    let displayName = null;
    try {
      const profile = await client.getProfile(userId);
      displayName = profile.displayName;
    } catch (_) {
      // Profile fetch may fail for some account types — store user_id only
    }
    upsertFollower.run(userId, displayName, ts);
    console.log(`Follow: ${displayName ?? userId}`);
  }

  if (event.type === 'unfollow') {
    markUnfollowed.run(ts, userId);
    console.log(`Unfollow: ${userId}`);
  }

  if (event.type === 'message' && event.message.type === 'text') {
    console.log(`Message from ${userId}: ${event.message.text}`);
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: event.message.text,
    });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Waiting for LINE webhook events...');
});
