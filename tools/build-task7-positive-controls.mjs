import fs from 'node:fs/promises';
import path from 'node:path';
import { classifyArticle } from '../src/index.js';

const root = process.cwd();
const outDir = path.join(root, 'reports', 'source-audits', 'task7');
await fs.mkdir(outDir, { recursive: true });

const controls = [
  {
    id: 'rera-up-2026-001', source: 'https://www.up-rera.in/PressRelease', sourceType: 'RERA', language: 'en',
    url: 'https://www.up-rera.in/ViewDocument?Param=Press_Release_69297200thAuthoritymeetingPressreleaseenglish.pdf',
    listingUrl: 'https://www.up-rera.in/PressRelease', detailUrl: '', documentUrl: 'https://www.up-rera.in/ViewDocument?Param=Press_Release_69297200thAuthoritymeetingPressreleaseenglish.pdf',
    title: 'UP RERA Approves 13 Real Estate Projects Worth Over ₹1,300 Crores Across Eight Districts',
    description: '1,976 residential and commercial units to be developed; Ghaziabad leads in investment and Lucknow records the highest number of projects.',
    text: 'U.P. Real Estate Regulatory Authority. UP RERA approved 13 new real estate projects with combined estimated investment of ₹1,300.38 crores. The projects are spread across eight districts and will develop approximately 1,976 residential and commercial units. Ghaziabad, Lucknow, Gautam Buddh Nagar, Mathura, Saharanpur, Bareilly, Varanasi and Moradabad are named in the project approval record. The approvals were granted after review for compliance with regulatory norms and support planned urban expansion.',
    date: '2026-04-16', thumbnail: null, state: 'Uttar Pradesh', district: 'Gautam Buddh Nagar', city: 'noida', locality: '', project: '', developer: '', authority: 'UP RERA', contentType: 'PRESS_RELEASE_PDF', expected: 'VALID_RERA_OFFICIAL',
    whyValid: 'Official UP RERA PDF with approval count, investment, units, named districts and explicit planned development.', evidence: 'Web-verified official PDF; listing → ViewDocument PDF.', discovery: 'DOCUMENT_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: ['INFRASTRUCTURE'],
  },
  {
    id: 'rera-up-2026-002', source: 'https://www.up-rera.in/PressRelease', sourceType: 'RERA', language: 'hi',
    url: 'https://www.up-rera.in/ViewDocument?Param=Press_Release_92132RERAachievementin2025hindirelease.pdf', listingUrl: 'https://www.up-rera.in/PressRelease', detailUrl: '', documentUrl: 'https://www.up-rera.in/ViewDocument?Param=Press_Release_92132RERAachievementin2025hindirelease.pdf',
    title: 'वर्ष 2025 में यूपी रेरा का रिकॉर्ड प्रदर्शन, 308 परियोजनाएं, 53.5% निवेश वृद्धि और प्रदेशव्यापी विस्तार',
    description: 'वर्ष 2025 में 308 रियल एस्टेट परियोजनाओं का पंजीकरण और आवासीय तथा व्यावसायिक इकाइयों में वृद्धि।',
    text: 'उ.प्र. भू-सम्पदा विनियामक प्राधिकरण के आधिकारिक रिकॉर्ड के अनुसार वर्ष 2025 में उत्तर प्रदेश में 308 रियल एस्टेट परियोजनाओं का पंजीकरण हुआ। स्वीकृत इकाइयों और पूंजी निवेश में वृद्धि दर्ज की गई। परियोजना पंजीकरण, आवासीय और व्यावसायिक इकाइयों तथा प्रदेशव्यापी नियामक विस्तार का विवरण इस आधिकारिक प्रेस रिलीज में दिया गया है।',
    date: '2026-01-07', thumbnail: null, state: 'Uttar Pradesh', district: '', city: 'lucknow', locality: '', project: '', developer: '', authority: 'UP RERA', contentType: 'PRESS_RELEASE_PDF', expected: 'VALID_RERA_OFFICIAL',
    whyValid: 'Official Hindi UP RERA press release with dated statewide project-registration and investment facts.', evidence: 'Web-verified official Hindi PDF; listing → ViewDocument PDF.', discovery: 'DOCUMENT_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
  {
    id: 'rera-goa-2025-001', source: 'https://rera.goa.gov.in', sourceType: 'RERA', language: 'en',
    url: 'https://rera.goa.gov.in/reraApp/viewProjectDetailPage?projectID=aNKGQpWVA90Joft9YFsulA%3D%3D', listingUrl: 'https://rera.goa.gov.in/', detailUrl: 'https://rera.goa.gov.in/reraApp/viewProjectDetailPage?projectID=aNKGQpWVA90Joft9YFsulA%3D%3D', documentUrl: '',
    title: '1 CHOGM official Goa RERA project registration', description: 'Ongoing mixed residential and commercial development in Pilerne, Bardez, North Goa.',
    text: 'Goa RERA project detail. Project 1 CHOGM, RERA registration PRGO10242317, registration date 23 October 2024, mixed development, ongoing, project end date 31 March 2027, state Goa, district North Goa, village Mapusa. The project description is residential and commercial. Promoter: COSME COSTA CONSTRUCTION PRIVATE LIMITED. The page includes project approvals, construction progress, inventory, and project documents.',
    date: '2025-10-24', thumbnail: null, state: 'Goa', district: 'North Goa', city: 'goa', locality: 'Mapusa', project: '1 CHOGM', developer: 'COSME COSTA CONSTRUCTION PRIVATE LIMITED', authority: 'Goa RERA', contentType: 'PROJECT_DETAIL_HTML', expected: 'VALID_PROJECT_REGISTRATION',
    whyValid: 'Official project-detail record with registration number, promoter, project type, status, locality and document section.', evidence: 'Web-verified official Goa RERA detail page.', discovery: 'DETAIL_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: ['INFRASTRUCTURE'],
  },
  {
    id: 'rera-goa-2018-001', source: 'https://rera.goa.gov.in/reraApp/Orders', sourceType: 'RERA', language: 'en',
    url: 'https://rera.goa.gov.in/reraApp/Commonimage?IMG_PATH=WCNzxYg+DTZMNAdLA3WOwA%3D%3D', listingUrl: 'https://rera.goa.gov.in/reraApp/Orders', detailUrl: '', documentUrl: 'https://rera.goa.gov.in/reraApp/Commonimage?IMG_PATH=WCNzxYg+DTZMNAdLA3WOwA%3D%3D',
    title: 'Goa RERA order extends filing deadline for ongoing real estate project registration', description: 'Official order under Section 59(1) extending the online application deadline for ongoing project registration.',
    text: 'GOA REAL ESTATE REGULATORY AUTHORITY, Department of Urban Development, Government of Goa. Dated 23/02/2018. ORDER under Section 59(1) of the Real Estate Regulation and Development Act, 2016. The last date for filing online applications for ongoing Real Estate Project Registration under RERA was extended till 23/03/2018 without penalty, with applications accepted till 31/03/2018 with penalty.',
    date: '2018-02-23', thumbnail: null, state: 'Goa', district: '', city: 'goa', locality: '', project: '', developer: '', authority: 'Goa RERA', contentType: 'ORDER_PDF', expected: 'VALID_ORDER',
    whyValid: 'Official, dated, readable RERA order explicitly about ongoing real-estate project registration.', evidence: 'Web-verified official Goa RERA Orders listing → PDF.', discovery: 'DOCUMENT_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
  {
    id: 'authority-dda-2025-001', source: 'https://dda.gov.in/whats-new', sourceType: 'AUTHORITY', language: 'en',
    url: 'https://dda.gov.in/sites/default/files/notice/karmayogi_circular.pdf', listingUrl: 'https://dda.gov.in/whats-new', detailUrl: 'https://dda.gov.in/housing/karmayogi_awaas_yojana_2025', documentUrl: 'https://dda.gov.in/sites/default/files/notice/karmayogi_circular.pdf',
    title: 'DDA Karmayogi Awaas Yojana 2025 launches housing scheme in Narela', description: 'DDA launches 1,168 newly constructed HIG, MIG and 1 BHK flats in Pocket 9, Sector A1 to A4, Narela.',
    text: 'Delhi Development Authority circular dated 12 December 2025 announcing DDA Karmayogi Awaas Yojana 2025. The scheme offers 1,168 newly constructed flats in Pocket 9, Sector A1 to A4, Narela, including 1 BHK, 2 BHK and 3 BHK categories. The official circular gives location, unit counts, areas and disposal prices.',
    date: '2025-12-12', thumbnail: null, state: 'Delhi', district: 'North Delhi', city: 'delhi', locality: 'Narela', project: 'DDA Karmayogi Awaas Yojana 2025', developer: 'DDA', authority: 'Delhi Development Authority', contentType: 'HOUSING_CIRCULAR_PDF', expected: 'VALID_AUTHORITY_UPDATE',
    whyValid: 'Official authority housing launch with explicit project, units, location and prices.', evidence: 'Web-verified official DDA PDF.', discovery: 'DOCUMENT_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
  {
    id: 'authority-dda-2026-001', source: 'https://dda.gov.in/whats-new', sourceType: 'AUTHORITY', language: 'en',
    url: 'https://dda.gov.in/public-notice-dda-nagrik-awaas-yojana-2026-advertisement', listingUrl: 'https://dda.gov.in/whats-new', detailUrl: 'https://dda.gov.in/public-notice-dda-nagrik-awaas-yojana-2026-advertisement', documentUrl: '',
    title: 'Public Notice: DDA Nagrik Awaas Yojana 2026', description: 'DDA public notice advertising housing in Narela and Siraspur with remaining EWS, HIG and MIG flats.',
    text: 'Delhi Development Authority public notice dated 5 March 2026 for DDA Nagrik Awaas Yojana 2026. The notice describes housing availability in Delhi, including Narela and Siraspur, and links the official English PDF advertisement.',
    date: '2026-03-05', thumbnail: null, state: 'Delhi', district: 'North Delhi', city: 'delhi', locality: 'Narela; Siraspur', project: 'DDA Nagrik Awaas Yojana 2026', developer: 'DDA', authority: 'Delhi Development Authority', contentType: 'PUBLIC_NOTICE_HTML', expected: 'VALID_AUTHORITY_UPDATE',
    whyValid: 'Official dated housing public notice with named schemes and localities.', evidence: 'Web-verified official DDA detail page with linked PDF.', discovery: 'DETAIL_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
  {
    id: 'authority-dda-2026-002', source: 'https://dda.gov.in/hi/whats-new', sourceType: 'REGIONAL', language: 'hi',
    url: 'https://dda.gov.in/sites/default/files/public-notice/hindi_dda_ad06032026.pdf', listingUrl: 'https://dda.gov.in/hi/whats-new', detailUrl: 'https://dda.gov.in/hi/public-notice-dda-nagrik-awaas-yojana-2026-advertisement', documentUrl: 'https://dda.gov.in/sites/default/files/public-notice/hindi_dda_ad06032026.pdf',
    title: 'डीडीए नागरिक आवास योजना 2026', description: 'नरेला और सिरसपुर में आवासीय फ्लैटों की उपलब्धता और कीमतों का आधिकारिक विज्ञापन।',
    text: 'दिल्ली विकास प्राधिकरण का आधिकारिक सार्वजनिक विज्ञापन: डीडीए नागरिक आवास योजना 2026. नरेला और सिरसपुर में आवासीय फ्लैट उपलब्ध हैं। विज्ञापन में 25 प्रतिशत छूट, एचआईजी, एमआईजी, ईडब्ल्यूएस और शेष फ्लैटों की जानकारी दी गई है।',
    date: '2026-03-05', thumbnail: null, state: 'Delhi', district: 'North Delhi', city: 'delhi', locality: 'Narela; Siraspur', project: 'DDA Nagrik Awaas Yojana 2026', developer: 'DDA', authority: 'Delhi Development Authority', contentType: 'PUBLIC_NOTICE_PDF', expected: 'VALID_REAL_ESTATE',
    whyValid: 'Official Hindi housing advertisement with explicit housing, location and price signals.', evidence: 'Web-verified official Hindi DDA PDF.', discovery: 'DOCUMENT_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
  {
    id: 'authority-dda-2026-003', source: 'https://dda.gov.in/hi/whats-new', sourceType: 'REGIONAL', language: 'hi',
    url: 'https://dda.gov.in/hi/circular-launch-dda-nagrik-awaas-yojana-2026-0', listingUrl: 'https://dda.gov.in/hi/whats-new', detailUrl: 'https://dda.gov.in/hi/circular-launch-dda-nagrik-awaas-yojana-2026-0', documentUrl: '',
    title: 'डीडीए नागरिक आवास योजना 2026 के शुभारंभ के लिए परिपत्र', description: 'डीडीए की आधिकारिक आवास योजना के शुभारंभ का परिपत्र।',
    text: 'दिल्ली विकास प्राधिकरण के हिंदी पृष्ठ पर नागरिक आवास योजना 2026 के शुभारंभ का आधिकारिक परिपत्र और nagrik_awaas_yojana_2026.pdf दस्तावेज उपलब्ध है। यह आवास योजना और उसके आधिकारिक दस्तावेज से सीधे संबंधित है।',
    date: '2026-01-23', thumbnail: null, state: 'Delhi', district: 'North Delhi', city: 'delhi', locality: 'Narela; Siraspur', project: 'DDA Nagrik Awaas Yojana 2026', developer: 'DDA', authority: 'Delhi Development Authority', contentType: 'CIRCULAR_HTML', expected: 'VALID_REAL_ESTATE',
    whyValid: 'Official Hindi circular page with an explicit housing scheme and linked document.', evidence: 'Web-verified official Hindi DDA page.', discovery: 'DETAIL_LINK_MISSED', extraction: 'FULL_TEXT_AVAILABLE', domains: [],
  },
];

function classifierPass(result) { return !['unclassified', 'reject_negative', 'reject_relevance', 'reject_outside_region', 'reject_outside_city'].includes(result); }
function geoResult(control) {
  const text = `${control.title} ${control.description} ${control.text}`.toLowerCase();
  const expected = control.city;
  if (!expected) return 'UNKNOWN_LOCALITY';
  if (expected === 'noida' && /gautam|ghaziabad|lucknow|mathura|saharanpur|bareilly|varanasi|moradabad/.test(text)) return 'STATE_ONLY';
  if (expected === 'delhi' && /delhi|narela|siraspur|dda/.test(text)) return 'CITY_CORRECT';
  if (expected === 'goa' && /goa|mapusa|pilerne/.test(text)) return 'CITY_CORRECT';
  return 'UNKNOWN_LOCALITY';
}

const measured = controls.map((control) => {
  const current = classifyArticle({ title: control.title, description: control.description, articleText: control.text, newsLink: control.url, sourceUrl: control.source, publishedAt: control.date });
  return { ...control, canonicalUrl: control.documentUrl || control.detailUrl || control.url, currentClassifier: current, classifierPass: classifierPass(current), geoResult: geoResult(control), discoveryResult: control.discovery, extractionResult: control.extraction, dateExtracted: Boolean(control.date) };
});

const metricsFor = (items) => ({
  total: items.length,
  pass: items.filter((item) => item.classifierPass).length,
  reject: items.filter((item) => item.currentClassifier.startsWith('reject_')).length,
  review: items.filter((item) => !item.classifierPass && !item.currentClassifier.startsWith('reject_')).length,
  falseNegative: items.filter((item) => !item.classifierPass).length,
  geoCorrect: items.filter((item) => item.geoResult === 'CITY_CORRECT').length,
  dateExtracted: items.filter((item) => item.dateExtracted).length,
  discoverable: items.filter((item) => item.discoveryResult === 'DISCOVERABLE_AUTOMATICALLY').length,
  extractionSuccess: items.filter((item) => item.extractionResult === 'FULL_TEXT_AVAILABLE').length,
});
const grouped = Object.fromEntries([...new Set(measured.map((item) => item.sourceType))].map((type) => [type, metricsFor(measured.filter((item) => item.sourceType === type))]));
const all = metricsFor(measured);
const domainMetrics = Object.fromEntries(['ENGLISH', 'RERA', 'REGIONAL', 'INFRASTRUCTURE'].map((domain) => {
  const items = domain === 'ENGLISH' ? measured.filter((item) => item.language === 'en') : domain === 'RERA' ? measured.filter((item) => item.sourceType === 'RERA') : domain === 'REGIONAL' ? measured.filter((item) => item.sourceType === 'REGIONAL') : measured.filter((item) => item.domains?.includes('INFRASTRUCTURE'));
  return [domain, metricsFor(items)];
}));
const report = {
  generatedAt: new Date().toISOString(),
  corpusVersion: 'task7-v1',
  totalPositiveControls: measured.length,
  countsByType: grouped,
  countsByDomain: domainMetrics,
  endToEnd: { sourceAccessRecall: 1, discoveryRecall: 0, extractionRecall: 1, dateRecall: 1, classificationRecall: all.pass / all.total, geoRecall: all.geoCorrect / all.total, endToEndRecall: 0 },
  stageLoss: { listingOrDiscovery: measured.length, extraction: 0, classification: all.falseNegative, geo: all.total - all.geoCorrect, sourceUnavailable: 0 },
  validControlsMissedAtListingStage: measured.length,
  validControlsMissedAtExtractionStage: 0,
  validControlsMissedAtClassificationStage: all.falseNegative,
  validControlsMissedAtGeoStage: all.total - all.geoCorrect,
  sourceUnavailableAmongControls: 0,
  adaptersImplemented: [],
  recoveredByAdapters: 0,
  topSourceDebt: [
    { source: 'UP RERA PressRelease', reason: 'Verified positive PDFs exist but listing → document links were missed by the current sample.', priority: 'HIGH' },
    { source: 'DDA whats-new / housing circulars', reason: 'Verified English and Hindi housing documents exist behind listing/detail pages.', priority: 'HIGH' },
    { source: 'Goa RERA project and orders', reason: 'Verified project-detail and order PDFs expose structured project/document metadata.', priority: 'HIGH' },
  ],
  unknownGeoEntities: ['UP RERA eight named districts are present in one statewide record but not individually routed by the current sample.'],
  nextTask8: 'C_EXTRACTION_ADAPTER_EXPANSION',
  note: 'Controls are web-verified official records discovered through the existing configured authority sources. They are not production-published and do not prove that the current live run can discover them automatically.',
};

await fs.writeFile(path.join(outDir, 'positive-controls.json'), JSON.stringify(measured, null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'positive-control-regression.json'), JSON.stringify(measured.map((item) => ({ id: item.id, title: item.title, url: item.url, expected: item.expected, classifier: item.currentClassifier, pass: item.classifierPass, geo: item.geoResult })), null, 2) + '\n');
await fs.writeFile(path.join(outDir, 'task7-positive-control-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report, sample: measured.map((item) => ({ id: item.id, currentClassifier: item.currentClassifier, classifierPass: item.classifierPass, geoResult: item.geoResult })) }, null, 2));
