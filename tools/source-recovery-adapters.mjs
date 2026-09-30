function absoluteUrl(value, baseUrl) {
  try { return new URL(String(value || '').trim(), baseUrl).toString(); } catch { return ''; }
}

function normalizeUrl(value = '') {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.toString().replace(/\/+$/, '').toLowerCase();
  } catch {
    return String(value || '').trim().replace(/\/+$/, '').toLowerCase();
  }
}

function parseDateValue(value = '') {
  const date = new Date(String(value || '').trim());
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function hostOf(value = '') {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function addCandidate(collection, value, baseUrl, sourceHost, title = '') {
  const link = absoluteUrl(value, baseUrl);
  if (!link || hostOf(link) !== sourceHost || normalizeUrl(link) === normalizeUrl(baseUrl)) return;
  collection.set(normalizeUrl(link), { link, title: String(title || '').replace(/\s+/g, ' ').trim() });
}

function walkStructured(value, state, baseUrl, sourceHost) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { value.forEach((item) => walkStructured(item, state, baseUrl, sourceHost)); return; }
  const type = Array.isArray(value['@type']) ? value['@type'].join(' ') : String(value['@type'] || '');
  const articleLike = /article|newsarticle|blogposting|report|creativework/i.test(type);
  const title = value.headline || value.name || value.title || '';
  const url = value.url || value.mainEntityOfPage?.['@id'] || value.mainEntityOfPage;
  if (articleLike || value.item || value.itemListElement) addCandidate(state.links, url, baseUrl, sourceHost, title);
  if (value.datePublished || value.dateCreated || value.dateModified) {
    const date = parseDateValue(value.datePublished || value.dateCreated || value.dateModified);
    if (date) state.dates.push(date);
  }
  if (value.image?.url || typeof value.image === 'string') state.thumbnails += 1;
  for (const [key, child] of Object.entries(value)) {
    if (key === '@context' || key === '@type') continue;
    walkStructured(child, state, baseUrl, sourceHost);
  }
}

function parseJsonScript(raw) {
  const text = String(raw || '').trim().replace(/^<!--|-->$/g, '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function extractStructuredListing($, sourceUrl) {
  const sourceHost = hostOf(sourceUrl);
  const state = { links: new Map(), dates: [], thumbnails: 0, methods: new Set() };
  $('script[type="application/ld+json"]').each((_, element) => {
    const parsed = parseJsonScript($(element).text());
    if (parsed) { state.methods.add('JSON_LD'); walkStructured(parsed, state, sourceUrl, sourceHost); }
  });
  $('[data-href], [data-url], [data-link], [data-article-url]').each((_, element) => {
    const link = $(element).attr('data-href') || $(element).attr('data-url') || $(element).attr('data-link') || $(element).attr('data-article-url');
    addCandidate(state.links, link, sourceUrl, sourceHost, $(element).text());
    state.methods.add('EMBEDDED_ATTRIBUTES');
  });
  return {
    links: [...state.links.values()],
    dates: [...new Set(state.dates)].sort().reverse(),
    thumbnailCount: state.thumbnails,
    method: [...state.methods].join('+')
  };
}

export function rankArticleLinks(candidates, sourceUrl) {
  const sourceHost = hostOf(sourceUrl);
  const seen = new Set();
  return candidates
    .filter((candidate) => candidate?.link && hostOf(candidate.link) === sourceHost)
    .filter((candidate) => {
      const key = normalizeUrl(candidate.link);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((candidate) => {
      const url = candidate.link.toLowerCase();
      const title = String(candidate.title || '').trim();
      let score = Math.min(30, title.length);
      if (/\.(pdf)(?:$|\?)/i.test(url)) score += 12;
      if (/(article|news|story|stories|blog|press|release|notice|announcement|media|update|order|judg|publication|circular)/i.test(url)) score += 10;
      if (/(login|register|contact|about|privacy|terms|sitemap|javascript|#|page=|category|tag)/i.test(url)) score -= 12;
      if (title.length < 12) score -= 8;
      return { ...candidate, score };
    })
    .sort((left, right) => right.score - left.score || left.link.localeCompare(right.link));
}

export function classifyExtractionFailure(row) {
  const url = String(row.url || '').toLowerCase();
  const error = String(row.error || '').toLowerCase();
  if (/rss|feed/.test(url) && /parse|xml/.test(error)) return 'ENCODING';
  if (/\.pdf(?:$|\?)/.test(url)) return 'PDF';
  if (/iframe|embed/.test(error)) return 'IFRAME';
  if (/api|json|graphql|next|nuxt|ajax/.test(url)) return 'EMBEDDED_JSON';
  if (/page|archive|pagination|older|load/.test(url)) return 'PAGINATION';
  if (/notice|tender|order|judg|circular|publication|press/.test(url)) return 'AUTHORITY_NOTICE_TABLE';
  return row.listingMethod === 'RSS' || row.listingMethod === 'ATOM' ? 'DETAIL_LINK' : 'HTML_SELECTOR';
}
