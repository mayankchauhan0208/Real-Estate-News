import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": userAgent
  }
});

const stateDir = path.resolve(".state");
const sentNewsPath = path.join(stateDir, "sent-news.json");

const defaultSources = [
  "https://www.hindustantimes.com/real-estate",
  "https://www.hindustantimes.com/topic/faridabad/news",
  "https://economictimes.indiatimes.com/industry/services/property-/-cstruction",
  "https://economictimes.indiatimes.com/news/company/corporate-trends",
  "https://www.cnbctv18.com/real-estate/",
  "https://timesofindia.indiatimes.com/real-estate/news",
  "https://realty.economictimes.indiatimes.com/tag/gurugram",
  "https://realty.economictimes.indiatimes.com/tag/faridabad",
  "https://realty.economictimes.indiatimes.com/news/residential",
  "https://realty.economictimes.indiatimes.com/news/commercial",
  "https://realty.economictimes.indiatimes.com/news/infrastructure",
  "https://realty.economictimes.indiatimes.com/news/industry",
  "https://www.moneycontrol.com/news/business/real-estate/",
  "https://www.constructionworld.in/latest-construction-news/real-estate-news",
  "https://www.outlookmoney.com/topic/real-estate",
  "https://www.tribuneindia.com/topic/real-estate",
  "https://torbitrealty.com/category/news/city-updates/gurugram/",
  "https://realtynmore.com/latest-news/",
  "https://realtynxt.com/",
  "https://www.track2realty.track2media.com/",
  "https://propnewstime.com/",
  "https://hsvphry.org.in/",
  "https://www.bptp.com/media",
  "https://www.dlf.in/media",
  "https://m3mindia.com/media",
  "https://smartworlddevelopers.com/media",
  "https://www.signatureglobal.in/",
  "https://www.centralpark.in/media.php"
];

const noidaCityEnabledAtStartup = ["1", "true", "yes", "on"].includes(
  (process.env.ENABLE_NOIDA_CITY || "").trim().toLowerCase()
);
const noidaSources = [
  "https://realty.economictimes.indiatimes.com/tag/noida",
  "https://timesofindia.indiatimes.com/city/noida"
];

function isNoidaCityEnabled() {
  return noidaCityEnabledAtStartup;
}

