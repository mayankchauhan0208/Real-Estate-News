import * as cheerio from "cheerio";

const SHELL_SELECTORS = [
  "script", "style", "noscript", "template", "svg", "nav", "header", "footer", "aside",
  "form", "dialog", "[role='navigation']", "[role='banner']", "[role='contentinfo']",
  ".advertisement", ".ad-container", ".ads", ".newsletter", ".related-news", ".recommended",
  ".read-more", ".social-share", ".share-tools", ".comments", ".cookie", ".popup", ".modal"
];

const FAMILY_SELECTORS = {
  "realty.economictimes.indiatimes.com": [".article-section__body__news", ".detail_synopsis", ".article-body", ".article-content", ".story-content", ".detail-content", "[itemprop='articleBody']"],
  "infra.economictimes.indiatimes.com": [".article-section__body__news", ".detail_synopsis", ".article-body", ".article-content", ".story-content", ".detail-content", "[itemprop='articleBody']"],
  "www.hindustantimes.com": [".story-details", ".story-content", ".article-content", "[itemprop='articleBody']", "article"]
};

function normalized(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function familySelectors(url) { return FAMILY_SELECTORS[hostOf(url)] || []; }
function wordSet(value) { return new Set(normalized(value).toLowerCase().split(/\W+/u).filter((word) => word.length > 3)); }
function aliasMatches(text, alias) {
  const value = normalized(alias);
  if (!value) return false;
  if (/^[\x00-\x7F]+$/u.test(value)) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  }
  return text.includes(value.toLowerCase());
}

function removeShell($, root) {
  const scope = root ? $(root) : $("body");
  scope.find(SHELL_SELECTORS.join(",")).remove();
  if (scope.is(SHELL_SELECTORS.join(","))) scope.remove();
  return normalized(scope.text());
}

function textBlocks($, root) {
  const scope = root ? $(root) : $("body");
  return scope.find("p, h2, h3, li").map((_, element) => normalized($(element).text())).get().filter((value) => value.length >= 25);
}

function jsonLdNodes($) {
  const nodes = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    nodes.push(value);
    Object.values(value).forEach(visit);
  };
  $("script[type='application/ld+json']").each((_, element) => {
    try { visit(JSON.parse($(element).text())); } catch {}
  });
  return nodes;
}

function structuredArticle($) {
  const nodes = jsonLdNodes($).filter((node) => typeof node.articleBody === "string" && normalized(node.articleBody).length >= 160);
  const node = nodes.sort((a, b) => normalized(b.articleBody).length - normalized(a.articleBody).length)[0];
  if (!node) return null;
  return { text: normalized(node.articleBody), headline: normalized(node.headline), description: normalized(node.description), date: node.datePublished || node.dateCreated || "", source: "JSON_LD_ARTICLE_BODY" };
}

function scoreCandidate($, root, title) {
  const text = removeShell($, root);
  const blocks = textBlocks($, root);
  const words = wordSet(text);
  const titleWords = wordSet(title);
  const overlap = [...titleWords].filter((word) => words.has(word)).length;
  const navHits = (text.match(/\b(login|subscribe|advertise|home|menu|search|follow us|view all news)\b/gi) || []).length;
  const score = Math.min(text.length, 12000) + blocks.length * 120 + overlap * 80 - navHits * 90;
  return { text, blocks, score, navHits, overlap };
}

function geoProvenance(text, rules) {
  const haystack = normalized(text).toLowerCase();
  const evidence = [];
  for (const rule of rules || []) {
    for (const alias of [rule.name, rule.code, ...(rule.keywords || [])].filter(Boolean)) {
      const value = normalized(alias);
      if (!value || !aliasMatches(haystack, value)) continue;
      const lower = value.toLowerCase();
      let type = "BODY_EXPLICIT_CITY";
      if (/expressway|corridor|highway|airport|road/.test(lower)) type = "CORRIDOR_RELATION";
      else if (/sector|township|industrial|park|extension/.test(lower)) type = "LOCALITY_ALIAS";
      else if (/authority|dda|yeida|rera/.test(lower)) type = "AUTHORITY_JURISDICTION";
      evidence.push({ type, matchedText: value, normalizedPlace: lower, candidateCity: rule.code, confidence: value.toLowerCase() === String(rule.name).toLowerCase() ? "high" : "medium" });
    }
  }
  return [...new Map(evidence.map((item) => [`${item.candidateCity}:${item.normalizedPlace}`, item])).values()];
}

