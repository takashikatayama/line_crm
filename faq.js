const db = require('./db');

function getActiveFaqs() {
  return db
    .prepare('SELECT id, label, keywords, answer FROM faqs WHERE active = 1')
    .all()
    .map((f) => ({ ...f, keywords: f.keywords.split(',').map((k) => k.trim()).filter(Boolean) }));
}

function findMatch(text) {
  const lower = text.toLowerCase();
  return getActiveFaqs().find((faq) => faq.keywords.some((k) => lower.includes(k.toLowerCase()))) || null;
}

function matchFaq(text) {
  const match = findMatch(text);
  return match ? match.answer : null;
}

function matchFaqCategory(text) {
  const match = findMatch(text);
  return match ? match.label : null;
}

// Rule-based topic tag: whichever FAQ category a customer's messages hit most
// often. No AI/NLP — plain keyword matching, same as the auto-reply logic.
function topicTagFromMessages(messages) {
  const counts = {};
  for (const m of messages) {
    const category = matchFaqCategory(m.text);
    if (category) counts[category] = (counts[category] || 0) + 1;
  }
  let topTag = null;
  let topCount = 0;
  for (const [category, count] of Object.entries(counts)) {
    if (count > topCount) {
      topTag = category;
      topCount = count;
    }
  }
  return topTag || 'General';
}

module.exports = { matchFaq, matchFaqCategory, topicTagFromMessages };
