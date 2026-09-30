import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { extractStructuredListing, rankArticleLinks, classifyExtractionFailure } from './source-recovery-adapters.mjs';

const sourceUrl = 'https://example.gov.in/notices';
const $ = cheerio.load(`
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: [{ item: { '@type': 'NewsArticle', headline: 'New housing project approved', url: 'https://example.gov.in/news/project-approved', datePublished: '2026-09-29T10:00:00Z' } }]
  })}</script>
  <a href="/documents/notice.pdf">Official notice</a>
  <a href="/contact">Contact</a>
  <div data-article-url="/press-release/housing-update">Housing update</div>
`);
const structured = extractStructuredListing($, sourceUrl);
assert.equal(structured.links.length, 2);
assert.equal(structured.dates[0], '2026-09-29T10:00:00.000Z');
const ranked = rankArticleLinks([
  ...structured.links,
  { link: 'https://example.gov.in/contact', title: 'Contact' },
  { link: 'https://example.gov.in/news/project-approved', title: 'New housing project approved' }
], sourceUrl);
assert.equal(ranked[0].link, 'https://example.gov.in/news/project-approved');
assert.equal(classifyExtractionFailure({ url: 'https://example.gov.in/notice.pdf', listingMethod: 'HTML_GENERIC_EXTRACTOR' }), 'PDF');
assert.equal(classifyExtractionFailure({ url: 'https://example.gov.in/press-release', listingMethod: 'HTML_GENERIC_EXTRACTOR' }), 'AUTHORITY_NOTICE_TABLE');
console.log(JSON.stringify({ passed: true, structuredLinks: structured.links.length, rankedLinks: ranked.length }));
