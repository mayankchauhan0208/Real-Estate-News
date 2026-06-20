import assert from "node:assert/strict";
import {
  applyCityCode,
  cleanArticleFields,
  getRejectionReasons,
  isPublishableArticle
} from "./index.js";

const sentIds = new Set();

function article(overrides = {}) {
  return cleanArticleFields({
    title: "Dwarka Expressway luxury housing project launched in Gurugram",
    description:
      "A developer launched a residential project on Dwarka Expressway with improved connectivity and infrastructure.",
    articleText:
      "The Gurugram project includes housing, connectivity, infrastructure upgrades, and residential development.",
    isActive: true,
    newsLink: "https://example.com/gurugram/dwarka-expressway-project-launch",
    thumbnailImage: "https://example.com/image.jpg",
    postedBy: "Example News",
    postedByLogo: "https://example.com/logo.png",
    createdAt: "2026-06-20T00:00:00.000Z",
    publishedAt: "2026-06-20T00:00:00.000Z",
    fetchedAt: "2026-06-20T00:00:00.000Z",
    ...overrides
  });
}

function publishable(overrides = {}) {
  return applyCityCode(article(overrides));
}

function reasons(overrides = {}) {
  return getRejectionReasons(publishable(overrides), sentIds);
}

assert.equal(publishable().cityCode, "gurugram");
assert.equal(isPublishableArticle(publishable(), sentIds), true);

assert.match(
  reasons({
    title: "फरीदाबाद में नई योजना के लाभार्थी",
    description: "फरीदाबाद में 50 परिवारों को लाभ मिला",
    postedBy: "Faridabad News In Hindi, Amarujala.com",
    newsLink: "https://www.amarujala.com/haryana/faridabad/news"
  }).join("; "),
  /non-English\/Hindi content/
);

assert.match(
  reasons({
    title: "Cap on diesel bulk buying triggers power backup worries for condos",
    description: "Gurugram condos face power backup worries due to diesel bulk buying cap.",
    articleText: "Residents worry about generator and power backup issues in condominiums."
  }).join("; "),
  /negative\/crime\/utility concern news/
);

assert.match(
  reasons({
    title: "Faridabad sector 24 construction company catches fire, no casualty",
    description: "A short circuit caused a fire at a construction company in Faridabad.",
    articleText: "Fire officials said the short circuit caused smoke at the site."
  }).join("; "),
  /negative\/crime\/utility concern news/
);

assert.match(
  reasons({
    title: "Mumbai real estate project launched by developer",
    description: "Mumbai housing project launched with new residential towers.",
    articleText: "The project is in Mumbai and not in Gurugram or Faridabad.",
    newsLink: "https://example.com/mumbai/project-launch"
  }).join("; "),
  /outside-city conflict|outside region/
);

console.log("Filter smoke tests passed.");
