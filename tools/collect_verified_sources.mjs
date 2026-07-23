import fs from "node:fs/promises";

const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const seeds = [
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com"],
  ["Moneycontrol", "News", "NCR", "https://www.moneycontrol.com"],
  ["Business Standard", "News", "NCR", "https://www.business-standard.com"],
  ["Financial Express", "News", "NCR", "https://www.financialexpress.com"],
  ["Mint", "News", "NCR", "https://www.livemint.com"],
  ["CNBC TV18", "News", "NCR", "https://www.cnbctv18.com"],
  ["Hindustan Times", "News", "NCR", "https://www.hindustantimes.com"],
  ["Times of India", "News", "NCR", "https://timesofindia.indiatimes.com"],
  ["Indian Express", "News", "NCR", "https://indianexpress.com"],
  ["The Hindu", "News", "NCR", "https://www.thehindu.com"],
  ["News18", "News", "NCR", "https://www.news18.com"],
  ["NDTV", "News", "NCR", "https://www.ndtv.com"],
  ["India Today", "News", "NCR", "https://www.indiatoday.in"],
  ["Firstpost", "News", "NCR", "https://www.firstpost.com"],
  ["Realty Plus", "News", "NCR", "https://www.rprealtyplus.com"],
  ["Housing.com News", "News", "NCR", "https://housing.com"],
  ["MagicBricks", "News", "NCR", "https://content.magicbricks.com"],
  ["99acres", "News", "NCR", "https://www.99acres.com"],
  ["SquareYards", "News", "NCR", "https://www.squareyards.com"],
  ["PropTiger", "News", "NCR", "https://www.proptiger.com"],
  ["NoBroker", "News", "NCR", "https://www.nobroker.in"],
  ["Construction World", "News", "NCR", "https://www.constructionworld.in"],
  ["Property Observer", "News", "NCR", "https://www.propertyobserver.in"],
  ["PropNewsTime", "News", "NCR", "https://propnewstime.com"],
  ["RealtyNXT", "News", "NCR", "https://realtynxt.com"],
  ["The Realty Today", "News", "NCR", "https://therealtytoday.com"],
  ["The Property Times", "News", "NCR", "https://thepropertytimes.in"],
  ["Amar Ujala", "Local News", "NCR", "https://www.amarujala.com"],
  ["Dainik Jagran", "Local News", "NCR", "https://www.jagran.com"],
  ["Live Hindustan", "Local News", "NCR", "https://www.livehindustan.com"],
  ["Navbharat Times", "Local News", "NCR", "https://navbharattimes.indiatimes.com"],
  ["ABP", "Local News", "NCR", "https://www.abplive.com"],
  ["TV9", "Local News", "NCR", "https://www.tv9hindi.com"],
  ["Zee News", "Local News", "NCR", "https://zeenews.india.com"],
  ["Punjab Kesari", "Local News", "NCR", "https://www.punjabkesari.in"],
  ["Ten News", "Local News", "NCR", "https://tennews.in"],
  ["CitySpidey", "Local News", "NCR", "https://www.cityspidey.com"],
  ["Millennium Post", "Local News", "NCR", "https://www.millenniumpost.in"],
  ["Noida Authority", "Government", "Noida", "https://noidaauthorityonline.in"],
  ["Greater Noida Authority", "Government", "Noida", "https://www.greaternoidaauthority.in"],
  ["YEIDA", "Government", "Noida", "https://www.yamunaexpresswayauthority.com"],
  ["UP RERA", "Government", "Noida", "https://www.up-rera.in"],
  ["Haryana RERA", "Government", "Gurugram/Faridabad", "https://haryanarera.gov.in"],
  ["DDA", "Government", "NCR", "https://dda.gov.in"],
  ["GMDA", "Government", "Gurugram", "https://www.gmda.gov.in"],
  ["HSVP", "Government", "Gurugram/Faridabad", "https://hsvphry.org.in"],
  ["HSIIDC", "Government", "Gurugram/Faridabad", "https://hsiidc.org.in"],
  ["PIB", "Government", "NCR", "https://pib.gov.in"],
  ["MoHUA", "Government", "NCR", "https://mohua.gov.in"],
  ["NHAI", "Government", "NCR", "https://nhai.gov.in"],
  ["DMRC", "Government", "NCR", "https://www.delhimetrorail.com"],
  ["NMRC", "Government", "Noida", "https://www.nmrcnoida.com"],
  ["NCRTC", "Government", "NCR", "https://ncrtc.in"],
  ["UPEIDA", "Government", "Noida", "https://upeida.up.gov.in"],
  ["Invest UP", "Government", "Noida", "https://invest.up.gov.in"],
  ["Invest Haryana", "Government", "Gurugram/Faridabad", "https://investharyana.in"],
  ["ANAROCK", "Research", "NCR", "https://www.anarock.com"],
  ["JLL India", "Research", "NCR", "https://www.jll.co.in"],
  ["CBRE India", "Research", "NCR", "https://www.cbre.co.in"],
  ["Knight Frank India", "Research", "NCR", "https://www.knightfrank.co.in"],
  ["Colliers India", "Research", "NCR", "https://www.colliers.com"],
  ["Savills India", "Research", "NCR", "https://www.savills.in"],
  ["Cushman & Wakefield", "Research", "NCR", "https://www.cushmanwakefield.com"],
  ["PropEquity", "Research", "NCR", "https://www.propequity.in"],
  ["Liases Foras", "Research", "NCR", "https://www.liasesforas.com"],
  ["CRISIL", "Research", "NCR", "https://www.crisil.com"],
  ["ICRA", "Research", "NCR", "https://www.icra.in"],
  ["DLF", "Developer", "Gurugram", "https://www.dlf.in"],
  ["Godrej Properties", "Developer", "NCR", "https://www.godrejproperties.com"],
  ["Signature Global", "Developer", "Gurugram", "https://www.signatureglobal.in"],
  ["Smartworld", "Developer", "Gurugram", "https://smartworlddevelopers.com"],
  ["M3M", "Developer", "Gurugram", "https://m3mindia.com"],
  ["ATS", "Developer", "Noida", "https://www.atsgreens.com"],
  ["BPTP", "Developer", "Faridabad/Gurugram", "https://www.bptp.com"],
  ["Emaar India", "Developer", "Gurugram", "https://www.emaarindia.com"],
  ["ACE", "Developer", "Noida", "https://www.acegroupindia.com"],
  ["Gaurs", "Developer", "Noida", "https://www.gaurs.com"],
  ["Mahagun", "Developer", "Noida", "https://www.mahagunindia.com"],
  ["CRC", "Developer", "Noida", "https://crcgroup.in"],
  ["Bhutani", "Developer", "Noida", "https://www.bhutaniinfra.com"],
  ["County Group", "Developer", "Noida", "https://countygroup.in"],
  ["Saya", "Developer", "Noida", "https://www.sayaindia.com"],
  ["Eldeco", "Developer", "Noida", "https://www.eldecogroup.com"],
  ["Conscient", "Developer", "Gurugram", "https://www.conscient.in"],
  ["Central Park", "Developer", "Gurugram", "https://www.centralpark.in"],
  ["Hero Realty", "Developer", "Gurugram", "https://www.herorealty.in"],
  ["Whiteland", "Developer", "Gurugram", "https://www.whitelandcorporation.com"],
  ["Trevoc", "Developer", "Gurugram", "https://trevocgroup.com"],
  ["Ganga Realty", "Developer", "Gurugram", "https://www.gangarealty.com"],
  ["JMS", "Developer", "Gurugram", "https://www.jmsgroup.co.in"],
  ["ROF", "Developer", "Gurugram", "https://www.rof.co.in"],
  ["Pyramid", "Developer", "Gurugram", "https://www.pyramidinfratech.com"],
  ["Paras", "Developer", "Gurugram", "https://www.parasbuildtech.com"],
  ["Experion", "Developer", "Gurugram", "https://www.experion.co"],
  ["Krisumi", "Developer", "Gurugram", "https://www.krisumi.com"],
  ["Sobha", "Developer", "NCR", "https://www.sobha.com"],
  ["Prestige", "Developer", "NCR", "https://www.prestigeconstructions.com"],
  ["Lodha", "Developer", "NCR", "https://www.lodhagroup.in"],
  ["Birla Estates", "Developer", "NCR", "https://www.birlaestates.com"],
  ["Tata Realty", "Developer", "NCR", "https://www.tatarealty.in"],
  ["Adani Realty", "Developer", "NCR", "https://www.adanirealty.com"],
  ["Max Estates", "Developer", "NCR", "https://maxestates.in"],
  ["Ashiana", "Developer", "Faridabad/Gurugram", "https://www.ashianahousing.com"],
  ["Omaxe", "Developer", "Faridabad", "https://www.omaxe.com"],
  ["Supertech", "Developer", "Noida", "https://www.supertechlimited.com"],
  ["Jaypee", "Developer", "Noida", "https://www.jaypeegreens.com"]
];

