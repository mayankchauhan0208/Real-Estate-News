import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { classifyArticle, detectCityCodes, extractArticleText, getRejectionReasons, isPublishableArticle } from "../src/index.js";

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

const manesarFlyoverWithoutPropertyNexus = {
  ...common,
  cityCode: "gurugram",
  title: "Smoother Drive to Manesar: New Gurgaon Flyover Set to Decongest Key Junctions Near Dwarka Expressway",
  description: "GMDA plans a new Gurgaon flyover to reduce traffic bottlenecks and improve commuter connectivity.",
  newsLink: "https://www.magicbricks.com/news/smoother-drive-to-manesar-new-gurgaon-flyover-set-to-decongest-key-junctions-near-dwarka-expressway-jkmb/151946.html",
  articleText: "The GMDA flyover will reduce traffic congestion between New Gurgaon and Manesar. A later promotional section mentions generic real-estate impact, but the article does not identify a property development, land event, or development-zone decision tied to the flyover."
};

const unreadableOrdinaryNews = {
  ...common,
  fullArticleRead: false,
  cityCode: "gurugram",
  title: "New residential project announced in Gurugram",
  newsLink: "https://example.com/gurugram/new-residential-project",
  articleText: "New residential project announced."
};

const portalAndStatusPages = [
  {
    ...common,
    cityCode: "ahmedabad",
    title: "MIG - LIG - EWS Housing Schemes - Online Application Forms for Vacant Houses of AUDA",
    newsLink: "https://auda.org.in:8443/",
    articleText: "Ahmedabad Urban Development Authority online housing application portal."
  },
  {
    ...common,
    cityCode: "dhanbad",
    title: "Project Registration Status",
    newsLink: "https://jharera.jharkhand.gov.in/Home/DataCorrection",
    articleText: "All Rights Reserved by JHARERA. Data correction and project registration status portal."
  },
  {
    ...common,
    cityCode: "dhanbad",
    title: "Project Extension Status",
    newsLink: "https://jharera.jharkhand.gov.in/Home/ProjectExtensionCorrection",
    articleText: "All Rights Reserved by JHARERA. Project extension correction portal."
  },
  {
    ...common,
    cityCode: "dhanbad",
    title: "ULB Project Registration Status",
    newsLink: "https://jharera.jharkhand.gov.in/Home/ULBDataCorrection",
    articleText: "All Rights Reserved by JHARERA. ULB project registration correction portal."
  }
];

const offTopicFeedContamination = [
  {
    ...common,
    cityCode: "noida",
    sourceUrl: "https://timesofindia.indiatimes.com/city/noida",
    title: "OpenAI GPT 6.1 Sol",
    newsLink: "https://timesofindia.indiatimes.com/technology/tech-news/openai-launches-gpt-6-1-sol/articleshow/134582763.cms",
    articleText: "OpenAI launched a new technology model with pricing and performance details."
  },
  {
    ...common,
    cityCode: "noida",
    sourceUrl: "https://timesofindia.indiatimes.com/city/noida",
    title: "Pebble Wellness Band",
    newsLink: "https://timesofindia.indiatimes.com/technology/tech-news/pebble-launches-qore-ultra-wellness-band/articleshow/134583984.cms",
    articleText: "Pebble launched a wellness band with health tracking and battery features."
  },
  {
    ...common,
    cityCode: "faridabad",
    title: "Valuations of IT stocks already capture most of AI disruption risk",
    newsLink: "https://economictimes.indiatimes.com/markets/stocks/news/valuations-of-it-stocks-already-capture-most-of-ai-disruption-risk/articleshow/134673144.cms",
    articleText: "The article discusses stock valuations and AI disruption risk for technology companies."
  },
  {
    ...common,
    cityCode: "bhatinda",
    title: "Mithapur women celebrate sons' Asian Games gold",
    newsLink: "https://www.tribuneindia.com/news/jalandhar/mithapur-women-celebrate-sons-asian-games-gold",
    articleText: "Families celebrate a sporting achievement and discuss the Asian Games."
  },
  {
    ...common,
    cityCode: "patna",
    title: "How India Inc can turn AI investment into productivity",
    newsLink: "https://www.hindustantimes.com/ht-insight/future-tech/how-india-inc-can-turn-ai-investment-into-productivity-101791136306123.html",
    articleText: "The article discusses artificial intelligence investment and business productivity."
  }
];

