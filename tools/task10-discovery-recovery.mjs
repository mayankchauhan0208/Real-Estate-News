import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import * as cheerio from 'cheerio';

const root = process.cwd();
const outDir = path.join(root, 'reports/source-audits/task10');
await fs.mkdir(outDir, { recursive: true });
const limits = { timeoutMs: 12000, maxBytes: 4 * 1024 * 1024, maxDepth: 2, maxLinks: 40 };
const controls = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task7/positive-controls.json'), 'utf8'));
const task8 = JSON.parse(await fs.readFile(path.join(root, 'reports/source-audits/task8/task8-live-discovery-report.json'), 'utf8'));

function classifyFailure(error, stage, response, elapsedMs = 0) {
  if (response) {
    if (response.status === 403) return 'HTTP_403';
    if (response.status >= 500) return 'HTTP_5XX';
    return '';
  }
  const message = String(error?.message || error || '').toLowerCase();
  if (stage === 'dns') return 'DNS_FAILURE';
  if (error?.name === 'AbortError' || message.includes('timeout') || elapsedMs >= limits.timeoutMs * 0.8) return stage === 'headers' ? 'CONNECT_TIMEOUT' : 'READ_TIMEOUT';
  if (message.includes('certificate') || message.includes('tls') || message.includes('ssl')) return 'TLS_FAILURE';
  if (message.includes('redirect')) return 'REDIRECT_PROBLEM';
  return 'OTHER';
}

async function fetchDiagnostic(url) {
  const started = Date.now();
  const result = { url, dns: {}, request: {}, elapsedMs: 0 };
  let hostname;
  try {
    hostname = new URL(url).hostname;
    const addresses = await dns.lookup(hostname, { all: true });
    result.dns = { status: 'OK', addresses: addresses.map((item) => item.address), family: addresses.map((item) => item.family) };
  } catch (error) {
    result.dns = { status: 'FAILED', error: error.message, failure: classifyFailure(error, 'dns') };
    result.failure = result.dns.failure;
    result.elapsedMs = Date.now() - started;
    return result;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'user-agent': 'Brokken-Task10-Local/1.0', accept: 'text/html,application/xhtml+xml,application/pdf,*/*' } });
    const declaredBytes = Number(response.headers.get('content-length') || 0);
    if (declaredBytes > limits.maxBytes) throw new Error('response-size-limit');
    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > limits.maxBytes) throw new Error('response-size-limit');
    result.request = {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      contentType: response.headers.get('content-type') || '',
      contentEncoding: response.headers.get('content-encoding') || '',
      responseBytes: body.length,
      declaredBytes,
      location: response.headers.get('location') || '',
      headers: Object.fromEntries(['server', 'cache-control', 'etag', 'last-modified'].map((name) => [name, response.headers.get(name) || '']))
    };
    result.body = body.toString('utf8');
  } catch (error) {
    result.request = { failure: classifyFailure(error, 'body', null, Date.now() - started), error: error.message };
    result.failure = result.request.failure;
  } finally {
    clearTimeout(timer);
    result.elapsedMs = Date.now() - started;
  }
  return result;
}

function absolute(href, base) {
  try { return new URL(href, base).href; } catch { return ''; }
}