const pageTypePaths = [
  ["Latest News", "/"],
  ["Latest News", "/news"],
  ["Latest News", "/latest-news"],
  ["News Category", "/news/real-estate"],
  ["News Category", "/category/real-estate"],
  ["News Category", "/topic/real-estate"],
  ["News Category", "/tag/real-estate"],
  ["News Category", "/real-estate"],
  ["Real Estate Section", "/real-estate/news"],
  ["Real Estate Section", "/news/business/real-estate"],
  ["Property Section", "/property"],
  ["Property Section", "/property-news"],
  ["Infrastructure News", "/infrastructure"],
  ["Infrastructure News", "/infrastructure-news"],
  ["Infrastructure News", "/news/infrastructure"],
  ["City News", "/city/gurgaon"],
  ["City News", "/city/gurugram"],
  ["City News", "/city/faridabad"],
  ["City News", "/city/noida"],
  ["City News", "/cities/gurugram-news"],
  ["City News", "/cities/faridabad-news"],
  ["City News", "/cities/noida-news"],
  ["City News", "/topic/gurugram/news"],
  ["City News", "/topic/faridabad/news"],
  ["City News", "/topic/noida/news"],
  ["City News", "/topic/greater-noida/news"],
  ["Media Centre", "/media"],
  ["Media Centre", "/media-centre"],
  ["Media Centre", "/media-center"],
  ["Media Centre", "/media/press"],
  ["Newsroom", "/newsroom"],
  ["Newsroom", "/news-room"],
  ["Press Release Archive", "/press-release"],
  ["Press Release Archive", "/press-releases"],
  ["Press Release Archive", "/press"],
  ["Official Blog", "/blog"],
  ["Official Blog", "/blogs"],
  ["Announcement", "/announcement"],
  ["Announcement", "/announcements"],
  ["Notification", "/notification"],
  ["Notification", "/notifications"],
  ["Circular", "/circular"],
  ["Circular", "/circulars"],
  ["Tender", "/tender"],
  ["Tender", "/tenders"],
  ["Research", "/research"],
  ["Research", "/insights"],
  ["Research", "/reports"],
  ["Market Reports", "/market-reports"],
  ["Investor News", "/investor-relations/news"],
  ["Investor News", "/investors/news"],
  ["RSS Feed", "/rss"],
  ["RSS Feed", "/feed"],
  ["XML Feed", "/atom.xml"],
  ["XML Feed", "/rss.xml"],
  ["News Sitemap", "/sitemap.xml"],
  ["News Sitemap", "/news-sitemap.xml"],
  ["News Sitemap", "/post-sitemap.xml"],
  ["News Sitemap", "/page-sitemap.xml"]
];