const externalDeveloperMediaArticle = {
  ...common,
  cityCode: "noida",
  sourceUrl: "https://smartworlddevelopers.com/media",
  authoritativeContent: true,
  fullArticleRead: false,
  articleReadAttempted: false,
  title: "How Airports Create Wealth: Lessons From Global Cities And Noida’s Opportunity",
  newsLink: "https://www.outlookmoney.com/invest/how-airports-create-wealth-lessons-from-global-cities-and-noidas-opportunity",
  articleText: "Smartworld Developers discusses Noida property demand and airport-led development in a media update."
};

const greaterNoidaNcrArticle = {
  ...common,
  cityCode: "noida",
  title: "Puravankara acquires 13.44-acre land parcel in Greater Noida for ₹340 crore",
  description: "The developer enters the Delhi-NCR real estate market with a land parcel in Greater Noida.",
  newsLink: "https://realty.economictimes.indiatimes.com/news/industry/puravankara-acquires-13-44-acre-land-parcel-in-greater-noida-for-340-crore/134402153",
  articleText: "Puravankara acquired a land parcel in Greater Noida for a residential development in the Delhi-NCR market."
};

const diplomaticTopicFeedContamination = {
  ...common,
  cityCode: "new_delhi",
  title: "PM Modi meets Swiss president Parmelin in Delhi; trade, investment on agenda",
  description: "Prime Minister Narendra Modi met Swiss Confederation president Guy Parmelin at Hyderabad House in New Delhi.",
  newsLink: "https://timesofindia.indiatimes.com/india/pm-modi-meets-swiss-president-parmelin-in-delhi-trade-investment-on-agenda/articleshow/134689705.cms",
  articleText: "The leaders discussed bilateral relations, trade and investment. No property, land, housing or development event was reported."
};

const exciseTopicFeedContamination = {
  ...common,
  cityCode: "new_delhi",
  title: "Delhi excise department invites applications to reduce imported liquor prices after India-UK trade pact",
  description: "The department said the trade agreement reduced customs duty on specified liquor imports.",
  newsLink: "https://www.hindustantimes.com/india-news/delhi-excise-department-invites-applications-to-reduce-imported-liquor-prices-after-india-uk-trade-pact-101791176127850.html",
  articleText: "The Delhi Excise Department asked wholesale liquor licence holders to apply for revised maximum retail prices. The order concerns customs duty and liquor pricing, not property or development."
};

const genericRrtsTopicFeedContamination = {
  ...common,
  cityCode: "faridabad",
  title: "Gurugram to Faridabad in 20 minutes: Namo Bharat RRTS corridor proposed",
  description: "A proposed Namo Bharat RRTS corridor could cut travel time between Gurugram and Faridabad.",
  newsLink: "https://www.tribuneindia.com/news/haryana/gurugram-to-faridabad-in-20-minutes-namo-bharat-rrts-corridor-proposed",
  articleText: "The proposed rail corridor would improve public transport connectivity. A late speculative paragraph says it could influence real-estate demand, but no property project, land event, development zone or property-market evidence is reported."
};

const multiRegionFinanceReview = {
  ...common,
  cityCode: "new_delhi",
  title: "Saroj Poddar Group, Keventer launch ₹400 crore real estate debt AIF",
  description: "The fund will invest in secured real estate debt opportunities across Delhi-NCR and West Bengal.",
  newsLink: "https://realty.economictimes.indiatimes.com/news/industry/saroj-poddar-group-keventer-launch-400-crore-real-estate-debt-aif/134651253",
  articleText: "The sponsors launched a Category II fund for secured real estate debt opportunities across Delhi-NCR and West Bengal. No city-specific project or land event is named."
};

