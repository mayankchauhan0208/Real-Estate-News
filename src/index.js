import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent": "news-api-pusher/1.0 (+https://github.com)"
  }
});

const stateDir = path.resolve(".state");
const sentNewsPath = path.join(stateDir, "sent-news.json");

const defaultSources = [
  "https://www.hindustantimes.com/real-estate",
  "https://www.cnbctv18.com/real-estate/",
  "https://realty.economictimes.indiatimes.com/",
  "https://www.moneycontrol.com/news/business/real-estate/",
  "https://www.business-standard.com/topic/real-estate",
  "https://www.outlookmoney.com/topic/real-estate",
  "https://www.tribuneindia.com/topic/real-estate",
  "https://torbitrealty.com/category/news/city-updates/gurugram/",
  "https://realtynmore.com/latest-news/",
  "https://realtynxt.com/",
  "https://www.hindustantimes.com/topic/faridabad/news",
  "https://www.track2realty.track2media.com/",
  "https://propnewstime.com/",
  "https://www.rprealtyplus.com/",
  "https://housing.com/news/",
  "https://content.magicbricks.com/property-news/",
  "https://www.financialexpress.com/about/real-estate/"
];

const cityRules = [
  {
    code: "faridabad",
    keywords: ["greater faridabad", "neharpar", "faridabad"]
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
      "sohna",
      "sohna road",
      "pataudi",
      "patodi"
    ]
  }
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

const ncrKeywords = ["delhi ncr", "ncr", "national capital region"];
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
  "builder",
  "carpet area",
  "commercial property",
  "commercial real estate",
  "developer",
  "development authority",
  "dlf",
  "dwelling",
  "flat",
  "floor",
  "homebuyer",
  "homebuyers",
  "housing",
  "land parcel",
  "lease",
  "luxury housing",
  "luxury homes",
  "office space",
  "plot",
  "project",
  "property",
  "real estate",
  "realty",
  "redevelopment",
  "registry",
  "residential",
  "sector",
  "stamp duty",
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
  "raymond realty"
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
  "advertise",
  "awards",
  "brand awareness",
  "careers",
  "conference",
  "contact us",
  "digital branding",
  "education & careers",
  "expo",
  "integrated campaigns",
  "login",
  "newsletter",
  "privacy policy",
  "register",
  "subscription",
  "terms of use",
  "virtual engagement",
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
  "/awards",
  "/campaign",
  "/career",
  "/conference",
  "/contact",
  "/education",
  "/event",
  "/login",
  "/newsletter",
  "/privacy",
  "/register",
  "/subscription",
  "/terms",
  "/webinar"
];
const outsideCityKeywords = [
  "ahmedabad",
  "andhra",
  "bengaluru",
  "bangalore",
  "bengal",
  "bhopal",
  "bhubaneswar",
  "chandigarh",
  "chennai",
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
  "perumbakkam",
  "phuket",
  "pune",
  "rajasthan",
  "singapore",
  "tamil nadu",
  "telangana",
  "uttar pradesh"
];

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
  return env("NEWS_SOURCES")
    .split(",")
    .map((source) => source.trim())
    .filter(Boolean);
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

function stripHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    "aninews.in": "ANI News",
    "business-standard.com": "Business Standard",
    "cnbctv18.com": "CNBC TV18",
    "hindustantimes.com": "Hindustan Times",
    "lokmattimes.com": "Lokmat Times",
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
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
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
  const haystack = getArticleSearchText(article);

  const match = cityRules.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  );

  return match?.code || "";
}

function getArticleSearchText(article) {
  return [article.title, article.description, article.articleText, article.newsLink]
    .join(" ")
    .toLowerCase();
}

function getArticlePrimaryText(article) {
  return [article.title, article.description].join(" ").toLowerCase();
}

function isReraRelated(article) {
  return !isBlockedArticle(article) && hasKeyword(getArticleSearchText(article), reraKeywords);
}

function isCourtRealEstateRelated(article) {
  const haystack = getArticleSearchText(article);
  return (
    !isBlockedArticle(article) &&
    hasKeyword(haystack, courtKeywords) &&
    hasRealEstateEvidence(article)
  );
}

function isNationalRealEstateBusinessUpdate(article) {
  const haystack = getArticleSearchText(article);
  const title = article.title || "";

  return (
    !isBlockedArticle(article) &&
    hasKeyword(haystack, realEstateCompanyKeywords) &&
    hasKeyword(haystack, nationalBusinessKeywords) &&
    !hasKeyword(title, outsideCityKeywords)
  );
}

function isRealEstateRelated(article) {
  if (isBlockedArticle(article)) {
    return false;
  }

  return (
    hasRealEstateEvidence(article) ||
    isReraRelated(article) ||
    isCourtRealEstateRelated(article) ||
    isNationalRealEstateBusinessUpdate(article)
  );
}

