function findMatch(activeFaqs, text) {
  const lower = text.toLowerCase();
  return activeFaqs.find((faq) => faq.keywords.some((k) => lower.includes(k.toLowerCase()))) || null;
}

function matchFaq(activeFaqs, text) {
  const match = findMatch(activeFaqs, text);
  return match ? match.answer : null;
}

function matchFaqCategory(activeFaqs, text) {
  const match = findMatch(activeFaqs, text);
  return match ? match.label : null;
}

// Rule-based topic tag: whichever FAQ category a customer's messages hit most
// often. No AI/NLP — plain keyword matching, same as the auto-reply logic.
function topicTagFromMessages(activeFaqs, messages) {
  const counts = {};
  for (const m of messages) {
    const category = matchFaqCategory(activeFaqs, m.text);
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
