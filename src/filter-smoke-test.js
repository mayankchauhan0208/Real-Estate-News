import assert from "node:assert/strict";
import {
  applyCityCode,
  cleanArticleFields,
  getRejectionReasons,
  isAllowedSource,
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

assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/real-estate/"), true);
assert.equal(isAllowedSource("https://www.moneycontrol.com/news/business/"), false);
assert.equal(isAllowedSource("https://www.aninews.in/category/business/"), false);
assert.equal(isAllowedSource("https://www.lokmattimes.com/business/"), false);
assert.equal(isAllowedSource("https://www.business-standard.com/search?q=REAL%20ESTATE"), false);
assert.equal(isAllowedSource("https://realty.economictimes.indiatimes.com/"), false);
assert.equal(isAllowedSource("https://timesofindia.indiatimes.com/real-estate"), false);
assert.equal(isAllowedSource("https://www.constructionworld.in/"), false);
assert.equal(isAllowedSource("https://housing.com/news/"), false);
assert.equal(isAllowedSource("https://www.squareyards.com/blog"), false);

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
  true
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
  true
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
