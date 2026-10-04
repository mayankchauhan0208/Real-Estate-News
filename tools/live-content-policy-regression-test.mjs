import assert from "node:assert/strict";
import { detectCityCodes, getRejectionReasons, isPublishableArticle } from "../src/index.js";

const common = {
  source: "Regression fixture",
  publishedAt: "2026-10-04T00:00:00.000Z",
  fullArticleRead: true,
  articleReadAttempted: true,
  description: "",
  imageUrl: "https://example.com/image.jpg",
  postedBy: "Regression fixture"
};

const nhai = {
  ...common,
  cityCode: "gurugram",
  title: "NHAI approves plan to build flyover, underpass near Cyber City",
  newsLink: "https://www.hindustantimes.com/cities/gurugram-news/nhai-approves-plan-to-build-flyover-underpass-near-cyber-city-101791052791322.html",
  articleText: "NHAI approved a flyover and underpass near Cyber City along the Delhi-Gurgaon Expressway. The work improves traffic movement near DLF Cyber City and Ambience Mall. DLF will spend around Rs 130 crore on the road work."
};

const dda = {
  ...common,
  cityCode: "new_delhi",
  title: "Delhi HC directs DDA to process property conversion applications within two months",
  newsLink: "https://realty.economictimes.indiatimes.com/news/regulatory/delhi-hc-directs-dda-to-process-property-conversion-applications-within-two-months/134669382",
  articleText: "The Delhi High Court directed the Delhi Development Authority to process 1,373 pending leasehold-to-freehold property conversion applications within two months. Residents and property owners reported difficulties and delays. The DDA portal was unavailable, approvals were pending, petitions were filed, and conveyance deeds remained unissued. The article describes administrative inaction and ongoing litigation, not a new development."
};

const mumbaiRegistrations = {
  ...common,
  source: "realtyquarter.com",
  cityCode: "mumbai",
  title: "Mumbai Records Over 12,600 Property Registrations in September",
  newsLink: "https://realtyquarter.com/mumbai-records-over-12600-property-registrations-in-september/",
  articleText: "Mumbai recorded 12,622 property registrations in September 2026, up 5% year on year. Registrations rose during the festive period and marked the strongest September in 14 years, indicating healthy residential property-market activity."
};

const propertyLinkedInfrastructure = {
  ...common,
  cityCode: "gurugram",
  title: "Metro corridor to unlock mixed-use development and housing in Gurugram",
  newsLink: "https://example.com/gurugram-metro-mixed-use-development",
  articleText: "The approved metro corridor will connect new sectors and unlock a named mixed-use development zone, supporting residential housing and commercial offices along the corridor."
};

const greaterNoidaNcrArticle = {
  ...common,
  cityCode: "noida",
  title: "Puravankara acquires 13.44-acre land parcel in Greater Noida for ₹340 crore",
  description: "The developer enters the Delhi-NCR real estate market with a land parcel in Greater Noida.",
  newsLink: "https://realty.economictimes.indiatimes.com/news/industry/puravankara-acquires-13-44-acre-land-parcel-in-greater-noida-for-340-crore/134402153",
  articleText: "Puravankara acquired a land parcel in Greater Noida for a residential development in the Delhi-NCR market."
};

const unrelatedTopicPageArticles = [
  {
    ...common,
    cityCode: "faridabad",
    title: "Chhattisgarh CM Sai reaches Singapore to pitch state’s investment potential",
    newsLink: "https://economictimes.indiatimes.com/news/india/chhattisgarh-cm-seeks-global-investors-in-singapore-to-boost-states-economic-growth-at-sing-forum-2026/articleshow/134669859.cms",
    articleText: "Chhattisgarh Chief Minister Vishnu Deo Sai reached Singapore to explore investment opportunities. Discussions will cover energy, mining, manufacturing and other sectors."
  },
  {
    ...common,
    cityCode: "faridabad",
    title: "Honda Elevate Facelift launch on October 6: Expected price, new features, design changes and more",
    newsLink: "https://economictimes.indiatimes.com/news/new-updates/honda-elevate-facelift-launch-on-october-6-expected-price-new-features-design-changes-and-more/articleshow/134670092.cms",
    articleText: "Honda Cars India released a teaser of the Elevate facelift. The SUV gets revised LED DRLs, a 360-degree camera and expected price details ahead of launch."
  },
  {
    ...common,
    cityCode: "new_delhi",
    title: "Delhi CM launches waste processing project, says 100 acres reclaimed from landfill sites",
    newsLink: "https://www.hindustantimes.com/cities/delhi-news/delhi-cm-launches-waste-processing-project-says-100-acres-reclaimed-from-landfill-sites-101791009921665.html",
    articleText: "The government laid the foundation stone for waste processing facilities at landfill sites. The facilities will process fresh and construction waste and produce biogas and manure."
  },
  {
    ...common,
    cityCode: "new_delhi",
    title: "MHI approves 382 sites for EV charging infrastructure in Delhi",
    newsLink: "https://www.hindustantimes.com/cities/delhi-news/mhi-approves-382-sites-for-ev-charging-infrastructure-in-delhi-101791107054495.html",
    articleText: "The Ministry of Heavy Industries approved sites for electric vehicle charging infrastructure. The government will float a tender for high-readiness charging sites."
  }
];

const sentIds = new Set();
assert.equal(isPublishableArticle(nhai, sentIds), false);
assert.match(getRejectionReasons(nhai, sentIds).join("; "), /not positive target real-estate|POSITIVE_INFRASTRUCTURE_WITHOUT_SUFFICIENT_REAL_ESTATE_NEXUS/);
assert.equal(isPublishableArticle(dda, sentIds), false);
assert.match(getRejectionReasons(dda, sentIds).join("; "), /adverse property\/court event in readable full article/);
assert.equal(isPublishableArticle(mumbaiRegistrations, sentIds), true);
assert.equal(isPublishableArticle(propertyLinkedInfrastructure, sentIds), true);
assert.deepEqual(detectCityCodes(greaterNoidaNcrArticle), ["noida"]);
for (const article of unrelatedTopicPageArticles) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
}

console.log(JSON.stringify({
  passed: true,
  nhaI: "REJECTED_NO_PROPERTY_NEXUS",
  dda: "REJECTED_FULL_BODY_ADVERSE_EVENT",
  mumbaiRegistrations: "PUBLISHABLE",
  propertyLinkedInfrastructure: "PUBLISHABLE",
  unrelatedTopicPageArticles: "REJECTED"
}, null, 2));