const ordinaryMultiplexLaunch = {
  ...common,
  cityCode: "faridabad",
  title: "Cinépolis India Launches Second Multiplex in Faridabad at City Life Mall",
  description: "Cinépolis India has launched a new four-screen multiplex at City Life Mall.",
  newsLink: "https://realtynmore.com/cinepolis-india-launches-second-multiplex-in/",
  articleText: "The cinema opened inside an existing mall. The article describes screens, seats and catchment demand, but does not report a new mall, lease transaction or property development event."
};

const jagranFlightRouteWithoutPropertyNexus = {
  ...common,
  cityCode: "noida",
  source: "Dainik Jagran Noida",
  title: "दिल्ली-NCR से उत्तराखंड का सफर और भी आसान, नोएडा एयरपोर्ट से कुमाऊं की उड़ान शुरू; खाने-टैक्सी पर खास छूट",
  description: "पंतनगर और नोएडा इंटरनेशनल एयरपोर्ट के बीच सीधी हवाई सेवा शुरू होने से कुमाऊं क्षेत्र को दिल्ली-एनसीआर से बेहतर कनेक्टिविटी मिली है।",
  newsLink: "https://www.jagran.com/uttar-pradesh/noida-ncr-direct-flight-service-between-noida-airport-and-pantnagar-24000001.html",
  articleText: "पंतनगर और नोएडा इंटरनेशनल एयरपोर्ट के बीच सीधी हवाई सेवा शुरू हुई। इससे पर्यटन, धार्मिक यात्राओं और व्यावसायिक गतिविधियों को बढ़ावा मिलेगा। यात्रियों को खाने और टैक्सी पर छूट दी जाएगी।"
};

const jagranDeepTechFundraisingWithoutPropertyNexus = {
  ...common,
  cityCode: "kanpur",
  source: "Dainik Jagran Kanpur",
  title: "IIT Kanpur का सबसे बड़ा अभियान: डीप-टेक, एआई और क्वांटम रिसर्च को मिलेगी रफ्तार, लैब से निकलेंगे भविष्य के उद्यमी",
  description: "आईआईटी कानपुर ने ग्रेटर दैन अस अभियान शुरू किया, जिसका लक्ष्य मार्च 2029 तक एक अरब डॉलर जुटाना है।",
  newsLink: "https://www.jagran.com/uttar-pradesh/kanpur-city-iit-kanpur-launches-billion-dollar-deep-tech-fundraising-campaign-24000002.html",
  articleText: "अभियान डीप-टेक, एआई और क्वांटम अनुसंधान को आगे बढ़ाने के लिए एक अरब डॉलर जुटाएगा। संस्थान लैब से नए उद्यमी और तकनीकी स्टार्टअप तैयार करेगा।"
};

const jagranAgraMuseumAndMallConstruction = {
  ...common,
  cityCode: "agra",
  source: "Dainik Jagran Agra",
  title: "आगरा छत्रपति शिवाजी म्यूजियम और यूनिटी मॉल का काम समय पर हो पूरा, डीएम मनीष के सख्त निर्देश",
  description: "डीएम ने शहर की विकास परियोजनाओं की समीक्षा कर म्यूजियम और यूनिटी मॉल का निर्माण समय पर पूरा करने के निर्देश दिए।",
  newsLink: "https://www.jagran.com/uttar-pradesh/agra-city-dm-reviews-unity-mall-and-museum-construction-24000003.html",
  articleText: "आगरा में निर्माणाधीन छत्रपति शिवाजी म्यूजियम और यूनिटी मॉल की बिल्डिंग का निर्माण तय समय में पूरा किया जाएगा। डीएम ने दोनों विकास परियोजनाओं की प्रगति की समीक्षा की।"
};

