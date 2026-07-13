import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
  applyCityCode,
  cleanArticleFields,
  detectCityCodes,
  extractMetadataImage,
  getExtraArticleUrls,
  getRejectionReasons,
  getSourcePageUrls,
  hasBackfillDateRange,
  isAllowedSource,
  isLikelyFeedUrl,
  isPublishableArticle,
  isWithinBackfillDateRange,
  shouldSkipTitle
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

assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/real-estate/"), true);
assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/"), false);
assert.equal(isAllowedSource("https://www.aninews.in/category/business/"), false);
assert.equal(isAllowedSource("https://www.lokmattimes.com/business/"), false);
assert.equal(isAllowedSource("https://www.business-standard.com/search?q=REAL%20ESTATE"), false);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/"), false);
assert.equal(isAllowedSource("https://timesofindia.indiatimes.com/real-estate"), false);
assert.equal(isAllowedSource("https://www.constructionworld.in/"), false);
assert.equal(isAllowedSource("https://www.constructionworld.in/latest-construction-news/real-estate-news"), true);
assert.equal(isAllowedSource("https://housing.com/news/"), false);
assert.equal(isAllowedSource("https://www.squareyards.com/blog"), false);
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
  false
);

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

assert.equal(
  isPublishableArticle(
    publishable({
      title: "Delhi NCR housing sales rise with premium launches",
      description: "Delhi NCR residential launches and sales improved with new real estate projects.",
      articleText: "Premium housing demand increased across Delhi NCR.",
      newsLink: "https://example.com/delhi-ncr-housing-sales"
    }),
    sentIds
  ),
  false
);

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

assert.deepEqual(detectCityCodes(rrtsCorridorArticle).sort(), ["faridabad", "gurugram"]);
assert.equal(isPublishableArticle(rrtsCorridorArticle, sentIds), true);

assert.match(
  reasons({
    title: "Noida and Greater Noida RRTS corridor gets new DPR",
    description: "The regional rapid transit corridor focuses on Noida and Greater Noida.",
    articleText: "The Noida infrastructure project does not include Gurugram or Faridabad as project cities.",
    newsLink: "https://example.com/noida-greater-noida-rrts-dpr"
  }).join("; "),
  /no allowed city match|outside-city conflict|outside region/
);

assert.equal(
  isPublishableArticle(
    publishable({
      title: "Premium housing sales rise with new launches",
      description: "Residential launches and sales improved with new real estate projects.",
      articleText: "The report says Delhi NCR premium housing demand increased with new launches.",
      newsLink: "https://example.com/body-delhi-ncr-housing-sales"
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

assert.match(
  reasons({
    title: "Gurugram housing demand to remain steady in 2026 despite global uncertainty",
    description: "A market report says demand remained steady in Gurugram.",
    articleText: "The report discusses market trends and buyer demand, not a specific project launch.",
    newsLink: "https://example.com/gurugram-housing-demand-market-report"
  }).join("; "),
  /no specific project\/development signal|broad market\/company update/
);

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
