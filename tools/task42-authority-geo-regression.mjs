import fs from "node:fs/promises";
import { workbookCityRules } from "../src/city-config.js";

process.env.ENABLED_CITY_CODES = workbookCityRules.map((rule) => rule.code).join(",");
const { classifyArticle, detectCityCodes, isNegativeNews } = await import("../src/index.js");

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ""; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== '\r') cell += c;
  }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}

const rows = parseCsv(await fs.readFile("reports/source-audits/task22/task22-multilingual-editorial-review-audited.csv", "utf8"));
const makeArticle = (row) => ({
  title: row.TITLE_ORIGINAL,
  description: row.DESCRIPTION_ORIGINAL,
  articleText: row.SHORT_EVIDENCE_SNIPPET,
  newsLink: row.URL,
  sourceUrl: row.URL,
  publishedAt: row.DATE,
  createdAt: row.DATE,
  fullArticleRead: true,
  articleReadAttempted: true,
  thumbnailImage: "https://example.test/task42.jpg",
  postedBy: row.SOURCE,
  postedByLogo: "https://example.test/logo.jpg",
  isActive: true,
  sourceCityCodes: []
});
const expected = new Map([
  ["task22-022", "hyderabad"],
  ["task22-021", "hyderabad"],
  ["task22-001", "new_delhi"],
  ["task22-002", "new_delhi"]
]);
for (const [id, city] of expected) {
  const row = rows.find((candidate) => candidate.RECORD_ID === id);
  if (!row) throw new Error(`Missing regression fixture ${id}`);
  const article = makeArticle(row);
  const routes = detectCityCodes(article);
  if (!routes.includes(city)) throw new Error(`${id}: expected ${city}, got ${routes.join("|") || "NO_CITY"}`);
  if (isNegativeNews(article)) throw new Error(`${id}: incorrectly classified as negative`);
  if (["reject_relevance", "reject_negative"].includes(classifyArticle(article))) throw new Error(`${id}: rejected as ${classifyArticle(article)}`);
}
for (const id of ["task22-011", "task22-013"]) {
  const row = rows.find((candidate) => candidate.RECORD_ID === id);
  if (!isNegativeNews(makeArticle(row))) throw new Error(`${id}: negative regression was not protected`);
}
console.log(JSON.stringify({ passed: true, recoveredAuthorityEvents: [...expected.keys()], protectedNegativeControls: ["task22-011", "task22-013"] }, null, 2));
