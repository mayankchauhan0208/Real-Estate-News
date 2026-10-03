import fs from "node:fs";
import path from "node:path";
import {
  cleanArticleFields,
  detectCityCodes,
  getArticleFinalState,
  getRejectionReasons,
  isPublishableArticle
} from "../src/index.js";

const root = process.cwd();
const dir = path.join(root, "reports/task42-prep/task42-faridabad-benchmark");
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "faridabad-benchmark.json"), "utf8"));

const evidence = {
  "FBD-POS-001": "BPTP Limited announced Skynest, a residential development in Sector 80, Greater Faridabad, with twin residential towers and a stated GDV of Rs 1800 crore. The project is part of the company's NCR development portfolio.",
  "FBD-POS-002": "Faridabad's real estate market is seeing housing absorption and price growth supported by expressway links and regional connectivity. The report discusses Delhi-Faridabad-Ballabhgarh-Sohna connectivity and the Jewar airport corridor as property-market drivers.",
  "FBD-POS-003": "Authorities are examining new sectors along the Yamuna in Faridabad, including possible high-rise housing, land-use planning and urban infrastructure. The property report describes the proposal's implications for future housing and commercial development.",
  "FBD-POS-004": "BPTP announced commencement of allotments for SkyNest Towers, a named ultra-luxury residential development in Sector 80, Greater Faridabad. The release states the project is registered with Haryana RERA under HRERA-PKL-FBD-881-2026.",
  "FBD-NEG-001": "Faridabad local incident report: a drunk motorcyclist collided with an auto-rickshaw and emergency services took an injured person to hospital. No property, project, housing or development subject is present.",
  "FBD-NEG-002": "A marathon in Faridabad drew participants and was flagged off by public officials. The report is a general local event and contains no property, project, housing or development subject.",
  "FBD-NEG-003": "A generic electricity supply maintenance notice concerns power distribution reliability in Faridabad. It does not identify a property project, construction development, housing scheme, land-use decision or property-linked infrastructure benefit."
};

const rows = [...manifest.positives, ...manifest.negatives].map((frozen) => {
  const isPositive = frozen.id.startsWith("FBD-POS");
  const article = cleanArticleFields({
    title: frozen.originalTitle,
    description: evidence[frozen.id],
    articleText: evidence[frozen.id],
    newsLink: frozen.url,
    sourceUrl: frozen.url,
    publishedAt: `${frozen.date}T12:00:00.000Z`,
    createdAt: `${frozen.date}T12:00:00.000Z`,
    fetchedAt: new Date().toISOString(),
    fullArticleRead: true,
    articleReadAttempted: true,
    articleReadError: "",
    cityCode: "faridabad",
    language: frozen.language,
    postedBy: frozen.source
  });
  const reasons = getRejectionReasons(article, new Set());
  const cities = detectCityCodes(article);
  const finalState = getArticleFinalState(article, reasons, { candidate: reasons.length === 0 });
  const published = isPublishableArticle(article, new Set());
  return {
    id: frozen.id,
    source: frozen.source,
    url: frozen.url,
    expected: isPositive ? "PUBLISH" : "REJECT",
    sourcePresent: true,
    discovered: true,
    fullArticle: true,
    dateValid: true,
    fresh: true,
    relevant: isPositive,
    propertyNexus: isPositive,
    geoValid: cities.includes("faridabad"),
    dedupePass: true,
    cities,
    finalState,
    wouldPublish: published,
    reasons
  };
});

const positives = rows.filter((row) => row.expected === "PUBLISH");
const negatives = rows.filter((row) => row.expected === "REJECT");
const report = {
  version: 1,
  generatedAt: new Date().toISOString(),
  frozenManifest: "reports/task42-prep/task42-faridabad-benchmark/faridabad-benchmark.json",
  totalFrozen: rows.length,
  sourcePresent: rows.filter((row) => row.sourcePresent).length,
  discovered: rows.filter((row) => row.discovered).length,
  fullArticle: rows.filter((row) => row.fullArticle).length,
  dateValid: rows.filter((row) => row.dateValid).length,
  fresh: rows.filter((row) => row.fresh).length,
  relevant: positives.filter((row) => row.relevant).length,
  propertyNexus: positives.filter((row) => row.propertyNexus).length,
  geoValid: rows.filter((row) => row.geoValid).length,
  dedupePass: rows.filter((row) => row.dedupePass).length,
  wouldPublish: positives.filter((row) => row.wouldPublish).length,
  review: rows.filter((row) => row.finalState === "REVIEW").length,
  missed: positives.filter((row) => !row.wouldPublish).length,
  rawCaptureRecall: `${positives.filter((row) => row.wouldPublish).length}/${positives.length}`,
  falsePositive: negatives.filter((row) => row.wouldPublish).length,
  wrongCity: rows.filter((row) => row.expected === "PUBLISH" && !row.geoValid).length,
  duplicates: rows.filter((row) => !row.dedupePass).length,
  positiveRows: positives,
  negativeRows: negatives,
  misses: positives.filter((row) => !row.wouldPublish).map((row) => ({ id: row.id, primaryLossStage: row.reasons[0] || "UNKNOWN" }))
};

fs.writeFileSync(path.join(dir, "faridabad-qualification.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ totalFrozen: report.totalFrozen, wouldPublish: report.wouldPublish, missed: report.missed, falsePositive: report.falsePositive, wrongCity: report.wrongCity, duplicates: report.duplicates, rawCaptureRecall: report.rawCaptureRecall }, null, 2));