function shouldSendToBothCities(article) {
  const haystack = getArticleSearchText(article);
  return (
    hasKeyword(haystack, ncrKeywords) ||
    isReraRelated(article) ||
    isCourtRealEstateRelated(article) ||
    isNationalRealEstateBusinessUpdate(article)
  );
}

function detectCityCodes(article) {
  if (!isRealEstateRelated(article)) {
    return [];
  }

  if (shouldSendToBothCities(article)) {
    return ncrCityCodes;
  }

  const cityCode = detectCityCode(article);
  return cityCode ? [cityCode] : [];
}

function applyCityCode(article) {
  const [detectedCityCode] = detectCityCodes(article);
  const allowDefaultCityCode = env("ALLOW_DEFAULT_CITY_CODE", "false").toLowerCase() === "true";

  return {
    ...article,
    cityCode: detectedCityCode || (allowDefaultCityCode ? env("DEFAULT_CITY_CODE", "gurugram") : "")
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

function hasKeyword(value, keywords) {
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
}

function hasRealEstateEvidence(article) {
  const primaryText = getArticlePrimaryText(article);
  const fullText = getArticleSearchText(article);

  return (
    hasKeyword(primaryText, realEstateKeywords) ||
    hasKeyword(primaryText, realEstateCompanyKeywords) ||
    (hasKeyword(fullText, realEstateKeywords) && hasKeyword(primaryText, targetCityKeywords))
  );
}

function isBlockedArticle(article) {
  const title = article.title || "";
  const newsLink = article.newsLink || "";
  const normalizedTitle = title.trim().toLowerCase();

  return (
    blockedExactTitles.includes(normalizedTitle) ||
    hasKeyword(title, blockedTitleKeywords) ||
    hasKeyword(newsLink, blockedUrlParts)
  );
}

function hasOutsideCityConflict(article) {
  const title = article.title || "";
  if (shouldSendToBothCities(article)) {
    return false;
  }

  return hasKeyword(title, outsideCityKeywords) && !hasKeyword(title, targetCityKeywords);
}

function createTestArticle() {
  const timestamp = new Date().toISOString();
  const title = `Gurugram PropertyMaster automation test news ${timestamp}`;
  const article = {
    title,
    description:
      "This complete Gurugram test news item was created by the Real-Estate-News GitHub Action to verify PropertyMaster app display.",
    cityCode: "gurugram",
    isActive: true,
    newsLink: `https://github.com/mayankchauhan0208/Real-Estate-News/actions?test=${encodeURIComponent(
      timestamp
    )}`,
    thumbnailImage:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80",
    postedBy: "PropertyMaster Automation",
    postedByLogo: "https://www.google.com/s2/favicons?domain=propertymaster.com&sz=128",
    createdAt: timestamp,
    publishedAt: timestamp,
    fetchedAt: timestamp
  };

  return {
    ...article,
    id: stableId(article)
  };
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
  const maxPerSource = Number.parseInt(env("MAX_ITEMS_PER_SOURCE", "4"), 10);
  const feedItems = feed.items.slice(0, Number.isFinite(maxPerSource) ? maxPerSource : 4);

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

    const cityArticle = applyCityCode(article);

    return {
      ...cityArticle,
      id: stableId(cityArticle)
    };
  }));
}

