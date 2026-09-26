import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import Parser from "rss-parser";
import { citySourceRules, workbookCityRules } from "./city-config.js";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": userAgent
  }
});

const stateDir = path.resolve(".state");
const sentNewsPath = path.join(stateDir, "sent-news.json");
const sentNewsSeedPath = path.resolve("data", "sent-news-seed.json");
const runReportsDir = path.resolve("reports", "runs");
const adminSettingsPath = path.resolve("config", "admin-settings.json");
const adminSettings = readAdminSettings();

const defaultSources = [
  "https://www.magicbricks.com/news/feed",
  "https://www.hindustantimes.com/real-estate",
  "https://www.hindustantimes.com/feeds/rss/cities/gurugram-news/rssfeed.xml",
  "https://www.hindustantimes.com/topic/faridabad/news",
  "https://www.hindustantimes.com/feeds/rss/cities/faridabad-news/rssfeed.xml",
  "https://www.hindustantimes.com/feeds/rss/real-estate/rssfeed.xml",
  "https://economictimes.indiatimes.com/industry/services/property-/-cstruction",
  "https://economictimes.indiatimes.com/rssfeeds/13357019.cms",
  "https://economictimes.indiatimes.com/news/company/corporate-trends",
  "https://www.cnbctv18.com/real-estate/",
  "https://timesofindia.indiatimes.com/real-estate/news",
  "https://timesofindia.indiatimes.com/rssfeeds/6547154.cms",
  "https://indianexpress.com/section/cities/delhi/",
  "https://realty.economictimes.indiatimes.com/tag/gurugram",
  "https://realty.economictimes.indiatimes.com/tag/faridabad",
  "https://realty.economictimes.indiatimes.com/news/residential",
  "https://realty.economictimes.indiatimes.com/news/commercial",
  "https://realty.economictimes.indiatimes.com/news/infrastructure",
  "https://realty.economictimes.indiatimes.com/news/industry",
  "https://realty.economictimes.indiatimes.com/rss/topstories",
  "https://www.moneycontrol.com/news/business/real-estate/",
  "https://www.business-standard.com/topic/real-estate",
  "https://www.constructionworld.in/latest-construction-news/real-estate-news",
  "https://www.outlookmoney.com/topic/real-estate",
  "https://www.tribuneindia.com/topic/real-estate",
  "https://swarajyamag.com/stories.rss",
  "https://www.businessoffood.in/category/food-service/",
  "https://torbitrealty.com/category/news/city-updates/gurugram/",
  "https://indianinfrastructure.com/",
  "https://urbantransportnews.com/",
  "https://www.metrorailnews.in/",
  "https://themetrorailguy.com/",
  "https://news.railanalysis.com/",
  "https://www.delhimetrorail.com/",
  "https://ncrtc.in/",
  "https://realtynmore.com/latest-news/",
  "https://realtynmore.com/feed/",
  "https://realtynxt.com/",
  "https://www.track2realty.track2media.com/",
  "https://propnewstime.com/",
  "https://realtyquarter.com/feed/",
  "https://hsvphry.org.in/",
  "https://haryanarera.gov.in",
  "https://tcpharyana.gov.in",
  "https://mohua.gov.in",
  "https://www.pib.gov.in",
  "https://dda.gov.in",
  "https://gmda.gov.in",
  "https://nhai.gov.in",
  "https://www.bptp.com/media",
  "https://www.dlf.in/media",
  "https://m3mindia.com/media",
  "https://smartworlddevelopers.com/media",
  "https://www.signatureglobal.in/",
  "https://www.centralpark.in/media.php",
  "https://www.godrejproperties.com/media/press",
  "https://in.emaar.com/en/media/",
  "https://www.whitelandcorporation.com/",
  "https://www.whitelandcorp.com",
  "https://maxestates.in/news_and_media",
  "https://www.birlaestates.com/media-centre.aspx",
  "https://www.puriconstructions.com/",
  "https://www.omaxe.com/",
  "https://www.rpsgroupindia.com/"
];

function isLegacyNoidaCityEnabled() {
  return ["1", "true", "yes", "on"].includes((process.env.ENABLE_NOIDA_CITY || "").trim().toLowerCase());
}

const legacyDefaultCityCodes = ["faridabad", "gurugram"];

const CITY_ALIAS_OVERRIDES = {
  faridabad: ["फरीदाबाद", "ग्रेटर फरीदाबाद", "नहरपार", "greater faridabad", "neharpar"],
  gurugram: ["gurgaon", "gurgaon district", "गुरुग्राम", "गुड़गांव", "millennium city", "cyber city", "manesar", "manasar", "मानेसर", "sohna", "सोहना", "pataudi", "patudi", "patodi", "पटौदी", "pataudi mandi", "dwarka expressway", "golf course road", "golf course extension road", "southern peripheral road", "spr", "badshahpur", "farrukh nagar", "farrukhnagar", "wazirabad", "kadipur", "harsaru"],
  faridabad: ["फरीदाबाद", "ग्रेटर फरीदाबाद", "नहरपार", "greater faridabad", "neharpar", "ballabgarh", "बल्लभगढ़", "nit faridabad", "old faridabad"],
  noida: ["greater noida", "ग्रेटर नोएडा", "gautam buddha nagar", "gautam budh nagar", "dadri", "दादरी", "jewar", "जेवर", "yamuna expressway", "yeida", "noida authority", "greater noida authority"],
  palwal: ["palwal district", "पलवल", "prithla", "पृथला", "hathin", "हथीन", "hodal", "होडल", "badoli", "badoli block", "hassanpur", "hassanpur block"],
  rohtak: ["rohtak district", "sampla", "meham", "kalanaur"],
  panipat: ["panipat district", "samalkha", "israna", "madlauda"],
  karnal: ["karnal district", "assandh", "gharaunda", "indri", "nilokheri"],
  sonipat: ["sonipat district", "gohana", "kharkhoda", "rai", "murthal", "kundli"],
  rewari: ["rewari district", "dharuhera", "bawal", "kosli"],
  hisar: ["hissar", "हिसार"],
  mahendragarh: ["narnaul", "नारनौल"],
  nuh: ["mewat", "मेवात"],
  yamunanagar: ["yamuna nagar", "यमुनानगर"],
  charkhi_dadri: ["charkhi dadri", "चरखी दादरी"],
  bangalore: ["bengaluru", "ಬೆಂಗಳೂರು"],
  mumbai: ["bombay", "मुंबई"],
  navi_mumbai: ["new mumbai"],
  chennai: ["madras", "चेन्नई"],
  kolkata: ["calcutta", "कोलकाता"],
  kochi: ["cochin", "कोच्चि"],
  trivandrum: ["thiruvananthapuram", "तिरुवनंतपुरम"],
  allahabad: ["prayagraj", "प्रयागराज", "इलाहाबाद"],
  varanasi: ["banaras", "काशी"],
  mysore: ["mysuru", "मैसूरु"]
};

function enrichCityRuleAliases(rule) {
  const codeAlias = String(rule.code || "").replaceAll("_", " ").trim().toLowerCase();
  const nameAlias = String(rule.name || "").trim().toLowerCase();
  const generatedAliases = [
    codeAlias,
    nameAlias,
    nameAlias ? `${nameAlias} city` : "",
    nameAlias ? `${nameAlias} district` : ""
  ];
  const aliases = CITY_ALIAS_OVERRIDES[rule.code] || [];
  return {
    ...rule,
    keywords: [...new Set([...(rule.keywords || []), ...generatedAliases, ...aliases].map((value) => String(value || "").trim()).filter(Boolean))]
  };
}

const allCityRules = workbookCityRules.map(enrichCityRuleAliases);
const allCityCodeSet = new Set(allCityRules.map((rule) => rule.code));
const enabledCityCodeSet = getEnabledCityCodeSet();
const cityRules = allCityRules.filter((rule) => enabledCityCodeSet.has(rule.code));

function getEnabledCityCodeSet() {
  const requestedCityCodes = splitDelimitedValues(env("ENABLED_CITY_CODES"))
    .map((code) => code.toLowerCase())
    .filter(Boolean);
  const adminEnabledCityCodes = Array.isArray(adminSettings.enabledCityCodes)
    ? adminSettings.enabledCityCodes.map((code) => String(code || "").trim().toLowerCase()).filter(Boolean)
    : [];
  const disabledCityCodes = new Set([
    ...(Array.isArray(adminSettings.disabledCityCodes) ? adminSettings.disabledCityCodes : []),
    ...splitDelimitedValues(env("DISABLED_CITY_CODES"))
  ].map((code) => String(code || "").trim().toLowerCase()).filter(Boolean));

  const enabled = requestedCityCodes.length > 0
    ? new Set(
      requestedCityCodes.includes("all")
        ? allCityRules.map((rule) => rule.code)
        : requestedCityCodes.filter((code) => allCityCodeSet.has(code))
    )
    : adminSettings.allCitiesEnabled === true
      ? new Set(allCityRules.map((rule) => rule.code))
      : new Set(
        adminEnabledCityCodes.length > 0
          ? adminEnabledCityCodes.filter((code) => allCityCodeSet.has(code))
          : [
            ...legacyDefaultCityCodes,
            ...(isLegacyNoidaCityEnabled() ? ["noida"] : [])
          ]
      );

  for (const code of disabledCityCodes) {
    enabled.delete(code);
  }

  return enabled;
}

function isNoidaCityEnabled() {
  return enabledCityCodeSet.has("noida");
}

function getActiveCitySources() {
  return citySourceRules
    .filter((rule) => enabledCityCodeSet.has(rule.code))
    .flatMap((rule) => rule.urls);
}

const gurugramCorridorKeywords = [
  "dwarka expressway",
  "elevated spr",
  "golf course road",
  "golf course extension road",
  "southern peripheral road",
  "spr"
];
const targetInfrastructureCorridorKeywords = [
  "dpr",
  "highway",
  "metro corridor",
  "ncrtc",
  "rapid rail",
  "regional rapid transit",
  "rrts",
  "namo bharat",
  "transit corridor"
];
const ncrCommercialOfficeKeywords = [
  "commercial leasing",
  "commercial office",
  "gross office leasing",
  "office leasing",
  "office market",
  "office space"
];
const faridabadJewarGrowthKeywords = [
  "faridabad-jewar expressway",
  "jewar airport",
  "jewar expressway",
  "noida international airport"
];
const positiveGrowthCatalystKeywords = [
  "appreciation catalyst",
  "attractive pricing",
  "boom",
  "connectivity",
  "development",
  "emerging realty hub",
  "growth",
  "विकास",
  "infra development",
  "infrastructure development",
  "infrastructure-led growth",
  "infrastructure led growth",
  "infrastructure upgrades",
  "investor",
  "investor interest",
  "premier real estate destination",
  "sector 150 gains traction",
  "poised for rapid transformation",
  "real estate market",
  "transformation"
];
const positiveCityMarketKeywords = [
  "100 mn sq ft office market",
  "built-up area expands",
  "built up area expands",
  "capital appreciation",
  "3 crore budget",
  "home buyer",
  "home-buyer",
  "city rise",
  "demand remains resilient",
  "drives ncr housing market",
  "emerging market",
  "emerging ncr realty hub",
  "emerging real estate market",
  "emerging realty hub",
  "emerges as a strong real estate destination",
  "gaining momentum",
  "growth market",
  "housing demand",
  "housing market",
  "luxury senior living hub",
  "senior living hub",
  "homebuyers are looking beyond",
  "infra development",
  "infrastructure development",
  "infrastructure inflection",
  "infrastructure-led growth",
  "infrastructure led growth",
  "investment destination",
  "investment potential",
  "investor interest",
  "premier real estate destination",
  "sector 150 gains traction",
  "largest market",
  "market momentum",
  "modern urban hub",
  "office market",
  "office milestone",
  "office stock",
  "market remains resilient",
  "property market",
  "rental yield",
  "rental yields",
  "real estate destination",
  "real estate hotspot",
  "realty destination",
  "real estate expansion",
  "real estate growth",
  "real estate hierarchy",
  "real estate market",
  "real estate rise",
  "premium housing market",
  "redefining ncr",
  "realty hub",
  "strong real estate destination"
];

const requiredPayloadFields = [
  "title",
  "description",
  "cityCode",
  "newsLink",
  "thumbnailImage",
  "postedBy",
  "createdAt",
  "postedByLogo"
];

const ncrKeywords = ["delhi ncr"];
const ncrCityCodes = isNoidaCityEnabled() ? ["gurugram", "faridabad", "noida"] : ["gurugram", "faridabad"];
const ncrDelhiCityCodes = enabledCityCodeSet.has("new_delhi") ? ["new_delhi"] : [];
const targetCityKeywords = [...cityRules.flatMap((rule) => rule.keywords), ...ncrKeywords];
const reraKeywords = ["rera", "hrera", "h-rera", "real estate regulatory authority"];
const courtKeywords = [
  "court",
  "courts",
  "hc",
  "interim",
  "restrain",
  "restrained",
  "restraining",
  "supreme court",
  "high court",
  "tribunal",
  "nclt",
  "nclat",
  "case",
  "cases",
  "litigation",
  "order",
  "judgment",
  "judgement",
  "plea",
  "petition"
];
const realEstateKeywords = [
  "affordable housing",
  "apartment",
  "appreciation",
  "approval",
  "मंजूरी",
  "builder",
  "carpet area",
  "commercial property",
  "commercial real estate",
  "कमर्शियल रियल एस्टेट",
  "connectivity",
  "corridor",
  "developer",
  "development",
  "development authority",
  "dlf",
  "dwelling",
  "expressway",
  "एक्सप्रेसवे",
  "flat",
  "floor",
  "growth corridor",
  "highway",
  "homebuyer",
  "homebuyers",
  "housing",
  "हाउसिंग",
  "घर खरीदार",
  "होमबायर",
  "infra",
  "infrastructure",
  "इंफ्रास्ट्रक्चर",
  "बुनियादी ढांचा",
  "investment",
  "निवेश",
  "inaugurated",
  "land parcel",
  "जमीन",
  "भूमि",
  "launch",
  "लॉन्च",
  "शुरू",
  "launched",
  "launches",
  "lease",
  "luxury housing",
  "luxury homes",
  "master plan",
  "metro",
  "मेट्रो",
  "new project",
  "new project launch",
  "office space",
  "price appreciation",
  "plot",
  "possession",
  "project",
  "परियोजना",
  "प्रोजेक्ट",
  "property",
  "प्रॉपर्टी",
  "संपत्ति",
  "rapid rail",
  "real estate",
  "रियल एस्टेट",
  "रियल्टी",
  "realty",
  "redevelopment",
  "registry",
  "residential",
  "आवासीय",
  "rrts",
  "sector",
  "stamp duty",
  "township",
  "transit-oriented development"
];
const promotionalRealEstateKeywords = [
  "affordable housing",
  "appreciation",
  "approval",
  "मंजूरी",
  "approved",
  "मंजूर",
  "allotment",
  "allotments",
  "bookings",
  "customer confidence",
  "commercial property",
  "commercial real estate",
  "कमर्शियल रियल एस्टेट",
  "completion",
  "पूरा",
  "connectivity",
  "corridor",
  "delivered",
  "delivery",
  "डिलीवरी",
  "develop",
  "developed",
  "developer",
  "development",
  "expansion",
  "expressway",
  "एक्सप्रेसवे",
  "earnings",
  "growth",
  "विकास",
  "growth corridor",
  "highway",
  "housing",
  "हाउसिंग",
  "घर खरीदार",
  "होमबायर",
  "infra",
  "infrastructure",
  "इंफ्रास्ट्रक्चर",
  "बुनियादी ढांचा",
  "inaugurated",
  "investment",
  "निवेश",
  "launch",
  "लॉन्च",
  "शुरू",
  "launched",
  "launches",
  "luxury housing",
  "luxury homes",
  "luxury living",
  "metro",
  "मेट्रो",
  "new project",
  "new project launch",
  "ncrtc",
  "premium housing",
  "premium housing market",
  "office space",
  "possession",
  "profit",
  "net profit",
  "price appreciation",
  "project",
  "परियोजना",
  "प्रोजेक्ट",
  "rapid rail",
  "real estate",
  "रियल एस्टेट",
  "रियल्टी",
  "realty",
  "redevelopment",
  "regional rapid transit",
  "residential",
  "आवासीय",
  "results",
  "revenue",
  "rrts",
  "sales",
  "township"
];
const tataRealEstateCompanyKeywords = [
  "tata housing",
  "tata realty",
  "tata realty and infrastructure",
  "tata value homes",
  "tata projects",
  "tril"
];