const jagranPrayagrajFlatsAndLandRedevelopment = {
  ...common,
  cityCode: "allahabad",
  source: "Dainik Jagran Prayagraj",
  title: "योगी आदित्यनाथ ने प्रयागराज के कसारी-मसारी इलाके को कृष्णपुरी नाम दिया",
  description: "माफिया से मुक्त कराई गई जमीन पर 602 फ्लैट का पद्मलोक अपार्टमेंट बनाया जाएगा।",
  newsLink: "https://www.jagran.com/uttar-pradesh/prayagraj-land-redevelopment-602-flats-padmalok-apartment-24000004.html",
  articleText: "प्रयागराज में मुक्त कराई गई भूमि पर गरीब परिवारों के लिए 602 फ्लैट का पद्मलोक अपार्टमेंट बनेगा। मुख्यमंत्री ने आवासीय पुनर्विकास परियोजना का भूमि पूजन किया।"
};

const jagranCommodityPriceReport = {
  ...common,
  cityCode: "kanpur",
  source: "Dainik Jagran Kanpur",
  title: "कानपुर मंडी भाव 15 अक्टूबर: गेहूं, चावल और दाल के ताजा रेट, देखें Gold-Silver के दाम",
  description: "कानपुर के खुले बाजार में गल्ला, दलहन, चावल, तेल, सोना और चांदी के थोक भाव जारी किए गए।",
  newsLink: "https://www.jagran.com/uttar-pradesh/kanpur-city-kanpur-mandi-bhav-grain-pulses-gold-silver-prices-today-40406330.html",
  articleText: "कानपुर मंडी भाव। खुले बाजार में गेहूं, चावल, दाल और खाद्य तेल के आज के रेट जारी हुए। सर्राफा बाजार में सोने और चांदी के भावों में परिवर्तन हुआ।"
};

function extractedFixtureArticle(body, surroundingHtml, overrides = {}) {
  const $ = cheerio.load(`<html><body><header>Development Authority</header><nav>Housing projects</nav><main><article><h1>${overrides.title || "Fixture"}</h1><p>${body}</p></article>${surroundingHtml}</main><footer>Real estate development</footer></body></html>`);
  return {
    ...common,
    cityCode: overrides.cityCode || "kanpur",
    title: overrides.title || "Fixture",
    description: overrides.description || body,
    newsLink: overrides.newsLink || "https://example.com/city/fixture",
    articleText: extractArticleText($)
  };
}

