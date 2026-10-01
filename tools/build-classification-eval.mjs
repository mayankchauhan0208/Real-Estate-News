import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyArticle } from "../src/index.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(rootDir, "reports", "source-audits", "targeted");
const inputFiles = ["rera-date-v2.jsonl", "regional-date-v2.jsonl"];
const outputPath = path.join(targetDir, "classification-evaluation.jsonl");
const summaryPath = path.join(targetDir, "classification-evaluation-summary.json");

function lines(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function isNegative(text) { return /fraud|cheat|complaint|court|delay|cancel|demolition|protest|crime|death|accident|dispute|penalty|stalled|धोखाधड़ी|शिकायत|अदालत|देरी|रद्द|विरोध|अपराध|मौत|दुर्घटना/u.test(text); }
function isNavigation(text, title, link) {
  return /(^home\b|all india forum|login|contact us|about us|about k-reat|form and manner|filing appeals|skip to main|skip_main|terms and conditions|view all|show more|read more)/i.test(`${title} ${text.slice(0, 1200)}`) && !/\b(order|notice|circular|judgment|press release|registration|approval|project)\b/i.test(`${title} ${link}`);
}
function reraType(text, title) {
  const value = `${title} ${text.slice(0, 5000)}`;
  if (/suo ?motu/i.test(value)) return ["SUO_MOTU", "title/body contains suo motu"];
  if (/reat|real estate appellate tribunal/i.test(value)) return ["REAT", "REAT terminology"];
  if (/judg(e)?ment|निर्णय/u.test(value)) return ["JUDGMENT", "judgment terminology"];
  if (/order|आदेश/u.test(value)) return ["ORDER", "order terminology"];
  if (/circular|परिपत्र/u.test(value)) return ["CIRCULAR", "circular terminology"];
  if (/press release|प्रेस रिलीज़|प्रेस विज्ञप्ति/u.test(value)) return ["PRESS_RELEASE", "press release terminology"];
  if (/project registration|registered project|परियोजना पंजीकरण/u.test(value)) return ["PROJECT_REGISTRATION", "registration terminology"];
  if (/approval|approved|मंजूरी|अनुमोदन/u.test(value)) return ["PROJECT_APPROVAL", "approval terminology"];
  if (/notice|public notice|सूचना|नोटिस/u.test(value)) return ["NOTICE", "notice terminology"];
  return ["OTHER", "no specific RERA record type signal"];
}
function recordLabel(record, kind) {
  const title = lines(record.articles?.[0]?.title || "");
  const text = lines(record.articles?.[0]?.text || "");
  const link = record.articles?.[0]?.link || record.source;
  const evidence = `${title} ${text.slice(0, 5000)}`;
  if (!text || record.articles?.[0]?.state !== "ARTICLE_OK") return ["INSUFFICIENT_CONTENT", "article not fully readable", "low"];
  if (kind === "rera") {
    if (isNavigation(text, title, link)) return ["NAVIGATION_INDEX", "navigation/index language dominates", "high"];
    const official = /^https?:\/\/(?:www\.)?(?:rera\.|.*-rera\.|up-rera|hprera|ukrera|aiforera)/i.test(recordSource(link));
    if (!official) {
      return isNegative(evidence) ? ["NEGATIVE_REJECT", "third-party RERA report with negative signal", "high"] : ["UNCERTAIN", "third-party RERA reporting", "low"];
    }
    const [type, reason] = reraType(text, title);
    if (type !== "OTHER") return ["VALID_RERA_OFFICIAL", reason, "medium"];
    if (isNegative(evidence) && !/order|judgment|notice|circular/i.test(evidence)) return ["NEGATIVE_REJECT", "negative/consumer-distress signal", "medium"];
    return ["UNCERTAIN", "official source but no specific record signal", "low"];
  }
  if (isNegative(evidence)) return ["NEGATIVE_REJECT", "negative signal", "medium"];
  if (/real estate|realty|property|housing|residential|commercial|project|developer|builder|land|plot|township|metro|expressway|airport|infrastructure|रियल|प्रॉपर्टी|आवास|जमीन|परियोजना|निर्माण|मेट्रो|एक्सप्रेसवे/u.test(evidence)) return ["VALID_REGIONAL_REAL_ESTATE", "real-estate signal in original content", "medium"];
  return ["IRRELEVANT", "no supported real-estate signal", "medium"];
}
function recordSource(link) { try { return new URL(link).hostname; } catch { return ""; } }
function pass(result) { return !["unclassified", "reject_negative", "reject_relevance", "reject_outside_region", "reject_outside_city"].includes(result); }

async function main() {
  const records = [];
  for (const file of inputFiles) {
    const kind = file.startsWith("rera") ? "rera" : "regional";
    const content = await fs.readFile(path.join(targetDir, file), "utf8");
    for (const line of content.split(/\r?\n/).filter(Boolean)) {
      const source = JSON.parse(line);
      for (const article of source.articles || []) {
        const title = lines(article.title);
        const text = lines(article.text);
        const description = text.slice(0, 500);
        const base = { title, description, articleText: text, newsLink: article.link, sourceUrl: source.source, publishedAt: article.date };
        const titleOnly = classifyArticle({ ...base, description: "", articleText: "" });
        const titleDescription = classifyArticle({ ...base, articleText: "" });
        const fullText = classifyArticle(base);
        const [reviewLabel, reviewReason, confidence] = recordLabel({ ...source, articles: [article] }, kind);
        const [recordType, recordEvidence] = kind === "rera" ? reraType(`${title} ${text}`, title) : ["NOT_RERA", "regional source"];
        records.push({
          sourceType: kind,
          source: source.source,
          url: article.link,
          title,
          description,
          diagnosticExcerpt: text.slice(0, 3000),
          language: article.language || "unknown",
          date: article.date || "",
          dateSource: article.dateSource || "",
          geoEvidence: article.geo || [],
          currentClassifier: article.relevance || "unclassified",
          titleOnly,
          titleDescription,
          fullText,
          reviewLabel,
          reviewReason,
          confidence,
          recordType,
          recordEvidence
        });
      }
    }
  }
  await fs.writeFile(outputPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  const summarize = (kind) => {
    const items = records.filter((record) => record.sourceType === kind);
    const valid = items.filter((record) => ["VALID_RERA_OFFICIAL", "VALID_REGIONAL_REAL_ESTATE"].includes(record.reviewLabel));
    const matrix = {
      validAndPass: valid.filter((record) => pass(record.fullText)).length,
      validAndReject: valid.filter((record) => !pass(record.fullText)).length,
      invalidAndPass: items.filter((record) => !valid.includes(record) && pass(record.fullText)).length,
      invalidAndReject: items.filter((record) => !valid.includes(record) && !pass(record.fullText)).length
    };
    return { sampleSize: items.length, labels: Object.fromEntries([...new Set(items.map((item) => item.reviewLabel))].map((label) => [label, items.filter((item) => item.reviewLabel === label).length])), matrix, titlePass: items.filter((item) => pass(item.titleOnly)).length, titleDescriptionPass: items.filter((item) => pass(item.titleDescription)).length, fullTextPass: items.filter((item) => pass(item.fullText)).length, recordTypes: kind === "rera" ? Object.fromEntries([...new Set(items.map((item) => item.recordType))].map((type) => [type, items.filter((item) => item.recordType === type).length])) : {} };
  };
  const summary = { generatedAt: new Date().toISOString(), total: records.length, rera: summarize("rera"), regional: summarize("regional"), note: "Labels are conservative diagnostic triage and require human review before classifier changes." };
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