const realEstateCompanyKeywords = [
  "dlf",
  "dlf homes",
  "dlf ltd",
  "bptp",
  "bptp ltd",
  "gaurs",
  "gaur group",
  "gaursons",
  "gaursons india",
  "gaurs group",
  "godrej properties",
  ...tataRealEstateCompanyKeywords,
  "lodha",
  "macrotech",
  "prestige estates",
  "brigade enterprises",
  "sobha",
  "oberoi realty",
  "phoenix mills",
  "signature global",
  "anant raj",
  "eldeco",
  "ashiana housing",
  "kolte-patil",
  "mahindra lifespace",
  "m3m",
  "raymond realty",
  "smartworld",
  "elan",
  "whiteland",
  "tulip",
  "tulip group",
  "central park",
  "emaar india",
  "emaar",
  "omaxe",
  "puri constructions",
  "puri",
  "rps",
  "srs"
];
const nationalBusinessKeywords = [
  "q1",
  "q2",
  "q3",
  "q4",
  "quarter",
  "quarterly",
  "net profit",
  "profit",
  "revenue",
  "sales",
  "pre-sales",
  "presales",
  "booking",
  "bookings",
  "earnings",
  "results",
  "ipo",
  "shares",
  "stock",
  "market cap",
  "fundraise",
  "fund raising",
  "investment",
  "निवेश",
  "acquisition",
  "merger"
];
const targetRealEstateCorporateCompanies = [
  {
    code: "gurugram",
    keywords: ["dlf", "dlf homes", "dlf ltd"]
  },
  {
    code: "",
    keywords: ["bptp", "bptp ltd"]
  },
  {
    code: "",
    keywords: tataRealEstateCompanyKeywords
  },
  {
    code: "gurugram",
    keywords: [
      "m3m",
      "signature global",
      "smartworld",
      "elan",
      "whiteland",
      "tulip",
      "tulip group",
      "central park",
      "emaar india",
      "emaar"
    ]
  },
  {
    code: "noida",
    keywords: ["gaurs", "gaur group", "gaursons", "gaursons india", "gaurs group"]
  },
  {
    code: "faridabad",
    keywords: ["omaxe", "puri", "puri constructions", "rps", "srs"]
  }
];
const positiveCorporateRealEstateKeywords = [
  "chairman",
  "ceo",
  "compensation",
  "fy",
  "pay",
  "remuneration",
  "salary"
];
const leadershipBusinessConfidenceKeywords = [
  "aims to create",
  "chairman",
  "ceo",
  "managing director",
  "md",
  "growth market",
  "market expansion",
  "scouts land",
  "scouting land",
  "plans new launches",
  "plans launches",
  "launch pipeline",
  "new launches",
  "offering",
  "core growth market",
  "as important as",
  "bets big",
  "customer confidence",
  "top developer",
  "top developers"
];
const luxuryTransactionKeywords = [
  "apartment purchase",
  "apartments",
  "buys",
  "bought",
  "crore apartment",
  "luxury apartment",
  "luxury apartments",
  "premium apartment",
  "record deal",
  "transaction"
];
const gurugramLuxuryProjectKeywords = [
  "the dahlias",
  "dlf dahlias",
  "the camellias",
  "dlf camellias",
  "the arbour",
  "dlf arbour",
  "the magnolias",
  "dlf magnolias",
  "three sixty north",
  "360 north"
];
const authorityPipelineKeywords = [
  "commercial auction",
  "commercial sites",
  "demarcation",
  "development authority",
  "gnida",
  "hsvp",
  "huda",
  "mixed land use",
  "mixed-use policy",
  "new commercial sites",
  "noida authority",
  "plot scheme",
  "plot allottees",
  "project pipeline",
  "plots",
  "sector demarcation",
  "social infrastructure",
  "tod",
  "transit-oriented development",
  "yeida"
];
const connectivityCatalystKeywords = [
  "connectivity catalyst",
  "expressway",
  "एक्सप्रेसवे",
  "interchange",
  "jewar connectivity",
  "noida airport",
  "noida international airport",
  "metro corridor",
  "metro extension",
  "metro line",
  "spr",
  "southern peripheral road",
  "golf course extension road",
  "golf course road",
  "dwarka expressway",
  "elevated spr",
  "sohna road",
  "faridabad-noida-ghaziabad",
  "fng corridor"
];
const specificProjectKeywords = [
  "acquires land",
  "adds new inventory",
  "allotment",
  "allotments",
  "auction",
  "airport-linked",
  "authority hq",
  "allottees",
  "branded residences",
  "capital appreciation",
  "3 crore budget",
  "home buyer",
  "home-buyer",
  "charging stations",
  "commercial project",
  "commercial sites",
  "commercial plot",
  "commercial plots",
  "complete construction",
  "construction extension",
  "industrial project",
  "industrial projects",
  "develop land",
  "developed a residential",
  "developing a residential",
  "development project",
  "deliver all",
  "delivery by",
  "double-decker road corridor",
  "development of the year",
  "dwarka expressway",
  "elevated spr",
  "golf course extension road",
  "golf course road",
  "gurugram project",
  "group housing project",
  "flyover",
  "hand over",
  "hands over",
  "housing project",
  "land deal",
  "land auction",
  "industrial plots",
  "inaugurate noida authority hq",
  "inaugurates noida authority hq",
  "investment board",
  "investment board nod",
  "kiosks",
  "landmark high-rise development",
  "first gurugram project",
  "first faridabad project",
  "bookings worth",
  "land acquisition",
  "land parcel",
  "जमीन",
  "भूमि",
  "land rates",
  "luxury project",
  "new benchmark",
  "hospitality living",
  "metro extension",
  "metro line",
  "metro corridor approval",
  "metro station",
  "outbids competitors",
  "given approval from central body",
  "mixed-use development",
  "new commercial sites",
  "new noida",
  "new project",
  "faridabad project",
  "new real estate projects",
  "noida project",
  "noida projects",
  "plot rates",
  "plot scheme",
  "plot allottees",
  "project pipeline",
  "plots off noida airport",
  "plotted township",
  "premium housing market",
  "property hotspot",
  "pumped into new real estate projects",
  "steel span",
  "possession",
  "project launch",
  "project pipeline supports",
  "road corridor",
  "project takes shape",
  "rapid rail",
  "real estate projects",
  "regional rapid transit",
  "rental yield",
  "rental yields",
  "rrts",
  "projects worth",
  "residential development",
  "residential project",
  "senior living",
  "retail destination",
  "retail hub",
  "retail project",
  "retail and f&b mix",
  "retail and f&b offerings",
  "tenant mix",
  "records",
  "records sales",
  "sector demarcation",
  "social infrastructure",
  "sports complex",
  "underpass",
  "sold out",
  "township",
  "tod",
  "transit-oriented development",
  "traffic booths",
  "ultra-luxury residences",
  "unveils homes",
  "unveils luxury",
  "unveils project",
  "unveils residential",
  "unveils township"
];
const broadNonProjectKeywords = [
  "across india",
  "all about",
  "amid global uncertainty",
  "annual report",
  "buyers should know",
  "calculator",
  "cities where",
  "company update",
  "demand to remain",
  "earnings call",
  "explained",
  "global uncertainty",
  "housing data",
  "housing demand",
  "housing market recovery",
  "india's housing",
  "india’s housing",
  "india's office leasing",
  "india’s office leasing",
  "looking to buy a home",
  "marketing spends",
  "market recovery",
  "market report",
  "markets",
  "office leasing",
  "pan india",
  "pan-india",
  "quarterly update",
  "q1 fy",
  "q2 fy",
  "q3 fy",
  "q4 fy",
  "recovery",
  "records sales",
  "retail expansion",
  "retail sector",
  "sales dip",
  "sales fall",
  "sales value",
  "sector records",
  "what buyers should know",
  "what the housing data suggests",
  "consider these four options"
];
const blockedTitleKeywords = [
  "about us",
  "admission",
  "admissions",
  "actor",
  "actress",
  "advertise",
  "air monitor",
  "air monitors",
  "commodity rate",
  "commodity rates",
  "gold price",
  "gold rate",
  "silver price",
  "silver rate",
  "spotify",
  "tata play",
  "premium trial",
  "streaming date",
  "ott release",
  "appoints",
  "appointed",
  "across india",
  "aravali",
  "awards",
  "brand awareness",
  "business head",
  "built-up areas",
  "caqm",
  "careers",
  "college",
  "conference",
  "contact us",
  "digital branding",
  "education & careers",
  "ecological stress",
  "environment",
  "expo",
  "fish death",
  "fish deaths",
  "gallery",
  "global disruptions",
  "grievance",
  "grievance redressal",
  "integrated campaigns",
  "looking to buy a home",
  "login",
  "marketing spends",
  "newsletter",
  "names",
  "nationwide",
  "panel",
  "pan india",
  "pan-india",
  "pollution",
  "photo gallery",
  "photos",
  "privacy policy",
  "preity zinta",
  "register",
  "school",
  "sewage",
  "spring effect",
  "survey",
  "traffic jam",
  "subscription",
  "terms of use",
  "consider these four options",
  "ug admission",
  "video",
  "videos",
  "virtual engagement",
  "water pipeline",
  "water supply",
  "waterbody",
  "webinar"
];
const blockedExactTitles = [
  "bbd gurgaon",
  "commercial projects",
  "latest news",
  "online allotte payment services",
  "property / c'struction",
  "real estate news",
  "terms of use"
];
const blockedUrlParts = [
  "/about",
  "/advertise",
  "/awards",
  "/campaign",
  "/career",
  "/category/commercial",
  "/conference",
  "/contact",
  "/citizen-services",
  "/education",
  "/event",
  "/markets/gold-rate",
  "/markets/silver-rate",
  "gold-rate-in-",
  "silver-rate-in-",
  "/gallery",
  "/login",
  "/newsletter",
  "/payment",
  "/photo",
  "/photos",
  "/privacy",
  "/register",
  "/subscription",
  "/terms",
  "unauthorised-pg",
  "unauthorised-pgs",
  "unauthorized-pg",
  "unauthorized-pgs",
  "/video",
  "/videos",
  "/webinar"
];
const negativeNewsKeywords = [
  "accident",
  "accused",
  "alert",
  "arrest",
  "arrested",
  "aropi",
  "आरोपी",
  "assault",
  "attack",
  "aatmahatya",
  "आत्महत्या",
  "barred",
  "banned",
  "bankruptcy",
  "body found",
  "boycott",
  "built-up areas",
  "caqm",
  "cancel",
  "canceled",
  "cancelled",
  "cheated",
  "cheating",
  "chased",
  "collapse",
  "complaint",
  "शिकायत",
  "complaints",
  "crime",
  "apradh",
  "अपराध",
  "criminal",
  "crisis",
  "crash",
  "detour",
  "debarred",
  "demolish",
  "demolished",
  "demolition",
  "diesel",
  "death",
  "maut",
  "मौत",
  "dead",
  "default",
  "defaults",
  "delay",
  "delayed",
  "delays",
  "demolition death",
  "dies",
  "died",
  "dispute",
  "disputes",
  "dues",
  "encroachment",
  "eviction",
  "fir",
  "एफआईआर",
  "fine",
  "fined",
  "fish deaths",
  "fraud",
  "dhokha",
  "धोखा",
  "धोखाधड़ी",
  "frauds",
  "grievance",
  "grievances",
  "grap",
  "genset",
  "generator",
  "harass",
  "harassed",
  "harassment",
  "hospital",
  "illegal",
  "avaidh",
  "अवैध",
  "imd",
  "injured",
  "jail",
  "killed",
  "lawsuit",
  "legal",
  "co-op court",
  "cooperative court",
  "sue",
  "sues",
  "suing",
  "litigation",
  "murder",
  "hatya",
  "हत्या",
  "notice",
  "notices",
  "penalty",
  "police",
  "पुलिस",
  "pollution",
  "powercut",
  "protest",
  "protests",
  "rain",
  "rainfall",
  "rape",
  "balatkar",
  "बलात्कार",
  "raid",
  "raided",
  "revoked",
  "scam",
  "sc-appointed",
  "sealed",
  "seized",
  "shooting",
  "sister",
  "sisters",
  "stalled",
  "stranded",
  "strike",
  "summon",
  "summoned",
  "steep hike",
  "stuck",
  "suicide",
  "suicides",
  "tax hike",
  "thunderstorm",
  "threat",
  "threaten",
  "threatened",
  "unable",
  "unpaid",
  "violation",
  "violations",
  "violence",
  "weather",
  "yellow alert",
  "yet to fully take shape",
  "worries",
  "worry"
];
const negativePhraseKeywords = [
  "accused of",
  "bear the brunt",
  "broken roads",
  "builder arrested",
  "builder suicide",
  "builder ne aatmahatya",
  "बिल्डर ने आत्महत्या",
  "market crash",
  "buyers stranded",
  "awaits buyers",
  "caqm pollution",
  "cheated homebuyers",
  "circle rates surge",
  "construction ban",
  "construction halted",
  "construction stopped",
  "diesel bulk buying",
  "died by suicide",
  "ne aatmahatya ki",
  "ने आत्महत्या की",
  "dies by suicide",
  "director arrested",
  "eow complaint",
  "chased and harassed",
  "fraud case",
  "dhokhadhadi ka mamla",
  "धोखाधड़ी का मामला",
  "harassed by men",
  "homebuyer complaint",
  "homebuyers bear the brunt",
  "homebuyers stranded",
  "homebuyer suicide",
  "housing project halted",
  "housing project suspended",
  "imd data",
  "left in lurch",
  "lewd comments",
  "licence lapses",
  "license lapses",
  "long wait to get an auto",
  "long wait for auto",
  "last-mile connectivity issue",
  "last mile connectivity issue",
  "missing links",
  "murdered over property",
  "property vivad mein hatya",
  "प्रॉपर्टी विवाद में हत्या",
  "जमीन विवाद में हत्या",
  "not new claims",
  "payment default",
  "power backup",
  "power backup worries",
  "power outage",
  "power supply issue",
  "poor upkeep",
  "pre-sales decline",
  "pre-sales drop",
  "presales decline",
  "presales drop",
  "policy remains constrained",
  "property sales barred",
  "property tax",
  "property dispute murder",
  "zameen vivad mein hatya",
  "property dispute mein hatya",
  "property registration crisis",
  "property registration stuck",
  "project delayed",
  "project delay",
  "project halted",
  "project stalled",
  "project stuck",
  "project suspended",
  "rera complaint",
  "rera order",
  "rera penalty",
  "sc-appointed panel",
  "seal properties",
  "auction assets",
  "grap challan",
  "grap challans",
  "short circuit",
  "registry stalled",
  "registration stalled",
  "real estate agent killed",
  "real estate broker killed",
  "sales decline",
  "unchecked expansion",
  "needs focused planning",
  "not a single plot",
  "sales drop",
  "strike hits",
  "sexual harassment",
  "suicide due to property",
  "property ke karan aatmahatya",
  "प्रॉपर्टी के कारण आत्महत्या",
  "suicide over property",
  "traffic jam",
  "seven km detour",
  "water pipeline",
  "yellow alert",
  "yet to fully take shape"
];
const severeBodyNegativeKeywords = [
  "accident",
  "arrest",
  "arrested",
  "aropi",
  "आरोपी",
  "assault",
  "attack",
  "aatmahatya",
  "आत्महत्या",
  "body found",
  "cheated",
  "cheating",
  "chased",
  "collapse",
  "crime",
  "apradh",
  "अपराध",
  "criminal",
  "death",
  "maut",
  "मौत",
  "dead",
  "dies",
  "died",
  "fir",
  "एफआईआर",
  "fire",
  "fraud",
  "dhokha",
  "धोखा",
  "धोखाधड़ी",
  "harass",
  "harassed",
  "harassment",
  "injured",
  "jail",
  "killed",
  "murder",
  "hatya",
  "हत्या",
  "police",
  "पुलिस",
  "pistol",
  "rape",
  "balatkar",
  "बलात्कार",
  "scam",
  "shooting",
  "sister",
  "sisters",
  "suicide",
  "threatened",
  "violence"
];
const severeBodyNegativePhrases = [
  "builder arrested",
  "builder suicide",
  "builder ne aatmahatya",
  "बिल्डर ने आत्महत्या",
  "died by suicide",
  "ne aatmahatya ki",
  "ने आत्महत्या की",
  "dies by suicide",
  "director arrested",
  "chased and harassed",
  "fraud case",
  "dhokhadhadi ka mamla",
  "धोखाधड़ी का मामला",
  "harassed by men",
  "homebuyer suicide",
  "lewd comments",
  "murdered over property",
  "property vivad mein hatya",
  "प्रॉपर्टी विवाद में हत्या",
  "जमीन विवाद में हत्या",
  "property dispute murder",
  "zameen vivad mein hatya",
  "property dispute mein hatya",
  "real estate agent killed",
  "real estate broker killed",
  "short circuit",
  "sexual harassment",
  "suicide due to property",
  "property ke karan aatmahatya",
  "प्रॉपर्टी के कारण आत्महत्या",
  "suicide over property",
  "unauthorised pg",
  "unauthorised pgs",
  "unauthorized pg",
  "unauthorized pgs",
  "unfulfilled promises"
];
const baseOutsideCityKeywords = [
  "ahmedabad",
  "andhra",
  "bengaluru",
  "bangalore",
  "bengal",
  "bhopal",
  "bhubaneswar",
  "bihar",
  "bombay",
  "chandigarh",
  "chennai",
  "coimbatore",
  "delhi",
  "goa",
  "gujarat",
  "ghaziabad",
  "haridwar",
  "hyderabad",
  "indore",
  "jaipur",
  "kerala",
  "kolkata",
  "lucknow",
  "maharashtra",
  "mumbai",
  "new delhi",
  "noida",
  "greater noida",
  "pallikaranai",
  "patna",
  "pilkhuwa",
  "perumbakkam",
  "perungudi",
  "phuket",
  "pune",
  "rajasthan",
  "singapore",
  "tamil nadu",
  "telangana",
  "uttar pradesh"
];
const outsideCityKeywords = baseOutsideCityKeywords.filter((keyword) =>
  !isNoidaCityEnabled() || !["greater noida", "noida", "uttar pradesh"].includes(keyword)
);
const allLocationKeywords = [
  ...targetCityKeywords,
  ...outsideCityKeywords
];
const blockedSourceUrlParts = [
  "aninews.in",
  "content.magicbricks.com",
  "financialexpress.com/about/real-estate",
  "business-standard.com/search",
  "hindustantimes.com/cities/gurugram-news",
  "lokmattimes.com",
  "rprealtyplus.com",
  "99acres.com/articles",
  "timesofindia.indiatimes.com/city/gurgaon",
  "timesofindia.indiatimes.com/city/faridabad",
  "tribuneindia.com/news/haryana",
  "indianexpress.com/section/cities/delhi",
  "thehindu.com/news/cities/delhi"
];

function normalizeSourceUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

function sourceControlId(value) {
  let hash = 0;
  for (const char of String(value || "")) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `id-${Math.abs(hash)}`.toLowerCase();
}

function sourceAllowKey(source) {
  try {
    const url = new URL(source);
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return "";
  }
}

function getDisabledSourceIds() {
  return new Set([
    ...(Array.isArray(adminSettings.disabledSourceIds) ? adminSettings.disabledSourceIds : []),
    ...splitDelimitedValues(env("DISABLED_SOURCE_IDS"))
  ].map((id) => String(id || "").trim().toLowerCase()).filter(Boolean));
}

function getDisabledSourceUrls() {
  return new Set([
    ...(Array.isArray(adminSettings.disabledSourceUrls) ? adminSettings.disabledSourceUrls : []),
    ...splitDelimitedValues(env("DISABLED_SOURCE_URLS"))
  ].map(normalizeSourceUrl).filter(Boolean));
}

const disabledSourceIds = getDisabledSourceIds();
const disabledSourceUrls = getDisabledSourceUrls();

function isSourceDisabledByAdmin(sourceUrl) {
  return disabledSourceIds.has(sourceControlId(sourceUrl)) || disabledSourceUrls.has(normalizeSourceUrl(sourceUrl));
}

const activeDefaultSources = [
  ...defaultSources,
  ...getActiveCitySources()
].filter((source) => !isSourceDisabledByAdmin(source));
const allowedSourceUrlParts = [...activeDefaultSources, ...getSources()]
  .map(sourceAllowKey)
  .filter(Boolean);
const monthNumbers = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11
};
const monthPattern = Object.keys(monthNumbers).join("|");

function env(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

async function loadDotEnv() {
  try {
    const content = await fs.readFile(".env", "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function readAdminSettings() {
  try {
    return JSON.parse(readFileSync(adminSettingsPath, "utf8"));
  } catch {
    return {};
  }
}

function getSources() {
  const manualSourceUrls = Array.isArray(adminSettings.manualSources)
    ? adminSettings.manualSources
      .filter((source) => source && source.enabled !== false)
      .filter((source) => {
        const cityCodes = Array.isArray(source.cityCodes)
          ? source.cityCodes.map((code) => String(code || "").trim().toLowerCase()).filter(Boolean)
          : [];
        return cityCodes.length === 0 || cityCodes.some((code) => enabledCityCodeSet.has(code));
      })
      .map((source) => String(source.url || "").trim())
      .filter(Boolean)
      .filter((source) => !isSourceDisabledByAdmin(source))
    : [];

  return [
    ...manualSourceUrls,
    ...splitDelimitedValues(env("MANUAL_SOURCE_URLS")).filter((source) => !isSourceDisabledByAdmin(source))
  ];
}

function splitDelimitedValues(value) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSourceUrls() {
  const sourceUrls = splitDelimitedValues(env("SOURCE_URLS"));

  if (sourceUrls.length > 0) {
    return [...new Set(sourceUrls.filter((source) => !isSourceDisabledByAdmin(source)))];
  }

  return [...new Set([...activeDefaultSources, ...getSources()])];
}

function getExtraArticleUrls() {
  return splitDelimitedValues(env("EXTRA_ARTICLE_URLS"));
}

function getTargetCityCodeFilter() {
  const allowedCityCodes = new Set(cityRules.map((rule) => rule.code));
  return new Set(
    splitDelimitedValues(env("TARGET_CITY_CODES"))
      .map((cityCode) => cityCode.toLowerCase())
      .filter((cityCode) => allowedCityCodes.has(cityCode))
  );
}

function isAllowedExtraArticleUrl(articleUrl) {
  const normalized = articleUrl.toLowerCase();

  if (blockedSourceUrlParts.some((part) => normalized.includes(part))) {
    return false;
  }

  try {
    const url = new URL(articleUrl);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isAllowedSource(source) {
  if (!source || isSourceDisabledByAdmin(source)) {
    return false;
  }

  try {
    const url = new URL(source);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isLikelyFeedUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const pathName = url.pathname.toLowerCase();
    const query = url.search.toLowerCase();

    return (
      pathName.endsWith(".xml") ||
      pathName.endsWith(".rss") ||
      pathName.endsWith(".atom") ||
      /(^|\/)(rss|rssfeeds|feed|feeds|atom)(\/|$)/i.test(pathName) ||
      /[?&](output|format)=(rss|xml|atom)\b/i.test(query)
    );
  } catch {
    return false;
  }
}

function getFeedFallbackPageUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const original = url.toString();
    const pathName = url.pathname;
    const cleanedPath = pathName
      .replace(/\/(feed|feeds|rss|atom)\/?$/i, "/")
      .replace(/\/rssfeed\.xml$/i, "/")
      .replace(/\/(rss|atom)\.xml$/i, "/");

    if (cleanedPath !== pathName) {
      url.pathname = cleanedPath;
      url.search = "";
      url.hash = "";
      const cleaned = url.toString();
      return cleaned === original ? "" : cleaned;
    }

    return "";
  } catch {
    return "";
  }
}

function getPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getNonNegativeIntegerEnv(name, fallback = 0) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function getMaxItemsPerSource() {
  return getPositiveIntegerEnv("MAX_ITEMS_PER_SOURCE", 300);
}

function getMaxPagesPerSource() {
  return getPositiveIntegerEnv("MAX_PAGES_PER_SOURCE", 15);
}

function getMaxItemsPerRun() {
  return getPositiveIntegerEnv("MAX_ITEMS_PER_RUN", 30);
}

function getBuildVersion() {
  return env("BUILD_VERSION", "local-dev");
}

function getCommitSha() {
  return env("GITHUB_SHA", "");
}

function getSourceStrategyName() {
  return env(
    "SOURCE_STRATEGY",
    getBooleanEnv("AUTO_SOURCE_BATCH") ? "rotating-source-batch" : "full-source-coverage"
  );
}

function applySourceBatch(sourceUrls) {
  const offset = getNonNegativeIntegerEnv("SOURCE_OFFSET", 0);
  const limit = Number.parseInt(env("SOURCE_LIMIT", "0"), 10);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : 0;

  if (offset !== 0 || safeLimit !== 0) {
    return sourceUrls.slice(offset, safeLimit > 0 ? offset + safeLimit : undefined);
  }

  if (!getBooleanEnv("AUTO_SOURCE_BATCH")) {
    return sourceUrls;
  }

  const batchCount = Math.min(getPositiveIntegerEnv("SOURCE_BATCH_COUNT", 1), 24);
  if (batchCount <= 1) {
    return sourceUrls;
  }

  const explicitIndex = Number.parseInt(env("SOURCE_BATCH_INDEX", ""), 10);
  const timeSlotIndex = Math.floor(Date.now() / (10 * 60 * 1000));
  const batchIndex = Number.isFinite(explicitIndex) && explicitIndex >= 0
    ? explicitIndex % batchCount
    : timeSlotIndex % batchCount;
  const batchedSources = sourceUrls.filter((_, index) => index % batchCount === batchIndex);

  console.log(
    `Auto source batch: processing batch ${batchIndex + 1}/${batchCount} with ${batchedSources.length} of ${sourceUrls.length} sources.`
  );

  return batchedSources;
}

function getSourceConcurrency() {
  return Math.min(getPositiveIntegerEnv("SOURCE_CONCURRENCY", 10), 10);
}

function getArticleMetadataConcurrency() {
  return Math.min(getPositiveIntegerEnv("ARTICLE_METADATA_CONCURRENCY", 10), 10);
}

function getFetchTimeoutMs() {
  return Math.min(getPositiveIntegerEnv("FETCH_TIMEOUT_MS", 10000), 30000);
}

function getSourceTimeoutMs() {
  return Math.min(getPositiveIntegerEnv("SOURCE_FETCH_TIMEOUT_MS", 120000), 120000);
}

function getSourceRetryAttempts() {
  return Math.min(getPositiveIntegerEnv("SOURCE_RETRY_ATTEMPTS", 2), 3);
}

function isRetryableSourceError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    /source timed out|fetch failed|econnreset|econnrefused|etimedout|socket hang up|network/i.test(message) ||
    /\bhttp (408|425|429|500|502|503|504)\b/i.test(message)
  );
}

function getDefaultLookbackDays() {
  return getPositiveIntegerEnv("DEFAULT_LOOKBACK_DAYS", 20);
}

function getBooleanEnv(name, fallback = false) {
  const value = env(name);

  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "y", "on"].includes(value.toLowerCase());
}

function parseDateBoundary(value, endOfDay = false) {
  const input = env(value);

  if (!input) {
    return null;
  }

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? `${input}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
    : input;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${value} must be a valid date or ISO timestamp.`);
  }

  return date;
}