const cityRules = [
  {
    code: "faridabad",
    keywords: ["faridabad", "greater faridabad", "neharpar", "skynest", "skynest towers"]
  },
  {
    code: "gurugram",
    keywords: [
      "gurugram",
      "gurgaon",
      "dwarka expressway",
      "downtown 66",
      "golf course road",
      "golf course extension road",
      "manesar",
      "manasar",
      "pataudi",
      "patudi",
      "patodi",
      "southern peripheral road",
      "spr",
      "sohna",
      "sohna road"
    ]
  },
  ...(isNoidaCityEnabled()
    ? [{
      code: "noida",
      keywords: [
        "noida",
        "greater noida",
        "greater noida west",
        "noida extension",
        "new noida",
        "jewar",
        "jewar airport",
        "noida airport",
        "noida international airport",
        "yamuna expressway",
        "yeida"
      ]
    }]
    : [])
];
const gurugramCorridorKeywords = [
  "dwarka expressway",
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
  "boom",
  "connectivity",
  "development",
  "growth",
  "infrastructure upgrades",
  "investor",
  "poised for rapid transformation",
  "real estate market",
  "transformation"
];
const positiveCityMarketKeywords = [
  "demand remains resilient",
  "drives ncr housing market",
  "emerges as a strong real estate destination",
  "growth market",
  "housing demand",
  "housing market",
  "homebuyers are looking beyond",
  "infrastructure inflection",
  "investment destination",
  "largest market",
  "office market",
  "office stock",
  "market remains resilient",
  "property market",
  "real estate destination",
  "real estate growth",
  "real estate hierarchy",
  "real estate market",
  "premium housing market",
  "redefining ncr",
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
const targetCityKeywords = [...cityRules.flatMap((rule) => rule.keywords), ...ncrKeywords];
const reraKeywords = ["rera", "hrera", "h-rera", "real estate regulatory authority"];
const courtKeywords = [
  "court",
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
  "builder",
  "carpet area",
  "commercial property",
  "commercial real estate",
  "connectivity",
  "corridor",
  "developer",
  "development",
  "development authority",
  "dlf",
  "dwelling",
  "expressway",
  "flat",
  "floor",
  "growth corridor",
  "highway",
  "homebuyer",
  "homebuyers",
  "housing",
  "infra",
  "infrastructure",
  "investment",
  "inaugurated",
  "land parcel",
  "launch",
  "launched",
  "launches",
  "lease",
  "luxury housing",
  "luxury homes",
  "master plan",
  "metro",
  "new project",
  "new project launch",
  "office space",
  "price appreciation",
  "plot",
  "possession",
  "project",
  "property",
  "rapid rail",
  "real estate",
  "realty",
  "redevelopment",
  "registry",
  "residential",
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
  "approved",
  "allotment",
  "allotments",
  "bookings",
  "customer confidence",
  "commercial property",
  "commercial real estate",
  "completion",
  "connectivity",
  "corridor",
  "delivered",
  "delivery",
  "develop",
  "developed",
  "developer",
  "development",
  "expansion",
  "expressway",
  "earnings",
  "growth",
  "growth corridor",
  "highway",
  "housing",
  "infra",
  "infrastructure",
  "inaugurated",
  "investment",
  "launch",
  "launched",
  "launches",
  "luxury housing",
  "luxury homes",
  "luxury living",
  "metro",
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
  "rapid rail",
  "real estate",
  "realty",
  "redevelopment",
  "regional rapid transit",
  "residential",
  "results",
  "revenue",
  "rrts",
  "sales",
  "township"
];
const realEstateCompanyKeywords = [
  "dlf",
  "dlf homes",
  "dlf ltd",
  "bptp",
  "bptp ltd",
  "godrej properties",
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
  "hsvp",
  "huda",
  "mixed land use",
  "mixed-use policy",
  "new commercial sites",
  "sector demarcation",
  "social infrastructure",
  "tod",
  "transit-oriented development"
];
const connectivityCatalystKeywords = [
  "connectivity catalyst",
  "expressway",
  "interchange",
  "jewar connectivity",
  "metro corridor",
  "metro extension",
  "metro line",
  "spr",
  "southern peripheral road",
  "golf course extension road",
  "golf course road",
  "dwarka expressway",
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
  "branded residences",
  "commercial project",
  "commercial sites",
  "develop land",
  "developed a residential",
  "developing a residential",
  "development project",
  "development of the year",
  "dwarka expressway",
  "golf course extension road",
  "golf course road",
  "gurugram project",
  "group housing project",
  "hand over",
  "hands over",
  "housing project",
  "investment board",
  "investment board nod",
  "landmark high-rise development",
  "first gurugram project",
  "first faridabad project",
  "bookings worth",
  "land acquisition",
  "land parcel",
  "luxury project",
  "new benchmark",
  "hospitality living",
  "metro extension",
  "metro line",
  "mixed-use development",
  "new commercial sites",
  "new noida",
  "new project",
  "faridabad project",
  "new real estate projects",
  "noida project",
  "noida projects",
  "plotted township",
  "premium housing market",
  "property hotspot",
  "pumped into new real estate projects",
  "steel span",
  "possession",
  "project launch",
  "rapid rail",
  "real estate projects",
  "regional rapid transit",
  "rrts",
  "projects worth",
  "residential development",
  "residential project",
  "retail project",
  "records",
  "records sales",
  "sector demarcation",
  "social infrastructure",
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
  "latest news",
  "real estate news",
  "terms of use"
];
const blockedUrlParts = [
  "/about",
  "/advertise",
  "amarujala.com",
  "/awards",
  "/campaign",
  "/career",
  "/conference",
  "/contact",
  "/education",
  "/event",
  "/gallery",
  "/login",
  "/newsletter",
  "/photo",
  "/photos",
  "/privacy",
  "/register",
  "/subscription",
  "/terms",
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
  "assault",
  "attack",
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
  "collapse",
  "complaint",
  "complaints",
  "crime",
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
  "fine",
  "fined",
  "fish deaths",
  "fraud",
  "frauds",
  "grievance",
  "grievances",
  "grap",
  "genset",
  "generator",
  "hospital",
  "illegal",
  "imd",
  "injured",
  "jail",
  "killed",
  "lawsuit",
  "legal",
  "litigation",
  "murder",
  "notice",
  "notices",
  "penalty",
  "police",
  "pollution",
  "powercut",
  "protest",
  "protests",
  "rain",
  "rainfall",
  "rape",
  "raid",
  "raided",
  "revoked",
  "scam",
  "sc-appointed",
  "sealed",
  "seized",
  "shooting",
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
  "unable",
  "unpaid",
  "violation",
  "violations",
  "violence",
  "weather",
  "yellow alert",
  "worries",
  "worry"
];
const negativePhraseKeywords = [
  "accused of",
  "bear the brunt",
  "broken roads",
  "builder arrested",
  "builder suicide",
  "market crash",
  "buyers stranded",
  "caqm pollution",
  "cheated homebuyers",
  "circle rates surge",
  "construction ban",
  "construction halted",
  "construction stopped",
  "diesel bulk buying",
  "died by suicide",
  "dies by suicide",
  "director arrested",
  "eow complaint",
  "fraud case",
  "homebuyer complaint",
  "homebuyers bear the brunt",
  "homebuyers stranded",
  "homebuyer suicide",
  "housing project halted",
  "housing project suspended",
  "imd data",
  "left in lurch",
  "licence lapses",
  "license lapses",
  "missing links",
  "murdered over property",
  "not new claims",
  "payment default",
  "power backup",
  "power backup worries",
  "power outage",
  "power supply issue",
  "pre-sales decline",
  "pre-sales drop",
  "presales decline",
  "presales drop",
  "policy remains constrained",
  "property sales barred",
  "property tax",
  "property dispute murder",
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
  "sales drop",
  "strike hits",
  "suicide due to property",
  "suicide over property",
  "traffic jam",
  "seven km detour",
  "water pipeline",
  "yellow alert"
];
const severeBodyNegativeKeywords = [
  "accident",
  "arrest",
  "arrested",
  "assault",
  "attack",
  "body found",
  "cheated",
  "cheating",
  "collapse",
  "crime",
  "criminal",
  "death",
  "dead",
  "dies",
  "died",
  "fir",
  "fire",
  "fraud",
  "injured",
  "jail",
  "killed",
  "murder",
  "police",
  "rape",
  "scam",
  "shooting",
  "suicide",
  "violence"
];
const severeBodyNegativePhrases = [
  "builder arrested",
  "builder suicide",
  "died by suicide",
  "dies by suicide",
  "director arrested",
  "fraud case",
  "homebuyer suicide",
  "murdered over property",
  "property dispute murder",
  "real estate agent killed",
  "real estate broker killed",
  "short circuit",
  "suicide due to property",
  "suicide over property",
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
  "thehindu.com/news/cities/delhi",
  "amarujala.com"
];

const activeDefaultSources = isNoidaCityEnabled() ? [...defaultSources, ...noidaSources] : defaultSources;
const allowedSourceUrlParts = activeDefaultSources.map((source) => {
  const url = new URL(source);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
});
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

function getSources() {
  return [];
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
    return [...new Set(sourceUrls)];
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
  const normalized = source.toLowerCase();

  if (!source || blockedSourceUrlParts.some((part) => normalized.includes(part))) {
    return false;
  }

  let key = "";

  try {
    const url = new URL(source);
    key = `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return false;
  }

  return allowedSourceUrlParts.includes(key);
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
      /(^|\/)(rss|feed|feeds|atom)(\/|$)/i.test(pathName) ||
      /[?&](output|format)=(rss|xml|atom)\b/i.test(query)
    );
  } catch {
    return false;
  }
}

function getPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
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
  if (!hasBackfillDateRange(dateRange)) {
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

function logMissedNewsAudit(articles, filterSentIds, skipTitleSet, limit = 20) {
  if (!getBooleanEnv("MISSED_NEWS_AUDIT", true)) {
    return;
  }

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

    if (url.hostname === "www.hindustantimes.com" && normalizedPath === "/real-estate") {
      return Array.from({ length: maxPages }, (_, index) => {
        if (index === 0) {
          return sourceUrl;
        }

        const pageUrl = new URL(sourceUrl);
        pageUrl.pathname = `${normalizedPath}/page-${index + 1}`;
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

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
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

function titleOnlyId(article) {
  const title = normalizeTitle(article.title);

  return title ? crypto.createHash("sha256").update(title).digest("hex") : "";
}

function articleDedupeIds(article) {
  const sharedCityIds = article.sharedCityArticle ? [titleCityId(article)] : [canonicalUrlId(article), titleOnlyId(article)];

  return [article.id, ...sharedCityIds].filter(Boolean);
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

  return `${text.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}.`;
}

function cleanTitle(value = "") {
  return cleanText(value, 180)
    .replace(/\s+[|-]\s+(latest news|news|real estate news)$/i, "")
    .replace(/^(watch|photos?|video):\s*/i, "")
    .replace(new RegExp(`\\s*(?:${monthPattern})\\.?\\s+\\d{1,2},?\\s+\\d{4}.*$`, "i"), "")
    .replace(new RegExp(`\\s*\\d{1,2}\\s+(?:${monthPattern})\\.?\\s+\\d{4}.*$`, "i"), "")
    .trim();
}

function cleanArticleFields(article) {
  const title = cleanTitle(article.title);
  const description = cleanText(article.description, 700) || title;

  return {
    ...article,
    title,
    description,
    articleText: cleanText(article.articleText, 5000),
    newsLink: cleanText(article.newsLink, 1000),
    thumbnailImage: cleanText(article.thumbnailImage, 1000),
    postedBy: cleanText(article.postedBy, 120),
    postedByLogo: cleanText(article.postedByLogo, 1000)
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
    "hindustantimes.com": "Hindustan Times",
    "moneycontrol.com": "Moneycontrol",
    "outlookmoney.com": "Outlook Money",
    "propnewstime.com": "Prop News Time",
    "realtynmore.com": "RealtyNMore",
    "torbitrealty.com": "Torbit Realty",
    "tribuneindia.com": "The Tribune"
  };

  return names[host] || stripHtml(pageTitle).split("|")[0].trim() || host;
}

function getFallbackLogo(sourceUrl) {
  const host = new URL(sourceUrl).hostname;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
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
  const primaryText = getArticlePrimaryText(article);
  const cityCodes = cityRules
    .filter((rule) => hasWholeWordKeyword(primaryText, rule.keywords) || hasStrongArticleCityMatch(article, rule))
    .map((rule) => rule.code);

  return [...new Set(cityCodes)];
}

function getCorporateCompanyCityCodes(article, company = getTargetRealEstateCorporateCompany(article)) {
  if (!company) {
    return [];
  }

  const explicitCityCodes = detectExplicitTargetCityCodes(article);

  if (explicitCityCodes.length > 0) {
    return explicitCityCodes;
  }

  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;

  if (
    company.code &&
    hasWholeWordKeyword(primaryAndUrl, getDisqualifyingOutsideCityKeywords({ ...article, cityCode: company.code }))
  ) {
    return [];
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
    return ncrCityCodes;
  }

  if (!company.code && /\bdelhi[\s-]?ncr\b/i.test(primaryAndUrl)) {
    return ncrCityCodes;
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

function isPositiveTargetBusinessOrDevelopmentArticle(article) {
  return (
    isTargetRealEstateCorporateUpdate(article) ||
    isLeadershipBusinessConfidenceArticle(article) ||
    isLuxuryTransactionArticle(article) ||
    isAuthorityPipelineArticle(article) ||
    isConnectivityCatalystArticle(article) ||
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

  if (isPositiveCityMarketArticle(article)) {
    return "positive_city_market";
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
    isPositiveTargetBusinessOrDevelopmentArticle(article)
  ) {
    return true;
  }

  const primaryAndUrl = `${getArticlePrimaryText(article)} ${getArticleUrlText(article)}`;
  return hasKeyword(primaryAndUrl, specificProjectKeywords);
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
  if (!isRealEstateRelated(article)) {
    return [];
  }

  return detectMatchedCityCodes(article);
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
    return ncrCityCodes;
  }

  const matchedCityCodes = detectExplicitTargetCityCodes(article);

  if (matchedCityCodes.length > 0) {
    return matchedCityCodes;
  }

  if (hasNcrMatch(article)) {
    return ncrCityCodes;
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

function hasTargetRegionEvidence(article) {
  return (
    hasNcrMatch(article) ||
    isNcrCommercialOfficeMarketArticle(article) ||
    isFaridabadJewarGrowthArticle(article) ||
    isTargetProjectAwardArticle(article) ||
    isPositiveTargetBusinessOrDevelopmentArticle(article) ||
    hasTargetRegionInTitleOrUrl(article)
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
    hasWholeWordKeyword(primaryAndUrl, ["faridabad"]) &&
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
      "approves",
      "approval",
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
      "joint development",
      "launches",
      "property hotspot",
      "records",
      "records sales",
      "reports bookings",
      "residential project",
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
  const hasGurugram = hasWholeWordKeyword(primaryAndUrl, cityRules.find((rule) => rule.code === "gurugram").keywords);
  const hasFaridabad = hasWholeWordKeyword(primaryAndUrl, cityRules.find((rule) => rule.code === "faridabad").keywords);
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

function applyCityCode(article) {
  const [detectedCityCode] = detectCityCodes(article);

  return {
    ...article,
    cityCode: detectedCityCode || ""
  };
}

function expandCityArticles(article) {
  const cityCodes = detectCityCodes(article);

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
  return {
    title: article.title,
    description: article.description,
    cityCode: article.cityCode,
    isActive: article.isActive,
    newsLink: article.newsLink,
    thumbnailImage: article.thumbnailImage,
    postedBy: article.postedBy,
    createdAt: getCreatedAt(article),
    postedByLogo: article.postedByLogo
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

  return /[\u0900-\u097F]/u.test(text) || /\bnews in hindi\b/i.test(text) || /amarujala\.com/i.test(text);
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

function isBlockedArticle(article) {
  const title = article.title || "";
  const description = article.description || "";
  const newsLink = article.newsLink || "";
  const normalizedTitle = title.trim().toLowerCase();
  const primaryText = `${title} ${description}`;
  const allowProjectAwardArticle = isTargetProjectAwardArticle(article);

  return (
    blockedExactTitles.includes(normalizedTitle) ||
    /[\u0900-\u097F]/.test(primaryText) ||
    (!allowProjectAwardArticle && hasKeyword(primaryText, blockedTitleKeywords)) ||
    (!allowProjectAwardArticle && hasKeyword(newsLink, blockedUrlParts))
  );
}

function isNegativeNews(article) {
  if (
    isFaridabadJewarGrowthArticle(article) ||
    isPositiveTargetProjectUpdate(article) ||
    isOfficialAuthorityPipelineNotice(article)
  ) {
    return false;
  }

  const primaryText = getArticlePrimaryText(article);
  const urlText = getArticleUrlText(article);
  const bodyText = getArticleBodyText(article);

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

function getRejectionReasons(article, sentIds) {
  const reasons = [];

  if (!article.title || !article.newsLink) {
    reasons.push("filter 0: missing title/link");
    return reasons;
  }

  if (isBlockedArticle(article)) {
    reasons.push("filter 1: spam/menu page");
  }

  if (hasDisallowedLanguage(article)) {
    reasons.push("filter 2: non-English/Hindi content");
  }

  if (isNegativeNews(article)) {
    reasons.push("filter 3: negative/crime/utility concern news");
  }

  if (!isRealEstateRelated(article)) {
    reasons.push("filter 4: not positive target real-estate/project news");
  }

  if (isRealEstateRelated(article) && !hasSpecificProjectOrDevelopmentSignal(article)) {
    reasons.push("filter 9: no specific project/development signal");
  }

  if (isBroadNonProjectUpdate(article)) {
    reasons.push("filter 10: broad market/company update, not city project news");
  }

  if (!article.cityCode) {
    reasons.push("filter 5: no allowed city match");
  }

  if (article.cityCode && !hasTargetRegionEvidence(article)) {
    reasons.push("filter 6: target region missing or weak");
  }

  if (hasOutsideRegionInPrimaryText(article)) {
    reasons.push("filter 7: outside region in title/description");
  }

  if (hasOutsideCityConflict(article)) {
    reasons.push("filter 8: outside-city conflict");
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

function isPublishableArticle(article, sentIds) {
  return getRejectionReasons(article, sentIds).length === 0;
}

async function readSentIds() {
  try {
    const content = await fs.readFile(sentNewsPath, "utf8");
    const parsed = JSON.parse(content);
    return new Set(Array.isArray(parsed.sentIds) ? parsed.sentIds : []);
  } catch (error) {
    if (error.code === "ENOENT") {
      return new Set();
    }

    throw error;
  }
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

async function fetchFeed(sourceUrl) {
  const feed = await parser.parseURL(sourceUrl);
  const source = feed.title || new URL(sourceUrl).hostname;
  const publisherLogo = pickFirst(getPublisherLogo(feed), getFallbackLogo(sourceUrl));
  const feedItems = feed.items.slice(0, getMaxItemsPerSource());

  return Promise.all(feedItems.map(async (item) => {
    const newsLink = item.link || item.guid;
    const metadata = newsLink ? await fetchArticleMetadata(newsLink) : {};
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
      createdAt: rawArticle.publishedAt || "",
      publishedAt: rawArticle.publishedAt,
      fetchedAt: rawArticle.fetchedAt
    };

    const cityArticle = applyCityCode(cleanArticleFields(article));

    return {
      ...cityArticle,
      id: stableId(cityArticle)
    };
  }));
}

async function fetchHtml(sourceUrl) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetchWithTimeout(sourceUrl, {
        headers: {
          "User-Agent": userAgent,
          Accept: "text/html,*/*"
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

function isRejectedImageCandidate(value = "") {
  if (!value || /^data:/i.test(value)) {
    return true;
  }

  return /1x1|artshare|blank|placeholder|spacer|logo|icon|avatar|favicon|advertise|banner|copylink|flipcoin|youtube|ytimg|playstore|app store|social|facebook|instagram|whatsapp|linkedin|loader|buffering/i.test(
    value
  );
}

function extractPageImage($) {
  const selectors = [
    "#zoom_class",
    "img[alt*='Story Image' i]",
    "img[class*='zoom' i]",
    "article img",
    "main img",
    "[class*='article'] img",
    "[class*='story'] img",
    "[class*='content'] img",
    "figure img",
    "img"
  ];

  for (const selector of selectors) {
    const images = $(selector).toArray();

    for (const image of images) {
      const candidate = getImageCandidate($, image);

      if (candidate && !isRejectedImageCandidate(candidate)) {
        return candidate;
      }
    }
  }

  return "";
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

async function fetchArticleMetadata(articleUrl, fallback = {}) {
  try {
    const html = await fetchArticleHtml(articleUrl);
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

async function fetchArticleHtml(articleUrl) {
  let lastError;

  for (const variant of getArticleUrlVariants(articleUrl)) {
    try {
      return await fetchHtml(variant);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function fetchBinary(sourceUrl) {
  const response = await fetchWithTimeout(sourceUrl, {
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

async function fetchHsvpNotices(sourceUrl) {
  const html = await fetchHtml(sourceUrl);
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
      const pdfBuffer = await fetchBinary(candidate.noticeUrl);
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

async function fetchBptpMedia(sourceUrl) {
  const html = await fetchHtml(sourceUrl);
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

async function fetchDlfMedia(sourceUrl) {
  const html = await fetchHtml(sourceUrl);
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

async function fetchSmartworldMedia(sourceUrl) {
  const html = await fetchHtml(sourceUrl);
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

async function fetchM3mMedia(sourceUrl) {
  const tabNames = ["news", "press_release", "event"];
  const articles = [];

  for (const tabName of tabNames) {
    for (let page = 1; page <= getMaxPagesPerSource(); page += 1) {
      const apiUrl = `https://m3mindia.com/media-section-tab-data/${tabName}?page=${page}`;
      const response = await fetchWithTimeout(apiUrl, {
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

async function fetchSignatureGlobalMedia(sourceUrl) {
  let html = "";
  let lastError;
  let pageData;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(sourceUrl, {
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

async function fetchCentralParkMedia(sourceUrl) {
  const response = await fetchWithTimeout("https://www.centralpark.in/pressreleases.php", {
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

async function fetchOfficialDeveloperMedia(sourceUrl) {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");

  if (host === "dlf.in") {
    return fetchDlfMedia(sourceUrl);
  }

  if (host === "m3mindia.com") {
    return fetchM3mMedia(sourceUrl);
  }

  if (host === "smartworlddevelopers.com") {
    return fetchSmartworldMedia(sourceUrl);
  }

  if (host === "signatureglobal.in") {
    return fetchSignatureGlobalMedia(sourceUrl);
  }

  if (host === "centralpark.in") {
    return fetchCentralParkMedia(sourceUrl);
  }

  return [];
}

async function fetchPage(sourceUrl) {
  const pageUrls = getSourcePageUrls(sourceUrl);
  const seenLinks = new Set();
  const candidates = [];
  let publisher = "";
  let publisherLogo = "";

  for (const [pageIndex, pageUrl] of pageUrls.entries()) {
    let html = "";

    try {
      html = await fetchHtml(pageUrl);
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
    const metadata = await fetchArticleMetadata(candidate.newsLink, candidate);
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

async function fetchSource(sourceUrl) {
  if (isHsvpSource(sourceUrl)) {
    return fetchHsvpNotices(sourceUrl);
  }

  if (isBptpMediaSource(sourceUrl)) {
    return fetchBptpMedia(sourceUrl);
  }

  if (isOfficialDeveloperMediaSource(sourceUrl)) {
    return fetchOfficialDeveloperMedia(sourceUrl);
  }

  if (!isLikelyFeedUrl(sourceUrl)) {
    return fetchPage(sourceUrl);
  }

  try {
    return await fetchFeed(sourceUrl);
  } catch (error) {
    console.log(`Feed parse failed for ${sourceUrl}; trying page scrape. ${error.message}`);
    return fetchPage(sourceUrl);
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

  const selectedSources = getSourceUrls().filter(isAllowedSource);
  const extraArticleUrls = [...new Set(getExtraArticleUrls())].filter(isAllowedExtraArticleUrl);
  const maxItems = getMaxItemsPerRun();
  const backfillDateRange = getBackfillDateRange();
  const sentIds = await readSentIds();
  const resendBackfill = getBooleanEnv("RESEND_BACKFILL") && hasBackfillDateRange(backfillDateRange);
  const filterSentIds = resendBackfill ? new Set() : sentIds;
  const skipTitleSet = getSkipTitleSet();
  const targetCityCodeFilter = getTargetCityCodeFilter();
  const allArticles = [];

  if (isNoidaCityEnabled() && !getBooleanEnv("DRY_RUN") && !getBooleanEnv("ALLOW_NOIDA_API")) {
    throw new Error("Noida city mode is local-only for now. Set DRY_RUN=true, or set ALLOW_NOIDA_API=true after the API supports cityCode=noida.");
  }

  if (isNoidaCityEnabled()) {
    console.log("Noida city mode enabled: using Uttar Pradesh - Noida filters and opt-in sources.");
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

  for (const source of selectedSources) {
    try {
      const articles = await fetchSource(source);
      allArticles.push(...articles);
      console.log(`Fetched ${articles.length} items from ${source}`);
    } catch (error) {
      console.error(`Failed to fetch ${source}: ${error.message}`);
    }
  }

  for (const articleUrl of extraArticleUrls) {
    try {
      const article = await fetchDirectArticle(articleUrl);
      allArticles.push(article);
      console.log(`Fetched direct article: ${article.title || articleUrl}`);
    } catch (error) {
      console.error(`Failed to fetch direct article ${articleUrl}: ${error.message}`);
    }
  }

  const expandedAllArticles = allArticles
    .flatMap(expandCityArticles)
    .filter((article) => targetCityCodeFilter.size === 0 || targetCityCodeFilter.has(article.cityCode));
  logDateExcludedPublishableArticles(expandedAllArticles, backfillDateRange, filterSentIds, skipTitleSet);

  const expandedArticles = expandedAllArticles.filter((article) =>
    isWithinBackfillDateRange(article, backfillDateRange)
  );

  const uniqueArticles = uniqueByDedupeIds(
    expandedArticles
    .filter((article) => !shouldSkipTitle(article, skipTitleSet))
    .filter((article) => isPublishableArticle(article, filterSentIds))
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
    const reasons = shouldSkipTitle(article, skipTitleSet)
      ? ["manual skip: title already reposted"]
      : getRejectionReasons(article, filterSentIds);

    for (const reason of reasons) {
      rejectionCounts.set(reason, (rejectionCounts.get(reason) || 0) + 1);
    }
  }

  console.log(`Found ${uniqueArticles.length} new articles.`);
  for (const [reason, count] of [...rejectionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`Skipped ${count} articles by ${reason}.`);
  }

  logMissedNewsAudit(expandedArticles, filterSentIds, skipTitleSet);

  for (const article of expandedArticles.slice(0, 100)) {
    const reasons = shouldSkipTitle(article, skipTitleSet)
      ? ["manual skip: title already reposted"]
      : getRejectionReasons(article, filterSentIds);

    if (reasons.length > 0 && article.title) {
      console.log(`Skipped ${article.title}: ${reasons.join("; ")}`);
    }
  }

  console.log(
    `Push order: ${articlesToPush.filter((article) => article.sharedCityArticle).length} shared-city articles first, then ${
      articlesToPush.filter((article) => !article.sharedCityArticle).length
    } city-specific articles.`
  );

  for (const article of articlesToPush) {
    if (getBooleanEnv("DRY_RUN")) {
      console.log(
        `Dry run candidate (${article.cityCode}): ${article.title} | ${article.newsLink}`
      );
      continue;
    }

    const result = await pushArticle(article);
    for (const id of articleDedupeIds(article)) {
      sentIds.add(id);
    }
    console.log(
      `Pushed (${result.status}, ${article.cityCode}): ${article.title} | API response: ${
        result.body || "<empty>"
      }`
    );
  }

  await writeSentIds(sentIds);
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
  getExtraArticleUrls,
  hasDisallowedLanguage,
  hasBackfillDateRange,
  isLikelyFeedUrl,
  shouldSkipTitle,
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
