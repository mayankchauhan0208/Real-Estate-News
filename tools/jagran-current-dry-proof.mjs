import fs from "node:fs";
import {
  fetchSource,
  getArticleFinalState,
  getRejectionReasons,
  isPublishableArticle
} from "../src/index.js";

const settings = JSON.parse(fs.readFileSync("config/admin-settings.json", "utf8"));
const sourceIds = new Set([
  "regional-jagran-gurugram", "regional-jagran-lucknow", "regional-jagran-noida",
  "regional-jagran-ghaziabad", "regional-jagran-kanpur", "regional-jagran-varanasi",
  "regional-jagran-agra", "regional-jagran-meerut", "regional-jagran-prayagraj"
]);
const sources = settings.manualSources.filter((source) => sourceIds.has(source.id));
if (sources.length !== sourceIds.size) throw new Error(`Expected ${sourceIds.size} Jagran sources, found ${sources.length}`);

const records = [];
for (const source of sources) {
  try {
    const articles = await fetchSource(source.url);
    for (const article of articles) {
      const scoped = { ...article, sourceUrl: source.url, sourceMode: source.sourceMode, regionalSource: true };
      const reasons = getRejectionReasons(scoped, new Set());
      records.push({
        sourceId: source.id,
        title: scoped.title,
        url: scoped.newsLink,
        city: scoped.cityCode,
        readable: scoped.fullArticleRead === true,
        articleTextLength: String(scoped.articleText || "").length,
        state: getArticleFinalState(scoped, reasons),
        publishable: isPublishableArticle(scoped, new Set()),
        reasons
      });
    }
  } catch (error) {
    records.push({ sourceId: source.id, fetchError: String(error?.message || error) });
  }
}

const publishable = records.filter((record) => record.publishable);
console.log(JSON.stringify({
  dryRun: true,
  apiPosting: false,
  sources: sources.length,
  links: records.filter((record) => record.url).length,
  readable: records.filter((record) => record.readable).length,
  rejected: records.filter((record) => record.url && !record.publishable).length,
  fetchErrors: records.filter((record) => record.fetchError).length,
  wouldPublish: publishable.length,
  candidates: publishable,
  records
}, null, 2));