function getBackfillDateRange() {
  let from = parseDateBoundary("BACKFILL_FROM");
  let to = parseDateBoundary("BACKFILL_TO", true);

  if (!from && !to) {
    const defaultLookbackDays = getDefaultLookbackDays();
    to = new Date();
    from = new Date(to.getTime() - defaultLookbackDays * 24 * 60 * 60 * 1000);
  }

  if (from && to && from > to) {
    throw new Error("BACKFILL_FROM must be before or equal to BACKFILL_TO.");
  }

  return { from, to };
}

function getArticleDate(article) {
  const value =
    toIsoDate(article.publishedAt) ||
    toIsoDate(article.createdAt);

  return value ? new Date(value) : null;
}

function isWithinBackfillDateRange(article, dateRange) {
  if (!dateRange.from && !dateRange.to) {
    return true;
  }

  const articleDate = getArticleDate(article);

  if (!articleDate) {
    return false;
  }

  return (!dateRange.from || articleDate >= dateRange.from) && (!dateRange.to || articleDate <= dateRange.to);
}

function hasBackfillDateRange(dateRange) {
  return Boolean(dateRange.from || dateRange.to);
}

function formatArticleDate(article) {
  const articleDate = getArticleDate(article);
  return articleDate ? articleDate.toISOString().slice(0, 10) : "unknown-date";
}

function logDateExcludedPublishableArticles(articles, dateRange, filterSentIds, skipTitleSet) {
  if (!getBooleanEnv("DATE_EXCLUDED_AUDIT", false) || !hasBackfillDateRange(dateRange)) {
    return;
  }

  const dateExcludedArticles = uniqueByDedupeIds(
    articles
      .filter((article) => !isWithinBackfillDateRange(article, dateRange))
      .filter((article) => !shouldSkipTitle(article, skipTitleSet))
      .filter((article) => isPublishableArticle(article, filterSentIds))
      .sort((a, b) => new Date(b.publishedAt || b.createdAt || 0) - new Date(a.publishedAt || a.createdAt || 0))
  ).slice(0, 25);

  if (dateExcludedArticles.length === 0) {
    return;
  }

  console.log(`Date-excluded publishable articles: ${dateExcludedArticles.length} clean articles outside backfill window.`);
  for (const article of dateExcludedArticles) {
    console.log(
      `Date-excluded publishable (${article.cityCode || "no-city"}, ${formatArticleDate(article)}): ${article.title} | ${
        article.newsLink || ""
      }`
    );
  }
}

function isTargetLookingArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const hasTargetCityAndRealEstateSignal =
    hasWholeWordKeyword(primaryAndUrl, targetCityKeywords) &&
    (
      hasKeyword(primaryAndUrl, realEstateKeywords) ||
      hasKeyword(primaryAndUrl, promotionalRealEstateKeywords) ||
      hasKeyword(primaryAndUrl, realEstateCompanyKeywords)
    );

  return (
    hasTargetCityAndRealEstateSignal ||
    hasKeyword(primaryAndUrl, realEstateCompanyKeywords) ||
    hasKeyword(primaryAndUrl, authorityPipelineKeywords) ||
    hasKeyword(primaryAndUrl, connectivityCatalystKeywords) ||
    hasKeyword(primaryAndUrl, gurugramLuxuryProjectKeywords)
  );
}

function isActionableMissedNewsCandidate(article, reasons) {
  const hasOutsideConflict = reasons.some((reason) =>
    [
      "filter 7: outside region in title/description",
      "filter 8: outside-city conflict"
    ].includes(reason)
  );
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const hasStrongTargetCompanyContext =
    Boolean(article.cityCode) &&
    hasTargetRegionInPrimaryText(article) &&
    hasKeyword(primaryAndUrl, realEstateCompanyKeywords);
  const articleType = classifyArticle(article);
  const hasMappedDeveloperContext =
    Boolean(getTargetRealEstateCorporateCompany(article)) &&
    getCorporateCompanyCityCodes(article).length > 0 &&
    hasKeyword(primaryAndUrl, ["real estate", "realty", "developer", "project", "launch", "land", "market"]);
  const hasAuditTargetContext =
    Boolean(article.cityCode) ||
    (articleType !== "unclassified" && hasMappedDeveloperContext);

  if (
    !hasAuditTargetContext ||
    !isTargetLookingArticle(article) ||
    isBlockedArticle(article) ||
    hasDisallowedLanguage(article) ||
    isNegativeNews(article) ||
    (hasOutsideConflict && !hasStrongTargetCompanyContext)
  ) {
    return false;
  }

  if (articleType !== "unclassified" && articleType !== "reject_negative") {
    return true;
  }

  return (
    reasons.some((reason) =>
      [
        "filter 4: not positive target real-estate/project news",
        "filter 5: no allowed city match",
        "filter 6: target region missing or weak",
        "filter 9: no specific project/development signal",
        "filter 10: broad market/company update, not city project news"
      ].includes(reason)
    ) &&
    !hasOutsideConflict
  );
}

function collectMissedNewsAudit(articles, filterSentIds, skipTitleSet) {
  const missedCandidates = [];
  const seenTitles = new Set();

  for (const article of articles) {
    if (!article.title || shouldSkipTitle(article, skipTitleSet)) {
      continue;
    }

    const reasons = getRejectionReasons(article, filterSentIds)
      .filter((reason) => reason !== "filter 13: already sent");

    if (reasons.length === 0 || !isActionableMissedNewsCandidate(article, reasons)) {
      continue;
    }

    const normalizedTitle = normalizeTitle(article.title);

    if (seenTitles.has(normalizedTitle)) {
      continue;
    }

    seenTitles.add(normalizedTitle);
    missedCandidates.push({ article, reasons });
  }

  return missedCandidates;
}

function logMissedNewsAudit(missedCandidates, limit = 20) {
  if (!getBooleanEnv("MISSED_NEWS_AUDIT", false) || missedCandidates.length === 0) {
    return;
  }

  if (missedCandidates.length === 0) {
    return;
  }

  console.log(`Missed-news audit: ${missedCandidates.length} target-looking rejected articles.`);

  for (const { article, reasons } of missedCandidates.slice(0, limit)) {
    console.log(
      `Missed-news audit candidate (${classifyArticle(article)}, ${article.cityCode || "no-city"}): ${
        article.title
      } | ${reasons.join("; ")} | ${article.newsLink || ""}`
    );
  }
}

function reportArticle(article) {
  return {
    title: article.title || "",
    description: (article.description || "").slice(0, 500),
    cityCode: article.cityCode || "",
    classification: classifyArticle(article),
    publishedAt: article.publishedAt || "",
    newsLink: article.newsLink || "",
    postedBy: article.postedBy || "",
    sourceName: article.sourceName || article.postedBy || "",
    sourceUrl: article.sourceUrl || ""
  };
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function articleReportKey(article) {
  return [article.cityCode || "", article.newsLink || "", normalizeTitle(article.title || "")].join("|");
}

function buildRunAnalytics(expandedArticles, readyArticles, postedArticles, skipTitleSet, sentIds, getReasons = null) {
  const readyKeys = new Set(readyArticles.map(articleReportKey));
  const postedKeys = new Set(postedArticles.map(articleReportKey));
  const byCity = new Map();
  const rejectedArticles = [];
  const needsReviewArticles = [];
  const rejectionAuditLimit = Math.max(0, Number(process.env.REJECTION_AUDIT_LIMIT || 5000));
  let rejectedArticleTotal = 0;

  for (const article of expandedArticles) {
    const cityCode = article.cityCode || "unknown";
    const row = byCity.get(cityCode) || {
      cityCode,
      expanded: 0,
      readyToPost: 0,
      posted: 0,
      rejected: 0,
      rejectionReasons: {}
    };

    row.expanded += 1;
    const key = articleReportKey(article);

    if (readyKeys.has(key)) {
      row.readyToPost += 1;
    }

    if (postedKeys.has(key)) {
      row.posted += 1;
    }

    const reasons = getReasons
      ? getReasons(article)
      : shouldSkipTitle(article, skipTitleSet)
        ? ["manual skip: title already reposted"]
        : getRejectionReasons(article, sentIds);

    if (reasons.length > 0) {
      row.rejected += 1;
      rejectedArticleTotal += 1;
      for (const reason of reasons) {
        row.rejectionReasons[reason] = (row.rejectionReasons[reason] || 0) + 1;
      }
      const qualityDecision = localQualityJudge(article);
      if (needsLocalQualityReview(article) && needsReviewArticles.length < 300) {
        needsReviewArticles.push({
          article: reportArticle(article),
          reasons,
          decision: qualityDecision
        });
      }
      if (rejectedArticles.length < rejectionAuditLimit) {
        rejectedArticles.push({ article: reportArticle(article), reasons });
      }
    }

    byCity.set(cityCode, row);
  }

  const cityBreakdown = [...byCity.values()].sort((a, b) =>
    (b.readyToPost + b.posted + b.rejected + b.expanded) - (a.readyToPost + a.posted + a.rejected + a.expanded)
  );

  return {
    readyToPostCount: readyArticles.length,
    rejectedArticleCount: rejectedArticleTotal,
    needsReviewCount: needsReviewArticles.length,
    cityBreakdown,
    rejectedArticles,
    needsReviewArticles
  };
}
function safeReportFileName(date = new Date()) {
  return `news-run-${date.toISOString().replace(/[:.]/g, "-")}`;
}

async function writeRunReport(report) {
  await fs.mkdir(runReportsDir, { recursive: true });
  const fileName = safeReportFileName();
  const jsonPath = path.join(runReportsDir, `${fileName}.json`);
  const markdownPath = path.join(runReportsDir, `${fileName}.md`);
  const fetchedTotal = report.sources.reduce((sum, source) => sum + source.count, 0);
  const markdownLines = [
    "# News Run Report",
    "",
    `- Mode: ${report.mode}`,
    `- Build version: ${report.buildVersion || "unknown"}`,
    `- Commit: ${report.commitSha || "local"}`,
    `- Source strategy: ${report.sourceStrategy || "default"}`,
    `- Window: ${report.window.from || "beginning"} to ${report.window.to || "now"}`,
    `- Allowed sources: ${report.allSelectedSourceCount ?? report.sourceCount ?? report.sources.length}`,
    `- Selected sources: ${report.selectedSourceCount ?? report.sourceCount ?? report.sources.length}`,
    `- Sources fetched: ${report.sources.length}`,
    `- Items fetched: ${fetchedTotal}`,
    `- Source failures: ${report.failures.length}`,
    `- New candidates: ${report.candidates.length}`,
    `- Posted: ${report.posted.length}`,
    `- Dry run: ${report.dryRun}`,
    "",
    "## Skipped By Reason",
    ...Object.entries(report.skippedByReason).map(([reason, count]) => `- ${reason}: ${count}`),
    "",
    "## Failed Sources",
    ...(report.failures.length
      ? report.failures.map((failure) => `- ${failure.source}: ${failure.error}`)
      : ["- None"]),
    "",
    "## Posted Or Dry-Run Candidates",
    ...(report.posted.length
      ? report.posted.map((article) => `- [${article.cityCode}] ${article.title} | ${article.newsLink}`)
      : report.candidates.map((article) => `- [${article.cityCode}] ${article.title} | ${article.newsLink}`)),
    "",
    "## Missed-News Candidates",
    ...(report.missedCandidates.length
      ? report.missedCandidates.map(
          (item) => `- [${item.article.cityCode || "no-city"}] ${item.article.title} | ${item.reasons.join("; ")} | ${item.article.newsLink || ""}`
        )
      : ["- None"])
  ];

  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2));
  await fs.writeFile(markdownPath, `${markdownLines.join("\n")}\n`);
  console.log(`Run report written: ${jsonPath}`);
  console.log(`Run report written: ${markdownPath}`);
}