const exactCandidates = [
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/", "Latest News"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/news/residential", "Real Estate Section"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/news/commercial", "Real Estate Section"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/news/infrastructure", "Infrastructure News"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/rss/residential", "RSS Feed"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/rss/commercial", "RSS Feed"],
  ["Economic Times Realty", "News", "NCR", "https://realty.economictimes.indiatimes.com/rss/infrastructure", "RSS Feed"],
  ["Moneycontrol", "News", "NCR", "https://www.moneycontrol.com/news/business/real-estate/", "Real Estate Section"],
  ["CNBC TV18", "News", "NCR", "https://www.cnbctv18.com/real-estate/", "Real Estate Section"],
  ["Hindustan Times", "News", "NCR", "https://www.hindustantimes.com/real-estate", "Real Estate Section"],
  ["Hindustan Times", "City News", "Noida", "https://www.hindustantimes.com/cities/noida-news", "City News"],
  ["Hindustan Times", "City News", "Faridabad", "https://www.hindustantimes.com/topic/faridabad/news", "City News"],
  ["Times of India", "City News", "Gurugram", "https://timesofindia.indiatimes.com/city/gurgaon", "City News"],
  ["Times of India", "City News", "Noida", "https://timesofindia.indiatimes.com/city/noida", "City News"],
  ["Times of India", "City News", "Faridabad", "https://timesofindia.indiatimes.com/city/faridabad", "City News"],
  ["Construction World", "News", "NCR", "https://www.constructionworld.in/latest-construction-news/real-estate-news", "Real Estate Section"],
  ["PropNewsTime", "News", "NCR", "https://propnewstime.com/", "Latest News"],
  ["RealtyNXT", "News", "NCR", "https://realtynxt.com/", "Latest News"],
  ["The Realty Today", "News", "NCR", "https://therealtytoday.com/news/trending/", "Latest News"],
  ["NIA", "Government", "Noida", "https://www.niairport.in/en/company/news/overview/news-overview", "Newsroom"],
  ["YEIDA", "Government", "Noida", "https://www.yamunaexpresswayauthority.com/web/announcement/", "Announcement"],
  ["HSVP", "Government", "Gurugram/Faridabad", "https://hsvphry.org.in/", "Announcement"],
  ["DLF", "Developer", "Gurugram", "https://www.dlf.in/media", "Media Centre"],
  ["Godrej Properties", "Developer", "NCR", "https://www.godrejproperties.com/media/press", "Press Release Archive"],
  ["BPTP", "Developer", "Faridabad/Gurugram", "https://www.bptp.com/media", "Media Centre"],
  ["M3M", "Developer", "Gurugram", "https://m3mindia.com/media", "Media Centre"],
  ["Smartworld", "Developer", "Gurugram", "https://smartworlddevelopers.com/media", "Media Centre"],
  ["Signature Global", "Developer", "Gurugram", "https://www.signatureglobal.in/", "Latest News"],
  ["Central Park", "Developer", "Gurugram", "https://www.centralpark.in/media.php", "Media Centre"],
  ["Emaar India", "Developer", "Gurugram", "https://www.emaarindia.com/media/", "Media Centre"],
  ["Max Estates", "Developer", "NCR", "https://maxestates.in/news_and_media", "Media Centre"],
  ["Birla Estates", "Developer", "NCR", "https://www.birlaestates.com/media-centre.aspx", "Media Centre"]
];

