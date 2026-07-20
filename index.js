require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const { pool, migrate } = require('./db');
const { matchFaq, matchFaqCategory, topicTagFromMessages } = require('./faq');

const lineConfig = {
  channelSecret: process.env.LINE_CHANNEL_SECRET,
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
};

const client = new line.Client(lineConfig);
const app = express();

app.use(express.static('public'));

function asyncRoute(handler) {
  return (req, res) => {
    handler(req, res).catch((err) => {
      console.error(err);
      res.status(500).json({ error: 'internal error' });
    });
  };
}

async function getActiveFaqs() {
  const { rows } = await pool.query('SELECT id, label, keywords, answer FROM faqs WHERE active = TRUE');
  return rows.map((f) => ({ ...f, keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean) }));
}

// Messages can arrive from friends who followed before this webhook was
// connected (no 'follow' event ever fired for them). Backfill a customer
// row on first message so they still show up — followed_at here means
// "first seen", not their true follow date.
async function ensureCustomerSeen(userId, timestampMs) {
  const { rows } = await pool.query('SELECT user_id FROM customers WHERE user_id = $1', [userId]);
  if (rows.length) return;
  let displayName = null;
  try {
    const profile = await client.getProfile(userId);
    displayName = profile.displayName;
  } catch (err) {
    console.error('getProfile failed:', err.message);
  }
  await pool.query(
    'INSERT INTO customers (user_id, display_name, followed_at, unfollowed_at) VALUES ($1, $2, $3, NULL)',
    [userId, displayName, new Date(timestampMs).toISOString()]
  );
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
    await pool.query(
      `INSERT INTO customers (user_id, display_name, followed_at, unfollowed_at)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         followed_at = EXCLUDED.followed_at,
         unfollowed_at = NULL`,
      [userId, displayName, new Date(event.timestamp).toISOString()]
    );
    return;
  }

  if (event.type === 'unfollow') {
    await pool.query('UPDATE customers SET unfollowed_at = $1 WHERE user_id = $2', [
      new Date(event.timestamp).toISOString(),
      userId,
    ]);
    return;
  }

  if (event.type === 'message' && event.message.type === 'text') {
    await ensureCustomerSeen(userId, event.timestamp);
    const activeFaqs = await getActiveFaqs();
    const answer = matchFaq(activeFaqs, event.message.text);
    await pool.query(
      'INSERT INTO messages (user_id, text, timestamp, faq_matched) VALUES ($1, $2, $3, $4)',
      [userId, event.message.text, new Date(event.timestamp).toISOString(), Boolean(answer)]
    );
    console.log(`Message from ${userId}: ${event.message.text}`);

    if (answer) {
      return client.replyMessage(event.replyToken, { type: 'text', text: answer });
    }
    return;
  }
}