function getSourcePageUrls(sourceUrl) {
  const maxPages = getMaxPagesPerSource();

  if (maxPages <= 1) {
    return [sourceUrl];
  }

  try {
    const url = new URL(sourceUrl);
    const normalizedPath = url.pathname.replace(/\/+$/, "");

    if (url.hostname === "realty.economictimes.indiatimes.com" && normalizedPath.startsWith("/tag/")) {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath}/${index + 1}`;
        return pageUrl.toString();
      });
    }

    if (url.hostname === "www.hindustantimes.com" && ["/real-estate", "/cities/noida-news"].includes(normalizedPath)) {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath}/page-${index + 1}`;
        return pageUrl.toString();
      });
    }

    if (url.hostname === "www.hindustantimes.com" && normalizedPath.startsWith("/topic/")) {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath}/page-${index + 1}`;
        return pageUrl.toString();
      });
    }

    if (url.hostname === "indianexpress.com" && normalizedPath.startsWith("/about/")) {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath}/page/${index + 1}/`.replace(/\/{2,}/g, "/");
        return pageUrl.toString();
      });
    }

    const wordpressPagedHosts = new Set([
      "torbitrealty.com",
      "realtynmore.com",
      "realtynxt.com",
      "www.track2realty.track2media.com",
      "propnewstime.com"
    ]);

    if (wordpressPagedHosts.has(url.hostname)) {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath || ""}/page/${index + 1}/`.replace(/\/{2,}/g, "/");
        return pageUrl.toString();
      });
    }
  } catch {
    return [sourceUrl];
  }

  return [sourceUrl];
}

function isHsvpSource(sourceUrl) {
  try {
    return new URL(sourceUrl).hostname.replace(/^www\./, "") === "hsvphry.org.in";
  } catch {
    return false;
  }
}

function isBptpMediaSource(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    return url.hostname.replace(/^www\./, "") === "bptp.com" && url.pathname.replace(/\/+$/, "") === "/media";
  } catch {
    return false;
  }
}

function isOfficialDeveloperMediaSource(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const host = url.hostname.replace(/^www\./, "");
    const pathName = url.pathname.replace(/\/+$/, "") || "/";

    return (
      (host === "dlf.in" && pathName === "/media") ||
      (host === "m3mindia.com" && pathName === "/media") ||
      (host === "smartworlddevelopers.com" && pathName === "/media") ||
      (host === "signatureglobal.in" && pathName === "/") ||
      (host === "centralpark.in" && pathName === "/media.php")
    );
  } catch {
    return false;
  }
}

function getSkipTitleSet() {
  return new Set(
    env("SKIP_TITLES")
      .split(/\r?\n|\|\|/g)
      .map((title) => normalizeTitle(title))
      .filter(Boolean)
  );
}

function shouldSkipTitle(article, skipTitleSet) {
  return skipTitleSet.size > 0 && skipTitleSet.has(normalizeTitle(article.title));
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = getFetchTimeoutMs()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const externalSignal = options.signal;
  const signal = externalSignal && typeof AbortSignal !== "undefined" && AbortSignal.any
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;

  if (externalSignal && !AbortSignal.any) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    return await fetch(url, {
      ...options,
      signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function stableId(article) {
  const value = [
    article.newsLink,
    article.url,
    article.title,
    article.postedBy,
    article.source,
    article.cityCode
  ]
    .filter(Boolean)
    .join("|")
    .toLowerCase();

  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeTitle(value = "") {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCityId(article) {
  const value = [normalizeTitle(article.title), article.cityCode].filter(Boolean).join("|");

  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalUrlId(article) {
  const rawUrl = article.newsLink || article.url;

  if (!rawUrl) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";

    return crypto.createHash("sha256").update(url.toString().toLowerCase()).digest("hex");
  } catch {
    return crypto.createHash("sha256").update(rawUrl.toLowerCase()).digest("hex");
  }
}

function canonicalUrlCityId(article) {
  const rawUrl = article.newsLink || article.url;

  if (!rawUrl || !article.cityCode) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";

    return crypto
      .createHash("sha256")
      .update(`${url.toString().toLowerCase()}|${article.cityCode}`)
      .digest("hex");
  } catch {
    return crypto.createHash("sha256").update(`${rawUrl.toLowerCase()}|${article.cityCode}`).digest("hex");
  }
}

function titleOnlyId(article) {
  const title = normalizeTitle(article.title);

  return title ? crypto.createHash("sha256").update(title).digest("hex") : "";
}

function sourceSlugCityId(article) {
  const rawUrl = article.newsLink || article.url;

  if (!rawUrl || !article.cityCode) {
    return "";
  }

  try {
    const url = new URL(rawUrl);
    const slug = url.pathname
      .toLowerCase()
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .at(-1)
      ?.replace(/\.(html|htm|amp)$/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!slug || slug.length < 12) {
      return "";
    }

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return crypto.createHash("sha256").update(`${host}|${slug}|${article.cityCode}`).digest("hex");
  } catch {
    return "";
  }
}

function articleDedupeIds(article) {
  const cityScopedIds = [titleCityId(article), canonicalUrlCityId(article), sourceSlugCityId(article), storyClusterId(article)];
  const articleScopedIds = article.sharedCityArticle ? [] : [canonicalUrlId(article), titleOnlyId(article)];

  return [article.id, ...cityScopedIds, ...articleScopedIds].filter(Boolean);
}

function stripHtml(value = "") {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&lsquo;/gi, "'")
    .replace(/&rdquo;/gi, '"')
    .replace(/&ldquo;/gi, '"')
    .replace(/&ndash;/gi, "-")
    .replace(/&mdash;/gi, "-")
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

function cleanText(value = "", maxLength = 600) {
  const text = stripHtml(String(value))
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return truncateWithEllipsis(text, maxLength);
}

function truncateWithEllipsis(value = "", maxLength = 120) {
  const text = String(value).trim();

  if (text.length <= maxLength) {
    return text;
  }

  const suffix = "...";
  const truncated = text
    .slice(0, Math.max(0, maxLength - suffix.length))
    .replace(/\s+\S*$/, "")
    .trim();

  return `${truncated || text.slice(0, maxLength - suffix.length).trim()}${suffix}`;
}

function cleanTitle(value = "") {
  return cleanText(value, 120)
    .replace(/\s+[|-]\s+(latest news|news|real estate news)$/i, "")
    .replace(/^(watch|photos?|video):\s*/i, "")
    .replace(new RegExp(`\\s*(?:${monthPattern})\\.?\\s+\\d{1,2},?\\s+\\d{4}.*$`, "i"), "")
    .replace(new RegExp(`\\s*\\d{1,2}\\s+(?:${monthPattern})\\.?\\s+\\d{4}.*$`, "i"), "")
    .trim();
}

function cleanArticleFields(article) {
  const title = cleanTitle(article.title);
  const description = cleanText(article.description, 180) || title;
  const fallbackLogo = safeFallbackLogo(article.newsLink || article.url);

  return {
    ...article,
    title,
    description,
    articleText: cleanText(article.articleText, 5000),
    newsLink: cleanText(article.newsLink, 1000),
    thumbnailImage: cleanText(article.thumbnailImage, 1000) || fallbackLogo,
    postedBy: cleanPublisherName(article.postedBy, article.newsLink || article.url),
    postedByLogo: cleanText(article.postedByLogo, 1000) || fallbackLogo
  };
}

function pickFirst(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
}

function isGenericDescription(value = "") {
  const normalized = cleanText(value, 120).toLowerCase();
  return ["your description", "description", "article description", "news description"].includes(normalized);
}

function pickDescription(...values) {
  return values.find((value) => typeof value === "string" && value.trim() && !isGenericDescription(value))?.trim() || "";
}

function parseSrcset(value = "") {
  return String(value)
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .find(Boolean) || "";
}

function getNestedValue(object, pathParts) {
  return pathParts.reduce((value, key) => value?.[key], object);
}

function getThumbnail(item) {
  return pickFirst(
    item.enclosure?.url,
    item["media:content"]?.url,
    item["media:thumbnail"]?.url,
    getNestedValue(item, ["media:content", "$", "url"]),
    getNestedValue(item, ["media:thumbnail", "$", "url"])
  );
}

function getPublisherLogo(feed) {
  return pickFirst(feed.image?.url, feed.itunes?.image, feed.logo);
}

function getPublisherName(sourceUrl, pageTitle = "") {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  const names = {
    "business-standard.com": "Business Standard",
    "cnbctv18.com": "CNBC TV18",
    "economictimes.indiatimes.com": "The Economic Times",
    "hindustantimes.com": "Hindustan Times",
    "indianexpress.com": "The Indian Express",
    "moneycontrol.com": "Moneycontrol",
    "outlookmoney.com": "Outlook Money",
    "propnewstime.com": "Prop News Time",
    "realty.economictimes.indiatimes.com": "ET Realty",
    "realtynmore.com": "RealtyNMore",
    "timesofindia.indiatimes.com": "Times of India",
    "torbitrealty.com": "Torbit Realty",
    "tribuneindia.com": "The Tribune"
  };

  return names[host] || stripHtml(pageTitle).split("|")[0].trim() || host;
}

function cleanPublisherName(value = "", sourceUrl = "") {
  let hostPublisher = "";

  try {
    hostPublisher = sourceUrl ? getPublisherName(sourceUrl) : "";
  } catch {
    hostPublisher = "";
  }

  if (hostPublisher && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(hostPublisher)) {
    return hostPublisher;
  }

  const text = cleanText(value, 160);
  const publisherAliases = [
    ["The Economic Times", /\b(the\s+)?economic\s+times\b/i],
    ["ET Realty", /\bet\s+realty\b|\brealty\.economictimes\b/i],
    ["Times of India", /\btimes\s+of\s+india\b/i],
    ["Hindustan Times", /\bhindustan\s+times\b/i],
    ["The Indian Express", /\bindian\s+express\b/i],
    ["Moneycontrol", /\bmoneycontrol\b/i],
    ["CNBC TV18", /\bcnbc\s*tv\s*18\b/i],
    ["RealtyNMore", /\brealtynmore\b/i],
    ["Prop News Time", /\bprop\s*news\s*time\b/i]
  ];
  const alias = publisherAliases.find(([, pattern]) => pattern.test(text));

  if (alias) {
    return alias[0];
  }

  return text
    .split(/\s+[|-]\s+/)
    .at(-1)
    ?.replace(/\s*:\s*(latest|breaking).*$/i, "")
    .trim()
    .slice(0, 48) || text.slice(0, 48);
}

function getFallbackLogo(sourceUrl) {
  const host = new URL(sourceUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function safeFallbackLogo(sourceUrl = "") {
  try {
    return sourceUrl ? getFallbackLogo(sourceUrl) : "";
  } catch {
    return "";
  }
}

function absoluteUrl(value, baseUrl) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function parseNewsDateValue(value) {
  if (!value) {
    return "";
  }

  const raw = String(value)
    .replace(/\b(updated|published|last updated|posted)\s*(on|at)?\s*:?\s*/gi, " ")
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const normalized = raw.replace(/\bIST\b/i, "+05:30");
  const directDate = new Date(normalized);

  if (!Number.isNaN(directDate.getTime())) {
    return directDate.toISOString();
  }

  const monthFirst = raw.match(
    new RegExp(
      `(${monthPattern})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)?)?`,
      "i"
    )
  );

  if (monthFirst) {
    return buildNewsDateIso({
      year: monthFirst[3],
      monthName: monthFirst[1],
      day: monthFirst[2],
      hour: monthFirst[4],
      minute: monthFirst[5],
      meridiem: monthFirst[6]
    });
  }

  const dayFirst = raw.match(
    new RegExp(
      `(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(\\d{4})(?:,?\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)?)?`,
      "i"
    )
  );

  if (dayFirst) {
    return buildNewsDateIso({
      year: dayFirst[3],
      monthName: dayFirst[2],
      day: dayFirst[1],
      hour: dayFirst[4],
      minute: dayFirst[5],
      meridiem: dayFirst[6]
    });
  }

  return "";
}

function buildNewsDateIso({ year, monthName, day, hour = "0", minute = "0", meridiem = "" }) {
  const month = monthNumbers[String(monthName).toLowerCase().replace(/\.$/, "")];
  let hours = Number.parseInt(hour || "0", 10);
  const minutes = Number.parseInt(minute || "0", 10);

  if (meridiem) {
    const period = meridiem.toLowerCase();

    if (period === "pm" && hours < 12) {
      hours += 12;
    } else if (period === "am" && hours === 12) {
      hours = 0;
    }
  }

  const date = new Date(Date.UTC(Number(year), month, Number(day), hours, minutes) - 330 * 60 * 1000);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function extractPublishedAtFromText(value = "") {
  return parseNewsDateValue(value);
}

function toIsoDate(value) {
  if (!value) {
    return "";
  }

  const parsedNewsDate = parseNewsDateValue(value);

  if (parsedNewsDate) {
    return parsedNewsDate;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString();
}

function getCreatedAt(article) {
  const createdAt =
    toIsoDate(article.createdAt) ||
    toIsoDate(article.publishedAt) ||
    toIsoDate(article.fetchedAt) ||
    new Date().toISOString();

  return article.sharedCityArticle ? startOfDayIso(createdAt) : createdAt;
}

function startOfDayIso(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function detectCityCode(article) {
  const primaryText = getArticlePrimaryText(article);

  const primaryMatch = cityRules.find((rule) =>
    hasWholeWordKeyword(primaryText, rule.keywords)
  );

  if (primaryMatch) {
    return primaryMatch.code;
  }

  const articleMatch = cityRules.find((rule) => hasStrongArticleCityMatch(article, rule));

  return articleMatch?.code || "";
}

function getArticleSearchText(article) {
  return [article.title, article.description, article.articleText, article.newsLink]
    .join(" ")
    .toLowerCase();
}

function getArticlePrimaryText(article) {
  return [article.title, article.description].join(" ").toLowerCase();
}

function getArticleBodyText(article) {
  return (article.articleText || "").toLowerCase();
}

function getArticleUrlText(article) {
  return (article.newsLink || "").toLowerCase();
}

function getArticleHost(article) {
  try {
    return new URL(article.newsLink || article.url || "").hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function isDirectMediaUrl(value = "") {
  try {
    const url = new URL(value);
    return /\.(avif|gif|jpe?g|png|svg|webp|bmp|pdf)(\?.*)?$/i.test(url.pathname);
  } catch {
    return /\.(avif|gif|jpe?g|png|svg|webp|bmp|pdf)(\?.*)?$/i.test(String(value));
  }
}

function hasNewsArticlePageLink(article) {
  return isHttpUrl(article.newsLink || article.url || "") && !isDirectMediaUrl(article.newsLink || article.url || "");
}

function normalizeStoryText(value = "") {
  return normalizeTitle(value)
    .replace(/\b(rs|inr|crore|cr|lakh|mn|million|billion|sq|ft|for|the|and|with|from|over|into|to|of|in|at|by|on|its|their|project|projects|developers|developer|realty|fund|investment|invest|partner|partnership|join|joins|forces|tie|up|scale|living|luxury|ncr)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function storyClusterId(article) {
  const title = normalizeStoryText(article.title || "");
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  if (/\b(smartworld|kotak)\b/i.test(primaryAndUrl) && /\b(800|₹800|rs 800)\b/i.test(primaryAndUrl)) {
    return `smartworld-kotak-800cr|${article.cityCode || ""}`;
  }

  if (/\bdwarka expressway\b/i.test(primaryAndUrl) && /\b(135|price|prices|surge|power corridor)\b/i.test(primaryAndUrl)) {
    return `dwarka-expressway-price-surge|${article.cityCode || ""}`;
  }

  return title && title.length >= 18 ? `${title}|${article.cityCode || ""}` : "";
}

function hasSourceCityUrlMismatch(article) {
  const urlText = getArticleUrlText(article);

  if (!urlText || !article.cityCode) {
    return false;
  }

  const cityPathMap = {
    gurugram: ["/noida-news/", "/mumbai-news/", "/bengaluru-news/", "/bangalore-news/", "/chennai-news/", "/kolkata-news/", "/pune-news/", "/delhi-news/"],
    faridabad: ["/noida-news/", "/mumbai-news/", "/bengaluru-news/", "/bangalore-news/", "/chennai-news/", "/kolkata-news/", "/pune-news/", "/delhi-news/"],
    noida: ["/gurugram-news/", "/gurgaon-news/", "/mumbai-news/", "/bengaluru-news/", "/bangalore-news/", "/chennai-news/", "/kolkata-news/", "/pune-news/", "/delhi-news/"]
  };

  const blockedPaths = cityPathMap[article.cityCode] || [];
  if (!blockedPaths.some((part) => urlText.includes(part))) {
    return false;
  }

  const rule = allCityRules.find((cityRule) => cityRule.code === article.cityCode);
  const primaryMentions = rule ? countKeywordMentions(getArticlePrimaryText(article), rule.keywords) : 0;
  return primaryMentions < 2;
}
function isReraRelated(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  return !isBlockedArticle(article) && hasKeyword(primaryAndUrl, reraKeywords);
}

function isCourtRealEstateRelated(article) {
  const haystack = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  return (
    !isBlockedArticle(article) &&
    hasWholeWordKeyword(haystack, courtKeywords) &&
    hasRealEstateEvidence(article)
  );
}

function isNationalRealEstateBusinessUpdate(article) {
  const haystack = getArticleSearchText(article);
  const title = article.title || "";

  return (
    !isBlockedArticle(article) &&
    hasTargetRegionEvidence(article) &&
    hasPromotionalRealEstateSignal(article) &&
    hasKeyword(haystack, realEstateCompanyKeywords) &&
    hasKeyword(haystack, nationalBusinessKeywords) &&
    !hasWholeWordKeyword(title, getDisqualifyingOutsideCityKeywords(article))
  );
}

function getTargetRealEstateCorporateCompany(article) {
  const haystack = getArticleSearchText(article);
  return targetRealEstateCorporateCompanies.find((company) => hasWholeWordKeyword(haystack, company.keywords));
}

function detectExplicitTargetCityCodes(article) {
  const titleText = (article.title || "").toLowerCase();
  const titleCityCodes = cityRules
    .filter((rule) => hasWholeWordKeyword(titleText, rule.keywords))
    .map((rule) => rule.code);

  if (titleCityCodes.length > 0) {
    return [...new Set(titleCityCodes)];
  }

  const primaryText = getArticlePrimaryText(article);
  const primaryCityCodes = cityRules
    .filter((rule) => hasWholeWordKeyword(primaryText, rule.keywords))
    .map((rule) => rule.code);

  if (primaryCityCodes.length > 0) {
    return [...new Set(primaryCityCodes)];
  }

  const strongCityCodes = cityRules
    .filter((rule) => hasStrongArticleCityMatch(article, rule))
    .map((rule) => rule.code);

  if (strongCityCodes.length > 0) {
    return [...new Set(strongCityCodes)];
  }

  // City-specific feeds often omit the city from the article body. Their
  // source path is still a reliable routing signal (for example /noida-news).
  const sourceText = `${article.sourceUrl || ""} ${article.feedUrl || ""}`;
  return [...new Set(cityRules
    .filter((rule) => hasWholeWordKeyword(sourceText, rule.keywords))
    .map((rule) => rule.code))];
}
function detectTargetCityCodesFromFullArticle(article) {
  return cityRules
    .filter((rule) => countKeywordMentions(getArticleSearchText(article), rule.keywords) > 0)
    .map((rule) => rule.code);
}
function detectDominantFullArticleCityCodes(article) {
  const fullText = getArticleSearchText(article);
  const counts = cityRules
    .map((rule) => ({
      code: rule.code,
      count: countKeywordMentions(fullText, rule.keywords)
    }))
    .filter((entry) => entry.count > 0 && !["delhi_ncr", "new_delhi"].includes(entry.code));

  if (counts.length === 0) {
    return [];
  }

  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  const maxCount = Math.max(...counts.map((entry) => entry.count));
  const dominantCodes = counts
    .filter((entry) => entry.count === maxCount && entry.count >= 2 && entry.count / total >= 0.55)
    .map((entry) => entry.code);

  return dominantCodes.length === 1 ? dominantCodes : [];
}
function detectConcreteNcrCityCodesFromFullArticle(article) {
  const fullText = getArticleSearchText(article);
  const counts = ncrCityCodes
    .map((code) => {
      const rule = allCityRules.find((cityRule) => cityRule.code === code);
      return {
        code,
        count: rule ? countKeywordMentions(fullText, rule.keywords) : 0
      };
    })
    .filter((entry) => entry.count > 0);

  if (counts.length === 0) {
    return [];
  }

  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  const maxCount = Math.max(...counts.map((entry) => entry.count));
  return counts
    .filter((entry) => entry.count === maxCount && entry.count >= 2 && entry.count / total >= 0.6)
    .map((entry) => entry.code);
}
function hasDisabledDominantFullArticleCity(article) {
  const fullText = getArticleSearchText(article);
  const counts = allCityRules
    .map((rule) => ({
      code: rule.code,
      count: countKeywordMentions(fullText, rule.keywords)
    }))
    .filter((entry) => entry.count > 0 && !["delhi_ncr", "new_delhi"].includes(entry.code));

  if (counts.length === 0) {
    return false;
  }

  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  const maxCount = Math.max(...counts.map((entry) => entry.count));
  const dominantCodes = counts
    .filter((entry) => entry.count === maxCount && entry.count >= 2 && entry.count / total >= 0.55)
    .map((entry) => entry.code);

  return dominantCodes.length === 1 && !enabledCityCodeSet.has(dominantCodes[0]);
}
function getCorporateCompanyCityCodes(article, company = getTargetRealEstateCorporateCompany(article)) {
  if (!company) {
    return [];
  }

  const explicitCityCodes = detectExplicitTargetCityCodes(article);

  if (explicitCityCodes.length > 0) {
    return explicitCityCodes;
  }

  const dominantFullArticleCityCodes = detectDominantFullArticleCityCodes(article);

  if (dominantFullArticleCityCodes.length > 0) {
    return dominantFullArticleCityCodes;
  }

  if (hasDisabledDominantFullArticleCity(article)) {
    return [];
  }

  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  if (
    company.code &&
    !ncrCityCodes.includes(company.code)
  ) {
    return [];
  }

  if (
    company.code &&
    hasWholeWordKeyword(primaryAndUrl, getDisqualifyingOutsideCityKeywords({ ...article, cityCode: company.code }))
  ) {
    return [];
  }

  if (!company.code && /\bdelhi[\s-]?ncr\b/i.test(primaryAndUrl)) {
    return detectConcreteNcrCityCodesFromFullArticle(article);
  }

  if (
    !company.code &&
    hasWholeWordKeyword(primaryAndUrl, outsideCityKeywords.filter((keyword) => !["delhi", "new delhi"].includes(keyword)))
  ) {
    return [];
  }

  if (
    !company.code &&
    hasWholeWordKeyword(primaryAndUrl, ["bptp", "bptp ltd"]) &&
    hasKeyword(primaryAndUrl, ["customer confidence", "top developer", "top developers"])
  ) {
    return detectConcreteNcrCityCodesFromFullArticle(article);
  }

  return company.code ? [company.code] : [];
}

function isTargetRealEstateCorporateUpdate(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const company = getTargetRealEstateCorporateCompany(article);

  return (
    !isBlockedArticle(article) &&
    hasCleanPrimaryAndUrlText(article) &&
    Boolean(company) &&
    getCorporateCompanyCityCodes(article, company).length > 0 &&
    hasKeyword(primaryAndUrl, positiveCorporateRealEstateKeywords) &&
    !hasWholeWordKeyword(primaryAndUrl, getDisqualifyingOutsideCityKeywords(article))
  );
}

function isLeadershipBusinessConfidenceArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    Boolean(getTargetRealEstateCorporateCompany(article)) &&
    getCorporateCompanyCityCodes(article).length > 0 &&
    hasKeyword(primaryAndUrl, leadershipBusinessConfidenceKeywords) &&
    hasKeyword(primaryAndUrl, ["real estate", "realty", "developer", "project", "launch", "land", "market"])
  );
}

function isLuxuryTransactionArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryText(article) &&
    hasKeyword(primaryAndUrl, luxuryTransactionKeywords) &&
    hasKeyword(primaryAndUrl, gurugramLuxuryProjectKeywords) &&
    hasWholeWordKeyword(primaryAndUrl, ["gurugram", "gurgaon"])
  );
}

function isAuthorityPipelineArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    (hasCleanPrimaryAndUrlText(article) || isOfficialAuthorityPipelineNotice(article)) &&
    hasTargetRegionInTitleOrUrl(article) &&
    hasKeyword(primaryAndUrl, authorityPipelineKeywords) &&
    hasKeyword(primaryAndUrl, ["development", "commercial", "infrastructure", "sector", "mixed-use", "tod"])
  );
}

function isOfficialAuthorityPipelineNotice(article) {
  const primaryText = getArticlePrimaryText(article);
  const urlText = getArticleUrlText(article);

  return (
    /hsvphry\.org\.in\/documents\/notices\/NEWS_/i.test(urlText) &&
    hasWholeWordKeyword(primaryText, ["faridabad"]) &&
    hasKeyword(primaryText, ["auction", "demarcation", "e-auction", "commercial", "community", "infrastructure", "sector", "sites"]) &&
    !hasKeyword(primaryText, negativePhraseKeywords)
  );
}

function isConnectivityCatalystArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    (hasTargetRegionInTitleOrUrl(article) || hasNcrMatch(article) || isFaridabadJewarGrowthArticle(article)) &&
    hasKeyword(primaryAndUrl, connectivityCatalystKeywords) &&
    hasKeyword(primaryAndUrl, ["connectivity", "development", "growth", "real estate", "property", "infrastructure"])
  );
}

function isTargetCommercialRetailProjectArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    hasTargetRegionInPrimaryText(article) &&
    hasKeyword(primaryAndUrl, [
      "commercial complex",
      "commercial project",
      "high-street retail",
      "mall",
      "mixed-use retail",
      "open-air destination",
      "retail and f&b mix",
  "retail and f&b offerings",
      "retail centre",
      "retail center",
      "retail destination",
      "retail hub",
      "retail project",
      "shopping centre",
      "shopping center",
      "tenant mix"
    ]) &&
    hasKeyword(primaryAndUrl, [
      "adds",
      "arrival",
      "expands",
      "expansion",
      "launch",
  "लॉन्च",
  "शुरू",
      "launched",
      "launches",
      "leasing",
      "opens",
      "strengthen"
    ]) &&
    hasKeyword(primaryAndUrl, ["gurugram", "gurgaon", "faridabad", "noida", "delhi ncr"]) &&
    !hasWholeWordKeyword(primaryAndUrl, getDisqualifyingOutsideCityKeywords(article))
  );
}
function isPositiveCityMarketArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    hasTargetRegionInTitleOrUrl(article) &&
    hasKeyword(primaryAndUrl, ["real estate", "realty", "property", "housing"]) &&
    hasKeyword(primaryAndUrl, positiveCityMarketKeywords) &&
    !hasWholeWordKeyword(primaryAndUrl, getDisqualifyingOutsideCityKeywords(article))
  );
}

function isStrongPositiveMarketOrInfrastructureArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const disqualifyingOutsideCities = getDisqualifyingOutsideCityKeywords(article).filter(
    (keyword) => !["faridabad", "gurugram", "gurgaon", "noida"].includes(keyword)
  );

  return (
    hasCleanPrimaryAndUrlText(article) &&
    (hasTargetRegionInTitleOrUrl(article) || hasNcrMatch(article)) &&
    hasKeyword(primaryAndUrl, [
      "appreciation",
      "built-up area",
      "built up area",
      "capital financial center",
      "financial center",
      "expressway",
  "एक्सप्रेसवे",
      "interchange",
      "invest",
      "investment",
  "निवेश",
      "leasing",
      "metro",
  "मेट्रो",
      "office",
      "rental yield",
      "rental yields",
      "road approved"
    ]) &&
    hasKeyword(primaryAndUrl, [
      "approval",
  "मंजूरी",
      "approved",
  "मंजूर",
      "capital appreciation",
  "3 crore budget",
  "home buyer",
  "home-buyer",
      "development",
      "expands",
      "growth",
  "विकास",
      "infrastructure",
  "इंफ्रास्ट्रक्चर",
  "बुनियादी ढांचा",
      "market",
      "open",
      "opens",
      "project",
  "परियोजना",
  "प्रोजेक्ट",
      "takes shape",
      "real estate",
  "रियल एस्टेट",
  "रियल्टी",
      "realty",
      "rental yield",
      "rental yields",
      "to open",
      "to invest"
    ]) &&
    !hasWholeWordKeyword(primaryAndUrl, disqualifyingOutsideCities)
  );
}

function isNoidaDeveloperBlogArticle(article) {
  const host = getArticleHost(article);
  const urlText = getArticleUrlText(article);

  return ["atsgreens.com", "prateekgroup.com"].includes(host) && urlText.includes("/blog");
}

function hasNoidaDeveloperBlogQualitySignal(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    article.cityCode === "noida" &&
    hasCleanPrimaryAndUrlText(article) &&
    hasTargetRegionInTitleOrUrl(article) &&
    hasKeyword(primaryAndUrl, [
      "airport",
      "builder",
      "capital values",
      "connectivity",
      "expressway",
  "एक्सप्रेसवे",
      "greater noida",
      "jewar",
      "launch",
  "लॉन्च",
  "शुरू",
      "market data",
      "metro",
  "मेट्रो",
      "noida airport",
      "noida expressway",
      "price",
      "prices",
      "project",
  "परियोजना",
  "प्रोजेक्ट",
      "projects",
      "rera",
      "sector",
      "sector 150"
    ]) &&
    hasKeyword(primaryAndUrl, ["apartment", "builder", "housing", "investment", "property", "real estate", "residential"])
  );
}

function isPositiveCivicInfrastructureArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    hasTargetRegionInTitleOrUrl(article) &&
    hasKeyword(primaryAndUrl, [
      "authority hq",
  "allottees",
      "charging stations",
      "industrial projects",
      "kiosks",
      "metro station",
  "outbids competitors",
      "sports complex"
    ]) &&
    hasKeyword(primaryAndUrl, ["add", "allot", "building", "emerges", "inaugurate", "launch", "project", "spend"]) &&
    !hasKeyword(primaryAndUrl, negativePhraseKeywords) &&
    !hasWholeWordKeyword(primaryAndUrl, ["accident", "arrest", "chargesheet", "crime", "fraud", "illegal", "murder", "police", "suicide"])
  );
}

function isPositiveTargetBusinessOrDevelopmentArticle(article) {
  return (
    isTargetRealEstateCorporateUpdate(article) ||
    isLeadershipBusinessConfidenceArticle(article) ||
    isLuxuryTransactionArticle(article) ||
    isAuthorityPipelineArticle(article) ||
    isConnectivityCatalystArticle(article) ||
    isPositiveCivicInfrastructureArticle(article) ||
    isTargetCommercialRetailProjectArticle(article) ||
    isStrongPositiveMarketOrInfrastructureArticle(article) ||
    isPositiveCityMarketArticle(article)
  );
}

function classifyArticle(article) {
  if (isNegativeNews(article)) {
    return "reject_negative";
  }

  if (isNcrCommercialOfficeMarketArticle(article)) {
    return "ncr_office_market";
  }

  if (isFaridabadJewarGrowthArticle(article)) {
    return "faridabad_jewar_catalyst";
  }

  if (isTargetDominantInfrastructureCorridor(article)) {
    return "target_corridor";
  }

  if (isConnectivityCatalystArticle(article)) {
    return "connectivity_catalyst";
  }

  if (isFaridabadNcrGrowthComparisonArticle(article)) {
    return "positive_city_market";
  }

  if (isAuthorityPipelineArticle(article)) {
    return "authority_pipeline";
  }

  if (isLuxuryTransactionArticle(article)) {
    return "luxury_transaction";
  }

  if (isTargetRealEstateCorporateUpdate(article)) {
    return "developer_corporate_positive";
  }

  if (isLeadershipBusinessConfidenceArticle(article)) {
    return "leadership_confidence";
  }

  if (isTargetProjectAwardArticle(article)) {
    return "project_development";
  }

  if (isTargetCommercialRetailProjectArticle(article)) {
    return "commercial_retail_project";
  }

  if (isPositiveCityMarketArticle(article)) {
    return "positive_city_market";
  }

  if (isStrongPositiveMarketOrInfrastructureArticle(article)) {
    return "positive_market_infrastructure";
  }

  if (isPositiveTargetProjectUpdate(article) || (hasRealEstateEvidence(article) && hasSpecificProjectOrDevelopmentSignal(article))) {
    return "project_development";
  }

  return "unclassified";
}

function isRealEstateRelated(article) {
  if (isBlockedArticle(article)) {
    return false;
  }

  return (
    hasRealEstateEvidence(article) ||
    isNationalRealEstateBusinessUpdate(article) ||
    isNcrCommercialOfficeMarketArticle(article) ||
    isFaridabadNcrGrowthComparisonArticle(article) ||
    isTargetProjectAwardArticle(article) ||
    isPositiveTargetBusinessOrDevelopmentArticle(article)
  );
}

function hasSpecificProjectOrDevelopmentSignal(article) {
  if (
    isTargetDominantInfrastructureCorridor(article) ||
    isNcrCommercialOfficeMarketArticle(article) ||
    isFaridabadJewarGrowthArticle(article) ||
    isFngConnectivityCatalystArticle(article) ||
    isFaridabadNcrGrowthComparisonArticle(article) ||
    isTargetProjectAwardArticle(article) ||
    isPositiveCityMarketArticle(article) ||
    isStrongPositiveMarketOrInfrastructureArticle(article) ||
    isPositiveTargetBusinessOrDevelopmentArticle(article)
  ) {
    return true;
  }

  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  return hasKeyword(primaryAndUrl, [
    ...specificProjectKeywords,
    "approval",
    "approved",
    "authority",
    "connectivity",
    "corridor",
    "development",
    "housing",
    "infrastructure",
    "investment",
    "invests",
    "land parcel",
    "launch",
    "launched",
    "metro",
    "new township",
    "project",
    "residential",
    "rera",
    "road project",
    "township",
    "urban development"
  ]);
}

function isBroadNonProjectUpdate(article) {
  if (
    isTargetDominantInfrastructureCorridor(article) ||
    isNcrCommercialOfficeMarketArticle(article) ||
    isFaridabadJewarGrowthArticle(article) ||
    isFaridabadNcrGrowthComparisonArticle(article) ||
    isPositiveCityMarketArticle(article) ||
    isPositiveTargetProjectUpdate(article) ||
    isPositiveTargetBusinessOrDevelopmentArticle(article)
  ) {
    return false;
  }

  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasKeyword(primaryAndUrl, broadNonProjectKeywords) &&
    !hasSpecificProjectOrDevelopmentSignal(article)
  );
}

function shouldSendToBothCities(article) {
  return detectMatchedCityCodes(article).length === ncrCityCodes.length;
}

function detectCityCodes(article) {
  if (!isRealEstateRelated(article) || isBlockedArticle(article) || isNegativeNews(article)) {
    return [];
  }

  const primaryText = getArticlePrimaryText(article);
  const concreteNcrCityCodes = hasNcrMatch(article) ? detectConcreteNcrCityCodesFromFullArticle(article) : [];
  const matchedCodes = concreteNcrCityCodes.length > 0 ? concreteNcrCityCodes : detectMatchedCityCodes(article);
  const hasPreviousNcrRoute = matchedCodes.some((code) => ncrCityCodes.includes(code));
  const ncrDelhiRoute = hasNcrMatch(article) && hasPreviousNcrRoute ? ncrDelhiCityCodes : [];
  const routedCodes = [...matchedCodes, ...ncrDelhiRoute];
  return [...new Set(routedCodes)].filter((code) =>
    code !== "delhi_ncr" && (code !== "new_delhi" || ncrDelhiRoute.includes("new_delhi") || /\bnew delhi\b|\bcentral delhi\b|\bsouth delhi\b|\bnorth delhi\b|\beast delhi\b|\bwest delhi\b/i.test(primaryText))
  );
}

function detectMatchedCityCodes(article) {
  if (isFngConnectivityCatalystArticle(article)) {
    return isNoidaCityEnabled() ? ["faridabad", "noida"] : ["faridabad"];
  }

  if (isFaridabadJewarGrowthArticle(article)) {
    return ["faridabad"];
  }

  if (isFaridabadNcrGrowthComparisonArticle(article)) {
    return ["faridabad"];
  }

  const corporateCompany = getTargetRealEstateCorporateCompany(article);

  if (corporateCompany && isTargetProjectAwardArticle(article)) {
    return getCorporateCompanyCityCodes(article, corporateCompany);
  }

  if (corporateCompany && isPositiveTargetBusinessOrDevelopmentArticle(article)) {
    return getCorporateCompanyCityCodes(article, corporateCompany);
  }

  if (isNcrCommercialOfficeMarketArticle(article)) {
    return detectTargetCityCodesFromFullArticle(article);
  }

  if (isTargetCommercialRetailProjectArticle(article)) {
    return detectExplicitTargetCityCodes(article);
  }

  const matchedCityCodes = detectExplicitTargetCityCodes(article);

  if (matchedCityCodes.length > 0) {
    return matchedCityCodes;
  }

  const dominantFullArticleCityCodes = detectDominantFullArticleCityCodes(article);

  if (dominantFullArticleCityCodes.length > 0) {
    return dominantFullArticleCityCodes;
  }

  if (hasDisabledDominantFullArticleCity(article)) {
    return [];
  }

  if (hasNcrMatch(article)) {
    return detectConcreteNcrCityCodesFromFullArticle(article);
  }

  return [];
}

function hasTargetRegionInPrimaryText(article) {
  const primaryText = getArticlePrimaryText(article);
  return hasWholeWordKeyword(primaryText, targetCityKeywords);
}

function hasTargetRegionInTitleOrUrl(article) {
  const titleAndUrl = `${article.title || ""} ${getArticleUrlText(article)}`;
  return hasWholeWordKeyword(titleAndUrl, targetCityKeywords);
}

function hasDominantEnabledCityEvidence(article) {
  return detectDominantFullArticleCityCodes(article).length > 0;
}

function isAllCityRealEstateDevelopmentArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const explicitCityCodes = detectExplicitTargetCityCodes(article);
  const dominantCityCodes = detectDominantFullArticleCityCodes(article);

  return (
    hasCleanPrimaryAndUrlText(article) &&
    (explicitCityCodes.length > 0 || dominantCityCodes.length > 0) &&
    hasKeyword(primaryAndUrl, [
      "approval",
      "approved",
      "commercial real estate",
      "connectivity",
      "developer",
      "development",
      "expressway",
      "housing",
      "infrastructure",
      "investment",
      "launch",
      "launched",
      "launches",
      "metro",
      "office space",
      "project",
      "real estate",
      "realty",
      "residential",
      "township"
    ]) &&
    hasKeyword(primaryAndUrl, [
      "adds",
      "approval",
      "approved",
      "boosts",
      "develop",
      "developing",
      "development",
      "expands",
      "growth",
      "inaugurate",
      "invest",
      "investment",
      "launch",
      "launched",
      "launches",
      "opens",
      "project",
      "projects",
      "worth"
    ])
  );
}

function hasTargetRegionEvidence(article) {
  return (
    hasNcrMatch(article) ||
    hasTargetRegionInTitleOrUrl(article) ||
    hasTargetRegionInPrimaryText(article) ||
    hasDominantEnabledCityEvidence(article)
  );
}

function hasNcrTitleOrUrlMatch(article) {
  const haystack = `${article.title || ""} ${getArticleUrlText(article)}`.toLowerCase();
  return /\bncr\b/i.test(haystack) || /\bdelhi ncr\b/i.test(haystack);
}

function isNcrCommercialOfficeMarketArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasNcrTitleOrUrlMatch(article) &&
    hasKeyword(primaryAndUrl, ncrCommercialOfficeKeywords) &&
    !hasKeyword(primaryAndUrl, ["housing sales", "housing demand", "residential sales", "home sales"])
  );
}

function isFaridabadNcrGrowthComparisonArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    hasWholeWordKeyword(primaryAndUrl, ["faridabad", "faridabads"]) &&
    hasWholeWordKeyword(primaryAndUrl, ["gurugram", "gurgaon", "noida"]) &&
    hasKeyword(primaryAndUrl, ["real estate", "realty", "property", "housing"]) &&
    (hasKeyword(primaryAndUrl, positiveCityMarketKeywords) || hasKeyword(primaryAndUrl, positiveGrowthCatalystKeywords))
  );
}

function hasCleanPrimaryText(article) {
  const primaryText = getArticlePrimaryText(article);
  const urlText = getArticleUrlText(article);
  const bodyText = getArticleBodyText(article);

  return (
    !hasWholeWordKeyword(primaryText, negativeNewsKeywords) &&
    !hasKeyword(primaryText, negativePhraseKeywords) &&
    !hasWholeWordKeyword(urlText, negativeNewsKeywords) &&
    !hasKeyword(urlText, negativePhraseKeywords) &&
    !hasWholeWordKeyword(bodyText, severeBodyNegativeKeywords) &&
    !hasKeyword(bodyText, severeBodyNegativePhrases)
  );
}

function hasCleanPrimaryAndUrlText(article) {
  const primaryText = getArticlePrimaryText(article);
  const urlText = getArticleUrlText(article);

  return (
    !hasWholeWordKeyword(primaryText, negativeNewsKeywords) &&
    !hasKeyword(primaryText, negativePhraseKeywords) &&
    !hasWholeWordKeyword(urlText, negativeNewsKeywords) &&
    !hasKeyword(urlText, negativePhraseKeywords)
  );
}

function isPositiveTargetProjectUpdate(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryText(article) &&
    hasTargetRegionEvidence(article) &&
    hasPromotionalRealEstateSignal(article) &&
    hasSpecificProjectOrDevelopmentSignal(article) &&
    hasKeyword(primaryAndUrl, [
      "approved",
  "मंजूर",
      "approves",
      "approval",
  "मंजूरी",
      "allotment",
      "allotments",
      "bookings worth",
      "first faridabad project",
      "first gurugram project",
      "faridabad project",
      "gdv",
      "gurugram project",
      "noida project",
      "invest",
      "investment",
  "निवेश",
      "joint development",
      "launches",
      "property hotspot",
      "records",
      "records sales",
      "reports bookings",
      "residential project",
  "senior living",
      "sold out",
      "traffic booths",
      "worth rs",
      "worth ₹"
    ])
  );
}

function isFaridabadJewarGrowthArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasWholeWordKeyword(primaryAndUrl, ["faridabad"]) &&
    hasKeyword(primaryAndUrl, faridabadJewarGrowthKeywords) &&
    hasKeyword(primaryAndUrl, positiveGrowthCatalystKeywords)
  );
}

function isFngConnectivityCatalystArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  return (
    hasCleanPrimaryAndUrlText(article) &&
    hasWholeWordKeyword(primaryAndUrl, ["faridabad"]) &&
    hasWholeWordKeyword(primaryAndUrl, ["noida"]) &&
    hasWholeWordKeyword(primaryAndUrl, ["ghaziabad"]) &&
    hasKeyword(primaryAndUrl, connectivityCatalystKeywords) &&
    hasKeyword(primaryAndUrl, ["connectivity", "corridor", "development", "growth", "infrastructure", "real estate"])
  );
}

function hasTargetInfrastructureCorridorSignal(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  return hasKeyword(primaryAndUrl, targetInfrastructureCorridorKeywords);
}

function isTargetDominantInfrastructureCorridor(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const fullText = getArticleSearchText(article);
  const gurugramRule = allCityRules.find((rule) => rule.code === "gurugram");
  const faridabadRule = allCityRules.find((rule) => rule.code === "faridabad");
  const hasGurugram = hasWholeWordKeyword(primaryAndUrl, gurugramRule?.keywords || ["gurugram", "gurgaon"]);
  const hasFaridabad = hasWholeWordKeyword(primaryAndUrl, faridabadRule?.keywords || ["faridabad"]);
  const hasNoida = hasWholeWordKeyword(primaryAndUrl, ["noida"]);
  const targetMentions = countKeywordMentions(fullText, targetCityKeywords);
  const outsideMentions = countKeywordMentions(fullText, outsideCityKeywords);
  const hasNamedTargetNoidaCorridor = hasGurugram && hasFaridabad && hasNoida;

  return (
    hasTargetInfrastructureCorridorSignal(article) &&
    hasGurugram &&
    hasFaridabad &&
    (
      hasNamedTargetNoidaCorridor ||
      (
        targetMentions >= 2 &&
        outsideMentions > 0 &&
        targetMentions / (targetMentions + outsideMentions) >= 0.67
      )
    )
  );
}

function hasOutsideRegionInPrimaryText(article) {
  const primaryText = getArticlePrimaryText(article);

  if (
    isTargetDominantInfrastructureCorridor(article) ||
    isNcrCommercialOfficeMarketArticle(article) ||
    isFaridabadJewarGrowthArticle(article) ||
    isFaridabadNcrGrowthComparisonArticle(article) ||
    isConnectivityCatalystArticle(article) ||
    isPositiveTargetBusinessOrDevelopmentArticle(article) ||
    isPositiveTargetProjectUpdate(article)
  ) {
    return false;
  }

  if (/\b(new delhi|south delhi|central delhi|east delhi|west delhi|north delhi|delhi,|delhi:)\b/i.test(primaryText)) {
    return true;
  }

  return hasWholeWordKeyword(primaryText, getDisqualifyingOutsideCityKeywords(article));
}

function hasOutsideRegionEvidence(article) {
  return hasWholeWordKeyword(getArticleSearchText(article), getDisqualifyingOutsideCityKeywords(article));
}

const cityDetectionCache = new Map();

function getCityDetectionCacheKey(article) {
  return [article.newsLink || article.url || "", normalizeTitle(article.title || ""), article.publishedAt || article.createdAt || ""].join("|");
}

function getCachedDetectedCityCodes(article) {
  const key = getCityDetectionCacheKey(article);
  if (!cityDetectionCache.has(key)) {
    cityDetectionCache.set(key, detectCityCodes(article));
  }
  return cityDetectionCache.get(key);
}

function applyCityCode(article) {
  const detectedCityCodes = getCachedDetectedCityCodes(article);
  const detectedCityCode = detectedCityCodes.includes(article.cityCode) ? article.cityCode : detectedCityCodes[0];

  return {
    ...article,
    cityCode: detectedCityCode || ""
  };
}

function expandCityArticles(article) {
  const cityCodes = getCachedDetectedCityCodes(article);

  if (cityCodes.length === 0) {
    return [article];
  }

  return cityCodes.map((cityCode) => {
    const cityArticle = {
      ...article,
      cityCode,
      sharedCityArticle: cityCodes.length > 1
    };

    return {
      ...cityArticle,
      id: stableId(cityArticle)
    };
  });
}

function toApiPayload(article) {
  const fallbackLogo = safeFallbackLogo(article.newsLink || article.url);
  const thumbnailImage = isHttpUrl(article.thumbnailImage) ? article.thumbnailImage : fallbackLogo;
  const postedByLogo = isHttpUrl(article.postedByLogo) ? article.postedByLogo : fallbackLogo;

  return {
    title: cleanTitle(article.title),
    description: cleanText(article.description, 180) || cleanTitle(article.title),
    cityCode: article.cityCode,
    isActive: article.isActive,
    newsLink: article.newsLink,
    thumbnailImage,
    postedBy: cleanPublisherName(article.postedBy, article.newsLink || article.url),
    createdAt: getCreatedAt(article),
    postedByLogo
  };
}

function articlePriority(article) {
  return article.sharedCityArticle ? 1 : 0;
}

function missingRequiredPayloadFields(article) {
  const payload = toApiPayload(article);

  return requiredPayloadFields.filter((field) => {
    const value = payload[field];
    return typeof value !== "string" || !value.trim();
  });
}

function invalidPayloadUrlFields(article) {
  const payload = toApiPayload(article);

  return ["newsLink", "thumbnailImage", "postedByLogo"].filter((field) => !isHttpUrl(payload[field]));
}

function hasKeyword(value, keywords) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function countKeywordMentions(value, keywords) {
  const normalized = value.toLowerCase();

  return keywords.reduce((count, keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = normalized.match(new RegExp(`\\b${escaped}\\b`, "gi"));

    return count + (matches?.length || 0);
  }, 0);
}

function hasWholeWordKeyword(value, keywords) {
  const normalized = value.toLowerCase();

  return keywords.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
  });
}

function hasNcrMatch(article) {
  const haystack = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`.toLowerCase();
  return /\bdelhi[\s-]?ncr\b/i.test(haystack);
}

