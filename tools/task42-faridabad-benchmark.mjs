import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outDir = path.join(root, "reports/task42-prep/task42-faridabad-benchmark");
fs.mkdirSync(outDir, { recursive: true });

// Frozen before the local engine comparison. Positive rows come from independent
// public reporting or a developer/authority publication; controls are intentionally
// local but have no qualifying property/development nexus.
const positives = [
  {
    id: "FBD-POS-001",
    source: "BPTP official",
    url: "https://www.bptp.com/media/bptp-limited-launches-skynest-in-sector-80-greater-faridabad-with-a-gdv-of-rs-1800-crore",
    originalTitle: "BPTP Limited launches Skynest in Sector 80, Greater Faridabad",
    language: "en",
    date: "2026-04-21",
    eventClass: "RESIDENTIAL_PROJECT_LAUNCH",
    expectedGeo: ["faridabad"],
    whyQualifying: "Official developer release names a residential development, Sector 80, Greater Faridabad and project investment/GDV."
  },
  {
    id: "FBD-POS-002",
    source: "The Financial Express",
    url: "https://www.financialexpress.com/business/news/faridabad-real-estate-market-gets-a-fresh-push-from-infrastructure-rising-home-demand/4336419/",
    originalTitle: "Faridabad real estate market gets a fresh push from infrastructure, rising home demand",
    language: "en",
    date: "2026-09-10",
    eventClass: "PROPERTY_LINKED_INFRASTRUCTURE",
    expectedGeo: ["faridabad"],
    whyQualifying: "Independent property-market report explicitly links Faridabad infrastructure and housing demand."
  },
  {
    id: "FBD-POS-003",
    source: "MagicBricks",
    url: "https://www.magicbricks.com/news/faridabad-to-get-new-sectors-along-yamuna-high-rise-buildings-planned-pmmb/151487.html",
    originalTitle: "Faridabad to get new sectors along Yamuna, high-rise buildings planned",
    language: "en",
    date: "2026-09-11",
    eventClass: "URBAN_DEVELOPMENT_HOUSING",
    expectedGeo: ["faridabad"],
    whyQualifying: "Public property publication reports planned sectors, high-rise housing and related urban development in Faridabad."
  },
  {
    id: "FBD-POS-004",
    source: "NewsVoir / BPTP release",
    url: "https://www.newsvoir.com/release/bptp-commences-allotments-for-skynest-towers-following-overwhelming-response-setting-a-new-benchmark-for-luxury-living-in-faridabad-36205.html",
    originalTitle: "BPTP commences allotments for SkyNest Towers in Faridabad",
    language: "en",
    date: "2026-07-17",
    eventClass: "RESIDENTIAL_ALLOTMENT",
    expectedGeo: ["faridabad"],
    whyQualifying: "Named residential project, allotment milestone, Sector 80 Faridabad location and HRERA registration are stated."
  }
];

const negatives = [
  {
    id: "FBD-NEG-001",
    source: "Amar Ujala",
    url: "https://www.amarujala.com/video/delhi-ncr/faridabad/video-drunk-motorcyclist-rams-into-auto-rickshaw-in-faridabad-2026-10-03",
    originalTitle: "Faridabad traffic incident involving a drunk motorcyclist",
    language: "hi",
    date: "2026-10-03",
    eventClass: "CRIME_OR_INCIDENT",
    expectedGeo: ["faridabad"],
    whyQualifying: "Hard negative: local Faridabad incident with no property or development nexus."
  },
  {
    id: "FBD-NEG-003",
    source: "Control",
    url: "https://example.com/faridabad-generic-electricity-control",
    originalTitle: "Faridabad electricity supply maintenance notice",
    language: "en",
    date: "2026-09-30",
    eventClass: "GENERIC_ELECTRICITY",
    expectedGeo: ["faridabad"],
    whyQualifying: "Hard negative control: generic utility item without an explicit property, project or development nexus."
  }
];

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  frozenBeforeEngineComparison: true,
  city: "faridabad",
  positives,
  negatives,
  note: "Public supply was frozen before comparison; no truth row is changed after observing Brokket output."
};

fs.writeFileSync(path.join(outDir, "faridabad-benchmark.json"), JSON.stringify(manifest, null, 2) + "\n");
const rows = [...positives, ...negatives];
const header = ["ID", "SOURCE", "URL", "ORIGINAL_TITLE", "LANGUAGE", "DATE", "EVENT_CLASS", "EXPECTED_GEO", "WHY_QUALIFYING"];
const csv = [header, ...rows.map((row) => [row.id, row.source, row.url, row.originalTitle, row.language, row.date, row.eventClass, row.expectedGeo.join("|"), row.whyQualifying])]
  .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
  .join("\n") + "\n";
fs.writeFileSync(path.join(outDir, "faridabad-benchmark.csv"), csv);
console.log(JSON.stringify({ totalFrozen: rows.length, positives: positives.length, negatives: negatives.length, output: outDir }, null, 2));
