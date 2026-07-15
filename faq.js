const fs = require('fs');
const path = require('path');

const faqs = JSON.parse(fs.readFileSync(path.join(__dirname, 'faqs.json'), 'utf8'));

function findMatch(text) {
  const lower = text.toLowerCase();
  return faqs.find((faq) => faq.keywords.some((k) => lower.includes(k.toLowerCase()))) || null;
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
