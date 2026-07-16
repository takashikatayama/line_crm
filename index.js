require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const db = require('./db');
const { matchFaq, matchFaqCategory, topicTagFromMessages } = require('./faq');

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(lineConfig);
const app = express();

app.use(express.static('public'));

const upsertFollow = db.prepare(`
  INSERT INTO customers (user_id, display_name, followed_at, unfollowed_at)
  VALUES (@userId, @displayName, @followedAt, NULL)
  ON CONFLICT(user_id) DO UPDATE SET
    display_name = @displayName,
    followed_at = @followedAt,
    unfollowed_at = NULL
`);

const markUnfollow = db.prepare(`
  UPDATE customers SET unfollowed_at = @unfollowedAt WHERE user_id = @userId
`);

const insertMessage = db.prepare(`
  INSERT INTO messages (user_id, text, timestamp, faq_matched)
  VALUES (@userId, @text, @timestamp, @faqMatched)
`);

const getCustomer = db.prepare('SELECT user_id FROM customers WHERE user_id = ?');
const insertSeenCustomer = db.prepare(`
  INSERT INTO customers (user_id, display_name, followed_at, unfollowed_at)
  VALUES (@userId, @displayName, @followedAt, NULL)
`);

// Messages can arrive from friends who followed before this webhook was
// connected (no 'follow' event ever fired for them). Backfill a customer
// row on first message so they still show up — followed_at here means
// "first seen", not their true follow date.
async function ensureCustomerSeen(userId, timestampMs) {
  if (getCustomer.get(userId)) return;
  let displayName = null;
  try {
    const profile = await client.getProfile(userId);
    displayName = profile.displayName;
  } catch (err) {
    console.error('getProfile failed:', err.message);
  }
  insertSeenCustomer.run({
    userId,
    displayName,
    followedAt: new Date(timestampMs).toISOString(),
  });
}