export function extractArticleEvidence(html, { url = "", title = "", description = "", cityRules = [] } = {}) {
  const $ = cheerio.load(String(html || ""));
  const structured = structuredArticle($);
  const selectors = ["article", "[itemprop='articleBody']", ...familySelectors(url), ".article-body", ".article-content", ".story-content", ".story-details", "main"];
  const candidates = [];
  for (const selector of [...new Set(selectors)]) {
    $(selector).each((_, element) => {
      const scored = scoreCandidate($, element, title);
      const selectorPriority = selector === "main" ? -2500 : selector.includes("article-section") ? 900 : selector === "article" ? 500 : 0;
      if (scored.text.length >= 120) candidates.push({ selector, ...scored, score: scored.score + selectorPriority });
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const chosen = structured && structured.text.length >= Math.max(160, (best?.text.length || 0) * 0.55)
    ? { text: structured.text, selector: "JSON_LD_ARTICLE_BODY", source: structured.source, blocks: structured.text.split(/(?<=[.!?])\s+/u).filter((part) => part.length >= 25), score: structured.text.length, navHits: 0, overlap: [...wordSet(title)].filter((word) => structured.text.toLowerCase().includes(word)).length, structured }
    : best ? { ...best, source: "SEMANTIC_HTML" } : null;
  const combined = normalized([title, description, chosen?.text || ""].join(" "));
  const reasons = [];
  if (!chosen) reasons.push("ARTICLE_SELECTOR_MISSING");
  else {
    if (chosen.source === "JSON_LD_ARTICLE_BODY") reasons.push("JSON_LD_USED");
    if (chosen.source === "SEMANTIC_HTML" && chosen.selector === "main") reasons.push("MAIN_FALLBACK");
    if (chosen.navHits > 2) reasons.push("SHELL_DENSITY_HIGH");
    if (chosen.text.length < 240) reasons.push("BODY_PRESENT_BUT_LOW_SIGNAL");
    if (chosen.overlap === 0 && title) reasons.push("TITLE_OVERLAP_MISSING");
  }
  const sentenceCount = chosen ? (chosen.text.match(/[.!?।॥]+/gu) || []).length : 0;
  const quality = chosen && chosen.text.length >= 240 && (chosen.blocks.length >= 3 || sentenceCount >= 3) && chosen.navHits <= 2 && chosen.overlap >= 1;
  if (!quality && chosen) reasons.push("QUALITY_GATE_FAILED");
  const image = $("meta[property='og:image'], meta[name='twitter:image'], article img, main img").first();
  const articleTitle = normalized(chosen?.structured?.headline || title || $("h1").first().text() || $("title").text());
  const articleDescription = normalized(chosen?.structured?.description || description || $("meta[name='description']").attr("content"));
  const geo = geoProvenance([articleTitle, articleDescription, chosen?.text || ""].join(" "), cityRules);
  return {
    title: articleTitle,
    description: articleDescription,
    text: chosen?.text || "",
    textLength: chosen?.text?.length || 0,
    readable: Boolean(quality),
    qualityReasonCodes: [...new Set(reasons.length ? reasons : ["QUALITY_GATE_PASS"])],
    extractionSource: chosen?.source || "NONE",
    selectedSelector: chosen?.selector || "",
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 8).map(({ selector, text: value, score, blocks: blockValues, navHits, overlap }) => ({ selector, textLength: value.length, score, blockCount: blockValues.length, navHits, titleOverlap: overlap })),
    thumbnail: Boolean(image.attr("content") || image.attr("src")),
    geoEvidence: geo,
    evidenceText: combined.slice(0, 24000)
  };
}

export const task19ShellSelectors = SHELL_SELECTORS;
