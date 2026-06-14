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
  "https://www.aninews.in/category/business/",
  "https://www.cnbctv18.com/real-estate/",
  "https://www.moneycontrol.com/news/business/",
  "https://www.business-standard.com/search?q=REAL%20ESTATE",
  "https://www.outlookmoney.com/topic/real-estate",
  "https://www.tribuneindia.com/topic/real-estate",
  "https://torbitrealty.com/category/news/city-updates/gurugram/",
  "https://realtynmore.com/latest-news/",
  "https://www.hindustantimes.com/topic/faridabad/news",
  "https://www.lokmattimes.com/business/",
  "https://propnewstime.com/"
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
      "sohna",
      "sohna road",
      "pataudi"
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
const outsideCityKeywords = [
  "ahmedabad",
  "andhra",
  "bengaluru",
  "bangalore",
  "bengal",
  "bhopal",
  "chandigarh",
  "chennai",
  "delhi",
  "goa",
  "gujarat",
  "hyderabad",
  "jaipur",
  "kerala",
  "kolkata",
  "lucknow",
  "maharashtra",
  "mumbai",
  "new delhi",
  "noida",
  "pune",
  "rajasthan",
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
  return (
    toIsoDate(article.createdAt) ||
    toIsoDate(article.publishedAt) ||
    toIsoDate(article.fetchedAt) ||
    new Date().toISOString()
  );
}

function detectCityCode(article) {
  const haystack = [article.title, article.description, article.newsLink]
    .join(" ")
    .toLowerCase();

  const match = cityRules.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  );

  return match?.code || "";
}

function detectCityCodes(article) {
  const haystack = [article.title, article.description, article.newsLink]
    .join(" ")
    .toLowerCase();

  if (ncrKeywords.some((keyword) => haystack.includes(keyword))) {
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
      cityCode
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

function hasOutsideCityConflict(article) {
  const title = article.title || "";
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

  return feed.items.map((item) => {
    const rawArticle = {
      title: stripHtml(item.title),
      description: stripHtml(item.contentSnippet || item.content || item.summary || item.description || ""),
      newsLink: item.link || item.guid,
      thumbnailImage: getThumbnail(item),
      postedBy: source,
      postedByLogo: publisherLogo,
      publishedAt: item.isoDate || item.pubDate || null,
      fetchedAt: new Date().toISOString()
    };

    const article = {
      title: rawArticle.title,
      description: rawArticle.description || rawArticle.title,
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
  });
}

async function fetchHtml(sourceUrl) {
  const response = await fetch(sourceUrl, {
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
      )
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
  const maxPerSource = Number.parseInt(env("MAX_ITEMS_PER_SOURCE", "10"), 10);
  const seenLinks = new Set();
  const candidates = [];

  $("a[href]").each((_, element) => {
    const link = absoluteUrl($(element).attr("href"), sourceUrl);
    const title = stripHtml($(element).text());

    if (!link || seenLinks.has(link) || title.length < 18) {
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

  const limitedCandidates = candidates.slice(0, Number.isFinite(maxPerSource) ? maxPerSource : 10);
  const articles = [];

  for (const candidate of limitedCandidates) {
    const metadata = await fetchArticleMetadata(candidate.newsLink, candidate);
    const article = {
      ...candidate,
      ...metadata,
      description: stripHtml(metadata.description || candidate.description),
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
        missingRequiredPayloadFields(article).length === 0 &&
        !hasOutsideCityConflict(article) &&
        (resendKnownArticles || !sentIds.has(article.id))
    )
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  ).slice(0, Number.isFinite(maxItems) ? maxItems : 30);
  const skippedWithoutCity = expandedArticles.filter(
    (article) => article.title && article.newsLink && !article.cityCode
  ).length;
  const skippedMissingFields = expandedArticles.filter(
    (article) =>
      article.title &&
      article.newsLink &&
      article.cityCode &&
      missingRequiredPayloadFields(article).length > 0 &&
      (resendKnownArticles || !sentIds.has(article.id))
  ).length;
  const skippedOutsideCity = expandedArticles.filter(
    (article) =>
      article.title &&
      article.newsLink &&
      article.cityCode &&
      missingRequiredPayloadFields(article).length === 0 &&
      hasOutsideCityConflict(article) &&
      (resendKnownArticles || !sentIds.has(article.id))
  ).length;
  const skippedAlreadySent = resendKnownArticles
    ? 0
    : expandedArticles.filter((article) => sentIds.has(article.id)).length;

  console.log(`Found ${uniqueArticles.length} new articles.`);
  console.log(`Skipped ${skippedWithoutCity} articles without Gurugram/Faridabad city match.`);
  console.log(`Skipped ${skippedMissingFields} articles missing required display fields.`);
  console.log(`Skipped ${skippedOutsideCity} articles with outside-city headline conflicts.`);
  console.log(`Skipped ${skippedAlreadySent} already-sent articles.`);

  for (const article of expandedArticles.slice(0, 100)) {
    const missingFields = missingRequiredPayloadFields(article);

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

  for (const article of uniqueArticles) {
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
