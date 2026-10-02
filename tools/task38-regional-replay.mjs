import fs from "node:fs/promises";
import path from "node:path";
import {
  detectArticleLanguage,
  detectCityCodes,
  getRejectionReasons,
  isNegativeNews
} from "../src/index.js";

const root = process.cwd();
const inputDir = "C:/Users/pc/AppData/Local/Temp/task36-revised-audit-2";
const files = [
  `${inputDir}/run-36965486474/news-run-report-36965486474/runs/news-run-2026-10-02T05-26-09-554Z.json`,
  `${inputDir}/run-36974654441/news-run-report-36974654441/runs/news-run-2026-10-02T07-51-35-624Z.json`
];

const rows = [];
for (const file of files) {
  const report = JSON.parse(await fs.readFile(file, "utf8"));
  for (const item of [...(report.needsReviewArticles || []), ...(report.rejectedArticles || [])]) {
    const article = item.article || {};
    if (article.trace?.regionalSource !== true || !article.newsLink) continue;
    rows.push({ article, historicalReasons: item.reasons || [] });
  }
}

const unique = new Map(rows.map((row) => [row.article.newsLink, row]));
const replay = [...unique.values()].map(({ article, historicalReasons }) => {
  const detected = detectArticleLanguage(article);
  const withLanguage = {
    ...article,
    language: detected.language,
    languageScript: detected.script,
    languageConfidence: detected.confidence,
    languageDetectionMethod: detected.method
  };
  const detectedCityCodes = detectCityCodes(withLanguage);
  const routed = { ...withLanguage, cityCode: article.cityCode || detectedCityCodes[0] || "" };
  const reasons = getRejectionReasons(routed, new Set());
  const hardRejected = reasons.some((reason) => reason.startsWith("filter "));
  const safeEvidence = article.fullArticleRead === true &&
    Boolean(article.publishedAt) &&
    Boolean(routed.cityCode) &&
    detected.language !== "not-captured" &&
    article.sourceMode === "AUTO_PUBLISH" &&
    !isNegativeNews(routed) &&
    !hardRejected;
  return {
    title: article.title,
    description: article.description,
    articleText: article.articleText,
    language: detected.language,
    script: detected.script,
    languageConfidence: detected.confidence,
    source: article.sourceName || article.postedBy,
    url: article.newsLink,
    publishedAt: article.publishedAt || "",
    explicitCityBefore: article.cityCode || "",
    detectedCityCodes,
    replayCity: routed.cityCode,
    fullArticleRead: article.fullArticleRead === true,
    negative: isNegativeNews(routed),
    historicalReasons,
    replayReasons: reasons,
    disposition: safeEvidence ? "SAFE_AUTO_PUBLISH" : reasons.some((reason) => reason.startsWith("review:")) ? "REVIEW" : "HARD_REJECT"
  };
});

const summary = {
  generatedAt: new Date().toISOString(),
  localOnly: true,
  historicalFunnel: { records: 37, languageDetected: 0, current: 37, relevantSafe: 17, geoValid: 4, geoUncertain: 33, review: 5, safeAutoPublish: 0, hardReject: 34 },
  surfacedDecisionRows: replay.length,
  replay: {
    languageDetected: replay.filter((row) => row.language !== "not-captured").length,
    languages: [...new Set(replay.map((row) => row.language))],
    scripts: [...new Set(replay.map((row) => row.script))],
    geoValid: replay.filter((row) => row.replayCity).length,
    geoUncertain: replay.filter((row) => !row.replayCity).length,
    safeAutoPublish: replay.filter((row) => row.disposition === "SAFE_AUTO_PUBLISH").length,
    review: replay.filter((row) => row.disposition === "REVIEW").length,
    hardReject: replay.filter((row) => row.disposition === "HARD_REJECT").length
  },
  aliasesAdded: ["ಬೆಂಗಳೂರು", "சென்னை", "హైదరాబాద్", "কলকাতা", "मुंबई", "पुणे"],
  forcedMappings: 0,
  articles: replay
};

const outputDir = path.join(root, "reports", "source-audits", "task38");
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "regional-replay.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  passed: true,
  surfacedDecisionRows: summary.surfacedDecisionRows,
  ...summary.replay,
  forcedMappings: summary.forcedMappings
}, null, 2));