function hasStrongArticleCityMatch(article, rule) {
  const fullText = getArticleSearchText(article);
  const targetMentions = countKeywordMentions(fullText, rule.keywords);
  const allLocationMentions = countKeywordMentions(fullText, allLocationKeywords);

  if (targetMentions < 1 || allLocationMentions === 0) {
    return false;
  }

  return targetMentions === allLocationMentions;
}

function hasRealEstateEvidence(article) {
  const primaryText = getArticlePrimaryText(article);
  const primaryAndUrl = `${primaryText} ${getArticleUrlText(article)}`;

  return (
    hasTargetRegionEvidence(article) &&
    hasPromotionalRealEstateSignal(article) &&
    (
      hasKeyword(primaryAndUrl, realEstateKeywords) ||
      hasKeyword(primaryAndUrl, realEstateCompanyKeywords)
    )
  );
}

function hasPromotionalRealEstateSignal(article) {
  const primaryText = getArticlePrimaryText(article);
  const primaryAndUrl = `${primaryText} ${getArticleUrlText(article)}`;

  return hasKeyword(primaryAndUrl, promotionalRealEstateKeywords);
}

function hasDisallowedLanguage(article) {
  const text = [
    article.title,
    article.description,
    article.articleText,
    article.postedBy,
    article.newsLink
  ]
    .filter(Boolean)
    .join(" ");

  const hasDevanagariScript = /[\u0900-\u097F]/u.test(text);
  const hasClearlyUnsupportedScript = /[\u0600-\u08FF\u0980-\u09FF\u0A00-\u0D7F\u0E00-\u0FFF\u1000-\u10FF\u3040-\u30FF\u4E00-\u9FFF]/u.test(text);
  return hasClearlyUnsupportedScript && !hasDevanagariScript;
}

function isTargetProjectAwardArticle(article) {
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  const companyCityCodes = getCorporateCompanyCityCodes(article);

  return (
    hasCleanPrimaryAndUrlText(article) &&
    (hasWholeWordKeyword(primaryAndUrl, targetCityKeywords) || companyCityCodes.length > 0) &&
    hasKeyword(primaryAndUrl, realEstateCompanyKeywords) &&
    hasKeyword(primaryAndUrl, ["award", "awards", "wins", "won"]) &&
    hasKeyword(primaryAndUrl, ["development", "housing", "project", "real estate", "realty", "residential"])
  );
}

function isGurugramCorridorArticle(article) {
  return hasWholeWordKeyword(getArticleSearchText(article), gurugramCorridorKeywords);
}

function getDisqualifyingOutsideCityKeywords(article) {
  if (isFngConnectivityCatalystArticle(article)) {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi", "ghaziabad", "noida", "uttar pradesh"].includes(keyword));
  }

  if (article.cityCode === "noida") {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi"].includes(keyword));
  }

  if (isFaridabadJewarGrowthArticle(article)) {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi", "noida", "uttar pradesh"].includes(keyword));
  }

  if (isFaridabadNcrGrowthComparisonArticle(article)) {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi", "gurugram", "gurgaon", "noida"].includes(keyword));
  }

  if (isNcrCommercialOfficeMarketArticle(article)) {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi", "noida"].includes(keyword));
  }

  if (isTargetDominantInfrastructureCorridor(article)) {
    return outsideCityKeywords.filter((keyword) => keyword !== "noida");
  }

  if (isConnectivityCatalystArticle(article)) {
    return outsideCityKeywords.filter((keyword) => keyword !== "noida");
  }

  if (hasNcrMatch(article)) {
    return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi"].includes(keyword));
  }

  if (!isGurugramCorridorArticle(article)) {
    return outsideCityKeywords;
  }

  return outsideCityKeywords.filter((keyword) => !["delhi", "new delhi"].includes(keyword));
}

