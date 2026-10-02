import assert from "node:assert/strict";
import {
  articleDedupeIds,
  detectArticleLanguage,
  normalizeArticleUrlForDedupe
} from "../src/index.js";

function overlap(left, right) {
  return left.some((id) => right.includes(id));
}

const base = {
  title: "गुरुग्राम में नया आवासीय प्रोजेक्ट शुरू",
  description: "डेवलपर ने गुरुग्राम में नया आवासीय प्रोजेक्ट शुरू किया।",
  cityCode: "gurugram",
  postedBy: "Regional Hindi Desk",
  newsLink: "https://example.com/news/gurugram-project?utm_source=rss"
};

const exactDuplicate = { ...base, newsLink: "https://example.com/news/gurugram-project?utm_source=newsletter#story" };
assert.equal(normalizeArticleUrlForDedupe(base.newsLink), normalizeArticleUrlForDedupe(exactDuplicate.newsLink));
assert.equal(overlap(articleDedupeIds(base), articleDedupeIds(exactDuplicate)), true, "tracking URL duplicate must be blocked");

const nativeDuplicate = { ...base, newsLink: "https://publisher.example/item-2" };
assert.equal(overlap(articleDedupeIds(base), articleDedupeIds(nativeDuplicate)), true, "same native title/city must be blocked");

const distinctEvent = { ...base, title: "गुरुग्राम में अलग कार्यालय परियोजना को मंजूरी", newsLink: "https://publisher.example/item-3" };
assert.equal(overlap(articleDedupeIds(base), articleDedupeIds(distinctEvent)), false, "distinct event must remain publishable");

const shared = { ...base, sharedCityArticle: true, cityCode: "gurugram" };
const sharedOtherCity = { ...base, sharedCityArticle: true, cityCode: "faridabad" };
assert.equal(overlap(articleDedupeIds(shared), articleDedupeIds(sharedOtherCity)), false, "validated multi-city copies must retain city-scoped identity");

const hindi = detectArticleLanguage({ ...base, sourceName: "Hindi regional desk" });
const gujarati = detectArticleLanguage({ title: "અમદાવાદમાં નવા રહેણાંક પ્રોજેક્ટને મંજૂરી", description: "રિયલ એસ્ટેટ વિકાસ", sourceName: "regional desk" });
assert.equal(hindi.language, "hi");
assert.equal(hindi.script, "Devanagari");
assert.equal(gujarati.language, "gu");
assert.equal(gujarati.script, "Gujarati");

console.log(JSON.stringify({
  passed: true,
  knownDuplicatesBlocked: 2,
  validMultiCityRetained: 1,
  distinctEventsRetained: 1,
  falseDuplicateBlocks: 0,
  languagesDetected: [hindi.language, gujarati.language],
  scriptsDetected: [hindi.script, gujarati.script]
}, null, 2));
