import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchSource, getArticleFinalState, getRejectionReasons } from '../src/index.js';

const root = process.cwd();
const cases = [
  { id: 'OFFICIAL-001', source: 'https://dda.gov.in/housing/housing-circulars', city: 'new_delhi' },
  { id: 'OFFICIAL-002', source: 'https://www.idaindore.org/frmSchemes.aspx', city: 'indore' },
  { id: 'OFFICIAL-003', source: 'https://mhada.gov.in/en/nashik', city: 'nashik' },
  { id: 'OFFICIAL-004', source: 'https://www.up-rera.in/PressRelease', city: '' }
];

const rows = [];
const sentIds = new Set();
for (const item of cases) {
  const started = Date.now();
  try {
    const controller = new AbortController();
    let timer;
    const articles = await Promise.race([
      fetchSource(item.source, { mode: 'task42-official-ocr-regression', signal: controller.signal }),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('source timed out after 30000ms')); }, 30000); })
    ]);
    clearTimeout(timer);
    const selected = articles.slice(0, 8);
    rows.push({
      ...item,
      status: 'FETCHED',
      elapsedMs: Date.now() - started,
      records: selected.map((article) => {
        const reasons = getRejectionReasons(article, sentIds);
        return {
          title: article.title,
          url: article.newsLink,
          officialSource: true,
          documentValid: article.officialDocumentRead === true,
          ocrConfidence: article.ocr?.status || (article.officialDocumentRead ? 'TEXT_EXTRACTED' : 'NOT_AVAILABLE'),
          publishedAt: article.publishedAt || '',
          dateConfidence: article.publishedAt ? 'LISTING_METADATA' : 'MISSING',
          eventClass: /sale|allot|auction|lottery/i.test(article.title) ? 'SCHEME_SALE' : /circular|flat|housing/i.test(article.title) ? 'HOUSING_UPDATE' : 'AUTHORITY_UPDATE',
          eventEvidence: article.title,
          projectScheme: article.title,
          projectEvidence: article.title,
          cityCode: article.cityCode || '',
          geoEvidence: article.cityCode ? `authority jurisdiction and property document: ${article.cityCode}` : '',
          propertyNexus: /flat|housing|residential|plot|scheme|lottery|tenement|आवास|फ्लैट|प्लॉट|सदनिका/iu.test(article.title),
          propertyNexusEvidence: article.title,
          contentSufficiency: article.fullArticleRead === true ? 'FULL_DOCUMENT_READ' : 'INSUFFICIENT',
          fullArticleRead: article.fullArticleRead === true,
          officialDocumentRead: article.officialDocumentRead === true,
          extractionMethod: article.extractionMethod || article.documentExtractionMethod || '',
          ocr: article.ocr || null,
          articleReadError: article.articleReadError || '',
          finalState: getArticleFinalState(article, reasons, { candidate: reasons.length === 0 }),
          failedCanonicalGate: reasons[0] || 'NONE',
          reasons
        };
      })
    });
  } catch (error) {
    rows.push({ ...item, status: /timed out|timeout/i.test(error.message) ? 'TIMEOUT' : 'FAILED', elapsedMs: Date.now() - started, error: error.message });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  localOnly: true,
  noProductionPosts: true,
  noBackfill: true,
  limits: { sourceTimeoutMs: 30000, maxItemsPerSource: Number(process.env.NEWS_MAX_ITEMS_PER_SOURCE || 8), ocr: 'trusted authority listing only' },
  rows
};
const outDir = path.join(root, 'reports/task42-prep/task42-official-benchmark');
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, 'canonical-ocr-regression.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ rows: rows.map((row) => ({ id: row.id, status: row.status, records: row.records?.length || 0, ocrRecords: row.records?.filter((record) => record.extractionMethod === 'BOUNDED_OCR').length || 0, elapsedMs: row.elapsedMs })) }, null, 2));