const blockedPathParts = [
  "/about",
  "/about-us",
  "/career",
  "/careers",
  "/contact",
  "/privacy",
  "/terms",
  "/project/",
  "/projects/",
  "/properties/",
  "/residential-project",
  "/commercial-project"
];

const allowedPathHints = [
  "announcement",
  "blog",
  "circular",
  "feed",
  "infrastructure",
  "insight",
  "investor",
  "latest",
  "market-report",
  "media",
  "news",
  "notification",
  "press",
  "property",
  "real-estate",
  "report",
  "research",
  "rss",
  "sitemap",
  "tender",
  "topic",
  "xml"
];

function normalizeUrl(value) {
  const url = new URL(value);
  url.hash = "";
  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCandidates() {
  const candidates = new Map();

  for (const [company, category, region, base] of seeds) {
    const baseUrl = new URL(base);
    for (const [type, path] of pageTypePaths) {
      const url = new URL(path, baseUrl.origin);
      candidates.set(normalizeUrl(url.toString()), { company, category, region, sourceName: company, url: normalizeUrl(url.toString()), urlType: type });
    }
  }

  for (const [company, category, region, url, type] of exactCandidates) {
    candidates.set(normalizeUrl(url), { company, category, region, sourceName: company, url: normalizeUrl(url), urlType: type });
  }

  return [...candidates.values()];
}

function inferType(url, fallback) {
  const path = new URL(url).pathname.toLowerCase();
  if (/rss|feed/.test(path)) return "RSS Feed";
  if (/sitemap/.test(path)) return "News Sitemap";
  if (/xml|atom/.test(path)) return "XML Feed";
  if (/tender/.test(path)) return "Tender";
  if (/circular/.test(path)) return "Circular";
  if (/notification/.test(path)) return "Notification";
  if (/announcement/.test(path)) return "Announcement";
  if (/investor/.test(path)) return "Investor News";
  if (/research|insight/.test(path)) return "Research";
  if (/report/.test(path)) return "Market Reports";
  if (/press/.test(path)) return "Press Release Archive";
  if (/media/.test(path)) return "Media Centre";
  if (/blog/.test(path)) return "Official Blog";
  if (/city|cities|gurugram|gurgaon|faridabad|noida/.test(path)) return "City News";
  if (/infrastructure/.test(path)) return "Infrastructure News";
  if (/property/.test(path)) return "Property Section";
  if (/real-estate|realty/.test(path)) return "Real Estate Section";
  if (/news/.test(path)) return "News Category";
  return fallback;
}

function isPotentialDynamicUrl(url, originalPath) {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  if (/\.(pdf|jpg|jpeg|png|webp|gif|svg|zip|docx?|xlsx?)$/i.test(path)) return false;
  if (blockedPathParts.some((part) => path.includes(part))) return false;
  if (path === "/" && originalPath !== "/") return false;
  if (path === "/") return true;
  return allowedPathHints.some((hint) => path.includes(hint));
}

function isAllowedRootSource(candidate) {
  return (
    candidate.category === "Local News" ||
    [
      "Construction World",
      "Economic Times Realty",
      "PropNewsTime",
      "RealtyNXT",
      "Realty Plus",
      "Ten News",
      "The Property Times",
      "The Realty Today"
    ].includes(candidate.sourceName) ||
    (candidate.sourceName === "HSVP" && candidate.urlType === "Announcement")
  );
}

async function fetchWithTimeout(url, timeoutMs = Number.parseInt(process.env.SOURCE_VERIFY_TIMEOUT_MS || "5500", 10)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent,
        Accept: "text/html,application/xhtml+xml,application/xml,text/xml,application/rss+xml,*/*;q=0.8"
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readSnippet(response, timeoutMs = 2500, maxBytes = 220000) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  const decoder = new TextDecoder();
  const timeout = setTimeout(() => reader.cancel().catch(() => {}), timeoutMs);

  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    // A timed-out body still leaves us with enough header/status evidence.
  } finally {
    clearTimeout(timeout);
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation after a complete body.
    }
  }

  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join("");
}