app.get('/api/stats', asyncRoute(async (req, res) => {
  const followerCount = Number(
    (await pool.query('SELECT COUNT(*) AS n FROM customers WHERE unfollowed_at IS NULL')).rows[0].n
  );

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const newFollowerCount = Number(
    (
      await pool.query(
        'SELECT COUNT(*) AS n FROM customers WHERE unfollowed_at IS NULL AND followed_at >= $1',
        [thirtyDaysAgo]
      )
    ).rows[0].n
  );

  const messageCount = Number((await pool.query('SELECT COUNT(*) AS n FROM messages')).rows[0].n);
  const faqMatchedCount = Number(
    (await pool.query('SELECT COUNT(*) AS n FROM messages WHERE faq_matched = TRUE')).rows[0].n
  );
  const faqHitRate = messageCount > 0 ? Math.round((faqMatchedCount / messageCount) * 100) : null;

  const { rows: customers } = await pool.query(`
    SELECT
      c.user_id,
      c.display_name,
      c.followed_at,
      c.needs_follow_up,
      c.tags,
      COUNT(m.id) AS message_count,
      COUNT(m.id) FILTER (WHERE m.faq_matched) AS faq_matched_count
    FROM customers c
    LEFT JOIN messages m ON m.user_id = c.user_id
    WHERE c.unfollowed_at IS NULL
    GROUP BY c.user_id
    ORDER BY c.followed_at DESC
  `);

  const activeFaqs = await getActiveFaqs();

  const allMessagesByUser = {};
  for (const m of (await pool.query('SELECT user_id, text FROM messages')).rows) {
    (allMessagesByUser[m.user_id] ??= []).push(m);
  }

  const fieldDefs = (await pool.query('SELECT id, name FROM custom_field_defs ORDER BY id ASC')).rows;
  const customFieldsByUser = {};
  for (const v of (await pool.query('SELECT user_id, field_id, value FROM custom_field_values')).rows) {
    (customFieldsByUser[v.user_id] ??= {})[v.field_id] = v.value;
  }

  const customersEnriched = customers.map((c) => {
    const messageCount = Number(c.message_count);
    const faqMatchedCount = Number(c.faq_matched_count);
    return {
      ...c,
      message_count: messageCount,
      faq_matched_count: faqMatchedCount,
      faq_hit_rate: messageCount > 0 ? Math.round((faqMatchedCount / messageCount) * 100) : null,
      topic_tag: topicTagFromMessages(activeFaqs, allMessagesByUser[c.user_id] || []),
      custom_fields: Object.fromEntries(
        fieldDefs.map((f) => [f.name, (customFieldsByUser[c.user_id] || {})[f.id] ?? ''])
      ),
    };
  });

  const { rows: messages } = await pool.query(`
    SELECT messages.user_id, customers.display_name, messages.text, messages.timestamp
    FROM messages
    LEFT JOIN customers ON customers.user_id = messages.user_id
    ORDER BY messages.id DESC LIMIT 100
  `);

  res.json({
    followerCount,
    newFollowerCount,
    messageCount,
    faqMatchedCount,
    faqHitRate,
    customers: customersEnriched,
    messages,
  });
}));

app.use(express.json());

app.patch('/api/customers/:userId', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT user_id FROM customers WHERE user_id = $1', [req.params.userId]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });

  const fields = [];
  const values = [];
  if (typeof req.body.memo === 'string') {
    values.push(req.body.memo);
    fields.push(`memo = $${values.length}`);
  }
  if (typeof req.body.needsFollowUp === 'boolean') {
    values.push(req.body.needsFollowUp);
    fields.push(`needs_follow_up = $${values.length}`);
  }
  if (typeof req.body.tags === 'string') {
    values.push(req.body.tags);
    fields.push(`tags = $${values.length}`);
  }
  if (fields.length) {
    values.push(req.params.userId);
    await pool.query(`UPDATE customers SET ${fields.join(', ')} WHERE user_id = $${values.length}`, values);
  }

  if (req.body.customFields && typeof req.body.customFields === 'object') {
    for (const [fieldId, value] of Object.entries(req.body.customFields)) {
      await pool.query(
        `INSERT INTO custom_field_values (user_id, field_id, value) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, field_id) DO UPDATE SET value = EXCLUDED.value`,
        [req.params.userId, Number(fieldId), String(value ?? '')]
      );
    }
  }

  if (!fields.length && !req.body.customFields) {
    return res.status(400).json({ error: 'no valid fields to update' });
  }
  res.json({ ok: true });
}));

app.get('/api/custom-fields', asyncRoute(async (req, res) => {
  const { rows: fields } = await pool.query('SELECT id, name FROM custom_field_defs ORDER BY id ASC');
  res.json({ fields });
}));

app.post('/api/custom-fields', asyncRoute(async (req, res) => {
  const { name } = req.body;
  if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query('INSERT INTO custom_field_defs (name) VALUES ($1) RETURNING id', [name.trim()]);
    res.json({ id: result.rows[0].id });
  } catch (err) {
    res.status(400).json({ error: 'a field with that name already exists' });
  }
}));