function isGenericCultureReligionLocalNews(article) {
  const primaryAndUrl = getArticlePrimaryText(article) + " " + getArticleUrlText(article);

  if (!hasKeyword(primaryAndUrl, [
    "auspicious activities",
    "auspicious activity",
    "festival",
    "festivals",
    "muhurat",
    "muhurta",
    "pitru paksha",
    "pitrapaksha",
    "puja",
    "religious ritual",
    "shrad",
    "shradh",
    "shraddh",
    "shraddha",
    "श्राद्ध",
    "पितृ पक्ष",
    "पूजा",
    "मुहूर्त",
    "शुभ कार्य",
    "शुभ"
  ])) {
    return false;
  }

  return !hasKeyword(primaryAndUrl, [
    "commercial real estate",
    "development authority",
    "housing project",
    "infrastructure project",
    "land parcel",
    "metro project",
    "project launch",
    "property market",
    "real estate",
    "realty",
    "residential project",
    "township"
  ]);
}
function isGenericLocalNonRealEstateNews(article) {
  const primaryText = getArticlePrimaryText(article);
  const titleAndUrl = `${article.title || ""} ${getArticleUrlText(article)}`.toLowerCase();

  if (!hasKeyword(`${primaryText} ${titleAndUrl}`, [
    "advocate",
    "advocates",
    "birders",
    "birds return",
    "clean-up",
    "clean up",
    "custody",
    "father custody",
    "highway blockade",
    "judicial work",
    "manas national park",
    "mass leave",
    "rhino",
    "sarobar",
    "shelter home",
    "welfare shelter",
    "wildlife",
    "women’s shelter",
    "womens shelter"
  ])) {
    return false;
  }

  return !hasKeyword(titleAndUrl, [
    "affordable housing",
    "commercial real estate",
    "development authority",
    "housing project",
    "infrastructure project",
    "land parcel",
    "project launch",
    "property market",
    "real estate project",
    "realty project",
    "residential project",
    "township"
  ]);
}
function isGenericBroadMarketHeadline(article) {
  const title = cleanText(article.title || "", 240).toLowerCase();
  const titleHasCity = cityRules.some((rule) => hasWholeWordKeyword(title, rule.keywords));

  if (titleHasCity) {
    return false;
  }

  return hasKeyword(title, [
    "airports, expressways, and gccs redefine",
    "category ii aif",
    "commercial real estate is entering a new growth cycle",
    "demand to stay healthy",
    "festive housing demand",
    "growth likely to moderate",
    "housing demand to stay",
    "ageing population driving senior living",
    "senior living arrangement demand",
    "india's commercial real estate",
    "india’s commercial real estate",
    "new growth cycle",
    "what will drive demand"
  ]);
}
function isBlockedArticle(article) {
  const title = article.title || "";
  const description = article.description || "";
  const newsLink = article.newsLink || "";
  const normalizedTitle = title.trim().toLowerCase();
  const primaryText = `${title} ${description}`;
  const allowProjectAwardArticle = isTargetProjectAwardArticle(article);
  const articleHost = getArticleHost(article);
  const isWeakFoodRetailSource = articleHost === "businessoffood.in" && !hasKeyword(`${title} ${description} ${newsLink}`.toLowerCase(), ["real estate", "realty", "developer", "residential", "commercial project", "retail destination", "tenant mix", "open-air retail", "sector 70", "office space", "leased", "rents", "sq ft"]);

  return (
    blockedExactTitles.includes(normalizedTitle) ||
    isAddressLikeHeadline(title) ||
    isMalformedCategoryHeadline(title) ||
    isGenericBroadMarketHeadline(article) ||
    isGenericCultureReligionLocalNews(article) ||
    isGenericLocalNonRealEstateNews(article) ||
    isWeakFoodRetailSource ||
    (!allowProjectAwardArticle && hasKeyword(primaryText, blockedTitleKeywords)) ||
    (!allowProjectAwardArticle && hasKeyword(newsLink, blockedUrlParts))
  );
}

function isAddressLikeHeadline(title = "") {
  const normalized = cleanText(title, 240).toLowerCase();

  return (
    /\b\d+(st|nd|rd|th)\s+floor\b/.test(normalized) &&
    /\bsector\s+\d+\b/.test(normalized) &&
    /\b(noida|gurugram|gurgaon|faridabad|uttar pradesh|haryana|delhi)\b/.test(normalized)
  );
}

function isMalformedCategoryHeadline(title = "") {
  const normalized = cleanText(title, 240).toLowerCase().replace(/\s+/g, " ");
  const alphanumericLength = normalized.replace(/[^a-z0-9\u0900-\u097F]/gi, "").length;

  return (
    alphanumericLength < 8 ||
    /\bproperty\s*\/\s*c['’]?struction\b/i.test(normalized) ||
    /\bauto\s*homeno\s*auto\b/i.test(normalized) ||
    /^realtynmore,\s*\d/.test(normalized)
  );
}

function isNegativeNews(article) {
  const primaryText = getArticlePrimaryText(article);
  const urlText = getArticleUrlText(article);
  const bodyText = getArticleBodyText(article);
  const primaryAndUrl = `${primaryText} ${urlText}`;

  if (/\b(dumping|dumped|industrial waste|vacant land|residents flag|pollution|sewage|garbage|waste dumped)\b/i.test(primaryAndUrl)) {
    return true;
  }

  if (
    hasWholeWordKeyword(primaryAndUrl, courtKeywords) &&
    (hasKeyword(primaryAndUrl, negativePhraseKeywords) || hasWholeWordKeyword(primaryAndUrl, ["restraining", "restrained", "interim", "litigation", "petition", "plea"]))
  ) {
    return true;
  }

  if (
    isFaridabadJewarGrowthArticle(article) ||
    isPositiveTargetProjectUpdate(article) ||
    isOfficialAuthorityPipelineNotice(article)
  ) {
    return false;
  }

  return (
    hasWholeWordKeyword(primaryText, negativeNewsKeywords) ||
    hasKeyword(primaryText, negativePhraseKeywords) ||
    hasWholeWordKeyword(urlText, negativeNewsKeywords) ||
    hasKeyword(urlText, negativePhraseKeywords) ||
    hasWholeWordKeyword(bodyText, severeBodyNegativeKeywords) ||
    hasKeyword(bodyText, severeBodyNegativePhrases) ||
    isReraRelated(article) ||
    isCourtRealEstateRelated(article)
  );
}

function hasOutsideCityConflict(article) {
  if (
    isPositiveTargetProjectUpdate(article) ||
    (isPositiveTargetBusinessOrDevelopmentArticle(article) && (hasTargetRegionInTitleOrUrl(article) || hasNcrMatch(article)))
  ) {
    return false;
  }

  const disqualifyingOutsideCities = getDisqualifyingOutsideCityKeywords(article);
  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  if (hasWholeWordKeyword(primaryAndUrl, disqualifyingOutsideCities)) {
    return true;
  }

  return hasOutsideLocationDominance(article);
}

function hasOutsideLocationDominance(article) {
  const bodyText = getArticleBodyText(article);

  if (!bodyText) {
    return false;
  }

  const targetMentions = countKeywordMentions(bodyText, targetCityKeywords);
  const outsideMentions = countKeywordMentions(bodyText, getDisqualifyingOutsideCityKeywords(article));

  return outsideMentions > 0 && outsideMentions > targetMentions * 2;
}


const localJudgePositiveKeywords = [
  "affordable housing", "airport", "approval", "approved", "authority", "builder", "commercial", "commercial project", "connectivity", "construction", "corridor", "developer", "development", "expressway", "flat", "flats", "flyover", "gdv", "highway", "housing", "housing project", "industrial plot", "infra", "infrastructure", "invest", "investment", "land acquisition", "land auction", "land parcel", "launch", "launched", "launches", "leasing", "luxury homes", "metro", "office space", "plot", "plots", "possession", "project", "projects", "property", "rera", "real estate", "realty", "redevelopment", "residential", "residential project", "road", "township", "warehouse", "warehousing",
  "रियल एस्टेट", "रियल्टी", "प्रॉपर्टी", "संपत्ति", "आवास", "घर", "फ्लैट", "प्लॉट", "जमीन", "भूमि", "परियोजना", "प्रोजेक्ट", "निर्माण", "विकास", "निवेश", "मेट्रो", "एक्सप्रेसवे", "हाईवे", "रिंग रोड", "एयरपोर्ट", "मंजूरी", "लॉन्च", "மனை", "வீடு", "கட்டிடம்", "திட்டம்", "மெட்ரோ", "சாலை", "முதலீடு", "அனுமதி", "ఇల్లు", "భూమి", "ప్రాజెక్ట్", "మెట్రో", "రోడ్", "రియల్ ఎస్టేట్", "పెట్టుబడి", "అనుమతి", "ಮನೆ", "ಭೂಮಿ", "ಯೋಜನೆ", "ಮೆಟ್ರೋ", "ರಿಯಲ್ ಎಸ್ಟೇಟ್", "ಹೂಡಿಕೆ", "ಅನುಮತಿ", "বাড়ি", "জমি", "প্রকল্প", "মেট্রো", "রিয়েল এস্টেট", "বিনিয়োগ", "অনুমোদন", "મકાન", "જમીન", "પ્રોજેક્ટ", "મેટ્રો", "રિયલ એસ્ટેટ", "રોકાણ", "મંજૂરી", "घर", "जमीन", "प्रकल्प", "मेट्रो", "रिअल इस्टेट", "गुंतवणूक", "मंजुरी"
];

const localJudgeNegativeKeywords = [
  "accident", "admission", "admissions", "actor", "actress", "auspicious", "bird", "birders", "calendar", "college", "court dispute", "crime", "custody", "death", "dies", "election", "entertainment", "festival", "food delivery", "funeral", "gold rate", "holiday", "hospital", "imd", "killed", "lawsuit", "murder", "ott", "police", "politics", "pollution", "protest", "puja", "rape", "religious", "school", "shraddh", "suicide", "traffic jam", "weather", "wedding", "wildlife", "श्राद्ध", "पितृ पक्ष", "शुभ कार्य", "शुभ", "पूजा", "त्योहार", "पर्व", "मौसम", "बारिश", "हत्या", "आत्महत्या", "पुलिस", "अपराध", "चुनाव", "स्कूल", "कॉलेज", "अस्पताल", "जाम", "प्रदूषण", "விழா", "கொலை", "காவல்", "மழை", "பள்ளி", "மருத்துவமனை", "పండుగ", "హత్య", "పోలీస్", "వర్షం", "స్కూల్", "ఆసుపత్రి", "ಹಬ್ಬ", "ಕೊಲೆ", "ಪೊಲೀಸ್", "ಮಳೆ", "ಶಾಲೆ", "ಆಸ್ಪತ್ರೆ", "উৎসব", "খুন", "পুলিশ", "বৃষ্টি", "স্কুল", "হাসপাতাল", "તહેવાર", "હત્યા", "પોલીસ", "વરસાદ", "શાળા", "હોસ્પિટલ", "सण", "हत्या", "पोलीस", "पाऊस", "शाळा", "रुग्णालय"
];

const localJudgeStrongNegativeKeywords = ["shraddh", "श्राद्ध", "पितृ पक्ष", "शुभ कार्य", "food delivery", "tea e-auction", "volunteers meet", "traffic jam", "weather alert", "murder", "suicide", "rape", "custody", "wildlife"];

function localQualityJudge(article) {
  const primaryAndUrl = getArticlePrimaryText(article) + " " + getArticleUrlText(article);
  const fullText = getArticleSearchText(article);
  const positiveScore = countKeywordMentions(fullText, localJudgePositiveKeywords);
  const negativeScore = countKeywordMentions(fullText, localJudgeNegativeKeywords);
  const strongNegativeScore = countKeywordMentions(fullText, localJudgeStrongNegativeKeywords);
  const cityKeywords = article.cityCode ? (allCityRules.find((rule) => rule.code === article.cityCode)?.keywords || []) : [];
  const cityScore = article.cityCode ? countKeywordMentions(fullText, cityKeywords) : 0;
  const hasCoreTopic = hasKeyword(primaryAndUrl, ["real estate", "realty", "property", "housing", "infrastructure", "project", "metro", "expressway", "airport", "rera", "township", "land parcel", "construction", "builder", "developer", "residential", "commercial", "रियल एस्टेट", "रियल्टी", "प्रॉपर्टी", "परियोजना", "प्रोजेक्ट", "जमीन", "भूमि", "मेट्रो", "आवास", "निर्माण", "विकास"]);
  const hasStrongProjectSignal = hasSpecificProjectOrDevelopmentSignal(article) || isPositiveTargetBusinessOrDevelopmentArticle(article) || isPositiveTargetProjectUpdate(article);
  const hasCityEvidence = cityScore > 0 || hasNcrMatch(article) || hasMappedCorporateCityEvidence(article);
  const score = positiveScore * 2 + (hasCoreTopic ? 4 : 0) + (hasStrongProjectSignal ? 4 : 0) + Math.min(cityScore, 3) - negativeScore * 3 - strongNegativeScore * 8;
  const base = { score, positiveScore, negativeScore, strongNegativeScore, cityScore };

  if (strongNegativeScore > 0 && !hasCoreTopic) {
    return { ...base, approved: false, needsReview: false, status: "rejected", reason: "strong non-real-estate local topic" };
  }

  if (negativeScore > 0 && positiveScore < 2) {
    return { ...base, approved: false, needsReview: false, status: "rejected", reason: "negative/local topic outweighs project signal" };
  }

  if (!hasCoreTopic && !hasStrongProjectSignal) {
    return { ...base, approved: false, needsReview: false, status: "rejected", reason: "no core real-estate/infrastructure topic" };
  }

  if (!hasCityEvidence) {
    return { ...base, approved: false, needsReview: false, status: "rejected", reason: "weak city evidence" };
  }

  if (score >= 4) {
    return { ...base, approved: true, needsReview: false, status: "approved", reason: "approved by local quality judge" };
  }

  if (hasCoreTopic && hasCityEvidence && strongNegativeScore === 0 && negativeScore <= positiveScore) {
    return { ...base, approved: false, needsReview: true, status: "review", reason: "borderline positive real-estate item needs review" };
  }

  return { ...base, approved: false, needsReview: false, status: "rejected", reason: "low local quality score" };
}

function isRejectedByLocalQualityJudge(article) {
  return !localQualityJudge(article).approved;
}

function needsLocalQualityReview(article) {
  const decision = localQualityJudge(article);

  if (decision.needsReview === true) {
    return true;
  }

  return (
    decision.approved === true &&
    Boolean(article.cityCode) &&
    isRealEstateRelated(article) &&
    !isBlockedArticle(article) &&
    !isNegativeNews(article) &&
    hasTargetRegionEvidence(article) &&
    !hasSpecificProjectOrDevelopmentSignal(article)
  );
}

function hasMappedCorporateCityEvidence(article) {
  return Boolean(article.cityCode) && (
    isTargetRealEstateCorporateUpdate(article) ||
    isLeadershipBusinessConfidenceArticle(article) ||
    isTargetProjectAwardArticle(article)
  );
}
function getRejectionReasons(article, sentIds) {
  const reasons = [];

  if (!article.title || !article.newsLink) {
    reasons.push("filter 0: missing title/link");
    return reasons;
  }

  if (isBlockedArticle(article)) {
    reasons.push("filter 1: spam/menu page");
  }

  if (!hasNewsArticlePageLink(article)) {
    reasons.push("filter 15: direct media/PDF link, not article page");
  }

  if (hasDisallowedLanguage(article)) {
    reasons.push("filter 2: unsupported language/script");
  }

  if (isNegativeNews(article)) {
    reasons.push("filter 3: negative/crime/utility concern news");
  }

  if (!isRealEstateRelated(article) || isBlockedArticle(article) || isNegativeNews(article)) {
    reasons.push("filter 4: not positive target real-estate/project news");
  }

  if (isRealEstateRelated(article) && !hasSpecificProjectOrDevelopmentSignal(article)) {
    reasons.push("filter 9: no specific project/development signal");
  }

  if (isBroadNonProjectUpdate(article)) {
    reasons.push("filter 10: broad market/company update, not city project news");
  }

  if (isNoidaDeveloperBlogArticle(article) && !hasNoidaDeveloperBlogQualitySignal(article)) {
    reasons.push("filter 14: weak Noida developer blog signal");
  }

  if (isRejectedByLocalQualityJudge(article)) {
    const decision = localQualityJudge(article);
    reasons.push(`filter 17: local quality judge rejected article (${decision.reason}, score ${decision.score})`);
  }

  if (!article.cityCode) {
    reasons.push("filter 5: no allowed city match");
  }

  if (article.cityCode && !hasTargetRegionEvidence(article) && !hasMappedCorporateCityEvidence(article)) {
    reasons.push("filter 6: target region missing or weak");
  }

  if (hasOutsideRegionInPrimaryText(article) && !isStrongPositiveMarketOrInfrastructureArticle(article)) {
    reasons.push("filter 7: outside region in title/description");
  }

  if (hasOutsideCityConflict(article)) {
    reasons.push("filter 8: outside-city conflict");
  }

  if (hasSourceCityUrlMismatch(article)) {
    reasons.push("filter 16: source URL city mismatch");
  }

  const missingFields = article.cityCode ? missingRequiredPayloadFields(article) : [];

  if (missingFields.length > 0) {
    reasons.push(`filter 11: missing required fields (${missingFields.join(", ")})`);
  }

  const invalidUrlFields = article.cityCode ? invalidPayloadUrlFields(article) : [];

  if (invalidUrlFields.length > 0) {
    reasons.push(`filter 12: invalid URL fields (${invalidUrlFields.join(", ")})`);
  }

  if (articleDedupeIds(article).some((id) => sentIds.has(id))) {
    reasons.push("filter 13: already sent");
  }

  return reasons;
}

function getFastRejectionReasons(article, sentIds, skipTitleSet) {
  if (shouldSkipTitle(article, skipTitleSet)) {
    return ["manual skip: title already reposted"];
  }

  if (!article.title || !article.newsLink) {
    return ["filter 0: missing title/link"];
  }

  if (!article.cityCode) {
    return ["filter 5: no allowed city match"];
  }

  if (articleDedupeIds(article).some((id) => sentIds.has(id))) {
    return ["filter 13: already sent"];
  }

  return getRejectionReasons(article, sentIds);
}

function isPublishableArticle(article, sentIds) {
  return getRejectionReasons(article, sentIds).length === 0;
}

async function readSentIds() {
  const sentIds = new Set();

  try {
    const content = await fs.readFile(sentNewsSeedPath, "utf8");
    const parsed = JSON.parse(content);
    for (const id of Array.isArray(parsed.sentIds) ? parsed.sentIds : []) {
      sentIds.add(id);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    const content = await fs.readFile(sentNewsPath, "utf8");
    const parsed = JSON.parse(content);
    for (const id of Array.isArray(parsed.sentIds) ? parsed.sentIds : []) {
      sentIds.add(id);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  return sentIds;
}

async function writeSentIds(sentIds) {
  await fs.mkdir(stateDir, { recursive: true });
  const latestIds = [...sentIds].slice(-10000);

  await fs.writeFile(
    sentNewsPath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        sentIds: latestIds
      },
      null,
      2
    )
  );
}

async function fetchFeed(sourceUrl, options = {}) {
  const feed = await parser.parseURL(sourceUrl);
  const source = feed.title || new URL(sourceUrl).hostname;
  const publisherLogo = pickFirst(getPublisherLogo(feed), getFallbackLogo(sourceUrl));
  const feedItems = feed.items.slice(0, getMaxItemsPerSource());

  return mapWithConcurrency(feedItems, getArticleMetadataConcurrency(), async (item) => {
    const newsLink = item.link || item.guid;
    const metadata = newsLink ? await fetchArticleMetadata(newsLink, {}, options) : {};
    const rawArticle = {
      title: stripHtml(item.title),
      description: stripHtml(
        metadata.description || item.contentSnippet || item.content || item.summary || item.description || ""
      ),
      articleText: stripHtml(metadata.articleText || ""),
      newsLink,
      thumbnailImage: absoluteUrl(metadata.thumbnailImage || getThumbnail(item), newsLink || sourceUrl),
      postedBy: source,
      postedByLogo: publisherLogo,
      publishedAt: metadata.publishedAt || item.isoDate || item.pubDate || null,
      fetchedAt: new Date().toISOString()
    };

    const article = {
      title: rawArticle.title,
      description: rawArticle.description || rawArticle.title,
      articleText: rawArticle.articleText,
      isActive: true,
      newsLink: rawArticle.newsLink,
      thumbnailImage: rawArticle.thumbnailImage,
      postedBy: rawArticle.postedBy,
      postedByLogo: rawArticle.postedByLogo,
      sourceUrl,
      createdAt: rawArticle.publishedAt || "",
      publishedAt: rawArticle.publishedAt,
      fetchedAt: rawArticle.fetchedAt
    };

    const cityArticle = applyCityCode(cleanArticleFields(article));

    return {
      ...cityArticle,
      id: stableId(cityArticle)
    };
  });
}

async function fetchHtml(sourceUrl, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(sourceUrl, {
        signal: options.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.text();
    } catch (error) {
      lastError = error;

      if (isMissingPaginatedPageError(error) || attempt === 2) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
    }
  }

  throw lastError;
}

function isMissingPaginatedPageError(error) {
  return /^HTTP (404|410)\b/.test(error.message || "");
}

function extractArticleText($) {
  $(
    [
      "script",
      "style",
      "noscript",
      "nav",
      "header",
      "footer",
      "aside",
      "form",
      "button",
      "iframe",
      "[role='navigation']",
      "[class*='related']",
      "[class*='recommend']",
      "[class*='trending']",
      "[class*='popular']",
      "[class*='sidebar']",
      "[class*='share']",
      "[class*='social']",
      "[class*='comment']",
      "[id*='related']",
      "[id*='recommend']",
      "[id*='trending']",
      "[id*='popular']",
      "[id*='sidebar']"
    ].join(",")
  ).remove();

  const selectors = [
    "article [class*='story']",
    "article [class*='article']",
    "article [class*='content']",
    "article",
    "main article",
    "main [class*='story']",
    "main [class*='article']",
    "main [class*='content']"
  ];

  const candidates = selectors
    .map((selector) => stripHtml($(selector).text()))
    .filter((text) => text.length >= 120);

  if (candidates.length > 0) {
    return candidates.sort((a, b) => b.length - a.length)[0].slice(0, 5000);
  }

  return stripHtml(
    $("p")
      .map((_, element) => $(element).text())
      .get()
      .join(" ")
  ).slice(0, 5000);
}

function findStructuredDate(value) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const date = findStructuredDate(item);

      if (date) {
        return date;
      }
    }

    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  for (const key of ["datePublished", "dateCreated", "uploadDate", "dateModified"]) {
    const date = toIsoDate(value[key]);

    if (date) {
      return date;
    }
  }

  for (const child of Object.values(value)) {
    const date = findStructuredDate(child);

    if (date) {
      return date;
    }
  }

  return "";
}

function findStructuredImage(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = findStructuredImage(item);

      if (image) {
        return image;
      }
    }

    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  for (const key of ["url", "contentUrl"]) {
    if (typeof value[key] === "string" && value[key].trim()) {
      return value[key].trim();
    }
  }

  for (const key of ["image", "thumbnail", "thumbnailUrl", "primaryImageOfPage"]) {
    const image = findStructuredImage(value[key]);

    if (image) {
      return image;
    }
  }

  return "";
}

function extractStructuredPublishedAt($) {
  const scripts = $("script[type='application/ld+json']")
    .map((_, element) => $(element).contents().text())
    .get();

  for (const script of scripts) {
    try {
      const date = findStructuredDate(JSON.parse(script));

      if (date) {
        return date;
      }
    } catch {
      // Ignore malformed publisher JSON-LD.
    }
  }

  return "";
}