const commodityWithPropertySidebar = extractedFixtureArticle(
  "कानपुर मंडी भाव में गेहूं, दाल, सोना और चांदी के आज के रेट जारी हुए।",
  "<aside>Development Authority launches housing scheme</aside><section class='related-stories'>New housing project approved</section>",
  { title: "आज का मंडी भाव और सोने-चांदी का रेट" }
);
const sportsWithHousingRelatedLink = extractedFixtureArticle(
  "Kanpur won the cricket match after a strong bowling performance.",
  "<section class='related'>New housing project approved</section>",
  { title: "Kanpur wins cricket final" }
);
const weatherWithAuthorityNavigation = extractedFixtureArticle(
  "Heavy rain and cloudy weather are forecast in Kanpur tomorrow.",
  "<nav>Development Authority land allotment</nav>",
  { title: "Kanpur weather forecast for tomorrow" }
);
const authorityHousingWithCommoditySidebar = extractedFixtureArticle(
  "The Noida Authority approved a housing scheme and plot allotment for a residential project.",
  "<aside>Gold and silver prices today</aside>",
  { cityCode: "noida", title: "Noida Authority approves housing scheme and plot allotment", newsLink: "https://example.com/noida/authority-housing" }
);

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
assert.equal(isPublishableArticle(manesarFlyoverWithoutPropertyNexus, sentIds), false);
assert.match(getRejectionReasons(manesarFlyoverWithoutPropertyNexus, sentIds).join("; "), /not positive target real-estate|POSITIVE_INFRASTRUCTURE_WITHOUT_SUFFICIENT_REAL_ESTATE_NEXUS/);
assert.equal(isPublishableArticle(unreadableOrdinaryNews, sentIds), false);
assert.match(getRejectionReasons(unreadableOrdinaryNews, sentIds).join("; "), /FULL_ARTICLE_EXTRACTION_FAILED/);
for (const article of portalAndStatusPages) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
  assert.match(getRejectionReasons(article, sentIds).join("; "), /portal\/status\/landing page/);
}
for (const article of offTopicFeedContamination) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
}
assert.equal(isPublishableArticle(externalDeveloperMediaArticle, sentIds), false);
assert.match(getRejectionReasons(externalDeveloperMediaArticle, sentIds).join("; "), /FULL_ARTICLE_EXTRACTION_FAILED/);
assert.deepEqual(detectCityCodes(greaterNoidaNcrArticle), ["noida"]);
for (const article of unrelatedTopicPageArticles) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
}
for (const article of [diplomaticTopicFeedContamination, exciseTopicFeedContamination, genericRrtsTopicFeedContamination]) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
}
assert.equal(isPublishableArticle(multiRegionFinanceReview, sentIds), false);
assert.match(getRejectionReasons(multiRegionFinanceReview, sentIds).join("; "), /multi-region real-estate finance update/);
assert.equal(isPublishableArticle(ordinaryMultiplexLaunch, sentIds), false);
assert.equal(isPublishableArticle(jagranFlightRouteWithoutPropertyNexus, sentIds), false);
assert.match(getRejectionReasons(jagranFlightRouteWithoutPropertyNexus, sentIds).join("; "), /GENERIC_TRANSPORT_CONNECTIVITY_WITHOUT_PROPERTY_NEXUS/);
assert.equal(isPublishableArticle(jagranDeepTechFundraisingWithoutPropertyNexus, sentIds), false);
assert.match(getRejectionReasons(jagranDeepTechFundraisingWithoutPropertyNexus, sentIds).join("; "), /NON_REAL_ESTATE_STARTUP_TECH_FUNDRAISING/);
assert.equal(isPublishableArticle(jagranAgraMuseumAndMallConstruction, sentIds), true);
assert.equal(isPublishableArticle(jagranPrayagrajFlatsAndLandRedevelopment, sentIds), true);
assert.equal(isPublishableArticle(jagranCommodityPriceReport, sentIds), false);
assert.equal(classifyArticle(jagranCommodityPriceReport), "reject_relevance");
assert.match(getRejectionReasons(jagranCommodityPriceReport, sentIds).join("; "), /COMMODITY_MARKET_PRICES_WITHOUT_PROPERTY_EVENT/);
for (const article of [commodityWithPropertySidebar, sportsWithHousingRelatedLink, weatherWithAuthorityNavigation]) {
  assert.equal(isPublishableArticle(article, sentIds), false, article.title);
}
assert.equal(isPublishableArticle(authorityHousingWithCommoditySidebar, sentIds), true);

console.log(JSON.stringify({
  passed: true,
  nhaI: "REJECTED_NO_PROPERTY_NEXUS",
  dda: "REJECTED_FULL_BODY_ADVERSE_EVENT",
  mumbaiRegistrations: "PUBLISHABLE",
  propertyLinkedInfrastructure: "PUBLISHABLE",
  manesarFlyoverWithoutPropertyNexus: "REJECTED",
  unreadableOrdinaryNews: "REJECTED",
  portalAndStatusPages: "REJECTED",
  offTopicFeedContamination: "REJECTED",
  externalDeveloperMediaArticle: "REJECTED_WITHOUT_SAME_SITE_AUTHORITY_BYPASS",
  unrelatedTopicPageArticles: "REJECTED"
  ,newlyProtectedTopicFeedContamination: "REJECTED"
  ,jagranPrecisionGate: "2_FALSE_POSITIVES_REJECTED_2_VALID_DEVELOPMENTS_PRESERVED"
}, null, 2));
