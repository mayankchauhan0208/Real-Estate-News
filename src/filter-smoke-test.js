import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
  applyCityCode,
  classifyArticle,
  cleanArticleFields,
  detectCityCodes,
  extractMetadataImage,
  getExtraArticleUrls,
  getRejectionReasons,
  getSourcePageUrls,
  getSourceUrls,
  hasBackfillDateRange,
  isAllowedSource,
  isLikelyFeedUrl,
  isPublishableArticle,
  isWithinBackfillDateRange,
  shouldSkipTitle
} from "./index.js";

const sentIds = new Set();
const noidaCityEnabled = ["1", "true", "yes", "on"].includes(
  (process.env.ENABLE_NOIDA_CITY || "").trim().toLowerCase()
);

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

assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/real-estate/"), true);
assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/"), false);
assert.equal(isAllowedSource("https://www.aninews.in/category/business/"), false);
assert.equal(isAllowedSource("https://www.lokmattimes.com/business/"), false);
assert.equal(isAllowedSource("https://www.business-standard.com/search?q=REAL%20ESTATE"), false);
assert.equal(isAllowedSource("https://www.business-standard.com/topic/real-estate"), false);
assert.equal(isAllowedSource("https://economictimes.indiatimes.com/industry/services/property-/-cstruction"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/"), false);
assert.equal(isAllowedSource("https://economictimes.indiatimes.com/news/company/corporate-trends"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/news/residential"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/news/commercial"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/news/infrastructure"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/news/industry"), true);
assert.equal(isAllowedSource("https://timesofindia.indiatimes.com/real-estate"), false);
assert.equal(isAllowedSource("https://timesofindia.indiatimes.com/real-estate/news"), true);
assert.equal(isAllowedSource("https://www.constructionworld.in/"), false);
assert.equal(isAllowedSource("https://www.constructionworld.in/latest-construction-news/real-estate-news"), true);
assert.equal(isAllowedSource("https://indianinfrastructure.com/"), true);
assert.equal(isAllowedSource("https://urbantransportnews.com/"), true);
assert.equal(isAllowedSource("https://www.metrorailnews.in/"), true);
assert.equal(isAllowedSource("https://themetrorailguy.com/"), true);
assert.equal(isAllowedSource("https://news.railanalysis.com/"), true);
assert.equal(isAllowedSource("https://www.delhimetrorail.com/"), true);
assert.equal(isAllowedSource("https://ncrtc.in/"), true);
assert.equal(isAllowedSource("https://hsvphry.org.in/"), true);
assert.equal(isAllowedSource("https://www.bptp.com/media"), true);
assert.equal(isAllowedSource("https://www.dlf.in/media"), true);
assert.equal(isAllowedSource("https://m3mindia.com/media"), true);
assert.equal(isAllowedSource("https://smartworlddevelopers.com/media"), true);
assert.equal(isAllowedSource("https://www.signatureglobal.in/"), true);
assert.equal(isAllowedSource("https://www.centralpark.in/media.php"), true);
assert.equal(isAllowedSource("https://www.godrejproperties.com/media/press"), true);
assert.equal(isAllowedSource("https://www.emaarindia.com/media/"), true);
assert.equal(isAllowedSource("https://www.whitelandcorporation.com/"), true);
assert.equal(isAllowedSource("https://maxestates.in/news_and_media"), true);
assert.equal(isAllowedSource("https://www.birlaestates.com/media-centre.aspx"), true);
assert.equal(isAllowedSource("https://www.puriconstructions.com/"), true);
assert.equal(isAllowedSource("https://www.omaxe.com/"), true);
assert.equal(isAllowedSource("https://www.rpsgroupindia.com/"), true);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/tag/noida"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/tag/greater%2Bnoida"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/amp/tag/greater%2Bnoida"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/tag/jewar"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/tag/yamuna%2Bexpressway"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/tag/noida%2Bauthority"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/rss/residential"), noidaCityEnabled);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/rss/commercial"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.hindustantimes.com/cities/noida-news"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.hindustantimes.com/topic/noida-authority/news"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.niairport.in/en/company/news/overview/news-overview"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.yamunaexpresswayauthority.com/web/announcement/"), noidaCityEnabled);
assert.equal(isAllowedSource("https://gnida.up.gov.in/en/news"), noidaCityEnabled);
assert.equal(isAllowedSource("https://gnida.up.gov.in/en/announcements"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.atsgreens.com/blog"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.mahagunindia.com/media"), noidaCityEnabled);
assert.equal(isAllowedSource("https://countygroup.in/"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.prateekgroup.com/blog"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.gulshangroup.com/"), noidaCityEnabled);
assert.equal(isAllowedSource("https://www.aba-corp.com/"), noidaCityEnabled);
assert.equal(isAllowedSource("https://indianexpress.com/about/noida-authority/"), noidaCityEnabled);
assert.equal(isAllowedSource("https://timesofindia.indiatimes.com/city/noida"), noidaCityEnabled);
assert.equal(isAllowedSource("https://housing.com/news/"), false);
assert.equal(isAllowedSource("https://www.squareyards.com/blog"), false);
assert.equal(
  isPublishableArticle(
    publishable({
      title: "Commercial Projects",
      description: "Commercial projects category page.",
      articleText: "Commercial projects category page.",
      newsLink: "https://maxestates.in/category/commercial/"
    }),
    sentIds
  ),
  false
);
assert.equal(
  isPublishableArticle(
    publishable({
      title: "Online Allotte Payment Services",
      description: "Citizen payment services page.",
      articleText: "Online allotte payment services and citizen portal.",
      newsLink: "https://www.yamunaexpresswayauthority.com/web/citizen-services/citizen-portal-ots-system/"
    }),
    sentIds
  ),
  false
);
assert.equal(isLikelyFeedUrl("https://www.hindustantimes.com/real-estate"), false);
assert.equal(isLikelyFeedUrl("https://realty.economictimes.indiatimes.com/tag/gurugram"), false);
assert.equal(isLikelyFeedUrl("https://example.com/feed"), true);
assert.equal(isLikelyFeedUrl("https://example.com/rss.xml"), true);
assert.deepEqual(getSourcePageUrls("https://realty.economictimes.indiatimes.com/tag/faridabad").slice(0, 3), [
  "https://realty.economictimes.indiatimes.com/tag/faridabad",
  "https://realty.economictimes.indiatimes.com/tag/faridabad/2",
  "https://realty.economictimes.indiatimes.com/tag/faridabad/3"
]);
assert.deepEqual(getSourcePageUrls("https://propnewstime.com/").slice(0, 3), [
  "https://propnewstime.com/",
  "https://propnewstime.com/page/2/",
  "https://propnewstime.com/page/3/"
]);
assert.deepEqual(getSourcePageUrls("https://www.hindustantimes.com/real-estate").slice(0, 3), [
  "https://www.hindustantimes.com/real-estate",
  "https://www.hindustantimes.com/real-estate/page-2",
  "https://www.hindustantimes.com/real-estate/page-3"
]);
assert.deepEqual(getSourcePageUrls("https://www.hindustantimes.com/cities/noida-news").slice(0, 3), [
  "https://www.hindustantimes.com/cities/noida-news",
  "https://www.hindustantimes.com/cities/noida-news/page-2",
  "https://www.hindustantimes.com/cities/noida-news/page-3"
]);
assert.deepEqual(getSourcePageUrls("https://www.hindustantimes.com/topic/noida-authority/news").slice(0, 3), [
  "https://www.hindustantimes.com/topic/noida-authority/news",
  "https://www.hindustantimes.com/topic/noida-authority/news/page-2",
  "https://www.hindustantimes.com/topic/noida-authority/news/page-3"
]);
assert.deepEqual(getSourcePageUrls("https://indianexpress.com/about/noida-authority/").slice(0, 3), [
  "https://indianexpress.com/about/noida-authority/",
  "https://indianexpress.com/about/noida-authority/page/2/",
  "https://indianexpress.com/about/noida-authority/page/3/"
]);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html><body><article><figure><img data-src="/article-image.jpg" /></figure></article></body></html>
    `)
  ),
  "/article-image.jpg"
);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html>
        <head><meta property="og:image" content="https://example.com/logo.svg" /></head>
        <body><img id="zoom_class" src="https://example.com/story.png" alt="Story Image" /></body>
      </html>
    `)
  ),
  "https://example.com/story.png"
);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html>
        <head><meta property="og:image" content="https://example.com/story-real.png" /></head>
        <body><article><img src="data:image/svg+xml;base64,placeholder" data-src="https://example.com/story-real.png" /></article></body>
      </html>
    `)
  ),
  "https://example.com/story-real.png"
);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html><head><script type="application/ld+json">{"@type":"NewsArticle","image":{"url":"https://example.com/news.jpg"}}</script></head></html>
    `)
  ),
  "https://example.com/news.jpg"
);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html>
        <head><meta property="og:image" content="https://www.hindustantimes.com/ht-img/img/2026/06/26/550x309/rrts.jpg" /></head>
        <body><article><img src="https://www.hindustantimes.com/static-content/1y/ht/artShare@2x.png" /></article></body>
      </html>
    `)
  ),
  "https://www.hindustantimes.com/ht-img/img/2026/06/26/550x309/rrts.jpg"
);

assert.equal(
  extractMetadataImage(
    cheerio.load(`
      <html>
        <body><article><img src="https://www.hindustantimes.com/static-content/1y/ht/1x1-white.png" data-src="https://www.hindustantimes.com/ht-img/img/2026/06/26/400x225/rrts.jpg" /></article></body>
      </html>
    `)
  ),
  "https://www.hindustantimes.com/ht-img/img/2026/06/26/400x225/rrts.jpg"
);

assert.equal(
  isPublishableArticle(
    publishable({
      title: "BPTP to invest Rs 1,100 crore in Greater Faridabad housing project",
      description:
        "BPTP will invest Rs 1,100 crore to develop a residential housing project in Greater Faridabad.",
      articleText:
        "BPTP will invest in a Greater Faridabad residential project with new housing inventory in Neharpar. Related links mention Mumbai and Noida market updates.",
      newsLink:
        "https://realty.economictimes.indiatimes.com/news/residential/bptp-to-invest-rs-1100-crore-in-greater-faridabad-housing-project"
    }),
    sentIds
  ),
  true
);

assert.equal(
  isWithinBackfillDateRange(
    article({ publishedAt: "2026-06-30T08:00:00.000Z" }),
    { from: new Date("2026-06-30T00:00:00.000Z"), to: new Date("2026-07-13T23:59:59.999Z") }
  ),
  true
);

assert.equal(
  isWithinBackfillDateRange(
    article({ publishedAt: "2026-06-29T23:59:59.000Z" }),
    { from: new Date("2026-06-30T00:00:00.000Z"), to: new Date("2026-07-13T23:59:59.999Z") }
  ),
  false
);

assert.equal(
  cleanArticleFields(
    article({
      title: "Oberoi Realty bets big on GurugramJul 8, 2026 11:09 AM IST"
    })
  ).title,
  "Oberoi Realty bets big on Gurugram"
);

assert.equal(
  isWithinBackfillDateRange(
    article({
      createdAt: "",
      publishedAt: "Jul 10, 2026 10:24 PM IST",
      fetchedAt: "2026-07-13T06:18:00.000Z"
    }),
    { from: new Date("2026-07-10T00:00:00.000Z"), to: new Date("2026-07-10T23:59:59.999Z") }
  ),
  true
);

assert.equal(
  isWithinBackfillDateRange(
    article({
      createdAt: "",
      publishedAt: "",
      fetchedAt: "2026-07-13T06:18:00.000Z"
    }),
    { from: new Date("2026-06-30T00:00:00.000Z"), to: new Date("2026-07-13T23:59:59.999Z") }
  ),
  false
);

assert.equal(hasBackfillDateRange({ from: new Date("2026-06-25T00:00:00.000Z"), to: null }), true);
assert.equal(hasBackfillDateRange({ from: null, to: null }), false);
assert.equal(shouldSkipTitle(article({ title: "Existing reposted title" }), new Set(["existing reposted title"])), true);
assert.equal(shouldSkipTitle(article({ title: "Different title" }), new Set(["existing reposted title"])), false);

process.env.EXTRA_ARTICLE_URLS = "https://example.com/one, https://example.com/two; https://example.com/three";
assert.deepEqual(getExtraArticleUrls(), [
  "https://example.com/one",
  "https://example.com/two",
  "https://example.com/three"
]);
delete process.env.EXTRA_ARTICLE_URLS;

process.env.SOURCE_URLS = "https://www.bptp.com/media, https://hsvphry.org.in/";
assert.deepEqual(getSourceUrls(), ["https://www.bptp.com/media", "https://hsvphry.org.in/"]);
delete process.env.SOURCE_URLS;

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
  false
);

const dlfRemunerationArticle = publishable({
  title: "DLF Chairman Rajiv Singh's remuneration rises 20% to Rs 44.06 cr in FY26",
  description:
    "DLF Chairman Rajiv Singh's remuneration rose in FY26, reflecting a positive corporate update for the real estate company.",
  articleText:
    "DLF is a major real estate developer. The company update covers chairman remuneration and annual compensation.",
  newsLink:
    "https://m.economictimes.com/news/company/corporate-trends/dlf-chairman-rajiv-singhs-remuneration-rises-20-to-rs-44-06-cr-in-fy26/amp_articleshow/132342357.cms"
});

assert.deepEqual(detectCityCodes(dlfRemunerationArticle), ["gurugram"]);
assert.equal(isPublishableArticle(dlfRemunerationArticle, sentIds), true);
assert.equal(classifyArticle(dlfRemunerationArticle), "developer_corporate_positive");

const bptpFaridabadCorporateArticle = publishable({
  title: "BPTP plans new launches in Greater Faridabad as real estate demand rises",
  description: "BPTP leadership said Greater Faridabad remains a growth market for residential projects.",
  articleText: "The developer is scouting land and planning new launches in Greater Faridabad.",
  newsLink: "https://example.com/bptp-greater-faridabad-new-launches"
});

assert.deepEqual(detectCityCodes(bptpFaridabadCorporateArticle), ["faridabad"]);
assert.equal(isPublishableArticle(bptpFaridabadCorporateArticle, sentIds), true);

const bptpConfidenceArticle = publishable({
  title: "BPTP Ranks Among North India's Top 3 Developers, Kabul Chawla Says Customer Confidence Remains the Company's Greatest Strength",
  description: "BPTP leadership said customer confidence supports the company's Delhi NCR real estate growth.",
  articleText: "BPTP Media update for Delhi NCR real estate, Faridabad and Gurugram project markets.",
  newsLink: "https://cms.bptp.com/new/bptp-ranks-among-north-indias-top-3-developers-kabul-chawla-says-customer-confidence-remains-the-companys-greatest-strength/"
});

assert.deepEqual(
  detectCityCodes(bptpConfidenceArticle),
  noidaCityEnabled ? ["gurugram", "faridabad", "noida"] : ["gurugram", "faridabad"]
);
assert.equal(isPublishableArticle(bptpConfidenceArticle, sentIds), true);
assert.equal(classifyArticle(bptpConfidenceArticle), "leadership_confidence");

const bptpSkynestAwardArticle = publishable({
  title: "BPTP's Skynest Wins Landmark High-Rise Development of the Year at ET NOW Realty Conclave & Awards 2026",
  description: "BPTP's Skynest project in Greater Faridabad won a real estate development award.",
  articleText: "The award highlights Skynest, BPTP's high-rise residential project in Sector 80, Greater Faridabad.",
  newsLink: "https://cms.bptp.com/pressrelease/bptps-skynest-wins-landmark-high-rise-development-of-the-year-at-et-now-realty-conclave-awards-2026/"
});

assert.deepEqual(detectCityCodes(bptpSkynestAwardArticle), ["faridabad"]);
assert.equal(isPublishableArticle(bptpSkynestAwardArticle, sentIds), true);
assert.equal(classifyArticle(bptpSkynestAwardArticle), "project_development");

const bptpNoidaArticle = publishable({
  title: "BPTP Capital City, Sector 94, Noida, Receives Recognised Sustainability Certifications",
  description: "The update is about BPTP Capital City in Sector 94, Noida.",
  articleText: "BPTP media real estate update.",
  newsLink: "https://cms.bptp.com/pressrelease/bptp-capital-city-sector-94-noida-receives-recognised-sustainability-certifications/"
});

assert.deepEqual(detectCityCodes(bptpNoidaArticle), []);
assert.equal(isPublishableArticle(bptpNoidaArticle, sentIds), false);

const m3mNoidaArticle = publishable({
  title: "M3M India announces the launch of Jacob & Co Residences, Noida, with Rs 2,100 crore investment",
  description: "The official developer update is about a Noida residential project.",
  articleText: "M3M Media real estate update for Noida.",
  newsLink: "https://m3mindia.com/media/m3m-india-announces-the-launch-of-jacob-co-residences-noida"
});

assert.deepEqual(detectCityCodes(m3mNoidaArticle), noidaCityEnabled ? ["noida"] : []);
assert.equal(isPublishableArticle(m3mNoidaArticle, sentIds), noidaCityEnabled);

const centralParkAwardArticle = publishable({
  title: "Central Park recognised across three categories at Times Realty Awards 2026",
  description: "Central Park was recognised for Trusted Real Estate Brand and luxury development excellence.",
  articleText: "Central Park Media official real estate media update.",
  newsLink: "https://www.goodhomes.co.in/home-and-design-trends/meet-the-winners-of-the-times-realty-awards-north-2026-9621.html"
});

assert.deepEqual(detectCityCodes(centralParkAwardArticle), ["gurugram"]);
assert.equal(isPublishableArticle(centralParkAwardArticle, sentIds), true);
assert.equal(classifyArticle(centralParkAwardArticle), "project_development");

const signatureLeadershipArticle = publishable({
  title: "Signature Global sees Gurugram as core growth market, plans new launches",
  description: "The developer's MD said Gurugram will remain central to its market expansion.",
  articleText: "Signature Global is scouting land and planning new launches in Gurugram.",
  newsLink: "https://example.com/signature-global-gurugram-growth-market"
});

assert.deepEqual(detectCityCodes(signatureLeadershipArticle), ["gurugram"]);
assert.equal(isPublishableArticle(signatureLeadershipArticle, sentIds), true);
assert.equal(classifyArticle(signatureLeadershipArticle), "leadership_confidence");

const dlfSeniorLivingArticle = publishable({
  title: "DLF aims to create a meaningful offering for seniors in Gurugram",
  description: "DLF leadership said senior living can become a positive real estate offering in Gurugram.",
  articleText: "The developer discussed housing, community facilities and healthcare amenities for senior living.",
  newsLink: "https://example.com/dlf-senior-living-gurugram-offering"
});

assert.deepEqual(detectCityCodes(dlfSeniorLivingArticle), ["gurugram"]);
assert.equal(isPublishableArticle(dlfSeniorLivingArticle, sentIds), true);
assert.equal(classifyArticle(dlfSeniorLivingArticle), "leadership_confidence");

assert.match(
  reasons({
    title: "Signature Global pre-sales decline 25% to Rs 1,970 crore in Q1 FY27",
    description: "The developer reported a drop in pre-sales during the quarter.",
    articleText: "The Gurugram developer reported lower bookings and pre-sales decline.",
    newsLink: "https://example.com/signature-global-pre-sales-decline"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

const dlfLuxuryTransactionArticle = publishable({
  title: "Business leader buys apartment in DLF The Dahlias in Gurugram for Rs 95 crore",
  description: "The luxury apartment transaction highlights demand for premium Gurugram real estate.",
  articleText: "The apartment is in DLF The Dahlias in Gurugram.",
  newsLink: "https://example.com/dlf-dahlias-gurugram-apartment-purchase"
});

assert.deepEqual(detectCityCodes(dlfLuxuryTransactionArticle), ["gurugram"]);
assert.equal(isPublishableArticle(dlfLuxuryTransactionArticle, sentIds), true);
assert.equal(classifyArticle(dlfLuxuryTransactionArticle), "luxury_transaction");

const dlfLuxuryEcosystemArticle = publishable({
  title: "DLF MD reflects on ecosystem that defines luxury, Rs 100 Cr Gurugram apartments",
  description: "The DLF MD said Gurugram luxury apartments are supported by a mature real estate ecosystem.",
  articleText:
    "The article mentions Delhi NCR, Mumbai and other cities only as wider luxury-market context, while the core focus is Gurugram.",
  newsLink:
    "https://www.hindustantimes.com/real-estate/100-crore-apartments-in-gurugram-are-the-product-of-an-ecosystem-years-in-the-making-dlf-md-aakash-ohri-101782554459997.html"
});

assert.deepEqual(detectCityCodes(dlfLuxuryEcosystemArticle), ["gurugram"]);
assert.equal(isPublishableArticle(dlfLuxuryEcosystemArticle, sentIds), true);
assert.equal(classifyArticle(dlfLuxuryEcosystemArticle), "leadership_confidence");

const gurugramOfficeStockArticle = publishable({
  title: "Gurugram surpasses 100 million sq ft office stock, becoming North India's largest market",
  description: "Gurugram office market growth highlights commercial real estate momentum in the city.",
  articleText: "The milestone reflects strong commercial property demand and office space expansion in Gurugram.",
  newsLink:
    "https://economictimes.indiatimes.com/industry/services/property-/-cstruction/gurugram-surpasses-100-million-sq-ft-office-stock-becoming-north-indias-largest-market/articleshow/132573095.cms"
});

assert.deepEqual(detectCityCodes(gurugramOfficeStockArticle), ["gurugram"]);
assert.equal(isPublishableArticle(gurugramOfficeStockArticle, sentIds), true);
assert.equal(classifyArticle(gurugramOfficeStockArticle), "positive_city_market");

assert.match(
  reasons({
    title: "Police probe dispute over apartment purchase in DLF The Dahlias in Gurugram",
    description: "Police said the property dispute involved a luxury apartment transaction.",
    articleText: "The case involves a complaint and police investigation.",
    newsLink: "https://example.com/dlf-dahlias-police-dispute"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

const hsvpPipelineArticle = publishable({
  title: "HSVP commercial auction pipeline opens new commercial sites in Faridabad",
  description: "The development authority listed sector demarcation and social infrastructure sites.",
  articleText: "The Faridabad auction includes commercial sites, social infrastructure and TOD-related mixed-use development opportunities.",
  newsLink: "https://example.com/hsvp-faridabad-commercial-auction-pipeline"
});

assert.deepEqual(detectCityCodes(hsvpPipelineArticle), ["faridabad"]);
assert.equal(isPublishableArticle(hsvpPipelineArticle, sentIds), true);
assert.equal(classifyArticle(hsvpPipelineArticle), "authority_pipeline");

const officialHsvpPipelineArticle = publishable({
  title: "HSVP July e-auction demarcation plan lists Faridabad sites in Sector 84, Sector 89, Sector 97, Sector 98",
  description:
    "HSVP's July 2026 e-auction material lists Faridabad social infrastructure sites in multiple sectors, adding a positive authority-backed development pipeline signal.",
  articleText:
    "The official authority pipeline includes sector demarcation, infrastructure and auction site details for Faridabad.",
  newsLink: "https://hsvphry.org.in/documents/notices/NEWS_202607041240_d0827b76.pdf"
});

assert.deepEqual(detectCityCodes(officialHsvpPipelineArticle), ["faridabad"]);
assert.equal(isPublishableArticle(officialHsvpPipelineArticle, sentIds), true);
assert.equal(classifyArticle(officialHsvpPipelineArticle), "authority_pipeline");

const connectivityCatalystArticle = publishable({
  title: "Metro corridor improves Faridabad-Noida-Ghaziabad connectivity for real estate growth",
  description: "The connectivity catalyst is expected to support Faridabad property development.",
  articleText: "The corridor improves infrastructure access and supports Faridabad real estate growth.",
  newsLink: "https://example.com/faridabad-noida-ghaziabad-metro-connectivity"
});

assert.deepEqual(
  detectCityCodes(connectivityCatalystArticle),
  noidaCityEnabled ? ["faridabad", "noida"] : ["faridabad"]
);
assert.equal(isPublishableArticle(connectivityCatalystArticle, sentIds), true);
assert.equal(classifyArticle(connectivityCatalystArticle), "connectivity_catalyst");

assert.deepEqual(
  detectCityCodes(
    article({
      title: "Oberoi Realty launches premium project in Gurugram",
      description: "The developer said the Gurugram project expands its residential portfolio.",
      articleText: "The article body mentions Delhi NCR as wider market context, but no Faridabad project.",
      newsLink: "https://example.com/gurugram/oberoi-realty-project"
    })
  ),
  ["gurugram"]
);

const dlfDahliasTransactionArticle = publishable({
  title: "Delhi NCR-based businessman buys four apartments in DLF's The Dahlias in Gurugram",
  description: "The luxury housing transaction highlights demand for premium Gurugram real estate.",
  articleText: "The apartments are in DLF's The Dahlias in Gurugram.",
  newsLink:
    "https://www.moneycontrol.com/news/business/real-estate/delhi-ncr-based-businessman-buys-four-apartments-in-dlf-s-the-dahlias-in-gurugram-for-rs-380-crore-13643229.html"
});

assert.deepEqual(detectCityCodes(dlfDahliasTransactionArticle), ["gurugram"]);
assert.equal(isPublishableArticle(dlfDahliasTransactionArticle, sentIds), true);

assert.equal(
  isPublishableArticle(
    publishable({
      title:
        "How DLF The Arbour contributed to the evolution of Golf Course Extension Road as a luxury housing corridor",
      description:
        "The luxury housing corridor on Golf Course Extension Road has seen premium residential development.",
      articleText:
        "DLF The Arbour contributed to luxury housing demand and residential development along Golf Course Extension Road.",
      newsLink:
        "https://propnewstime.com/how-dlf-the-arbour-contributed-to-the-evolution-of-golf-course-extension-road"
    }),
    sentIds
  ),
  true
);

assert.equal(
  publishable({
    title: "Luxury project launched on SPR with improved connectivity",
    description: "The Southern Peripheral Road residential project adds new premium housing inventory.",
    articleText: "SPR is a Gurugram growth corridor for residential development.",
    newsLink: "https://example.com/spr-luxury-project"
  }).cityCode,
  "gurugram"
);

const delhiNcrPremiumHousingArticle = publishable({
  title: "Delhi NCR housing sales rise with premium launches",
  description: "Delhi NCR residential launches and sales improved with new real estate projects.",
  articleText: "Premium housing demand increased across Delhi NCR.",
  newsLink: "https://example.com/delhi-ncr-housing-sales"
});

assert.deepEqual(
  detectCityCodes(delhiNcrPremiumHousingArticle),
  noidaCityEnabled ? ["gurugram", "faridabad", "noida"] : ["gurugram", "faridabad"]
);
assert.equal(isPublishableArticle(delhiNcrPremiumHousingArticle, sentIds), true);

assert.equal(
  isPublishableArticle(
    publishable({
      title: "Delhi NCR developer launches residential project on Dwarka Expressway",
      description: "The residential project on Dwarka Expressway adds premium housing inventory.",
      articleText: "The project is located on Dwarka Expressway in Gurugram.",
      newsLink: "https://example.com/dwarka-expressway-project-launch"
    }),
    sentIds
  ),
  true
);

const rrtsCorridorArticle = publishable({
  title: "NCRTC submits DPR of RRTS connecting Gurugram, Faridabad and Noida",
  description:
    "The regional rapid transit corridor will improve infrastructure connectivity for Gurugram and Faridabad.",
  articleText:
    "The proposed RRTS corridor connects Gurugram and Faridabad with Noida, with most local development benefits focused on Gurugram and Faridabad.",
  newsLink: "https://example.com/ncrtc-rrts-gurugram-faridabad-noida-dpr",
  thumbnailImage: "https://example.com/rrts.jpg"
});

assert.deepEqual(
  detectCityCodes(rrtsCorridorArticle).sort(),
  noidaCityEnabled ? ["faridabad", "gurugram", "noida"] : ["faridabad", "gurugram"]
);
assert.equal(isPublishableArticle(rrtsCorridorArticle, sentIds), true);

const noidaRrtsReasons = reasons({
    title: "Noida and Greater Noida RRTS corridor gets new DPR",
    description: "The regional rapid transit corridor focuses on Noida and Greater Noida.",
    articleText: "The Noida infrastructure project does not include Gurugram or Faridabad as project cities.",
    newsLink: "https://example.com/noida-greater-noida-rrts-dpr"
  }).join("; ");

if (noidaCityEnabled) {
  const godrejNoidaLandArticle = publishable({
    title: "Godrej Properties acquires 4.95-acre land parcel in Noida for Rs 331.75 crore",
    description: "The developer won a bid for a land parcel in Noida for a real estate project.",
    articleText: "The Noida land acquisition will support a residential development project.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/industry/godrej-properties-wins-bid-for-495-acre-land-in-noida-for-33175-crore/132105197"
  });

  assert.deepEqual(detectCityCodes(godrejNoidaLandArticle), ["noida"]);
  assert.equal(isPublishableArticle(godrejNoidaLandArticle, sentIds), true);

  const greaterNoidaPlotRateArticle = publishable({
    title: "Greater Noida authority revises property rates across all categories",
    description: "Commercial and residential plot rates were revised ahead of Noida airport opening.",
    articleText: "The authority update supports Greater Noida real estate development and airport-linked growth.",
    newsLink: "https://www.hindustantimes.com/cities/noida-news/greater-noida-authority-revises-property-rates"
  });

  assert.deepEqual(detectCityCodes(greaterNoidaPlotRateArticle), ["noida"]);
  assert.equal(isPublishableArticle(greaterNoidaPlotRateArticle, sentIds), true);

  const noidaAirportPlotsArticle = publishable({
    title: "Over 1.1 lakh applicants vie for 973 plots off Noida airport",
    description: "YEIDA's plot scheme near Noida International Airport saw strong demand.",
    articleText: "The plots near Noida airport are part of an authority-backed development pipeline.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/industry/over-1-lakh-applicants-vie-for-plots-off-noida-airport"
  });

  assert.deepEqual(detectCityCodes(noidaAirportPlotsArticle), ["noida"]);
  assert.equal(isPublishableArticle(noidaAirportPlotsArticle, sentIds), true);

  assert.equal(
    isPublishableArticle(
      publishable({
        title: "Hybon expects revenue to grow 20-25% in FY27; to invest Rs 100 crore in Pilkhuwa facility",
        description: "The investment is for a Pilkhuwa facility outside the target cities.",
        articleText: "The company update is not about Noida, Gurugram or Faridabad real estate development.",
        newsLink: "https://realty.economictimes.indiatimes.com/news/allied-industries/hybon-targets-20-25-revenue-growth-in-fy27-with-100-crore-expansion/132013992"
      }),
      sentIds
    ),
    false
  );

  const noidaRrtsArticle = publishable({
    title: "Noida and Greater Noida RRTS corridor gets new DPR",
    description: "The regional rapid transit corridor focuses on Noida and Greater Noida.",
    articleText: "The Noida infrastructure project supports Noida property and development.",
    newsLink: "https://example.com/noida-greater-noida-rrts-dpr"
  });

  assert.deepEqual(detectCityCodes(noidaRrtsArticle), ["noida"]);
  assert.equal(isPublishableArticle(noidaRrtsArticle, sentIds), true);

  const noidaIndustrialLaunchArticle = publishable({
    title: "CM Yogi to inaugurate Noida authority HQ, launch Rs 6,785 crore industrial projects",
    description: "The authority headquarters and industrial projects add a positive development pipeline for Noida.",
    articleText: "The launch includes Noida Authority infrastructure and industrial projects for the city.",
    newsLink: "https://www.hindustantimes.com/cities/noida-news/cm-yogi-to-inaugurate-noida-authority-hq-launch-industrial-projects"
  });

  assert.deepEqual(detectCityCodes(noidaIndustrialLaunchArticle), ["noida"]);
  assert.equal(isPublishableArticle(noidaIndustrialLaunchArticle, sentIds), true);

  const noidaCommercialKioskArticle = publishable({
    title: "Street market near GIP mall: Noida authority to allot 19 kiosks",
    description: "The authority allotment adds organized commercial kiosks near a Noida retail hub.",
    articleText: "The Noida authority will allot kiosks as a commercial development update.",
    newsLink: "https://www.hindustantimes.com/cities/noida-news/street-market-near-gip-mall-noida-authority-to-allot-19-kiosks"
  });

  assert.deepEqual(detectCityCodes(noidaCommercialKioskArticle), ["noida"]);
  assert.equal(isPublishableArticle(noidaCommercialKioskArticle, sentIds), true);

  const noidaSportsComplexArticle = publishable({
    title: "Noida to spend Rs 145 crore on building sports complex in Sector 123",
    description: "The sports complex is a positive social infrastructure project for Noida sectors.",
    articleText: "The Noida project supports social infrastructure and sector development.",
    newsLink: "https://www.hindustantimes.com/cities/noida-news/noida-to-spend-145-crore-on-building-sports-complex-in-sector-123"
  });

  assert.deepEqual(detectCityCodes(noidaSportsComplexArticle), ["noida"]);
  assert.equal(isPublishableArticle(noidaSportsComplexArticle, sentIds), true);

  const noidaNegativeBuilderArticle = publishable({
    title: "CBI files chargesheet against Noida builder and bank officials",
    description: "The article is about a legal case and alleged builder fraud.",
    articleText: "The chargesheet and fraud case are negative real estate news.",
    newsLink: "https://www.hindustantimes.com/cities/noida-news/cbi-files-chargesheet-against-noida-builder"
  });

  assert.equal(isPublishableArticle(noidaNegativeBuilderArticle, sentIds), false);
} else {
  assert.match(noidaRrtsReasons, /no allowed city match|outside-city conflict|outside region/);
}

assert.equal(
  isPublishableArticle(
    publishable({
      title: "Premium housing sales rise with new launches",
      description: "Residential launches and sales improved with new real estate projects.",
      articleText: "The report says Delhi NCR premium housing demand increased with new launches.",
      newsLink: "https://example.com/body-only-housing-sales"
    }),
    sentIds
  ),
  false
);

assert.match(
  reasons({
    title: "DLF reports higher profit on real estate sales",
    description: "The developer reported higher revenue and bookings without mentioning a target city.",
    articleText: "The company discussed national real estate results.",
    newsLink: "https://example.com/dlf-results-no-city"
  }).join("; "),
  /no allowed city match|target region missing|not positive target real-estate/
);

assert.match(
  reasons({
    title: "Developer unveils strong residential growth plan",
    description: "The company announced new homes and commercial expansion.",
    articleText: "The body mentions Gurugram as one of several operating markets, but the article is a broad company update.",
    newsLink: "https://example.com/company-growth-plan"
  }).join("; "),
  /target region missing|no allowed city match/
);

assert.match(
  reasons({
    title: "Faridabad leads Hry in ABHA IDs registrations as Gurugram slips to second",
    description:
      "The district logged 1.37 million registrations between 2021 and June 2026 as Haryana achieved 63.2% coverage under the national digital health mission.",
    articleText:
      "The page body has related links about property registration and housing projects, but this article is about health registrations.",
    newsLink: "https://www.hindustantimes.com/cities/gurugram-news/faridabad-leads-hry-in-abha-ids-registrations"
  }).join("; "),
  /not positive target real-estate/
);

assert.equal(
  applyCityCode(
    article({
      title: "Bengaluru infrastructure-led growth drives real estate expansion",
      description: "Bengaluru real estate market update.",
      articleText: "Bengaluru infrastructure and real estate expansion update."
    })
  ).cityCode,
  ""
);

assert.match(
  reasons({
    title: "West Bengal CM Halts Commercial Construction Projects Following Warehouse Fire",
    description: "West Bengal halted commercial construction projects after a warehouse incident.",
    articleText: "The construction and real estate update is about Kolkata and West Bengal, not Gurugram or Faridabad.",
    newsLink:
      "https://realty.economictimes.indiatimes.com/news/industry/west-bengal-cm-halts-commercial-construction-projects"
  }).join("; "),
  /not positive target real-estate|no allowed city match|outside-city conflict|outside region/
);

assert.match(
  reasons({
    title: "Real estate approvals need faster coordination: Karnataka RERA chairman",
    description: "Karnataka RERA chairman discussed approvals.",
    articleText: "The update is about Karnataka RERA approvals and not Gurugram or Faridabad."
  }).join("; "),
  /negative\/crime\/utility concern news|no allowed city match|outside-city conflict|outside region/
);

assert.match(
  reasons({
    title: "Bombay High Court Affirms Right to Unilateral Deemed Conveyance Over Future TDR",
    description: "Bombay High Court ruling on conveyance.",
    articleText: "The case is linked to Bombay and not to Gurugram or Faridabad."
  }).join("; "),
  /no allowed city match|outside-city conflict|outside region/
);

assert.match(
  reasons({
    title: "Bengaluru's Future: Infrastructure-Led Growth Drives Real Estate Expansion",
    description: "Bengaluru infrastructure-led real estate growth.",
    articleText: "Bengaluru market expansion update."
  }).join("; "),
  /no allowed city match|outside-city conflict|outside region/
);

assert.match(
  reasons({
    title: "Bengaluru's Urban Growth Needs Focused Planning, Not Unchecked Expansion",
    description: "Bengaluru urban planning update.",
    articleText: "Bengaluru planning and expansion update."
  }).join("; "),
  /no allowed city match|outside-city conflict|outside region/
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

const ncrOfficeLeasingArticle = publishable({
  title: "NCR office leasing dips 1% to 7.2 million sq ft in H1 2026: Report",
  description:
    "Commercial office leasing in NCR remained steady at 7.2 million sq ft, supporting business activity across Delhi NCR.",
  articleText:
    "The NCR office market report covers commercial office space, leasing, occupier demand and real estate activity in Delhi NCR.",
  newsLink:
    "https://realty.economictimes.indiatimes.com/news/commercial/ncr-office-leasing-declines-slightly-to-72-million-sq-ft-in-h1-2026/132356292"
});

assert.deepEqual(
  detectCityCodes(ncrOfficeLeasingArticle).sort(),
  noidaCityEnabled ? ["faridabad", "gurugram", "noida"] : ["faridabad", "gurugram"]
);
assert.equal(isPublishableArticle(ncrOfficeLeasingArticle, sentIds), true);

const faridabadJewarArticle = publishable({
  title: "How Jewar Airport could trigger a Gurugram-like boom in Faridabad",
  description:
    "Faridabad is poised for rapid transformation driven by Noida International Airport and the proposed Faridabad-Jewar Expressway.",
  articleText:
    "Improved connectivity, infrastructure upgrades and attractive pricing are drawing investor interest and signalling a new era of development for Faridabad. The article compares Gurugram's airport-led growth and quotes BPTP leadership on Faridabad's demand shift.",
  newsLink:
    "https://economictimes.indiatimes.com/industry/services/property-/-cstruction/how-jewar-airport-could-trigger-a-gurugram-like-boom-in-faridabad/articleshow/132137532.cms",
  thumbnailImage: "https://img.etimg.com/thumb/msid-132137553,width-1200,height-630,imgsize-195266,overlay-economictimes/articleshow.jpg"
});

assert.deepEqual(detectCityCodes(faridabadJewarArticle), ["faridabad"]);
assert.equal(isPublishableArticle(faridabadJewarArticle, sentIds), true);

const faridabadsImageHeadlineArticle = publishable({
  title: "Beyond Noida and Gurugram How Faridabads infrastructure inflection is redefining NCRs real estate hierarchy",
  description:
    "The media headline discusses Faridabads infrastructure inflection and NCR real estate growth.",
  articleText:
    "The positive update highlights Faridabad real estate development, connectivity and infrastructure growth.",
  newsLink:
    "https://cms.bptp.com/wp-content/uploads/2026/07/Beyond-Noida-and-Gurugram-How-Faridabads-infrastructure-inflection-is-redefining-NCRs-real-estate-hierarchy-scaled.jpg"
});

assert.equal(detectCityCodes(faridabadsImageHeadlineArticle).includes("faridabad"), true);
assert.equal(isPublishableArticle(faridabadsImageHeadlineArticle, sentIds), true);

assert.match(
  reasons({
    title: "Days after two foresters assaulted, 1 acre of protected Aravali land cleared in Faridabad",
    description: "Protected Aravali land was cleared after two foresters were assaulted.",
    articleText: "The report mentions assault, protected land clearing, forest officials and environmental damage.",
    newsLink:
      "https://timesofindia.indiatimes.com/city/gurgaon/days-after-two-foresters-assaulted-1-acre-of-protected-aravali-land-cleared-in-faridabad/articleshow/132247476.cms"
  }).join("; "),
  /negative\/crime\/utility concern news|spam\/menu page/
);

const gurugramPositiveMarketArticle = publishable({
    title: "Gurugram housing demand to remain steady in 2026 despite global uncertainty",
    description: "A market report says demand remained steady in Gurugram.",
    articleText: "The report discusses market trends and buyer demand, not a specific project launch.",
    newsLink: "https://example.com/gurugram-housing-demand-market-report"
});

assert.deepEqual(detectCityCodes(gurugramPositiveMarketArticle), ["gurugram"]);
assert.equal(isPublishableArticle(gurugramPositiveMarketArticle, sentIds), true);
assert.equal(classifyArticle(gurugramPositiveMarketArticle), "positive_city_market");

const faridabadPositiveMarketArticle = publishable({
  title: "Faridabad emerges as a strong real estate destination in NCR",
  description: "The report says Faridabad property market is gaining momentum with housing demand.",
  articleText: "Faridabad real estate growth is supported by infrastructure and better connectivity.",
  newsLink: "https://example.com/faridabad-strong-real-estate-destination"
});

assert.deepEqual(detectCityCodes(faridabadPositiveMarketArticle), ["faridabad"]);
assert.equal(isPublishableArticle(faridabadPositiveMarketArticle, sentIds), true);
assert.equal(classifyArticle(faridabadPositiveMarketArticle), "positive_city_market");

assert.match(
  reasons({
    title: "Global disruptions create a 'spring effect', says Vikas Oberoi of Oberoi Realty",
    description: "The company discusses its Gurugram expansion plans.",
    articleText: "The article mentions a Gurugram project, but the headline is broad market commentary.",
    newsLink: "https://example.com/oberoi-realty-bets-on-gurugram-despite-global-uncertainty"
  }).join("; "),
  /spam\/menu page/
);

assert.match(
  reasons({
    title: "Oberoi Realty reports bookings worth Rs 8,109 crore for its first Gurugram project",
    description: "The company reported bookings for its first Gurugram project.",
    articleText: "The Gurugram project bookings update includes the specific project context.",
    newsLink: "https://example.com/oberoi-realty-gurugram-project-bookings"
  }).join("; "),
  /^$/
);

assert.match(
  reasons({
    title: "Oberoi Realty bets big on Delhi-NCR with Rs 6,000 crore luxury Gurugram project",
    description:
      "The Mumbai developer is expanding its residential portfolio with a premium Gurugram project in Delhi-NCR.",
    articleText:
      "The Gurugram project adds ultra-luxury residences and supports Delhi-NCR real estate growth. Mumbai is mentioned only as developer context.",
    newsLink: "https://example.com/oberoi-realty-delhi-ncr-gurugram-project"
  }).join("; "),
  /^$/
);

assert.deepEqual(
  detectCityCodes(
    publishable({
      title: "Oberoi Realty bets big on Delhi-NCR with Rs 6,000 crore luxury Gurugram project",
      description:
        "The Mumbai developer is expanding its residential portfolio with a premium Gurugram project in Delhi-NCR.",
      articleText:
        "The Gurugram project adds ultra-luxury residences and supports Delhi-NCR real estate growth.",
      newsLink: "https://example.com/oberoi-realty-delhi-ncr-gurugram-project"
    })
  ),
  ["gurugram"]
);

assert.match(
  reasons({
    title: "Gurugram RERA approves 51 real estate projects worth Rs 38,000 crore in H1 2026",
    description: "The approvals cover new Gurugram real estate projects and development activity.",
    articleText: "The approved projects add residential and commercial development in Gurugram.",
    newsLink: "https://example.com/gurugram-rera-approves-projects-worth-rs-38000-crore"
  }).join("; "),
  /^$/
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
    title: "Gurugram: Two missing links force seven km detour to e-way for Vatika commuters",
    description: "Commuters face a long detour due to missing road links near Gurugram.",
    articleText: "Residents said the missing links force a seven km detour to the expressway.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/infrastructure/gurugram-two-missing-links-force-detour"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

assert.match(
  reasons({
    title: "Gurugram civic body plans to seal properties, auction assets over unpaid GRAP challans",
    description: "The civic body may seal properties and auction assets over unpaid challans.",
    articleText: "The update concerns enforcement action and unpaid GRAP challans.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/industry/mcg-to-seal-properties-auction-assets"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

assert.match(
  reasons({
    title: "Property sales, registrations barred in Valley View Estate in Gurugram as licence lapses",
    description: "Property sales and registrations were barred after the development licence lapsed.",
    articleText: "The article is about a lapsed licence and barred transactions in Gurugram.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/regulatory/property-sales-barred"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

assert.match(
  reasons({
    title: "GRAP-4 in action, so what? Construction waste lies in open in Gurugram",
    description: "The report discusses GRAP-4 and construction dust concerns.",
    articleText: "Pollution and construction dust concerns continue under GRAP restrictions.",
    newsLink: "https://realty.economictimes.indiatimes.com/news/infrastructure/grap-4-gurugram"
  }).join("; "),
  /negative\/crime\/utility concern news/
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

assert.match(
  reasons({
    title: "Housr Introduces Zero-Deposit Rentals For Premium Co-Living Across India",
    description: "The rental product is available across India.",
    articleText: "The article mentions Gurugram only as one operating market.",
    newsLink: "https://realtynmore.com/housr-introduces-zero-deposit-rentals-for-premium-co-living-across-india/"
  }).join("; "),
  /spam\/menu page|target region missing|no allowed city match/
);

assert.match(
  reasons({
    title: "How Infrastructure and Urban Growth Are Driving Retail Expansion in NCR Markets",
    description:
      "New Delhi, June 25, 2026: NCR retail geography revolved around South Delhi and Central Gurugram.",
    articleText: "The article compares South Delhi with Central Gurugram retail markets.",
    newsLink: "https://realtynmore.com/how-infrastructure-and-urban-growth-ncr-markets/"
  }).join("; "),
  /outside region/
);

assert.match(
  reasons({
    title: "Gurugram luxury project launch sees strong buyer interest",
    description: "The Gurugram residential project adds premium housing near Golf Course Road.",
    articleText:
      "The Gurugram project focuses on premium residential development in Gurugram. The report also compares demand with Bengaluru.",
    newsLink: "https://example.com/gurugram-project-launch"
  }).join("; "),
  /^$/
);

assert.match(
  reasons({
    title: "Faridabad housing project launch adds new inventory",
    description: "The Faridabad residential project adds new apartments in Greater Faridabad.",
    articleText:
      "The Faridabad launch focuses on Greater Faridabad and Neharpar. The article also mentions Mumbai market trends.",
    newsLink: "https://example.com/faridabad-project-launch"
  }).join("; "),
  /^$/
);

assert.match(
  reasons({
    title: "Gurugram luxury project launch sees strong buyer interest",
    description: "The Gurugram residential project adds premium housing near Golf Course Road.",
    articleText:
      "Police said a fire and short circuit injured workers at the project site.",
    newsLink: "https://example.com/gurugram-project-severe-body-negative"
  }).join("; "),
  /negative\/crime\/utility concern news/
);

console.log("Filter smoke tests passed.");