app.post('/webhook', line.middleware(lineConfig), async (req, res) => {
  try {
    await Promise.all(req.body.events.map(handleEvent));
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  const userId = event.source && event.source.userId;
  if (!userId) return;

  if (event.type === 'follow') {
    let displayName = null;
    try {
      const profile = await client.getProfile(userId);
      displayName = profile.displayName;
    } catch (err) {
      console.error('getProfile failed:', err.message);
    }
    upsertFollow.run({
      userId,
      displayName,
      followedAt: new Date(event.timestamp).toISOString(),
    });
    return;
  }

  if (event.type === 'unfollow') {
    markUnfollow.run({
      userId,
      unfollowedAt: new Date(event.timestamp).toISOString(),
    });
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    await ensureCustomerSeen(userId, event.timestamp);
    const answer = matchFaq(event.message.text);
    insertMessage.run({
      userId,
      text: event.message.text,
      timestamp: new Date(event.timestamp).toISOString(),
      faqMatched: answer ? 1 : 0,
    });
    console.log(`Message from ${userId}: ${event.message.text}`);

    if (answer) {
      return client.replyMessage(event.replyToken, { type: 'text', text: answer });
    }
    return;
  }
}

app.get('/api/stats', (req, res) => {
  const followerCount = db
    .prepare('SELECT COUNT(*) AS n FROM customers WHERE unfollowed_at IS NULL')
    .get().n;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newFollowerCount = db
    .prepare('SELECT COUNT(*) AS n FROM customers WHERE unfollowed_at IS NULL AND followed_at >= ?')
    .get(thirtyDaysAgo).n;

  const messageCount = db.prepare('SELECT COUNT(*) AS n FROM messages').get().n;
  const faqMatchedCount = db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE faq_matched = 1')
    .get().n;
  const faqHitRate = messageCount > 0 ? Math.round((faqMatchedCount / messageCount) * 100) : null;

  const customers = db
    .prepare(`
      SELECT
        c.user_id,
        c.display_name,
        c.followed_at,
        c.needs_follow_up,
        COUNT(m.id) AS message_count,
        SUM(CASE WHEN m.faq_matched = 1 THEN 1 ELSE 0 END) AS faq_matched_count
      FROM customers c
      LEFT JOIN messages m ON m.user_id = c.user_id
      WHERE c.unfollowed_at IS NULL
      GROUP BY c.user_id
      ORDER BY c.followed_at DESC
    `)
    .all();

  const allMessagesByUser = {};
  for (const m of db.prepare('SELECT user_id, text FROM messages').all()) {
    (allMessagesByUser[m.user_id] ??= []).push(m);
  }

  const customersWithTags = customers.map((c) => ({
    ...c,
    faq_hit_rate: c.message_count > 0 ? Math.round((c.faq_matched_count / c.message_count) * 100) : null,
    topic_tag: topicTagFromMessages(allMessagesByUser[c.user_id] || []),
  }));

  const messages = db
    .prepare(`
      SELECT messages.user_id, customers.display_name, messages.text, messages.timestamp
      FROM messages
      LEFT JOIN customers ON customers.user_id = messages.user_id
      ORDER BY messages.id DESC LIMIT 100
    `)
    .all();

  res.json({
    followerCount,
    newFollowerCount,
    messageCount,
    faqMatchedCount,
    faqHitRate,
    customers: customersWithTags,
    messages,
  });
});

app.use(express.json());

app.patch('/api/customers/:userId', (req, res) => {
  const customer = db.prepare('SELECT user_id FROM customers WHERE user_id = ?').get(req.params.userId);
  if (!customer) return res.status(404).json({ error: 'not found' });

  const fields = [];
  const values = { userId: req.params.userId };
  if (typeof req.body.memo === 'string') {
    fields.push('memo = @memo');
    values.memo = req.body.memo;
  }
  if (typeof req.body.needsFollowUp === 'boolean') {
    fields.push('needs_follow_up = @needsFollowUp');
    values.needsFollowUp = req.body.needsFollowUp ? 1 : 0;
  }
  if (!fields.length) return res.status(400).json({ error: 'no valid fields to update' });

  db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE user_id = @userId`).run(values);
  res.json({ ok: true });
});

app.get('/api/faq-insight', (req, res) => {
  const messages = db
    .prepare(`
      SELECT messages.id, messages.user_id, customers.display_name, messages.text, messages.timestamp, messages.handled
      FROM messages
      LEFT JOIN customers ON customers.user_id = messages.user_id
      ORDER BY messages.id DESC
    `)
    .all();

  const categoryCounts = {};
  const unmatchedMessages = [];
  for (const m of messages) {
    const category = matchFaqCategory(m.text);
    if (category) {
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    } else if (!m.handled) {
      unmatchedMessages.push(m);
    }
  }

  const categoryBreakdown = Object.entries(categoryCounts)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  res.json({
    totalMessages: messages.length,
    matchedCount: messages.length - unmatchedMessages.length - messages.filter((m) => m.handled).length,
    categoryBreakdown,
    unmatchedMessages: unmatchedMessages.slice(0, 50),
  });
});

app.patch('/api/messages/:id', (req, res) => {
  const message = db.prepare('SELECT id FROM messages WHERE id = ?').get(req.params.id);
  if (!message) return res.status(404).json({ error: 'not found' });
  if (typeof req.body.handled !== 'boolean') return res.status(400).json({ error: 'handled must be boolean' });

  db.prepare('UPDATE messages SET handled = ? WHERE id = ?').run(req.body.handled ? 1 : 0, req.params.id);
  res.json({ ok: true });
});

app.get('/api/faqs', (req, res) => {
  const faqs = db.prepare('SELECT id, label, keywords, answer, active FROM faqs ORDER BY id ASC').all();
  res.json({ faqs });
});

app.post('/api/faqs', (req, res) => {
  const { label, keywords, answer } = req.body;
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (typeof keywords !== 'string' || !keywords.trim()) return res.status(400).json({ error: 'keywords is required' });
  if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });

  const result = db
    .prepare('INSERT INTO faqs (label, keywords, answer, active) VALUES (?, ?, ?, 1)')
    .run(label.trim(), keywords.trim(), answer.trim());
  res.json({ id: result.lastInsertRowid });
});

app.patch('/api/faqs/:id', (req, res) => {
  const faq = db.prepare('SELECT id FROM faqs WHERE id = ?').get(req.params.id);
  if (!faq) return res.status(404).json({ error: 'not found' });

  const fields = [];
  const values = [];
  if (typeof req.body.label === 'string' && req.body.label.trim()) {
    fields.push('label = ?');
    values.push(req.body.label.trim());
  }
  if (typeof req.body.keywords === 'string' && req.body.keywords.trim()) {
    fields.push('keywords = ?');
    values.push(req.body.keywords.trim());
  }
  if (typeof req.body.answer === 'string' && req.body.answer.trim()) {
    fields.push('answer = ?');
    values.push(req.body.answer.trim());
  }
  if (typeof req.body.active === 'boolean') {
    fields.push('active = ?');
    values.push(req.body.active ? 1 : 0);
  }
  if (!fields.length) return res.status(400).json({ error: 'no valid fields to update' });

  db.prepare(`UPDATE faqs SET ${fields.join(', ')} WHERE id = ?`).run(...values, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/faqs/:id', (req, res) => {
  const result = db.prepare('DELETE FROM faqs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

app.get('/api/customers/:userId', (req, res) => {
  const customer = db
    .prepare('SELECT user_id, display_name, followed_at, unfollowed_at, memo, needs_follow_up FROM customers WHERE user_id = ?')
    .get(req.params.userId);

  if (!customer) return res.status(404).json({ error: 'not found' });

  const messages = db
    .prepare('SELECT text, timestamp, faq_matched FROM messages WHERE user_id = ? ORDER BY id ASC')
    .all(req.params.userId);

  const messageCount = messages.length;
  const faqMatchedCount = messages.filter((m) => m.faq_matched).length;
  const faqHitRate = messageCount > 0 ? Math.round((faqMatchedCount / messageCount) * 100) : null;
  const topicTag = topicTagFromMessages(messages);

  res.json({ customer, messageCount, faqMatchedCount, faqHitRate, topicTag, messages });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
