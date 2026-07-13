import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const userAgent =
  "Mozilla/5.0 news-api-pusher check";

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
  "https://www.cnbctv18.com/real-estate/",
  "https://realty.economictimes.indiatimes.com/tag/gurugram",
  "https://realty.economictimes.indiatimes.com/tag/faridabad",
  "https://www.moneycontrol.com/news/business/real-estate/",
  "https://www.business-standard.com/topic/real-estate",
  "https://www.outlookmoney.com/topic/real-estate",
  "https://www.tribuneindia.com/topic/real-estate",
  "https://torbitrealty.com/category/news/city-updates/gurugram/",
  "https://realtynmore.com/latest-news/",
  "https://realtynxt.com/",
  "https://www.track2realty.track2media.com/",
  "https://propnewstime.com/"
];

const cityRules = [
  {
    code: "faridabad",
    keywords: ["faridabad", "greater faridabad", "neharpar"]
  },
  {
    code: "gurugram",
    keywords: [
      "gurugram",
      "gurgaon",
      "dwarka expressway",
      "golf course road",
      "manesar",
      "manasar",
      "pataudi",
      "patudi",
      "patodi",
      "sohna",
      "sohna road"
    ]
  }
];
const gurugramCorridorKeywords = ["dwarka expressway", "golf course road"];

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
const ncrCityCodes = ["gurugram", "faridabad"];
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
  "bookings",
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
  "metro",
  "new project",
  "new project launch",
  "office space",
  "possession",
  "profit",
  "net profit",
  "price appreciation",
  "project",
  "real estate",
  "realty",
  "redevelopment",
  "residential",
  "results",
  "revenue",
  "sales",
  "township"
];
const realEstateCompanyKeywords = [
  "dlf",
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
  "tulip group"
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
const blockedTitleKeywords = [
  "about us",
  "admission",
  "admissions",
  "actor",
  "actress",
  "advertise",
  "air monitor",
  "air monitors",
  "aravali",
  "awards",
  "brand awareness",
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
  "grievance",
  "grievance redressal",
  "integrated campaigns",
  "login",
  "newsletter",
  "panel",
  "pipeline",
  "pollution",
  "photo gallery",
  "photos",
  "privacy policy",
  "preity zinta",
  "register",
  "school",
  "sewage",
  "survey",
  "traffic jam",
  "subscription",
  "terms of use",
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
  "stuck",
  "suicide",
  "suicides",
  "tax hike",
  "thunderstorm",
  "threat",
  "unable",
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
  "builder arrested",
  "builder suicide",
  "buyers stranded",
  "caqm pollution",
  "cheated homebuyers",
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
  "murdered over property",
  "not new claims",
  "payment default",
  "power backup",
  "power backup worries",
  "power outage",
  "power supply issue",
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
  "short circuit",
  "registry stalled",
  "registration stalled",
  "real estate agent killed",
  "real estate broker killed",
  "strike hits",
  "suicide due to property",
  "suicide over property",
  "traffic jam",
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
  "hospital",
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
  "suicide over property"
];
const outsideCityKeywords = [
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
  "pallikaranai",
  "patna",
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

const allowedSourceUrlParts = defaultSources.map((source) => {
  const url = new URL(source);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
});

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

function getPositiveIntegerEnv(name, fallback) {
  const value = Number.parseInt(env(name, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getMaxItemsPerSource() {
  return getPositiveIntegerEnv("MAX_ITEMS_PER_SOURCE", 4);
}

function getMaxItemsPerRun() {
  return getPositiveIntegerEnv("MAX_ITEMS_PER_RUN", 30);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
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
    .replace(/&#39;/g, "'")
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

function toIsoDate(value) {
  if (!value) {
    return "";
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

function isRealEstateRelated(article) {
  if (isBlockedArticle(article)) {
    return false;
  }

  return hasRealEstateEvidence(article) || isNationalRealEstateBusinessUpdate(article);
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
  if (hasNcrMatch(article)) {
    return ncrCityCodes;
  }

  const primaryText = getArticlePrimaryText(article);
  const cityCodes = cityRules
    .filter((rule) => hasWholeWordKeyword(primaryText, rule.keywords) || hasStrongArticleCityMatch(article, rule))
    .map((rule) => rule.code);

  return [...new Set(cityCodes)];
}

function hasTargetRegionInPrimaryText(article) {
  const primaryText = getArticlePrimaryText(article);
  return hasWholeWordKeyword(primaryText, targetCityKeywords);
}

function hasTargetRegionEvidence(article) {
  return hasNcrMatch(article) || hasTargetRegionInPrimaryText(article) || cityRules.some((rule) => hasStrongArticleCityMatch(article, rule));
}

function hasOutsideRegionInPrimaryText(article) {
  return hasWholeWordKeyword(getArticlePrimaryText(article), getDisqualifyingOutsideCityKeywords(article));
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
  const haystack = getArticleSearchText(article);
  return /\bdelhi ncr\b/i.test(haystack);
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
  const fullText = getArticleSearchText(article);

  return (
    hasTargetRegionEvidence(article) &&
    hasPromotionalRealEstateSignal(article) &&
    (
      hasKeyword(primaryText, realEstateKeywords) ||
      hasKeyword(primaryText, realEstateCompanyKeywords) ||
      hasKeyword(fullText, realEstateKeywords)
    )
  );
}

function hasPromotionalRealEstateSignal(article) {
  const primaryText = getArticlePrimaryText(article);
  const fullText = getArticleSearchText(article);

  return hasKeyword(primaryText, promotionalRealEstateKeywords) || hasKeyword(fullText, promotionalRealEstateKeywords);
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

function isGurugramCorridorArticle(article) {
  return hasWholeWordKeyword(getArticleSearchText(article), gurugramCorridorKeywords);
}

function getDisqualifyingOutsideCityKeywords(article) {
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

  return (
    blockedExactTitles.includes(normalizedTitle) ||
    /[\u0900-\u097F]/.test(primaryText) ||
    hasKeyword(primaryText, blockedTitleKeywords) ||
    hasKeyword(newsLink, blockedUrlParts)
  );
}

function isNegativeNews(article) {
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
      createdAt: rawArticle.publishedAt || rawArticle.fetchedAt,
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

async function fetchArticleMetadata(articleUrl, fallback = {}) {
  try {
    const html = await fetchHtml(articleUrl);
    const $ = cheerio.load(html);
    const articleText = extractArticleText($);

    return {
      description: pickFirst(
        $('meta[property="og:description"]').attr("content"),
        $('meta[name="description"]').attr("content"),
        fallback.description
      ),
      thumbnailImage: pickFirst(
        $('meta[property="og:image"]').attr("content"),
        $('meta[name="twitter:image"]').attr("content"),
        fallback.thumbnailImage
      ),
      publishedAt: pickFirst(
        $('meta[property="article:published_time"]').attr("content"),
        $("time[datetime]").first().attr("datetime"),
        fallback.publishedAt
      ),
      articleText
    };
  } catch {
    return fallback;
  }
}

async function fetchPage(sourceUrl) {
  const html = await fetchHtml(sourceUrl);
  const $ = cheerio.load(html);
  const publisher = getPublisherName(sourceUrl, $("title").text());
  const publisherLogo = pickFirst(
    absoluteUrl($('link[rel="icon"]').attr("href"), sourceUrl),
    absoluteUrl($('link[rel="shortcut icon"]').attr("href"), sourceUrl),
    getFallbackLogo(sourceUrl)
  );
  const seenLinks = new Set();
  const candidates = [];

  $("a[href]").each((_, element) => {
    const link = absoluteUrl($(element).attr("href"), sourceUrl);
    const title = stripHtml($(element).text());

    if (!link || seenLinks.has(link) || title.length < 18 || isBlockedArticle({ title, newsLink: link })) {
      return;
    }

    const linkHost = new URL(link).hostname.replace(/^www\./, "");
    const sourceHost = new URL(sourceUrl).hostname.replace(/^www\./, "");

    if (linkHost !== sourceHost) {
      return;
    }

    seenLinks.add(link);
    candidates.push({
      title,
      description: title,
      articleText: "",
      cityCode: "",
      isActive: true,
      newsLink: link,
      thumbnailImage: absoluteUrl($(element).find("img").first().attr("src"), sourceUrl),
      postedBy: publisher,
      postedByLogo: publisherLogo,
      publishedAt: null,
      fetchedAt: new Date().toISOString()
    });
  });

  const limitedCandidates = candidates.slice(0, getMaxItemsPerSource());
  const articles = [];

  for (const candidate of limitedCandidates) {
    const metadata = await fetchArticleMetadata(candidate.newsLink, candidate);
    const article = {
      ...candidate,
      ...metadata,
      description: stripHtml(metadata.description || candidate.description),
      articleText: stripHtml(metadata.articleText || candidate.articleText || ""),
      thumbnailImage: absoluteUrl(metadata.thumbnailImage || candidate.thumbnailImage, candidate.newsLink),
      createdAt: metadata.publishedAt || candidate.fetchedAt
    };

    const cityArticle = applyCityCode(cleanArticleFields(article));

    articles.push({
      ...cityArticle,
      id: stableId(cityArticle)
    });
  }

  return articles;
}

async function fetchSource(sourceUrl) {
  try {
    return await fetchFeed(sourceUrl);
  } catch (error) {
    console.log(`RSS parse failed for ${sourceUrl}; trying page scrape. ${error.message}`);
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
  const response = await fetch(apiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

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

  const sources = getSources();
  const selectedSources = [...new Set([...defaultSources, ...sources])].filter(isAllowedSource);
  const maxItems = getMaxItemsPerRun();
  const sentIds = await readSentIds();
  const allArticles = [];

  for (const source of selectedSources) {
    try {
      const articles = await fetchSource(source);
      allArticles.push(...articles);
      console.log(`Fetched ${articles.length} items from ${source}`);
    } catch (error) {
      console.error(`Failed to fetch ${source}: ${error.message}`);
    }
  }

  const expandedArticles = allArticles.flatMap(expandCityArticles);

  const uniqueArticles = uniqueByDedupeIds(
    expandedArticles
    .filter((article) => isPublishableArticle(article, sentIds))
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
    const reasons = getRejectionReasons(article, sentIds);

    for (const reason of reasons) {
      rejectionCounts.set(reason, (rejectionCounts.get(reason) || 0) + 1);
    }
  }

  console.log(`Found ${uniqueArticles.length} new articles.`);
  for (const [reason, count] of [...rejectionCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`Skipped ${count} articles by ${reason}.`);
  }

  for (const article of expandedArticles.slice(0, 100)) {
    const reasons = getRejectionReasons(article, sentIds);

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
  cleanArticleFields,
  detectCityCodes,
  getRejectionReasons,
  hasDisallowedLanguage,
  isAllowedSource,
  isNegativeNews,
  isPublishableArticle
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