function extractStructuredImage($) {
  const scripts = $("script[type='application/ld+json']")
    .map((_, element) => $(element).contents().text())
    .get();

  for (const script of scripts) {
    try {
      const image = findStructuredImage(JSON.parse(script));

      if (image) {
        return image;
      }
    } catch {
      // Ignore malformed publisher JSON-LD.
    }
  }

  return "";
}

function extractPageTitle($) {
  return stripHtml(
    pickFirst(
      $('meta[property="og:title"]').attr("content"),
      $('meta[name="twitter:title"]').attr("content"),
      $("h1").first().text(),
      $("title").text()
    )
  ).replace(/\s+[|-]\s+.*$/, "");
}

function extractPagePublishedAt($, fallback = {}) {
  const articleText = $("article, main").first().text();
  const pageText = $("body").text();

  return pickFirst(
    toIsoDate($('meta[property="article:published_time"]').attr("content")),
    toIsoDate($('meta[name="publish-date"]').attr("content")),
    toIsoDate($('meta[name="pubdate"]').attr("content")),
    toIsoDate($('meta[name="date"]').attr("content")),
    toIsoDate($('[itemprop="datePublished"]').attr("content")),
    toIsoDate($("time[datetime]").first().attr("datetime")),
    extractStructuredPublishedAt($),
    extractPublishedAtFromText(articleText.slice(0, 1500)),
    extractPublishedAtFromText(pageText.slice(0, 3000)),
    toIsoDate(fallback.publishedAt)
  );
}

function parseHsvpNoticeDate(value = "") {
  const match = String(value).match(/NEWS_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/i);

  if (!match) {
    return "";
  }

  return buildNewsDateIso({
    year: match[1],
    monthName: Object.entries(monthNumbers).find(([, index]) => index === Number(match[2]) - 1)?.[0] || "jan",
    day: match[3],
    hour: match[4],
    minute: match[5]
  });
}

function getImageCandidate($, element) {
  const image = $(element);
  return pickFirst(
    image.attr("data-src"),
    image.attr("data-original"),
    image.attr("data-lazy-src"),
    image.attr("data-lazy"),
    image.attr("data-url"),
    image.attr("content"),
    parseSrcset(image.attr("srcset")),
    parseSrcset(image.attr("data-srcset")),
    image.attr("src")
  );
}

function getImageContextText($, element) {
  const image = $(element);
  const parts = [
    image.attr("alt"),
    image.attr("title"),
    image.attr("class"),
    image.attr("id"),
    image.attr("role"),
    image.attr("itemprop")
  ];

  for (const ancestor of image.parents().slice(0, 4).toArray()) {
    const node = $(ancestor);
    parts.push(node.attr("class"), node.attr("id"), node.attr("role"), node.attr("itemprop"));
  }

  return parts.filter(Boolean).join(" ").toLowerCase();
}