async function verify(candidate) {
  try {
    const original = new URL(candidate.url);
    const response = await fetchWithTimeout(candidate.url);
    const finalUrl = normalizeUrl(response.url);
    const final = new URL(finalUrl);
    const contentType = response.headers.get("content-type") || "";

    if (response.status !== 200) return null;
    if (final.origin !== original.origin) return null;
    if (final.pathname === "/" && !isAllowedRootSource(candidate)) return null;
    if (!isPotentialDynamicUrl(finalUrl, original.pathname.toLowerCase())) return null;
    if (/application\/pdf|image\//i.test(contentType)) return null;

    const isXml = /xml|rss|atom/i.test(contentType) || /\.(xml|rss|atom)$/i.test(final.pathname);
    const text = await readSnippet(response);
    const title = text.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, " ").trim() || "";
    const lower = `${final.pathname} ${title}`.toLowerCase();
    if (blockedPathParts.some((part) => lower.includes(part.replaceAll("/", "")))) return null;

    const type = inferType(finalUrl, candidate.urlType);
    return {
      ...candidate,
      url: finalUrl,
      urlType: type,
      rssAvailable: /rss|feed/i.test(final.pathname) || /rss/i.test(contentType) ? "Yes" : "Unknown",
      xmlAvailable: isXml ? "Yes" : "Unknown",
      updateFrequency: ["RSS Feed", "XML Feed", "Latest News", "News Category", "City News"].includes(type) ? "Daily/As Published" : "As Published",
      language: /amarujala|jagran|livehindustan|navbharat|abplive|tv9hindi|zeenews|punjabkesari/i.test(final.hostname) ? "Hindi" : "English",
      official: ["Government", "Developer", "Research"].includes(candidate.category) ? "Yes" : "Publisher",
      requiresJs: /__NEXT_DATA__|window\.__NUXT__|id="root"|id="__next"/i.test(text) ? "Maybe" : "No",
      pagination: /page\/2|page-2|load more|pagination|next page/i.test(text) ? "Likely" : "Unknown",
      statusCode: response.status,
      notes: isXml ? "Verified XML/RSS/sitemap source" : "Verified dynamic source page"
    };
  } catch {
    return null;
  }
}