app.delete('/api/custom-fields/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM custom_field_defs WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  await pool.query('DELETE FROM custom_field_values WHERE field_id = $1', [req.params.id]);
  await pool.query('DELETE FROM custom_field_defs WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/faq-insight', asyncRoute(async (req, res) => {
  const { rows: messages } = await pool.query(`
    SELECT messages.id, messages.user_id, customers.display_name, messages.text, messages.timestamp, messages.handled
    FROM messages
    LEFT JOIN customers ON customers.user_id = messages.user_id
    ORDER BY messages.id DESC
  `);

  const activeFaqs = await getActiveFaqs();

  const categoryCounts = {};
  const unmatchedMessages = [];
  for (const m of messages) {
    const category = matchFaqCategory(activeFaqs, m.text);
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
}));

app.patch('/api/messages/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM messages WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  if (typeof req.body.handled !== 'boolean') return res.status(400).json({ error: 'handled must be boolean' });

  await pool.query('UPDATE messages SET handled = $1 WHERE id = $2', [req.body.handled, req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/faqs', asyncRoute(async (req, res) => {
  const { rows: faqs } = await pool.query('SELECT id, label, keywords, answer, active FROM faqs ORDER BY id ASC');
  res.json({ faqs });
}));

app.post('/api/faqs', asyncRoute(async (req, res) => {
  const { label, keywords, answer } = req.body;
  if (typeof label !== 'string' || !label.trim()) return res.status(400).json({ error: 'label is required' });
  if (typeof keywords !== 'string' || !keywords.trim()) return res.status(400).json({ error: 'keywords is required' });
  if (typeof answer !== 'string' || !answer.trim()) return res.status(400).json({ error: 'answer is required' });

  const result = await pool.query(
    'INSERT INTO faqs (label, keywords, answer, active) VALUES ($1, $2, $3, TRUE) RETURNING id',
    [label.trim(), keywords.trim(), answer.trim()]
  );
  res.json({ id: result.rows[0].id });
}));

app.patch('/api/faqs/:id', asyncRoute(async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM faqs WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'not found' });

  const fields = [];
  const values = [];
  if (typeof req.body.label === 'string' && req.body.label.trim()) {
    values.push(req.body.label.trim());
    fields.push(`label = $${values.length}`);
  }
  if (typeof req.body.keywords === 'string' && req.body.keywords.trim()) {
    values.push(req.body.keywords.trim());
    fields.push(`keywords = $${values.length}`);
  }
  if (typeof req.body.answer === 'string' && req.body.answer.trim()) {
    values.push(req.body.answer.trim());
    fields.push(`answer = $${values.length}`);
  }
  if (typeof req.body.active === 'boolean') {
    values.push(req.body.active);
    fields.push(`active = $${values.length}`);
  }
  if (!fields.length) return res.status(400).json({ error: 'no valid fields to update' });

  values.push(req.params.id);
  await pool.query(`UPDATE faqs SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
  res.json({ ok: true });
}));

app.delete('/api/faqs/:id', asyncRoute(async (req, res) => {
  const result = await pool.query('DELETE FROM faqs WHERE id = $1', [req.params.id]);
  if (result.rowCount === 0) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
}));

app.get('/api/customers/:userId', asyncRoute(async (req, res) => {
  const { rows: customerRows } = await pool.query(
    'SELECT user_id, display_name, followed_at, unfollowed_at, memo, needs_follow_up, tags FROM customers WHERE user_id = $1',
    [req.params.userId]
  );
  const customer = customerRows[0];
  if (!customer) return res.status(404).json({ error: 'not found' });

  const { rows: messages } = await pool.query(
    'SELECT text, timestamp, faq_matched FROM messages WHERE user_id = $1 ORDER BY id ASC',
    [req.params.userId]
  );

  const messageCount = messages.length;
  const faqMatchedCount = messages.filter((m) => m.faq_matched).length;
  const faqHitRate = messageCount > 0 ? Math.round((faqMatchedCount / messageCount) * 100) : null;
  const activeFaqs = await getActiveFaqs();
  const topicTag = topicTagFromMessages(activeFaqs, messages);

  const { rows: customFields } = await pool.query(
    `SELECT d.id, d.name, v.value
     FROM custom_field_defs d
     LEFT JOIN custom_field_values v ON v.field_id = d.id AND v.user_id = $1
     ORDER BY d.id ASC`,
    [req.params.userId]
  );

  res.json({ customer, messageCount, faqMatchedCount, faqHitRate, topicTag, customFields, messages });
}));

const migrationPromise = migrate().catch((err) => {
  console.error('Migration failed:', err);
  throw err;
});

// Render/local: keep running a normal persistent server.
// Vercel: no app.listen() — the platform calls the exported handler per request.
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  migrationPromise
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Listening on http://localhost:${PORT}`);
      });
    })
    .catch(() => process.exit(1));
}

module.exports = async (req, res) => {
  await migrationPromise;
  app(req, res);
};

// LINE's webhook signature check needs the raw request body, so Vercel's
// automatic JSON body-parsing must stay off (express.json()/line.middleware
// do their own parsing further down the chain).
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
