import assert from "node:assert/strict";
import {
  applyCityCode,
  cleanArticleFields,
  getRejectionReasons,
  isPublishableArticle
} from "../src/index.js";

const base = {
  articleReadAttempted: true,
  fullArticleRead: true,
  publishedAt: "2026-10-01T00:00:00Z",
  thumbnailImage: "https://example.com/article.jpg",
  postedBy: "Verified source",
  postedByLogo: "https://example.com/logo.jpg",
  isActive: true,
  regionalSource: true,
  sourceMode: "AUTO_PUBLISH"
};

const controls = [
  {
    name: "indore-aerocity",
    cityCode: "indore",
    title: "Indore Aerocity residential development spans 11 hectares with Rs 600 crore investment",
    description: "Indore Aerocity will add a positive mixed-use development.",
    articleText: "The Indore Aerocity project covers about 11 hectares and will bring residential homes, hotels and office developments with investment of Rs 500-600 crore in Indore."
  },
  {
    name: "coimbatore-brigade",
    cityCode: "coimbatore",
    title: "Brigade Group to develop 5.4-acre residential project in Coimbatore for Rs 600 crore",
    description: "Brigade Group announced a new Coimbatore residential project.",
    articleText: "Brigade Group and JDA signed a 5.4-acre development agreement for a Rs 600 crore residential project in Coimbatore."
  },
  {
    name: "patna-new-market",
    cityCode: "patna",
    title: "Patna New Market redevelopment approved under Rs 590 crore commercial PPP",
    description: "Patna New Market will receive a positive commercial redevelopment investment.",
    articleText: "The Patna New Market redevelopment will create a multi-storey commercial project through a Rs 590 crore public-private partnership in Patna."
  }
];

for (const control of controls) {
  const article = applyCityCode(cleanArticleFields({
    ...base,
    ...control,
    newsLink: `https://example.com/${control.name}`
  }));
  const reasons = getRejectionReasons(article, new Set());
  assert.equal(article.cityCode, control.cityCode, `${control.name} city routing`);
  assert.deepEqual(reasons, [], `${control.name} rejection reasons`);
  assert.equal(isPublishableArticle(article, new Set()), true, `${control.name} publish gate`);
}

const reviewModeValid = applyCityCode(cleanArticleFields({
  ...base,
  ...controls[0],
  sourceMode: "ACTIVE_FOR_REVIEW",
  newsLink: "https://example.com/active-review-valid"
}));
assert.deepEqual(getRejectionReasons(reviewModeValid, new Set()), [], "ACTIVE_FOR_REVIEW must not impose a publication ceiling");

const uncertainGeo = { ...reviewModeValid, cityConfidence: "uncertain", newsLink: "https://example.com/active-review-uncertain" };
assert.deepEqual(getRejectionReasons(uncertainGeo, new Set()), ["review: uncertain event geography"]);

const genericInfrastructure = {
  ...reviewModeValid,
  title: "Indore opens new flyover to reduce traffic congestion",
  description: "A flyover will reduce commuter travel time.",
  articleText: "The Indore flyover improves traffic flow and road connectivity for commuters without a property or development event.",
  newsLink: "https://example.com/active-review-generic-infrastructure"
};
assert.equal(isPublishableArticle(genericInfrastructure, new Set()), false, "generic infrastructure must remain rejected");

const offSource = { ...reviewModeValid, sourceMode: "OFF", newsLink: "https://example.com/off-source-valid" };
assert.equal(isPublishableArticle(offSource, new Set()), false, "OFF sources must never auto-publish");

console.log(`Regional recall controls passed: ${controls.length}/3 plus source-mode policy`);
