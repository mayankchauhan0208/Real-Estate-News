import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { classifyArticle, isNegativeNews } from "../src/index.js";
import { workbookCityRules } from "../src/city-config.js";
import { extractArticleEvidence } from "./article-body-extractor.mjs";

const root = process.cwd();
const inputPath = path.join(root, "reports/source-audits/task17/editorial-review-audited-v2.csv");
const outDir = path.join(root, "reports/source-audits/task19");
const maxBytes = Number(process.env.TASK19_MAX_BODY_BYTES || 750_000);
const timeoutMs = Number(process.env.TASK19_ARTICLE_TIMEOUT_MS || 7000);
const concurrency = Number(process.env.TASK19_CONCURRENCY || 6);
const userAgent = "Mozilla/5.0 BrokketTask19LocalEvidence/1.0";

function parseCsv(text) {
  const rows = []; let row = []; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift() || [];
  return rows.filter((values) => values.some(Boolean)).map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}
function csvCell(value) { const text = String(value ?? ""); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
function writeCsv(rows, columns) { return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n") + "\r\n"; }
function hostOf(url) { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } }
function familyOf(url) { const host = hostOf(url); if (host.includes("economictimes")) return host.includes("infra.") ? "ET_INFRA" : "ET_REALTY"; if (host.includes("hindustantimes")) return "HINDUSTAN_TIMES"; return host || "OTHER"; }
function cleanText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function beforeQuality(row) {
  const snippet = row.EXTRACTED_TEXT_SNIPPET || "";
  if (!snippet || snippet.length < 120) return "INSUFFICIENT_CONTENT";
  if (/function\s*\(|document\.|querySelector|var\s+[A-Za-z_$]+\s*=|window\./i.test(snippet)) return "JAVASCRIPT_CONTAMINATED";
  if (/Login\s+Get\s+App|View\s+all\s+News|Advertise\s+With\s+Us|Subscribe\s+to\s+our\s+RSS/i.test(snippet)) return "NAVIGATION_CONTAMINATED";
  if (/404|page not found|error occurred|maintenance/i.test(`${row.TITLE} ${snippet}`)) return "ERROR_PAGE";
  return "CLEAN_ARTICLE";
}
function cityCodeForName(name) { const value = cleanText(name).toLowerCase(); return workbookCityRules.find((rule) => [rule.name, rule.code, ...(rule.keywords || [])].filter(Boolean).some((alias) => cleanText(alias).toLowerCase() === value))?.code || ""; }
function authoritativeLabels(rows) { return rows.reduce((map, row) => { map[row.HUMAN_LABEL] = (map[row.HUMAN_LABEL] || 0) + 1; return map; }, {}); }
function firstLoss(row, after) {
  if (after.wouldPublish) return { primary: "NONE", reason: "Recovered chain would publish." };
  if (!after.readable) return { primary: "EXTRACTION", reason: after.qualityReasonCodes.join(",") || "Article body failed quality gate." };
  if (after.relevance !== "PASS") return { primary: "RELEVANCE", reason: after.relevanceReason || after.relevance };
  if (after.negative === "REJECT_NEGATIVE") return { primary: "NEGATIVE_FILTER", reason: "Existing negative policy rejected the record." };
  if (!after.geoCodes.length) return { primary: "GEO", reason: "No article-level city evidence reached routing." };
  return { primary: "OTHER", reason: "Record remained non-publishable after bounded recovery." };
}

async function boundedFetch(url) {
  const controller = new AbortController(); const started = Date.now(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8", "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8" } });
    const reader = response.body?.getReader(); const decoder = new TextDecoder(); const chunks = []; let size = 0;
    if (reader) { while (size < maxBytes) { const part = await Promise.race([reader.read(), new Promise((_, reject) => setTimeout(() => reject(new Error("body timeout")), timeoutMs))]); if (part.done) break; const value = part.value || new Uint8Array(); const remaining = maxBytes - size; const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value; chunks.push(decoder.decode(chunk, { stream: true })); size += chunk.byteLength; if (chunk.byteLength < value.byteLength) break; } chunks.push(decoder.decode()); await reader.cancel().catch(() => {}); }
    return { ok: response.ok, status: response.status, finalUrl: response.url, contentType: response.headers.get("content-type") || "", html: chunks.join(""), truncated: size >= maxBytes, elapsedMs: Date.now() - started, error: "" };
  } catch (error) { return { ok: false, status: 0, finalUrl: "", contentType: "", html: "", truncated: false, elapsedMs: Date.now() - started, error: controller.signal.aborted ? `TIMEOUT_${timeoutMs}MS` : String(error.message || error) }; }
  finally { clearTimeout(timer); }
}

async function mapConcurrent(rows, worker) {
  const results = new Array(rows.length); let next = 0;
  async function run() { while (true) { const index = next; next += 1; if (index >= rows.length) return; results[index] = await worker(rows[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, run)); return results;
}

const audited = parseCsv(await fs.readFile(inputPath, "utf8"));
if (audited.length !== 69) throw new Error(`Expected 69 audited rows, found ${audited.length}`);
if (new Set(audited.map((row) => row.RECORD_ID)).size !== audited.length) throw new Error("Duplicate audited record IDs");
const expected = { PUBLISH: 2, REJECT_NEGATIVE: 15, REJECT_OFF_TOPIC: 29, REJECT_INSUFFICIENT: 23, REVIEW_UNCERTAIN: 0 };
const labels = authoritativeLabels(audited); for (const [key, value] of Object.entries(expected)) if ((labels[key] || 0) !== value) throw new Error(`Label drift ${key}: ${labels[key] || 0} != ${value}`);
for (const key of Object.keys(expected)) labels[key] ||= 0;
await fs.mkdir(outDir, { recursive: true });

const fetchStarted = Date.now();
const fetched = await mapConcurrent(audited, async (row) => ({ row, transport: await boundedFetch(row.URL) }));
const results = fetched.map(({ row, transport }) => {
  const before = { extractionQuality: beforeQuality(row), readable: row.CURRENT_FINAL_STATE !== "QUALITY" && row.CURRENT_FINAL_STATE !== "UNREADABLE", relevance: row.CURRENT_RELEVANCE_RESULT, negative: row.CURRENT_NEGATIVE_RESULT, geoCodes: row.CURRENT_CITY ? [cityCodeForName(row.CURRENT_CITY)] : [], wouldPublish: row.CURRENT_FINAL_STATE === "WOULD_PUBLISH" };
  let evidence;
  if (transport.ok && /html|xhtml|text\//i.test(transport.contentType)) evidence = extractArticleEvidence(transport.html, { url: row.URL, title: row.TITLE, description: row.DESCRIPTION, cityRules: workbookCityRules });
  else evidence = { title: row.TITLE, description: row.DESCRIPTION, text: row.EXTRACTED_TEXT_SNIPPET, textLength: (row.EXTRACTED_TEXT_SNIPPET || "").length, readable: false, qualityReasonCodes: [transport.error || `HTTP_${transport.status || "NO_RESPONSE"}`, "FROZEN_EVIDENCE_FALLBACK"], extractionSource: "FROZEN_AUDIT_SNIPPET", selectedSelector: "", candidateCount: 0, thumbnail: false, geoEvidence: [], evidenceText: row.EXTRACTED_TEXT_SNIPPET };
  const extractedText = cleanText([evidence.title, evidence.description, evidence.text].join(" "));
  const relevance = evidence.readable ? classifyArticle({ title: evidence.title || row.TITLE, description: evidence.description, articleText: evidence.text, newsLink: row.URL, sourceUrl: row.SOURCE, publishedAt: row.PUBLISHED_DATE }) : "unreadable";
  const negative = evidence.readable && isNegativeNews({ title: evidence.title || row.TITLE, description: evidence.description, articleText: evidence.text, newsLink: row.URL, sourceUrl: row.SOURCE, publishedAt: row.PUBLISHED_DATE }) ? "REJECT_NEGATIVE" : "PASS";
  const geoCodes = [...new Set((evidence.geoEvidence || []).map((item) => item.candidateCity).filter(Boolean))];
  const relevancePass = !["unclassified", "reject_relevance", "unreadable"].includes(relevance);
  const after = { readable: evidence.readable, relevance, negative, geoCodes, relevancePass, wouldPublish: evidence.readable && relevancePass && negative !== "REJECT_NEGATIVE" && geoCodes.length > 0, qualityReasonCodes: evidence.qualityReasonCodes, extractionSource: evidence.extractionSource, selectedSelector: evidence.selectedSelector, title: evidence.title, textLength: evidence.textLength, transport, geoEvidence: evidence.geoEvidence, thumbnail: evidence.thumbnail, extractedText };
  after.firstLoss = firstLoss(row, after);
  return { row, before, after, family: familyOf(row.URL), transport, evidence };
});

const publishTraces = results.filter((item) => item.row.HUMAN_LABEL === "PUBLISH").map(({ row, before, after, family }) => ({ recordId: row.RECORD_ID, title: row.TITLE, humanCity: row.HUMAN_CITY, url: row.URL, sourceFamily: family, before: { extractionQuality: before.extractionQuality, firstLoss: row.CURRENT_FINAL_STATE === "NO_GEO" ? "GEO" : "EXTRACTION" }, after: { extractionSource: after.extractionSource, qualityReasonCodes: after.qualityReasonCodes, geoEvidence: after.geoEvidence, routedCities: after.geoCodes, relevance: after.relevance, negative: after.negative, wouldPublish: after.wouldPublish, firstLoss: after.firstLoss } }));
const nonPublish = results.filter((item) => item.row.HUMAN_LABEL !== "PUBLISH");
const tp = results.filter((item) => item.row.HUMAN_LABEL === "PUBLISH" && item.after.wouldPublish).length;
const fp = nonPublish.filter((item) => item.after.wouldPublish).length;
const tn = nonPublish.length - fp;
const fn = results.filter((item) => item.row.HUMAN_LABEL === "PUBLISH" && !item.after.wouldPublish).length;
const confusion = { TP: tp, FP: fp, TN: tn, FN: fn, unresolved: results.filter((item) => item.after.firstLoss.primary === "OTHER").length, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, specificity: tn + fp ? tn / (tn + fp) : null };
const mechanisms = {};
for (const item of results) { const key = item.before.extractionQuality === "JAVASCRIPT_CONTAMINATED" ? (item.after.extractionSource === "JSON_LD_ARTICLE_BODY" ? "JSON_LD_NOT_USED" : "SCRIPT_TEXT_INCLUDED") : item.before.extractionQuality === "NAVIGATION_CONTAMINATED" ? "SITE_SHELL_SELECTED" : item.before.extractionQuality; mechanisms[key] ||= { count: 0, labels: {}, recoveryPossible: 0, sourceFamilies: new Set() }; mechanisms[key].count += 1; mechanisms[key].labels[item.row.HUMAN_LABEL] = (mechanisms[key].labels[item.row.HUMAN_LABEL] || 0) + 1; mechanisms[key].recoveryPossible += Number(item.after.readable); mechanisms[key].sourceFamilies.add(item.family); }
const mechanismReport = Object.fromEntries(Object.entries(mechanisms).map(([key, value]) => [key, { ...value, sourceFamilies: [...value.sourceFamilies] }]));
const rowsCsv = results.map(({ row, before, after, family }) => ({ RECORD_ID: row.RECORD_ID, SOURCE: row.SOURCE, SOURCE_FAMILY: family, TITLE: row.TITLE, HUMAN_LABEL: row.HUMAN_LABEL, HUMAN_CITY: row.HUMAN_CITY, BEFORE_EXTRACTION: before.extractionQuality, BEFORE_FINAL_STATE: row.CURRENT_FINAL_STATE, AFTER_EXTRACTION: after.extractionSource, AFTER_REASON_CODES: after.qualityReasonCodes.join("|"), AFTER_TEXT_LENGTH: after.textLength, AFTER_RELEVANCE: after.relevance, AFTER_NEGATIVE: after.negative, AFTER_GEO_CODES: after.geoCodes.join("|"), AFTER_FIRST_LOSS: after.firstLoss.primary, AFTER_WOULD_PUBLISH: after.wouldPublish ? "YES" : "NO", TRANSPORT_STATUS: after.transport.status, TRANSPORT_ERROR: after.transport.error, TRANSPORT_ELAPSED_MS: after.transport.elapsedMs }));
const columns = Object.keys(rowsCsv[0]);
await fs.writeFile(path.join(outDir, "task19-before-after.csv"), writeCsv(rowsCsv, columns));
await fs.writeFile(path.join(outDir, "task19-publish-traces.json"), JSON.stringify(publishTraces, null, 2) + "\n");
const diagnostics = { total: results.length, transport: { attempted: results.length, ok: results.filter((item) => item.transport.ok).length, failed: results.filter((item) => !item.transport.ok).length, timeouts: results.filter((item) => item.transport.error.startsWith("TIMEOUT_")).length, statuses: Object.fromEntries([...new Set(results.map((item) => item.transport.status))].map((status) => [String(status), results.filter((item) => item.transport.status === status).length])) }, mechanisms: mechanismReport, extractionSources: Object.fromEntries([...new Set(results.map((item) => item.after.extractionSource))].map((key) => [key, results.filter((item) => item.after.extractionSource === key).length])), reasonCodes: Object.fromEntries([...new Set(results.flatMap((item) => item.after.qualityReasonCodes))].map((key) => [key, results.filter((item) => item.after.qualityReasonCodes.includes(key)).length])) };
await fs.writeFile(path.join(outDir, "task19-extraction-diagnostics.json"), JSON.stringify(diagnostics, null, 2) + "\n");
const geoRows = results.flatMap(({ row, after }) => after.geoEvidence.map((evidence) => ({ recordId: row.RECORD_ID, humanLabel: row.HUMAN_LABEL, title: row.TITLE, type: evidence.type, matchedText: evidence.matchedText, normalizedPlace: evidence.normalizedPlace, candidateCity: evidence.candidateCity, confidence: evidence.confidence })));
const holdout = results.filter(({ row }) => row.HUMAN_LABEL !== "PUBLISH").filter((item, index) => index % 7 === 0).slice(0, 12).map(({ row, family, after }) => ({ recordId: row.RECORD_ID, family, humanLabel: row.HUMAN_LABEL, title: row.TITLE, readable: after.readable, wouldPublish: after.wouldPublish, firstLoss: after.firstLoss.primary }));
const generalization = { method: "Deterministic non-positive holdout: every seventh audited non-positive record, capped at 12; no positive row or URL-specific rule used to design extraction.", holdout, sourceFamilies: [...new Set(holdout.map((item) => item.family))], falsePositives: holdout.filter((item) => item.wouldPublish).length, allNonPositiveFalsePositives: fp };
await fs.writeFile(path.join(outDir, "task19-generalization.json"), JSON.stringify(generalization, null, 2) + "\n");
const elapsed = results.map((item) => item.transport.elapsedMs).sort((a, b) => a - b); const percentile = (values, p) => values.length ? values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] : 0;
const runtime = { bounded: true, timeoutMs, maxBodyBytes: maxBytes, concurrency, totalElapsedMs: Date.now() - fetchStarted, requests: results.length, articleFetches: results.length, fallbacks: results.filter((item) => item.after.extractionSource === "FROZEN_AUDIT_SNIPPET").length, jsonLdUses: results.filter((item) => item.after.extractionSource === "JSON_LD_ARTICLE_BODY").length, semanticHtmlUses: results.filter((item) => item.after.extractionSource === "SEMANTIC_HTML").length, averageElapsedMs: elapsed.length ? Math.round(elapsed.reduce((a, b) => a + b, 0) / elapsed.length) : 0, p95ElapsedMs: percentile(elapsed, 0.95), maxObservedBodyBytes: Math.max(0, ...results.map((item) => item.transport.html.length)), cache: "none; deterministic one-pass replay", failures: diagnostics.transport.failed };
await fs.writeFile(path.join(outDir, "task19-runtime.json"), JSON.stringify(runtime, null, 2) + "\n");
const report = { reportType: "TASK19_EVIDENCE_RECOVERY", generatedAt: new Date().toISOString(), localOnly: true, input: path.relative(root, inputPath), freeze: { records: 69, labelCounts: labels, noProductionMutation: true }, before: { currentPipelineWouldPublish: results.filter((item) => item.before.wouldPublish).length, TP: 0, FP: 0, TN: 67, FN: 2, extractionContaminated: results.filter((item) => ["JAVASCRIPT_CONTAMINATED", "NAVIGATION_CONTAMINATED"].includes(item.before.extractionQuality)).length }, after: { confusion, labelProtection: { negativeTotal: 15, negativeWouldPublish: nonPublish.filter((item) => item.row.HUMAN_LABEL === "REJECT_NEGATIVE" && item.after.wouldPublish).length, offTopicWouldPublish: nonPublish.filter((item) => item.row.HUMAN_LABEL === "REJECT_OFF_TOPIC" && item.after.wouldPublish).length, insufficientWouldPublish: nonPublish.filter((item) => item.row.HUMAN_LABEL === "REJECT_INSUFFICIENT" && item.after.wouldPublish).length }, recoveredPublishRecords: results.filter((item) => item.row.HUMAN_LABEL === "PUBLISH" && item.after.wouldPublish).map((item) => item.row.RECORD_ID), firstLossCounts: Object.fromEntries([...new Set(results.map((item) => item.after.firstLoss.primary))].map((key) => [key, results.filter((item) => item.after.firstLoss.primary === key).length])) }, diagnostics: "task19-extraction-diagnostics.json", geoEvidence: { types: [...new Set(geoRows.map((item) => item.type))], matchedRows: geoRows }, generalization: "task19-generalization.json", runtime: "task19-runtime.json", reports: { beforeAfter: "task19-before-after.csv", publishTraces: "task19-publish-traces.json" }, decision: fp === 0 && fn === 0 ? "LOCAL_RECOVERY_MEETS_REPLAY_TARGET_BUT_SAMPLE_IS_SMALL" : "LOCAL_RECOVERY_REQUIRES_FURTHER_TARGETED_WORK" };
await fs.writeFile(path.join(outDir, "task19-evidence-recovery-report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ after: report.after, diagnostics: report.diagnostics, runtime, decision: report.decision }, null, 2));
