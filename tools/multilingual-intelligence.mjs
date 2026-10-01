import { workbookCityRules } from '../src/city-config.js';

// Provider-independent, offline-safe language and evidence primitives. This module
// never translates, publishes, or changes the production source registry.
const SCRIPT_RANGES = {
  devanagari: /[\u0900-\u097F]/u,
  bengali: /[\u0980-\u09FF]/u,
  gujarati: /[\u0A80-\u0AFF]/u,
  gurmukhi: /[\u0A00-\u0A7F]/u,
  odia: /[\u0B00-\u0B7F]/u,
  tamil: /[\u0B80-\u0BFF]/u,
  telugu: /[\u0C00-\u0C7F]/u,
  kannada: /[\u0C80-\u0CFF]/u,
  malayalam: /[\u0D00-\u0D7F]/u,
  arabic: /[\u0600-\u06FF]/u,
  latin: /[A-Za-z]/u
};

const SCRIPT_LANGUAGE = {
  gujarati: 'gu', gurmukhi: 'pa', tamil: 'ta', telugu: 'te', kannada: 'kn',
  malayalam: 'ml', odia: 'or', arabic: 'ur', bengali: 'bn'
};
const DEVANAGARI_MARATHI = /(आहेत|आहे|महाराष्ट्र|मुंबईतील|पुण्यात|विकासकांनी|गृहनिर्माण)/u;
const DEVANAGARI_HINDI = /(है|हैं|उत्तर प्रदेश|दिल्ली में|गुरुग्राम|आवास)/u;
const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi',
  ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam', or: 'Odia', as: 'Assamese', ur: 'Urdu'
};
const DIGITS = { '०':'0','१':'1','२':'2','३':'3','४':'4','५':'5','६':'6','७':'7','८':'8','९':'9', '০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9', '૦':'0','૧':'1','૨':'2','૩':'3','૪':'4','૫':'5','૬':'6','૭':'7','૮':'8','૯':'9', '੦':'0','੧':'1','੨':'2','੩':'3','੪':'4','੫':'5','੬':'6','੭':'7','੮':'8','੯':'9', '௦':'0','௧':'1','௨':'2','௩':'3','௪':'4','௫':'5','௬':'6','௭':'7','௮':'8','௯':'9', '౦':'0','౧':'1','౨':'2','౩':'3','౪':'4','౫':'5','౬':'6','౭':'7','౮':'8','౯':'9', '೦':'0','೧':'1','೨':'2','೩':'3','೪':'4','೫':'5','೬':'6','೭':'7','೮':'8','೯':'9', '൦':'0','൧':'1','൨':'2','൩':'3','൪':'4','൫':'5','൬':'6','൭':'7','൮':'8','൯':'9', '୦':'0','୧':'1','୨':'2','୩':'3','୪':'4','୫':'5','୬':'6','୭':'7','୮':'8','୯':'9' };

function text(value) { return String(value ?? ''); }
export function normalizeUnicode(value) { return text(value).normalize('NFC').replace(/\u0000/g, ''); }
export function normalizeNativeNumerals(value) { return normalizeUnicode(value).replace(/[०-९০-৯૦-૯੦-੯௦-௯౦-౯೦-೯൦-൯୦-୯]/gu, (digit) => DIGITS[digit] || digit); }
export function detectScripts(value) {
  const input = normalizeUnicode(value); return Object.entries(SCRIPT_RANGES).filter(([, pattern]) => pattern.test(input)).map(([script]) => script);
}
export function identifyLanguage(value, declared = '') {
  const input = normalizeUnicode(value).trim(); const declaredCode = text(declared).toLowerCase().split('-')[0];
  if (declaredCode && LANGUAGE_NAMES[declaredCode]) return { code: declaredCode, name: LANGUAGE_NAMES[declaredCode], confidence: 'declared', scripts: detectScripts(input) };
  const scripts = detectScripts(input); const nonLatin = scripts.filter((script) => script !== 'latin');
  if (scripts.includes('devanagari')) {
    if (DEVANAGARI_MARATHI.test(input) && !DEVANAGARI_HINDI.test(input)) return { code: 'mr', name: 'Marathi', confidence: 'lexical', scripts };
    if (DEVANAGARI_HINDI.test(input)) return { code: 'hi', name: 'Hindi', confidence: 'lexical', scripts };
    return { code: 'hi-or-mr', name: 'Hindi/Marathi (unresolved)', confidence: 'script-only', scripts };
  }
  if (scripts.includes('bengali') && /অসমীয়া|অসমীয়া/.test(input)) return { code: 'as', name: 'Assamese', confidence: 'lexical', scripts };
  if (nonLatin.length === 1 && SCRIPT_LANGUAGE[nonLatin[0]]) return { code: SCRIPT_LANGUAGE[nonLatin[0]], name: LANGUAGE_NAMES[SCRIPT_LANGUAGE[nonLatin[0]]], confidence: 'script', scripts };
  if (scripts.includes('latin')) return { code: 'en', name: 'English or transliterated', confidence: 'script', scripts };
  return { code: 'unknown', name: 'Unknown', confidence: 'unknown', scripts };
}

