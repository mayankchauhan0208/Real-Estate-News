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
  const value = [article.newsLink, article.url, article.title, article.postedBy, article.source]
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
  const url = new URL(sourceUrl);
  return `${url.origin}/favicon.ico`;
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

function detectCityCode(article) {
  const haystack = [article.title, article.description, article.newsLink]
    .join(" ")
    .toLowerCase();

  const match = cityRules.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword))
  );

  return match?.code || "";
}

function applyCityCode(article) {
  const detectedCityCode = detectCityCode(article);
  const allowDefaultCityCode = env("ALLOW_DEFAULT_CITY_CODE", "false").toLowerCase() === "true";

  return {
    ...article,
    cityCode: detectedCityCode || (allowDefaultCityCode ? env("DEFAULT_CITY_CODE", "gurugram") : "")
  };
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
    postedByLogo: article.postedByLogo
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
  const publisherLogo = getPublisherLogo(feed);

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

    const article = applyCityCode({
      title: rawArticle.title,
      description: rawArticle.description || rawArticle.title,
      isActive: true,
      newsLink: rawArticle.newsLink,
      thumbnailImage: rawArticle.thumbnailImage,
      postedBy: rawArticle.postedBy,
      postedByLogo: rawArticle.postedByLogo,
      publishedAt: rawArticle.publishedAt,
      fetchedAt: rawArticle.fetchedAt
    });

    return {
      ...article,
      id: stableId(article)
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
    const article = applyCityCode({
      ...candidate,
      ...metadata,
      description: stripHtml(metadata.description || candidate.description),
      thumbnailImage: absoluteUrl(metadata.thumbnailImage || candidate.thumbnailImage, candidate.newsLink)
    });

    articles.push({
      ...article,
      id: stableId(article)
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
  const selectedSources = sources.length > 0 ? sources : defaultSources;
  const maxItems = Number.parseInt(env("MAX_ITEMS_PER_RUN", "30"), 10);
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

  const uniqueArticles = allArticles
    .filter((article) => article.title && article.newsLink && article.cityCode && !sentIds.has(article.id))
    .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    .slice(0, Number.isFinite(maxItems) ? maxItems : 30);
  const skippedWithoutCity = allArticles.filter(
    (article) => article.title && article.newsLink && !article.cityCode
  ).length;
  const skippedAlreadySent = allArticles.filter((article) => sentIds.has(article.id)).length;

  console.log(`Found ${uniqueArticles.length} new articles.`);
  console.log(`Skipped ${skippedWithoutCity} articles without Gurugram/Faridabad city match.`);
  console.log(`Skipped ${skippedAlreadySent} already-sent articles.`);

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