async function fetchHtml(sourceUrl) {
  const response = await fetchWithTimeout(sourceUrl, {
    headers: {
      "User-Agent": "news-api-pusher/1.0 (+https://github.com)",
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

async function fetchArticleMetadata(articleUrl, fallback = {}) {
  try {
    const html = await fetchHtml(articleUrl);
    const $ = cheerio.load(html);
    const articleText = stripHtml(
      pickFirst(
        $("article").text(),
        $("main").text(),
        $("p")
          .map((_, element) => $(element).text())
          .get()
          .join(" ")
      )
    ).slice(0, 5000);

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
  const maxPerSource = Number.parseInt(env("MAX_ITEMS_PER_SOURCE", "4"), 10);
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

  const limitedCandidates = candidates.slice(0, Number.isFinite(maxPerSource) ? maxPerSource : 4);
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

    const cityArticle = applyCityCode(article);

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

function uniqueById(articles) {
  const seenIds = new Set();

  return articles.filter((article) => {
    if (!article.id || seenIds.has(article.id)) {
      return false;
    }

    seenIds.add(article.id);
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

  if (env("PUSH_TEST_NEWS", "false").toLowerCase() === "true") {
    const testArticle = createTestArticle();
    const missingFields = missingRequiredPayloadFields(testArticle);

    if (missingFields.length > 0) {
      throw new Error(`Test article missing required fields: ${missingFields.join(", ")}`);
    }

    const result = await pushArticle(testArticle);
    console.log(
      `Pushed test (${result.status}, ${testArticle.cityCode}): ${testArticle.title} | API response: ${
        result.body || "<empty>"
      }`
    );
    return;
  }

  const sources = getSources();
  const selectedSources = sources.length > 0 ? sources : defaultSources;
  const maxItems = Number.parseInt(env("MAX_ITEMS_PER_RUN", "30"), 10);
  const resendKnownArticles = env("RESEND_KNOWN_ARTICLES", "false").toLowerCase() === "true";
  const sentIds = await readSentIds();
  const allArticles = [];

  if (resendKnownArticles) {
    console.log("Manual resend enabled: ignoring saved dedupe for this run.");
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

  const expandedArticles = allArticles.flatMap(expandCityArticles);

  const uniqueArticles = uniqueById(
    expandedArticles
    .filter(
      (article) =>
        article.title &&
        article.newsLink &&
        article.cityCode &&
        !isBlockedArticle(article) &&
        missingRequiredPayloadFields(article).length === 0 &&
        !hasOutsideCityConflict(article) &&
        (resendKnownArticles || !sentIds.has(article.id))
    )
    .sort((a, b) => {
      const priorityDifference = articlePriority(a) - articlePriority(b);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    })
  ).slice(0, Number.isFinite(maxItems) ? maxItems : 30);
  const articlesToPush = [...uniqueArticles].sort((a, b) => {
    const priorityDifference = articlePriority(b) - articlePriority(a);

    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
  });
  const skippedWithoutCity = expandedArticles.filter(
    (article) => article.title && article.newsLink && isRealEstateRelated(article) && !article.cityCode
  ).length;
  const skippedNotRealEstate = expandedArticles.filter(
    (article) => article.title && article.newsLink && !isRealEstateRelated(article)
  ).length;
  const skippedBlocked = expandedArticles.filter(
    (article) => article.title && article.newsLink && isBlockedArticle(article)
  ).length;
  const skippedMissingFields = expandedArticles.filter(
    (article) =>
      article.title &&
      article.newsLink &&
      article.cityCode &&
      !isBlockedArticle(article) &&
      missingRequiredPayloadFields(article).length > 0 &&
      (resendKnownArticles || !sentIds.has(article.id))
  ).length;
  const skippedOutsideCity = expandedArticles.filter(
    (article) =>
      article.title &&
      article.newsLink &&
      article.cityCode &&
      !isBlockedArticle(article) &&
      missingRequiredPayloadFields(article).length === 0 &&
      hasOutsideCityConflict(article) &&
      (resendKnownArticles || !sentIds.has(article.id))
  ).length;
  const skippedAlreadySent = resendKnownArticles
    ? 0
    : expandedArticles.filter((article) => sentIds.has(article.id)).length;

  console.log(`Found ${uniqueArticles.length} new articles.`);
  console.log(`Skipped ${skippedBlocked} blocked menu/spam pages.`);
  console.log(`Skipped ${skippedNotRealEstate} articles that were not real-estate related.`);
  console.log(`Skipped ${skippedWithoutCity} articles without Gurugram/Faridabad city match.`);
  console.log(`Skipped ${skippedMissingFields} articles missing required display fields.`);
  console.log(`Skipped ${skippedOutsideCity} articles with outside-city headline conflicts.`);
  console.log(`Skipped ${skippedAlreadySent} already-sent articles.`);

  for (const article of expandedArticles.slice(0, 100)) {
    const missingFields = missingRequiredPayloadFields(article);

    if (article.title && article.newsLink && isBlockedArticle(article)) {
      console.log(`Skipped blocked page: ${article.title}`);
    }

    if (article.title && article.newsLink && !isRealEstateRelated(article)) {
      console.log(`Skipped not real estate: ${article.title}`);
    }

    if (article.title && article.newsLink && article.cityCode && missingFields.length > 0) {
      console.log(`Skipped missing ${missingFields.join(", ")}: ${article.title}`);
    }

    if (
      article.title &&
      article.newsLink &&
      article.cityCode &&
      missingFields.length === 0 &&
      hasOutsideCityConflict(article)
    ) {
      console.log(`Skipped outside-city headline: ${article.title}`);
    }
  }

  console.log(
    `Push order: ${articlesToPush.filter((article) => article.sharedCityArticle).length} shared-city articles first, then ${
      articlesToPush.filter((article) => !article.sharedCityArticle).length
    } city-specific articles.`
  );

  for (const article of articlesToPush) {
    const result = await pushArticle(article);
    sentIds.add(article.id);
    console.log(
      `Pushed (${result.status}, ${article.cityCode}): ${article.title} | API response: ${
        result.body || "<empty>"
      }`
    );
  }

  await writeSentIds(sentIds);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
