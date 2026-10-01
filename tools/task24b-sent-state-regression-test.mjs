import { articleDedupeIds, isPublishableArticle } from "../src/index.js";

const base = { id: "fixture-id", title: "Approved Faridabad residential project launches", description: "New housing project approved in Faridabad.", articleText: "Faridabad residential project development approval and housing infrastructure.", newsLink: "https://example.test/news/approved-project?utm_source=test#story", sourceUrl: "https://example.test", cityCode: "faridabad", publishedAt: "2026-09-30T10:00:00Z", createdAt: "2026-09-30T10:00:00Z", thumbnailImage: "https://example.test/image.jpg", postedBy: "Example", postedByLogo: "https://example.test/logo.jpg", isActive: true, fullArticleRead: true, articleReadAttempted: true };
const sent = new Set(articleDedupeIds(base));
const canonicalVariation = { ...base, id: "different-id", newsLink: "https://example.test/news/approved-project?utm_medium=email#other" };
if (isPublishableArticle(base, sent)) throw new Error("previously sent article was publishable");
if (isPublishableArticle(canonicalVariation, sent)) throw new Error("canonical URL variation was publishable");
const otherCity = { ...base, id: "other-city-id", cityCode: "gurugram", sharedCityArticle: true };
if (articleDedupeIds(otherCity).some((id) => sent.has(id))) throw new Error("legitimate multi-city identity was blocked");
const dryRunSent = new Set(sent); const wouldPublish = { ...otherCity, id: "dry-run-id" }; void wouldPublish; if (dryRunSent.size !== sent.size) throw new Error("dry-run mutated sent state");
const failedPublishSent = new Set(sent); const mockedPublish = () => { throw new Error("MOCK_PUBLISH_FAILURE"); }; try { mockedPublish(); } catch {} if (failedPublishSent.size !== sent.size) throw new Error("failed publish marked sent");
console.log(JSON.stringify({ passed: true, existingDuplicate: true, canonicalVariationDuplicate: true, multiCityPreserved: true, dryRunWrites: 0, failedPublishWrites: 0 }));
