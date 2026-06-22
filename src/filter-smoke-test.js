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

assert.equal(
  isPublishableArticle(
    publishable({
      title: "DLF Q2 results: Net profit rises 54% QoQ to Rs 1,180 crore",
      description: "DLF reported stronger revenue and earnings in its real estate business.",
      articleText: "DLF, the Gurugram-based real estate developer, reported higher net profit and sales bookings.",
      newsLink:
        "https://www.moneycontrol.com/news/business/real-estate/dlf-q2-results-net-profit-rises-54-qoq-to-rs-1-180-crore-yearly-profits-dips-14-13643536.html"
    }),
    sentIds
  ),
  true
);

assert.equal(
  isPublishableArticle(
    publishable({
      title: "Delhi NCR-based businessman buys four apartments in DLF's The Dahlias in Gurugram",
      description: "The luxury housing transaction highlights demand for premium Gurugram real estate.",
      articleText: "The apartments are in DLF's The Dahlias in Gurugram.",
      newsLink:
        "https://www.moneycontrol.com/news/business/real-estate/delhi-ncr-based-businessman-buys-four-apartments-in-dlf-s-the-dahlias-in-gurugram-for-rs-380-crore-13643229.html"
    }),
    sentIds
  ),
  true
);

assert.match(
  reasons({
    title: "NCR housing market records strong premium demand",
    description: "Housing sales grew across NCR with new launches and residential demand.",
    articleText: "The report discusses Noida, Greater Noida and Ghaziabad without Gurugram or Faridabad.",
    newsLink: "https://example.com/ncr-housing-market"
  }).join("; "),
  /no allowed city match|outside-city conflict|outside region/
);

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
    title: "Yellow alert for thunderstorms in Haryana till June 24",
    description: "According to IMD data, thunderstorms and rain are expected in Gurugram.",
    articleText: "Weather officials issued a yellow alert for rain in Haryana.",
    newsLink: "https://timesofindia.indiatimes.com/city/gurgaon/yellow-alert/articleshow/131841000.cms",
    postedBy: "Gurgaon News: Latest Updates, Breaking Headlines & City News - Times of India"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
);

assert.match(
  reasons({
    title: "Fresh survey to focus on existing built-up areas, not new claims in Haryana",
    description: "SC-appointed panel will review Aravali built-up areas in Gurugram and Faridabad.",
    articleText: "The survey is about existing claims and not a new project launch.",
    newsLink: "https://timesofindia.indiatimes.com/city/gurgaon/fresh-survey/articleshow/131841001.cms",
    postedBy: "Gurgaon News: Latest Updates, Breaking Headlines & City News - Times of India"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
);

assert.match(
  reasons({
    title: "CAQM, pollution boards inspect sites for air monitors in Ggm, Fbad",
    description: "Pollution boards inspected air monitors in Gurugram and Faridabad.",
    articleText: "CAQM pollution monitoring update for the city.",
    newsLink: "https://www.hindustantimes.com/cities/gurugram-news/caqm-pollution-board"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
);

assert.match(
  reasons({
    title: "Traffic jam on Sohna E-way triggered by leak in water pipeline",
    description: "Traffic jam and water pipeline leak on Sohna E-way.",
    articleText: "Commuters faced delays after a pipeline leak.",
    newsLink: "https://www.hindustantimes.com/cities/gurugram-news/traffic-jam-pipeline"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
);

assert.match(
  reasons({
    title: "Haryana women's commission chief plans stronger grievance redressal",
    description: "Grievance redressal update in Gurugram.",
    articleText: "The commission discussed complaint handling.",
    newsLink: "https://www.hindustantimes.com/cities/gurugram-news/grievance-redressal"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
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