function includesAlias(haystack, alias) {
  const candidate = normalizeUnicode(alias).toLowerCase().trim(); if (!candidate) return false;
  if (/^[a-z0-9 _-]+$/i.test(candidate)) return new RegExp(`(?:^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i').test(haystack);
  return haystack.includes(candidate);
}
export function nativeGeoEvidence(article = {}) {
  const fields = [['title', article.title], ['description', article.description], ['body', article.articleText || article.body]];
  const evidence = [];
  for (const [field, value] of fields) {
    const haystack = normalizeUnicode(value).toLowerCase();
    if (!haystack) continue;
    for (const rule of workbookCityRules) {
      for (const alias of [rule.name, rule.code, ...(rule.keywords || [])].filter(Boolean)) {
        if (!includesAlias(haystack, alias)) continue;
        const native = /[^\x00-\x7F]/u.test(String(alias));
        evidence.push({ candidateCity: rule.code, matchedText: alias, normalizedPlace: String(alias).toLowerCase(), field, type: native ? `${field.toUpperCase()}_NATIVE_CITY` : `${field.toUpperCase()}_CITY`, confidence: native ? 'high' : 'medium', provenance: 'existing city-config keyword' });
      }
    }
  }
  return [...new Map(evidence.map((row) => [`${row.candidateCity}|${row.field}|${row.normalizedPlace}`, row])).values()];
}
export function translationDecision({ language, hasNativeGeo = false, providerConfigured = false } = {}) {
  if (language === 'en' || language === 'unknown') return { status: language === 'unknown' ? 'REVIEW_LANGUAGE' : 'NOT_REQUIRED', publishAllowed: language !== 'unknown', provider: 'none' };
  if (providerConfigured) return { status: 'READY_PROVIDER', publishAllowed: false, provider: 'configured-provider-not-invoked' };
  return { status: 'REVIEW_TRANSLATION_UNAVAILABLE', publishAllowed: false, provider: 'none', nativeGeoPreserved: hasNativeGeo };
}
export function eventKey(article = {}) { return normalizeUnicode(`${article.title || ''}|${article.cityCode || ''}`).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
export function crossLanguageDedupe(a, b) {
  const left = eventKey(a); const right = eventKey(b); if (!left || !right) return { decision: 'UNRESOLVED', score: 0 };
  if (left === right || (a.canonicalUrl && a.canonicalUrl === b.canonicalUrl)) return { decision: 'SAME_EVENT_HIGH_CONFIDENCE', score: 1 };
  const aTokens = new Set(left.split(' ').filter((token) => token.length > 3)); const bTokens = new Set(right.split(' ').filter((token) => token.length > 3));
  const overlap = [...aTokens].filter((token) => bTokens.has(token)).length / Math.max(aTokens.size, bTokens.size, 1);
  if (overlap >= 0.8 && a.cityCode && a.cityCode === b.cityCode) return { decision: 'POSSIBLE_SAME_EVENT', score: Number(overlap.toFixed(3)) };
  return { decision: overlap === 0 ? 'DISTINCT' : 'UNRESOLVED', score: Number(overlap.toFixed(3)) };
}
export const supportedLanguages = Object.fromEntries(Object.entries(LANGUAGE_NAMES));