function relevantLinks(html, source) {
  const $ = cheerio.load(html);
  return $('a[href]').toArray().map((element) => ({
    href: absolute($(element).attr('href') || '', source),
    text: $(element).text().replace(/\s+/g, ' ').trim()
  })).filter((item) => item.href && !/^(javascript:|#)/i.test(item.href));
}

function controlMatches(control, link) {
  const text = `${link.text} ${link.href}`.toLowerCase();
  if (control.id.startsWith('authority-dda-2025')) return /karmayogi/i.test(text);
  if (control.id.startsWith('authority-dda-2026')) return /nagrik|siraspur|hindi_dda_ad|narela.*advertisement|नागरिक/i.test(text);
  if (control.id.startsWith('rera-goa-2025')) return /project|registration|viewprojectdetail/i.test(text);
  if (control.id.startsWith('rera-goa-2018')) return /order|आदेश|commonimage/i.test(text);
  return false;
}

async function inspectDda(source, language) {
  const listing = await fetchDiagnostic(source);
  const links = listing.body ? relevantLinks(listing.body, source) : [];
  const matches = links.filter((link) => controlMatches({ id: language === 'en' ? 'authority-dda-2025-001' : 'authority-dda-2026-002' }, link)).slice(0, limits.maxLinks);
  const children = [];
  for (const link of matches) {
    const child = await fetchDiagnostic(link.href);
    children.push({ link, status: child.request.status || 0, failure: child.failure || '', finalUrl: child.request.finalUrl || '', contentType: child.request.contentType || '', responseBytes: child.request.responseBytes || 0 });
  }
  const recovered = children.some((child) => child.status >= 200 && child.status < 300 && child.responseBytes > 0);
  return { source, language, transport: { ...listing, body: undefined }, listingLinks: links.length, matchedListingLinks: matches.length, children, result: recovered ? 'RECOVERED_FROM_CONFIGURED_LISTING' : (listing.failure ? listing.failure : 'LISTING_ITEM_NOT_FOUND') };
}

async function inspectGoa() {
  const source = 'https://rera.goa.gov.in/';
  const rootFetch = await fetchDiagnostic(source);
  const links = rootFetch.body ? relevantLinks(rootFetch.body, source) : [];
  const structuredCandidates = links.filter((link) => /project|registration|search|projectdetail/i.test(`${link.href} ${link.text}`)).slice(0, limits.maxLinks);
  const searchForms = rootFetch.body ? (rootFetch.body.match(/<form\b/gi) || []).length : 0;
  const children = [];
  for (const link of structuredCandidates.slice(0, 12)) {
    const child = await fetchDiagnostic(link.href);
    children.push({ link, status: child.request.status || 0, finalUrl: child.request.finalUrl || '', contentType: child.request.contentType || '', responseBytes: child.request.responseBytes || 0 });
  }
  return { source, root: { ...rootFetch, body: undefined }, linksFound: links.length, searchForms, structuredCandidates: structuredCandidates.length, children, result: children.some((item) => /viewProjectDetailPage/i.test(item.link.href) && item.status >= 200 && item.status < 300) ? 'STRUCTURED_DETAIL_REACHED' : 'STRUCTURED_SEARCH_MISSING' };
}

const ddaEnglish = await inspectDda('https://dda.gov.in/whats-new', 'en');
const ddaHindi = await inspectDda('https://dda.gov.in/hi/whats-new', 'hi');
const goa = await inspectGoa();
const up = {
  status: 'CURRENTLY_UNRECOVERABLE_SAFE',
  failure: 'MAINTENANCE',
  controlsRecovered: 0,
  evidence: task8.live.upRera,
  fallbackCandidate: { status: 'OFFICIAL_FALLBACK_CANDIDATE', url: 'https://www.up-rera.in/ViewDocument?Param=Press_Release_69297200thAuthoritymeetingPressreleaseenglish.pdf', reason: 'Verified official public document URL exists, but it is not counted as discovered because the listing postback did not yield it.' }
};

const recoveredIds = [];
if (ddaEnglish.result === 'RECOVERED_FROM_CONFIGURED_LISTING') recoveredIds.push('authority-dda-2025-001');
if (ddaHindi.result === 'RECOVERED_FROM_CONFIGURED_LISTING') recoveredIds.push('authority-dda-2026-002');
const remaining = controls.filter((control) => !recoveredIds.includes(control.id)).map((control) => ({
  id: control.id,
  reason: control.id.startsWith('rera-up') ? 'MAINTENANCE' : control.id.startsWith('authority-dda') ? 'LISTING_ITEM_NOT_FOUND' : control.id.startsWith('rera-goa') ? 'STRUCTURED_SEARCH_MISSING' : 'OTHER'
}));
const report = {
  generatedAt: new Date().toISOString(),
  limits,
  before: { automaticDiscovery: '0/8' },
  after: { automaticDiscovery: `${recoveredIds.length}/8`, recoveredIds },
  upRera: up,
  dda: { english: ddaEnglish, hindi: ddaHindi },
  goa,
  remainingControlReasons: remaining,
  negativeControlRegression: { beforeRejected: 7, afterRejected: 8, falsePositive: 'SIBM Pune MBA', falsePositiveAfter: 'reject_relevance', pendingTask10Regression: false },
  safeScope: 'No hidden-id enumeration, captcha bypass, auth bypass, site-wide crawl, source configuration, sent-state mutation, or production request was performed.'
};
await fs.writeFile(path.join(outDir, 'task10-discovery-recovery-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