function parseImageDimension(value = "") {
  const match = String(value).match(/(?:^|[?&,/_-])(?:w|width|h|height)?[=/-]?(\d{2,4})(?:px)?(?:$|[?&,/_x.-])/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getImageDimensions($, element, candidate = "") {
  const image = $(element);
  const width = Number.parseInt(image.attr("width") || image.attr("data-width") || "0", 10) || parseImageDimension(candidate.match(/(?:width|w)[=/-]\d{2,4}/i)?.[0] || "");
  const height = Number.parseInt(image.attr("height") || image.attr("data-height") || "0", 10) || parseImageDimension(candidate.match(/(?:height|h)[=/-]\d{2,4}/i)?.[0] || "");
  const pathSize = candidate.match(/(?:^|[/_-])(\d{2,4})x(\d{2,4})(?:[/_.-]|$)/i);

  return {
    width: width || (pathSize ? Number.parseInt(pathSize[1], 10) : 0),
    height: height || (pathSize ? Number.parseInt(pathSize[2], 10) : 0)
  };
}

function isRejectedImageCandidate(value = "", context = "") {
  if (!value || /^data:/i.test(value)) {
    return true;
  }

  const haystack = `${value} ${context}`.toLowerCase();

  if (/1x1|artshare|blank|placeholder|spacer|logo|icon|avatar|favicon|advertise|banner|copylink|flipcoin|youtube|ytimg|playstore|app store|social|facebook|instagram|whatsapp|linkedin|loader|buffering/i.test(haystack)) {
    return true;
  }

  return /\b(author|profile|byline|publisher|journalist|reporter|columnist|user|headshot|photographer|team-member|staff|employee)\b/i.test(haystack);
}

function imageCandidateScore($, element, candidate, selectorRank) {
  const context = getImageContextText($, element);
  const { width, height } = getImageDimensions($, element, candidate);
  let score = 100 - selectorRank * 4;

  if (width >= 300) score += 18;
  if (height >= 180) score += 12;
  if (width > 0 && width < 160) score -= 45;
  if (height > 0 && height < 90) score -= 35;
  if (/article|story|content|figure|lead|hero|main|zoom|primary|featured/.test(context)) score += 20;
  if (/author|profile|byline|publisher|logo|avatar|headshot|reporter|journalist|staff/.test(context)) score -= 90;

  return score;
}

function extractPageImage($) {
  const selectors = [
    "#zoom_class",
    "img[alt*='Story Image' i]",
    "img[class*='zoom' i]",
    "article figure img",
    "article picture img",
    "article img",
    "main figure img",
    "main picture img",
    "main img",
    "[class*='article'] figure img",
    "[class*='story'] figure img",
    "[class*='content'] figure img",
    "[class*='article'] img",
    "[class*='story'] img",
    "[class*='content'] img",
    "figure img",
    "img"
  ];
  const candidates = [];

  selectors.forEach((selector, selectorRank) => {
    const images = $(selector).toArray();

    for (const image of images) {
      const candidate = getImageCandidate($, image);
      const context = getImageContextText($, image);

      if (candidate && !isRejectedImageCandidate(candidate, context)) {
        candidates.push({
          url: candidate,
          score: imageCandidateScore($, image, candidate, selectorRank)
        });
      }
    }
  });

  return candidates.sort((a, b) => b.score - a.score)[0]?.url || "";
}
function extractMetadataImage($, fallback = {}) {
  return pickFirst(
    extractPageImage($),
    ...[
      extractStructuredImage($),
      $('meta[property="og:image:secure_url"]').attr("content"),
      $('meta[property="og:image"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
      $('meta[name="twitter:image:src"]').attr("content"),
      $('meta[itemprop="image"]').attr("content"),
      fallback.thumbnailImage
    ].filter((image) => image && !isRejectedImageCandidate(image))
  );
}

async function fetchArticleMetadata(articleUrl, fallback = {}, options = {}) {
  try {
    const html = await fetchArticleHtml(articleUrl, options);
    const $ = cheerio.load(html);
    const articleText = extractArticleText($);

    return {
      description: pickFirst(
        pickDescription(
          $('meta[property="og:description"]').attr("content"),
          $('meta[name="description"]').attr("content"),
          fallback.description
        ),
        fallback.title
      ),
      thumbnailImage: pickFirst(
        extractMetadataImage($, fallback),
        fallback.thumbnailImage
      ),
      publishedAt: pickFirst(
        extractPagePublishedAt($, fallback),
        fallback.publishedAt
      ),
      articleText
    };
  } catch {
    return fallback;
  }
}

async function fetchDirectArticle(articleUrl) {
  const html = await fetchArticleHtml(articleUrl);
  const $ = cheerio.load(html);
  const title = extractPageTitle($);
  const publisher = getPublisherName(articleUrl, $("title").text());
  const publisherLogo = pickFirst(
    absoluteUrl($('link[rel="icon"]').attr("href"), articleUrl),
    absoluteUrl($('link[rel="shortcut icon"]').attr("href"), articleUrl),
    getFallbackLogo(articleUrl)
  );
  const article = {
    title,
    description: pickFirst(
      pickDescription(
        $('meta[property="og:description"]').attr("content"),
        $('meta[name="description"]').attr("content")
      ),
      title
    ),
    articleText: extractArticleText($),
    cityCode: "",
    isActive: true,
    newsLink: articleUrl,
    thumbnailImage: absoluteUrl(extractMetadataImage($), articleUrl),
    postedBy: publisher,
    postedByLogo: publisherLogo,
    publishedAt: extractPagePublishedAt($),
    createdAt: extractPagePublishedAt($),
    fetchedAt: new Date().toISOString()
  };
  const cityArticle = applyCityCode(cleanArticleFields(article));

  return {
    ...cityArticle,
    id: stableId(cityArticle)
  };
}

function getArticleUrlVariants(articleUrl) {
  const variants = [articleUrl];

  try {
    const url = new URL(articleUrl);
    const host = url.hostname.replace(/^www\./, "");
    const pathName = url.pathname;

    if (host === "economictimes.indiatimes.com") {
      variants.push(`https://m.economictimes.com${pathName}${url.search}`);

      if (/\/articleshow\//i.test(pathName)) {
        variants.push(`https://m.economictimes.com${pathName.replace(/\/articleshow\//i, "/amp_articleshow/")}${url.search}`);
      }
    }

    if (host === "m.economictimes.com" && /\/amp_articleshow\//i.test(pathName)) {
      variants.push(`https://economictimes.indiatimes.com${pathName.replace(/\/amp_articleshow\//i, "/articleshow/")}${url.search}`);
    }
  } catch {
    // Ignore malformed URLs; the original fetch will report the real failure.
  }

  return [...new Set(variants)];
}

async function fetchArticleHtml(articleUrl, options = {}) {
  let lastError;

  for (const variant of getArticleUrlVariants(articleUrl)) {
    try {
      return await fetchHtml(variant, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchBinary(sourceUrl, options = {}) {
  const response = await fetchWithTimeout(sourceUrl, {
        signal: options.signal,
        headers: {
      "User-Agent": userAgent,
      Accept: "application/pdf,*/*"
    }
  }, 20000);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

function extractPdfLinksFromLatinText(value = "") {
  return [...String(value).matchAll(/https?:\/\/[^\s)<>]+/g)]
    .map((match) => match[0])
    .filter((url) => isHttpUrl(url));
}

function normalizeSectorLabel(value = "") {
  const match = String(value).match(/sector\s*-?\s*(\d{1,3})/i);
  return match ? `Sector ${match[1]}` : "";
}

function extractHsvpFaridabadDetails(pdfLatinText = "") {
  const faridabadLinks = extractPdfLinksFromLatinText(pdfLatinText)
    .filter((link) => /faridabad/i.test(link));
  const sectors = [...new Set(
    faridabadLinks
      .flatMap((link) => [...link.matchAll(/sector\s*-?\s*(\d{1,3})/gi)].map((match) => normalizeSectorLabel(match[0])))
      .filter(Boolean)
  )].sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  const linkLabels = faridabadLinks
    .map((link) => {
      try {
        return new URL(link).pathname.split("/").pop() || "";
      } catch {
        return link;
      }
    })
    .join(" ");
  const locations = [...new Set(
    faridabadLinks.flatMap((link) =>
      ["Budena", "Tikawali", "Kheri Kalan", "Bhupani"]
        .filter((location) => new RegExp(location.replace(/\s+/g, ""), "i").test(link.replace(/\s+/g, "")))
    )
  )];
  const siteTypes = [];

  if (/(^|\d)PS|Primary/i.test(linkLabels)) {
    siteTypes.push("primary school");
  }

  if (/(^|\d)NS|nursery/i.test(linkLabels)) {
    siteTypes.push("nursery school");
  }

  if (/(^|\d)HS|High/i.test(linkLabels)) {
    siteTypes.push("high school");
  }

  if (/Dispensary|HF|Health/i.test(linkLabels)) {
    siteTypes.push("health facility");
  }

  if (/Creche/i.test(linkLabels)) {
    siteTypes.push("creche");
  }

  return {
    faridabadLinks,
    sectors,
    locations,
    siteTypes: [...new Set(siteTypes)]
  };
}

function getHsvpCardTitle($, element) {
  let current = $(element);

  for (let depth = 0; depth < 5; depth += 1) {
    const container = current.parent();

    if (!container.length) {
      break;
    }

    const title = stripHtml(
      container
        .find(".announcement-title, .notice-title, .card-title")
        .first()
        .text()
    );

    if (title && !/^view\b/i.test(title)) {
      return title;
    }

    current = container;
  }

  return stripHtml($(element).text());
}

function buildHsvpFaridabadArticle({ sourceUrl, noticeUrl, cardTitle, pdfLatinText }) {
  const details = extractHsvpFaridabadDetails(pdfLatinText);

  if (details.faridabadLinks.length === 0) {
    return null;
  }

  const sectorText = details.sectors.length > 0 ? details.sectors.join(", ") : "Faridabad sectors";
  const locationText = details.locations.length > 0 ? ` across ${details.locations.join(", ")}` : "";
  const siteTypeText = details.siteTypes.length > 0 ? "institutional and social infrastructure" : "social infrastructure";
  const publishedAt = parseHsvpNoticeDate(noticeUrl);
  const title = /commercial|community/i.test(cardTitle)
    ? `HSVP e-auction pipeline includes Faridabad commercial and community sites`
    : `HSVP July e-auction demarcation plan lists Faridabad sites in ${sectorText}`;
  const description =
    `HSVP's July 2026 e-auction material lists Faridabad ${siteTypeText} sites in ${sectorText}${locationText}, adding a positive authority-backed development pipeline signal.`;
  const article = {
    title,
    description,
    articleText: `${description} Source notice: ${cardTitle}. Faridabad-linked plan references: ${details.faridabadLinks.length}.`,
    isActive: true,
    newsLink: noticeUrl,
    thumbnailImage: getFallbackLogo(sourceUrl),
    postedBy: "Haryana Shehri Vikas Pradhikaran (HSVP)",
    postedByLogo: getFallbackLogo(sourceUrl),
    createdAt: publishedAt,
    publishedAt,
    fetchedAt: new Date().toISOString()
  };
  const cityArticle = applyCityCode(cleanArticleFields(article));

  return {
    ...cityArticle,
    id: stableId(cityArticle)
  };
}

async function fetchHsvpNotices(sourceUrl, options = {}) {
  const html = await fetchHtml(sourceUrl, options);
  const $ = cheerio.load(html);
  const seenLinks = new Set();
  const noticeCandidates = [];

  $("a[href]").each((_, element) => {
    const noticeUrl = absoluteUrl($(element).attr("href"), sourceUrl);

    if (!/\/documents\/notices\/NEWS_\d+.*\.pdf/i.test(noticeUrl) || seenLinks.has(noticeUrl)) {
      return;
    }

    seenLinks.add(noticeUrl);
    noticeCandidates.push({
      noticeUrl,
      cardTitle: getHsvpCardTitle($, element)
    });
  });

  const limitedCandidates = noticeCandidates.slice(0, getMaxItemsPerSource());
  const articles = await mapWithConcurrency(limitedCandidates, 4, async (candidate) => {
    try {
      const pdfBuffer = await fetchBinary(candidate.noticeUrl, options);
      const pdfLatinText = pdfBuffer.toString("latin1");
      return buildHsvpFaridabadArticle({
        sourceUrl,
        ...candidate,
        pdfLatinText
      });
    } catch (error) {
      console.log(`Skipped HSVP notice ${candidate.noticeUrl}: ${error.message}`);
      return null;
    }
  });

  return articles.filter(Boolean);
}

function getNestedImageUrl(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const image = getNestedImageUrl(item);

      if (image) {
        return image;
      }
    }

    return "";
  }

  if (typeof value !== "object") {
    return "";
  }

  return pickFirst(
    value.source_url,
    value.url,
    value.guid?.rendered,
    value.sizes?.large,
    value.sizes?.medium_large,
    value.sizes?.medium,
    getNestedImageUrl(value.image),
    getNestedImageUrl(value.banner),
    getNestedImageUrl(value.featured_image),
    getNestedImageUrl(value._embedded?.["wp:featuredmedia"])
  );
}

function getBptpExternalLink(item) {
  const value = item?.acf?.external_link;

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return pickFirst(value.url, value.href, value.link);
  }

  return "";
}

function buildBptpMediaArticle(item, sourceUrl, typeLabel) {
  const acf = item.acf || {};
  const title = stripHtml(pickFirst(acf.title, item.title?.rendered, item.title));
  const description = stripHtml(
    pickFirst(acf.desc, acf.meta_description, item.excerpt?.rendered, item.content?.rendered, title)
  );
  const publishedAt = toIsoDate(item.date_gmt || item.date);
  const newsLink = pickFirst(getBptpExternalLink(item), item.link);
  const thumbnailImage = absoluteUrl(
    pickFirst(
      getNestedImageUrl(acf.image),
      getNestedImageUrl(acf.banner),
      getNestedImageUrl(item.featured_image),
      getNestedImageUrl(item._embedded?.["wp:featuredmedia"])
    ),
    sourceUrl
  );
  const article = {
    title,
    description,
    articleText: stripHtml(`${description} BPTP ${typeLabel} real estate update.`),
    isActive: true,
    newsLink,
    thumbnailImage: thumbnailImage || getFallbackLogo(sourceUrl),
    postedBy: "BPTP Media",
    postedByLogo: "https://cms.bptp.com/wp-content/uploads/2025/01/logo.svg",
    createdAt: publishedAt,
    publishedAt,
    fetchedAt: new Date().toISOString()
  };
  const cityArticle = applyCityCode(cleanArticleFields(article));

  return {
    ...cityArticle,
    id: stableId(cityArticle)
  };
}

function collectBptpMediaItems(pageProps = {}) {
  return [
    ...(Array.isArray(pageProps.newsData) ? pageProps.newsData.map((item) => ({ item, typeLabel: "media" })) : []),
    ...(Array.isArray(pageProps.pressReleasesData)
      ? pageProps.pressReleasesData.map((item) => ({ item, typeLabel: "press release" }))
      : [])
  ];
}

async function fetchBptpMedia(sourceUrl, options = {}) {
  const html = await fetchHtml(sourceUrl, options);
  const $ = cheerio.load(html);
  const rawJson = $("#__NEXT_DATA__").first().text();

  if (!rawJson) {
    return [];
  }

  const pageData = JSON.parse(rawJson);
  const pageProps = pageData?.props?.pageProps || {};
  const seenKeys = new Set();
  const items = collectBptpMediaItems(pageProps)
    .filter(({ item }) => item?.title || item?.title?.rendered || item?.acf?.title)
    .filter(({ item }) => {
      const key = normalizeTitle(stripHtml(pickFirst(item?.acf?.title, item?.title?.rendered, item?.title)));

      if (!key || seenKeys.has(key)) {
        return false;
      }

      seenKeys.add(key);
      return true;
    })
    .slice(0, getMaxItemsPerSource());

  return items.map(({ item, typeLabel }) => buildBptpMediaArticle(item, sourceUrl, typeLabel));
}

function getOfficialDeveloperPublisher(sourceUrl) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");

  return {
    "dlf.in": "DLF Media",
    "m3mindia.com": "M3M Media",
    "smartworlddevelopers.com": "Smartworld Media",
    "signatureglobal.in": "Signature Global Media",
    "centralpark.in": "Central Park Media"
  }[host] || new URL(sourceUrl).hostname;
}

function buildOfficialDeveloperMediaArticle({
  sourceUrl,
  title,
  description = "",
  articleText = "",
  newsLink = "",
  thumbnailImage = "",
  publishedAt = "",
  postedBy = ""
}) {
  const publisher = postedBy || getOfficialDeveloperPublisher(sourceUrl);
  const cleanedTitle = stripHtml(title);
  const cleanedDescription = stripHtml(description || cleanedTitle);
  const article = {
    title: cleanedTitle,
    description: cleanedDescription,
    articleText: stripHtml(`${articleText || cleanedDescription} ${publisher} official real estate media update.`),
    isActive: true,
    newsLink: absoluteUrl(newsLink || sourceUrl, sourceUrl),
    thumbnailImage: absoluteUrl(thumbnailImage, sourceUrl) || getFallbackLogo(sourceUrl),
    postedBy: publisher,
    postedByLogo: getFallbackLogo(sourceUrl),
    createdAt: toIsoDate(publishedAt),
    publishedAt: toIsoDate(publishedAt),
    fetchedAt: new Date().toISOString()
  };
  const cityArticle = applyCityCode(cleanArticleFields(article));

  return {
    ...cityArticle,
    id: stableId(cityArticle)
  };
}

function uniqueOfficialMediaArticles(articles) {
  return uniqueByDedupeIds(articles.filter((article) => article.title && article.newsLink)).slice(0, getMaxItemsPerSource());
}

async function fetchDlfMedia(sourceUrl, options = {}) {
  const html = await fetchHtml(sourceUrl, options);
  const $ = cheerio.load(html);
  const articles = $(".news_box.media_news").map((_, element) => {
    const card = $(element);

    return buildOfficialDeveloperMediaArticle({
      sourceUrl,
      title: card.find("h4").first().text(),
      description: card.find("p").first().text(),
      articleText: card.text(),
      newsLink: card.find("a[href]").first().attr("href"),
      thumbnailImage: card.find("a[href]").first().attr("href"),
      publishedAt: card.find("span").first().text(),
      postedBy: "DLF Media"
    });
  }).get();

  return uniqueOfficialMediaArticles(articles);
}

async function fetchSmartworldMedia(sourceUrl, options = {}) {
  const html = await fetchHtml(sourceUrl, options);
  const $ = cheerio.load(html);
  const articles = $(".mediabox").map((_, element) => {
    const card = $(element);

    return buildOfficialDeveloperMediaArticle({
      sourceUrl,
      title: card.find("h4").first().text(),
      description: card.find("p").first().text(),
      articleText: card.text(),
      newsLink: card.find("a[href]").first().attr("href") || card.find("img[src]").first().attr("src"),
      thumbnailImage: card.find("img[src]").first().attr("src"),
      publishedAt: card.find("h5").first().text(),
      postedBy: "Smartworld Media"
    });
  }).get();

  return uniqueOfficialMediaArticles(articles);
}

async function fetchM3mMedia(sourceUrl, options = {}) {
  const tabNames = ["news", "press_release", "event"];
  const articles = [];

  for (const tabName of tabNames) {
    for (let page = 1; page <= getMaxPagesPerSource(); page += 1) {
      const apiUrl = `https://m3mindia.com/media-section-tab-data/${tabName}?page=${page}`;
      const response = await fetchWithTimeout(apiUrl, {
        signal: options.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        break;
      }

      const result = await response.json();
      const rows = Array.isArray(result.data) ? result.data : [];

      if (rows.length === 0) {
        break;
      }

      for (const item of rows) {
        articles.push(buildOfficialDeveloperMediaArticle({
          sourceUrl,
          title: item.title,
          description: item.description || item.title,
          articleText: item.description || item.title,
          newsLink: item.link || item.image || sourceUrl,
          thumbnailImage: item.image,
          publishedAt: item.date_time,
          postedBy: "M3M Media"
        }));
      }

      if (!result.last_page || page >= result.last_page || articles.length >= getMaxItemsPerSource()) {
        break;
      }
    }
  }

  return uniqueOfficialMediaArticles(articles);
}

async function fetchSignatureGlobalMedia(sourceUrl, options = {}) {
  let html = "";
  let lastError;
  let pageData;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(sourceUrl, {
        signal: options.signal,
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache"
        }
      }, 30000);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      html = await response.text();
      break;
    } catch (error) {
      lastError = error;

      if (attempt === 3) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }

  if (!html && lastError) {
    console.warn(`Signature Global page fetch failed; trying JSON data fallback. ${lastError.message}`);
  }

  if (html) {
    const $ = cheerio.load(html);
    const rawJson = $("#__NEXT_DATA__").first().text();

    if (rawJson) {
      pageData = JSON.parse(rawJson);
    }
  }

  if (!pageData) {
    const fallbackUrls = [
      "https://www.signatureglobal.in/_next/data/1MPKgSgQ9QFViTWLX484R/index.json"
    ];

    for (const fallbackUrl of fallbackUrls) {
      try {
        const response = await fetchWithTimeout(fallbackUrl, {
          signal: options.signal,
          headers: {
            "User-Agent": userAgent,
            Accept: "application/json,*/*"
          }
        }, 30000);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        pageData = await response.json();
        break;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (!pageData) {
    if (lastError) {
      throw lastError;
    }

    return [];
  }

  const pageProps = pageData?.props?.pageProps || pageData?.pageProps;
  const mediaBlogs = pageProps?.newsData?.[0]?.media_blog;
  const articles = (Array.isArray(mediaBlogs) ? mediaBlogs : []).map((item) =>
    buildOfficialDeveloperMediaArticle({
      sourceUrl,
      title: item.title,
      description: stripHtml(item.title),
      articleText: stripHtml(item.title),
      newsLink: item.source_link,
      thumbnailImage: item.desktop_image?.url || item.mobile_image?.url,
      publishedAt: item.date,
      postedBy: "Signature Global Media"
    })
  );

  return uniqueOfficialMediaArticles(articles);
}

async function fetchCentralParkMedia(sourceUrl, options = {}) {
  const response = await fetchWithTimeout("https://www.centralpark.in/pressreleases.php", {
    signal: options.signal,
    method: "POST",
    headers: {
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html,*/*"
    },
    body: new URLSearchParams({ pag: "1", page: "1" }).toString()
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const articles = $(".board-thumb").map((_, element) => {
    const card = $(element);
    const lines = card.find("p").first().text().split(/\r?\n/)
      .map((line) => stripHtml(line))
      .filter(Boolean);
    const [firstLine = "", ...descriptionLines] = lines;
    const description = descriptionLines.join(" ") || firstLine;
    const awardSummary = description.split(/,\s+including\b/i)[0];
    const title = firstLine && descriptionLines.length > 0 && /awards?/i.test(firstLine)
      ? `${awardSummary} at ${firstLine}`
      : firstLine;

    return buildOfficialDeveloperMediaArticle({
      sourceUrl,
      title,
      description,
      articleText: lines.join(" "),
      newsLink: card.find("a[href]").first().attr("href"),
      thumbnailImage: card.find("img[src]").first().attr("src"),
      publishedAt: card.find("h5").first().text(),
      postedBy: "Central Park Media"
    });
  }).get();

  return uniqueOfficialMediaArticles(articles);
}

async function fetchOfficialDeveloperMedia(sourceUrl, options = {}) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");

  if (host === "dlf.in") {
    return fetchDlfMedia(sourceUrl, options);
  }

  if (host === "m3mindia.com") {
    return fetchM3mMedia(sourceUrl, options);
  }

  if (host === "smartworlddevelopers.com") {
    return fetchSmartworldMedia(sourceUrl, options);
  }

  if (host === "signatureglobal.in") {
    return fetchSignatureGlobalMedia(sourceUrl, options);
  }

  if (host === "centralpark.in") {
    return fetchCentralParkMedia(sourceUrl, options);
  }

  return [];
}

async function fetchPage(sourceUrl, options = {}) {
  const pageUrls = getSourcePageUrls(sourceUrl);
  const seenLinks = new Set();
  const candidates = [];
  let publisher = "";
  let publisherLogo = "";

  for (const [pageIndex, pageUrl] of pageUrls.entries()) {
    let html = "";

    try {
      html = await fetchHtml(pageUrl, options);
    } catch (error) {
      if (pageIndex > 0) {
        if (isMissingPaginatedPageError(error)) {
          console.log(`Reached end of paginated source ${sourceUrl} at ${pageUrl}.`);
          break;
        }

        console.log(`Skipped paginated source page ${pageUrl}: ${error.message}`);
        continue;
      }

      throw error;
    }

    const $ = cheerio.load(html);

    publisher ||= getPublisherName(sourceUrl, $("title").text());
    publisherLogo ||= pickFirst(
      absoluteUrl($('link[rel="icon"]').attr("href"), sourceUrl),
      absoluteUrl($('link[rel="shortcut icon"]').attr("href"), sourceUrl),
      getFallbackLogo(sourceUrl)
    );

    $("a[href]").each((_, element) => {
      const link = absoluteUrl($(element).attr("href"), sourceUrl);
      const title = stripHtml($(element).text());
      const listingText = stripHtml(
        $(element)
          .closest("article, li, div")
          .text()
      );
      const listingPublishedAt = extractPublishedAtFromText(`${title} ${listingText}`);

      if (!link || seenLinks.has(link) || title.length < 18 || isBlockedArticle({ title, newsLink: link })) {
        return;
      }

      const linkHost = new URL(link).hostname.replace(/^www\./, "");
      const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");

      if (linkHost !== sourceHost) {
        return;
      }

      seenLinks.add(link);
      const candidateThumbnail = getImageCandidate($, $(element).find("img").first());
      candidates.push({
        title,
        description: title,
        articleText: "",
        cityCode: "",
        isActive: true,
        newsLink: link,
        thumbnailImage: isRejectedImageCandidate(candidateThumbnail) ? "" : absoluteUrl(candidateThumbnail, sourceUrl),
        postedBy: publisher,
        postedByLogo: publisherLogo,
        publishedAt: listingPublishedAt || null,
        fetchedAt: new Date().toISOString()
      });
    });
  }

  const limitedCandidates = candidates.slice(0, getMaxItemsPerSource());
  const articles = await mapWithConcurrency(limitedCandidates, 8, async (candidate) => {
    const metadata = await fetchArticleMetadata(candidate.newsLink, candidate, options);
    const article = {
      ...candidate,
      ...metadata,
      description: stripHtml(metadata.description || candidate.description),
      articleText: stripHtml(metadata.articleText || candidate.articleText || ""),
      thumbnailImage: absoluteUrl(metadata.thumbnailImage || candidate.thumbnailImage, candidate.newsLink),
      createdAt: metadata.publishedAt || candidate.publishedAt || ""
    };

    const cityArticle = applyCityCode(cleanArticleFields(article));

    return {
      ...cityArticle,
      id: stableId(cityArticle)
    };
  });

  return articles;
}

async function fetchSourceWithTimeout(sourceUrl) {
  const controller = new AbortController();
  const timeoutMs = getSourceTimeoutMs();
  let timeout;

  const sourcePromise = fetchSource(sourceUrl, { signal: controller.signal });
  sourcePromise.catch(() => {});

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`source timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([sourcePromise, timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted && !/timed out/i.test(error.message || "")) {
      throw new Error(`source timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSource(sourceUrl, options = {}) {
  if (isHsvpSource(sourceUrl)) {
    return fetchHsvpNotices(sourceUrl, options);
  }

  if (isBptpMediaSource(sourceUrl)) {
    return fetchBptpMedia(sourceUrl, options);
  }

  if (isOfficialDeveloperMediaSource(sourceUrl)) {
    return fetchOfficialDeveloperMedia(sourceUrl, options);
  }

  if (!isLikelyFeedUrl(sourceUrl)) {
    return fetchPage(sourceUrl, options);
  }

  try {
    return await fetchFeed(sourceUrl, options);
  } catch (error) {
    const fallbackPageUrl = getFeedFallbackPageUrl(sourceUrl);
    if (fallbackPageUrl) {
      console.log(`Feed parse failed for ${sourceUrl}; trying cleaned page ${fallbackPageUrl}. ${error.message}`);
      return fetchPage(fallbackPageUrl, options);
    }

    console.log(`Feed parse failed for ${sourceUrl}; trying page scrape. ${error.message}`);
    return fetchPage(sourceUrl, options);
  }
}

function uniqueByDedupeIds(articles) {
  const seenIds = new Set();

  return articles.filter((article) => {
    const dedupeIds = articleDedupeIds(article);

    if (dedupeIds.length === 0 || dedupeIds.some((id) => seenIds.has(id))) {
      return false;
    }

    for (const id of dedupeIds) {
      seenIds.add(id);
    }

    return true;
  });
}

function shouldDryRun() {
  return getBooleanEnv("DRY_RUN") || adminSettings.apiPushEnabled !== true;
}

async function fetchSourceWithRetry(sourceUrl) {
  const maxAttempts = getSourceRetryAttempts();
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return { articles: await fetchSourceWithTimeout(sourceUrl), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableSourceError(error)) {
        throw Object.assign(error, { sourceAttempts: attempt });
      }

      const delayMs = Math.min(attempt * 1500, 4000);
      console.warn(`Retrying source ${sourceUrl} after attempt ${attempt}/${maxAttempts}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw Object.assign(lastError || new Error("source fetch failed"), { sourceAttempts: maxAttempts });
}

async function pushArticle(article) {
  const apiUrl = env("APP_API_URL");
  const apiKey = env("APP_API_KEY");

  if (!apiUrl) {
    throw new Error("APP_API_URL is required.");
  }

  const headers = {
    "Content-Type": "application/json"
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  const payload = toApiPayload(article);
  const response = await fetchWithTimeout(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  }, 15000);

  const body = await response.text();

  if (!response.ok) {
    throw new Error(`API rejected "${article.title}" with ${response.status}: ${body}`);
  }

  return {
    status: response.status,
    body: body.slice(0, 500)
  };
}

async function main() {
  await loadDotEnv();

  const allSelectedSources = getSourceUrls().filter(isAllowedSource);
  const selectedSources = applySourceBatch(allSelectedSources);
  const extraArticleUrls = [...new Set(getExtraArticleUrls())].filter(isAllowedExtraArticleUrl);
  const maxItems = getMaxItemsPerRun();
  const backfillDateRange = getBackfillDateRange();
  const sentIds = await readSentIds();
  const resendBackfill = getBooleanEnv("RESEND_BACKFILL") && hasBackfillDateRange(backfillDateRange);
  const filterSentIds = resendBackfill ? new Set() : sentIds;
  const skipTitleSet = getSkipTitleSet();
  const targetCityCodeFilter = getTargetCityCodeFilter();
  const buildVersion = getBuildVersion();
  const commitSha = getCommitSha();
  const sourceStrategy = getSourceStrategyName();
  const allArticles = [];
  const fetchedSources = [];
  const failedSources = [];
  const postedArticles = [];
  const dryRunCandidates = [];

  if (isNoidaCityEnabled() && !getBooleanEnv("DRY_RUN") && !getBooleanEnv("ALLOW_NOIDA_API")) {
    throw new Error("Noida city mode is local-only for now. Set DRY_RUN=true, or set ALLOW_NOIDA_API=true after the API supports cityCode=noida.");
  }

  if (isNoidaCityEnabled()) {
    console.log("Noida city mode enabled: using Uttar Pradesh - Noida filters and opt-in sources.");
  }

  console.log(`Build version: ${buildVersion}${commitSha ? ` (${commitSha.slice(0, 7)})` : ""}.`);
  console.log(
    `Source strategy: ${sourceStrategy}. Processing ${selectedSources.length}/${allSelectedSources.length} allowed sources.`
  );

  if (selectedSources.length !== allSelectedSources.length) {
    console.log(`Source batch: processing ${selectedSources.length} of ${allSelectedSources.length} allowed sources.`);
  }

  if (backfillDateRange.from || backfillDateRange.to) {
    console.log(
      `Backfill date window: ${backfillDateRange.from?.toISOString() || "beginning"} to ${
        backfillDateRange.to?.toISOString() || "now"
      }`
    );
  }

  if (resendBackfill) {
    console.log("Backfill resend mode: ignoring sent-news dedupe while selecting articles.");
  }

  if (skipTitleSet.size > 0) {
    console.log(`Manual skip-title list: ${skipTitleSet.size} titles.`);
  }

  if (extraArticleUrls.length > 0) {
    console.log(`Extra direct article URLs: ${extraArticleUrls.length}.`);
  }

  if (targetCityCodeFilter.size > 0) {
    console.log(`Target city filter: ${[...targetCityCodeFilter].join(", ")}.`);
  }

  const fetchStartedAt = Date.now();
  console.log(`Fetching ${selectedSources.length} sources with ${getSourceConcurrency()} parallel source workers and ${formatDuration(getSourceTimeoutMs())} max per source.`);
  const sourceResults = await mapWithConcurrency(selectedSources, getSourceConcurrency(), async (source) => {
    try {
      const startedAt = Date.now();
      const result = await fetchSourceWithRetry(source);
      console.log(`Fetched ${result.articles.length} items from ${source} in ${formatDuration(Date.now() - startedAt)} (attempts: ${result.attempts})`);
      return { source, articles: result.articles, attempts: result.attempts };
    } catch (error) {
      console.error(`Failed to fetch ${source}: ${error.message}`);
      return { source, error: error.message, attempts: error.sourceAttempts || getSourceRetryAttempts() };
    }
  });

  const sourceHealth = sourceResults.map((result) => ({
    source: result.source,
    status: result.error ? "failed" : "ok",
    count: result.error ? 0 : result.articles.length,
    attempts: result.attempts || 1,
    error: result.error || ""
  }));

  for (const result of sourceResults) {
    if (result.error) {
      failedSources.push({ source: result.source, error: result.error, attempts: result.attempts || 1 });
      continue;
    }
    allArticles.push(...result.articles);
    fetchedSources.push({ source: result.source, count: result.articles.length, attempts: result.attempts || 1 });
  }
  console.log(`Source fetch phase completed in ${formatDuration(Date.now() - fetchStartedAt)}.`);
  for (const articleUrl of extraArticleUrls) {
    try {
      const article = await fetchDirectArticle(articleUrl);
      allArticles.push(article);
      fetchedSources.push({ source: articleUrl, count: 1, direct: true });
      console.log(`Fetched direct article: ${article.title || articleUrl}`);
    } catch (error) {
      failedSources.push({ source: articleUrl, error: error.message, direct: true });
      console.error(`Failed to fetch direct article ${articleUrl}: ${error.message}`);
    }
  }

  const filterStartedAt = Date.now();
  const expandedAllArticles = allArticles
    .flatMap(expandCityArticles)
    .filter((article) => targetCityCodeFilter.size === 0 || targetCityCodeFilter.has(article.cityCode));
  console.log(`Expanded ${allArticles.length} fetched articles to ${expandedAllArticles.length} city articles in ${formatDuration(Date.now() - filterStartedAt)}.`);
  logDateExcludedPublishableArticles(expandedAllArticles, backfillDateRange, filterSentIds, skipTitleSet);

  const expandedArticles = expandedAllArticles.filter((article) =>
    isWithinBackfillDateRange(article, backfillDateRange)
  );
  console.log(`Date window kept ${expandedArticles.length} articles in ${formatDuration(Date.now() - filterStartedAt)}.`);

  const rejectionReasonCache = new Map();
  const getCachedRejectionReasons = (article) => {
    const key = articleReportKey(article);
    if (!rejectionReasonCache.has(key)) {
      rejectionReasonCache.set(
        key,
        getBooleanEnv("DETAILED_REJECTION_REASONS", false)
          ? shouldSkipTitle(article, skipTitleSet)
            ? ["manual skip: title already reposted"]
            : getRejectionReasons(article, filterSentIds)
          : getFastRejectionReasons(article, filterSentIds, skipTitleSet)
      );
    }
    return rejectionReasonCache.get(key);
  };

  const uniqueArticles = uniqueByDedupeIds(
    expandedArticles
    .filter((article) => getCachedRejectionReasons(article).length === 0)
    .sort((a, b) => {
      const priorityDifference = articlePriority(a) - articlePriority(b);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    })
  ).slice(0, maxItems);
  const articlesToPush = [...uniqueArticles].sort((a, b) => {
    const priorityDifference = articlePriority(b) - articlePriority(a);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
  });
  const rejectionCounts = new Map();

  for (const article of expandedArticles) {
    const reasons = getCachedRejectionReasons(article);

    for (const reason of reasons) {
      rejectionCounts.set(reason, (rejectionCounts.get(reason) || 0) + 1);
    }
  }

  const runAnalytics = buildRunAnalytics(expandedArticles, articlesToPush, postedArticles, skipTitleSet, filterSentIds, getCachedRejectionReasons);

  console.log(`Filtering phase completed in ${formatDuration(Date.now() - filterStartedAt)}.`);
  console.log(`Found ${uniqueArticles.length} new articles.`);
  for (const [reason, count] of [...rejectionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`Skipped ${count} articles by ${reason}.`);
  }
  const missedNewsCandidates = getBooleanEnv("MISSED_NEWS_AUDIT", false)
    ? collectMissedNewsAudit(expandedArticles, filterSentIds, skipTitleSet)
    : [];
  logMissedNewsAudit(missedNewsCandidates);

  if (getBooleanEnv("DETAILED_SKIP_LOG", false)) {
    for (const article of expandedArticles.slice(0, 100)) {
      const reasons = getCachedRejectionReasons(article);

      if (reasons.length > 0 && article.title) {
        console.log(`Skipped ${article.title}: ${reasons.join("; ")}`);
      }
    }
  }

  console.log(
    `Push order: ${articlesToPush.filter((article) => article.sharedCityArticle).length} shared-city articles first, then ${
      articlesToPush.filter((article) => !article.sharedCityArticle).length
    } city-specific articles.`
  );

  for (const article of articlesToPush) {
    if (shouldDryRun()) {
      console.log(
        `Dry run candidate (${article.cityCode}): ${article.title} | ${article.newsLink}`
      );
      dryRunCandidates.push(reportArticle(article));
      continue;
    }

    const result = await pushArticle(article);
    for (const id of articleDedupeIds(article)) {
      sentIds.add(id);
    }
    await writeSentIds(sentIds);
    postedArticles.push(reportArticle(article));
    console.log(
      `Pushed (${result.status}, ${article.cityCode}): ${article.title} | API response: ${
        result.body || "<empty>"
      }`
    );
  }

  await writeSentIds(sentIds);
  await writeRunReport({
    generatedAt: new Date().toISOString(),
    mode: shouldDryRun() ? "dry-run" : "live",
    dryRun: shouldDryRun(),
    noidaEnabled: isNoidaCityEnabled(),
    targetCityCodes: [...targetCityCodeFilter],
    window: {
      from: backfillDateRange.from?.toISOString() || "",
      to: backfillDateRange.to?.toISOString() || ""
    },
    buildVersion,
    commitSha,
    sourceStrategy,
    allSelectedSourceCount: allSelectedSources.length,
    selectedSourceCount: selectedSources.length,
    sourceHealth,
    sourceHealthSummary: {
      ok: sourceHealth.filter((source) => source.status === "ok").length,
      failed: sourceHealth.filter((source) => source.status === "failed").length,
      zeroItem: sourceHealth.filter((source) => source.status === "ok" && source.count === 0).length
    },
    sourceCount: selectedSources.length,
    sources: fetchedSources,
    failures: failedSources,
    fetchedArticleCount: allArticles.length,
    expandedArticleCount: expandedArticles.length,
    skippedByReason: mapToObject(rejectionCounts),
    rejectedArticleCount: runAnalytics.rejectedArticleCount,
    needsReviewCount: runAnalytics.needsReviewCount,
    rejectedArticles: runAnalytics.rejectedArticles,
    needsReviewArticles: runAnalytics.needsReviewArticles,
    cityBreakdown: runAnalytics.cityBreakdown,
    candidates: articlesToPush.map(reportArticle),
    posted: postedArticles,
    dryRunCandidates,
    missedCandidates: missedNewsCandidates.slice(0, 50).map(({ article, reasons }) => ({
      article: reportArticle(article),
      reasons
    }))
  });
}

export {
  applyCityCode,
  classifyArticle,
  cleanArticleFields,
  detectCityCodes,
  expandCityArticles,
  extractMetadataImage,
  fetchSource,
  getSourcePageUrls,
  getSourceUrls,
  getRejectionReasons,
  localQualityJudge,
  needsLocalQualityReview,
  getExtraArticleUrls,
  hasDisallowedLanguage,
  hasBackfillDateRange,
  isLikelyFeedUrl,
  getFeedFallbackPageUrl,
  shouldSkipTitle,
  articleDedupeIds,
  isAllowedSource,
  isNegativeNews,
  isPublishableArticle,
  isWithinBackfillDateRange
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}