async function run() {
  await fs.mkdir("data", { recursive: true });
  await fs.mkdir("reports", { recursive: true });
  const candidates = buildCandidates();
  const results = [];
  let index = 0;
  let completed = 0;
  const concurrency = Number.parseInt(process.env.SOURCE_VERIFY_CONCURRENCY || "32", 10);

  async function worker() {
    while (index < candidates.length) {
      const candidate = candidates[index++];
      const verified = await verify(candidate);
      completed += 1;
      if (verified && !results.some((item) => item.url === verified.url)) {
        results.push(verified);
      }
      if (completed % 100 === 0) {
        console.log(`checked=${completed}/${candidates.length} verified=${results.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  results.sort((a, b) => a.category.localeCompare(b.category) || a.company.localeCompare(b.company) || a.url.localeCompare(b.url));
  const rows = results.map((item, rowIndex) => ({
    ID: rowIndex + 1,
    Company: item.company,
    Category: item.category,
    "Sub Category": item.urlType,
    Region: item.region,
    "Source Name": item.sourceName,
    URL: item.url,
    "URL Type": item.urlType,
    "RSS Available": item.rssAvailable,
    "XML Available": item.xmlAvailable,
    "Update Frequency": item.updateFrequency,
    Language: item.language,
    Official: item.official,
    "Requires JS": item.requiresJs,
    Pagination: item.pagination,
    "Status Code": item.statusCode,
    Notes: item.notes
  }));

  const headers = Object.keys(rows[0] || {
    ID: "",
    Company: "",
    Category: "",
    "Sub Category": "",
    Region: "",
    "Source Name": "",
    URL: "",
    "URL Type": "",
    "RSS Available": "",
    "XML Available": "",
    "Update Frequency": "",
    Language: "",
    Official: "",
    "Requires JS": "",
    Pagination: "",
    "Status Code": "",
    Notes: ""
  });
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join("\n");
  await fs.writeFile("data/verified-dynamic-sources.csv", csv, "utf8");
  await fs.writeFile("reports/verified-dynamic-sources.json", JSON.stringify(rows, null, 2), "utf8");

  const byCategory = rows.reduce((acc, row) => {
    acc[row.Category] = (acc[row.Category] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify({
    candidateCount: candidates.length,
    verifiedCount: rows.length,
    byCategory,
    csv: "data/verified-dynamic-sources.csv",
    json: "reports/verified-dynamic-sources.json"
  }, null, 2));
}

run();
