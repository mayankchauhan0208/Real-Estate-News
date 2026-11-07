import fs from "node:fs";
import assert from "node:assert/strict";

const settings = JSON.parse(fs.readFileSync("config/admin-settings.json", "utf8"));
const expected = new Map([
  ["regional-jagran-gurugram", ["gurugram"]],
  ["regional-jagran-lucknow", ["lucknow"]],
  ["regional-jagran-noida", ["noida"]],
  ["regional-jagran-ghaziabad", ["ghaziabad"]],
  ["regional-jagran-kanpur", ["kanpur"]],
  ["regional-jagran-varanasi", ["varanasi"]],
  ["regional-jagran-agra", ["agra"]],
  ["regional-jagran-meerut", ["meerut"]],
  ["regional-jagran-prayagraj", ["allahabad"]],
  ["regional-jagran-rohtak", ["rohtak"]],
  ["regional-jagran-sonipat", ["sonipat"]],
  ["regional-jagran-panipat", ["panipat"]],
  ["regional-jagran-karnal", ["karnal"]],
  ["regional-jagran-palwal", ["palwal"]],
  ["regional-jagran-rewari", ["rewari"]],
  ["regional-jagran-hapur", ["hapur"]],
  ["regional-jagran-aligarh", ["aligarh"]],
  ["regional-jagran-moradabad", ["moradabad"]],
  ["regional-jagran-mathura", ["mathura", "vrindavan"]],
  ["regional-jagran-panchkula", ["panchkula"]],
  ["regional-jagran-ambala", ["ambala"]],
  ["regional-jagran-kurukshetra", ["kurukshetra"]],
  ["regional-jagran-yamunanagar", ["yamunanagar"]]
]);

const sources = settings.manualSources.filter((source) => expected.has(source.id));
assert.equal(sources.length, expected.size, "all verified Jagran city sources must be configured");

for (const source of sources) {
  assert.equal(source.enabled, true, `${source.id} must remain enabled after the clean event-core dry proof`);
  assert.equal(source.category, "regional-hindi", `${source.id} must retain native-language metadata`);
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW", `${source.id} must not bypass editorial safeguards`);
  assert.deepEqual(source.cityCodes, expected.get(source.id), `${source.id} must remain city scoped`);
  assert.match(source.url, /^https:\/\/www\.jagran\.com\/(?:haryana|uttar-pradesh)\//);
}

const ids = settings.manualSources.map((source) => source.id);
const urls = settings.manualSources.map((source) => source.url.replace(/\/+$/, "").toLowerCase());
assert.equal(new Set(ids).size, ids.length, "manual source IDs must be unique");
assert.equal(new Set(urls).size, urls.length, "manual source URLs must be unique");

const retiredSourceIds = [
  "id-1945181977",
  "id-73416366",
  "id-1403152805",
  "id-1449511912",
  "id-757010052",
  "id-1293757423",
  "id-1239259165",
  "id-501530784",
  "id-2032380169",
  "id-1929816154",
  "id-948416396",
  "id-1045186369",
  "id-495256027",
  "manual-v3-b9f3e91f2af571c8",
  "id-1710371250",
  "manual-v3-85936e8c3f05f018",
  "manual-v3-5798ea1a5fbdd49e",
  "id-1755963750"
];
for (const id of retiredSourceIds) {
  assert.equal(settings.manualSources.find((source) => source.id === id)?.enabled, false, `${id} must stay retired after a confirmed source-health failure`);
}

const mintRealEstate = settings.manualSources.find((source) => source.id === "national-mint-real-estate");
assert.ok(mintRealEstate, "verified Mint real-estate replacement must be configured");
assert.equal(mintRealEstate.url, "https://www.livemint.com/industry/real-estate");
assert.equal(mintRealEstate.enabled, true);
assert.equal(mintRealEstate.category, "national-property");
assert.equal(mintRealEstate.sourceMode, "ACTIVE_FOR_REVIEW", "new national source must not bypass editorial safeguards");

const anandabazar = settings.manualSources.find((source) => source.id === "regional-anandabazar-real-estate");
assert.ok(anandabazar, "verified Anandabazar Bengali real-estate surface must be configured");
assert.equal(anandabazar.enabled, true);
assert.equal(anandabazar.category, "regional-bengali");
assert.equal(anandabazar.sourceMode, "ACTIVE_FOR_REVIEW", "new regional source must remain review-only");
assert.deepEqual(anandabazar.cityCodes, ["kolkata"]);

const expressExpected = new Map([
  ["regional-new-indian-express-hyderabad", ["hyderabad"]],
  ["regional-new-indian-express-chennai", ["chennai"]],
  ["regional-new-indian-express-bengaluru", ["bangalore"]],
  ["regional-new-indian-express-kochi", ["kochi"]]
]);
for (const [id, cityCodes] of expressExpected) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-english");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
}

const tamilExpected = new Map([
  ["regional-dinamani-tamil-nadu", []],
  ["regional-dinamani-chennai", ["chennai"]],
  ["regional-dinamalar-tamil-nadu", []]
]);
for (const [id, cityCodes] of tamilExpected) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-tamil");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
}

for (const id of ["id-1800000012", "id-196410002", "id-196410004", "id-196410005"]) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.equal(source?.sourceMode, "ACTIVE_FOR_REVIEW", `${id} must be explicitly subject to regional review telemetry`);
}

const patrikaExpected = new Map([
  ["regional-patrika-jaipur", ["jaipur"]],
  ["regional-patrika-bhopal", ["bhopal"]],
  ["regional-patrika-indore", ["indore"]],
  ["regional-patrika-jabalpur", ["jabalpur"]],
  ["regional-patrika-raipur", ["raipur"]],
  ["regional-patrika-udaipur", ["udaipur"]],
  ["regional-patrika-noida", ["noida"]],
  ["regional-patrika-gwalior", ["gwalior"]],
  ["regional-patrika-ujjain", ["ujjain"]],
  ["regional-patrika-sagar", ["sagar"]],
  ["regional-patrika-dewas", ["dewas"]],
  ["regional-patrika-satna", ["satna"]],
  ["regional-patrika-ratlam", ["ratlam"]],
  ["regional-patrika-rewa", ["rewa"]],
  ["regional-patrika-kota", ["kota"]],
  ["regional-patrika-jodhpur", ["jodhpur"]],
  ["regional-patrika-ajmer", ["ajmer"]],
  ["regional-patrika-alwar", ["alwar"]],
  ["regional-patrika-bhiwadi", ["bhiwadi"]]
]);
for (const [id, cityCodes] of patrikaExpected) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-hindi");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
}

const kotputliBehror = settings.manualSources.find((source) => source.id === "regional-bhaskar-kotputli-behror");
assert.ok(kotputliBehror, "verified Kotputli-Behror Hindi surface must cover Neemrana-area stories with direct event evidence");
assert.equal(kotputliBehror.url, "https://www.bhaskar.com/local/rajasthan/kotputli/");
assert.equal(kotputliBehror.enabled, true);
assert.equal(kotputliBehror.category, "regional-hindi");
assert.equal(kotputliBehror.sourceMode, "ACTIVE_FOR_REVIEW", "district coverage must not infer a city or bypass review");
assert.deepEqual(kotputliBehror.cityCodes, ["neemrana"]);

const amarUjalaAlwar = settings.manualSources.find((source) => source.id === "regional-amarujala-alwar");
assert.ok(amarUjalaAlwar, "verified Alwar Hindi surface must provide an independent nearby-Delhi regional desk");
assert.equal(amarUjalaAlwar.url, "https://www.amarujala.com/rajasthan/alwar");
assert.equal(amarUjalaAlwar.enabled, true);
assert.equal(amarUjalaAlwar.category, "regional-hindi");
assert.equal(amarUjalaAlwar.sourceMode, "ACTIVE_FOR_REVIEW", "general local coverage must remain review-gated");
assert.deepEqual(amarUjalaAlwar.cityCodes, ["alwar"]);

const divyaBhaskarGujarati = new Map([
  ["regional-divyabhaskar-anand", ["anand"]],
  ["regional-divyabhaskar-bharuch", ["bharuch"]],
  ["regional-divyabhaskar-navsari", ["navsari"]],
  ["regional-divyabhaskar-valsad", ["valsad"]],
  ["regional-divyabhaskar-vapi", ["vapi"]],
  ["regional-divyabhaskar-kutch", ["kutch"]],
  ["regional-divyabhaskar-patan", ["patan"]],
  ["regional-divyabhaskar-surendranagar", ["surendranagar"]],
  ["regional-divyabhaskar-banaskantha", ["banaskantha"]],
  ["regional-divyabhaskar-dholera", ["dholera"]],
  ["regional-divyabhaskar-kheda", ["kheda"]],
  ["regional-divyabhaskar-sabarkantha", ["sabarkantha"]],
  ["regional-divyabhaskar-bardoli", ["bardoli"]],
  ["regional-divyabhaskar-kalol", ["kalol"]]
]);
for (const [id, cityCodes] of divyaBhaskarGujarati) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured after live extraction proof`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-gujarati");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
  assert.match(source.url, /^https:\/\/www\.divyabhaskar\.co\.in\/local\/gujarat\//);
}

const lokmatMarathi = new Map([
  ["regional-lokmat-ahmadnagar", ["ahmednagar"]],
  ["regional-lokmat-akola", ["akola"]],
  ["regional-lokmat-amravati", ["amravati"]],
  ["regional-lokmat-jalgaon", ["jalgaon"]],
  ["regional-lokmat-solapur", ["solapur"]],
  ["regional-lokmat-kolhapur", ["kolhapur"]],
  ["regional-lokmat-nanded", ["nanded"]],
  ["regional-lokmat-latur", ["latur"]],
  ["regional-lokmat-sangli", ["sangli"]],
  ["regional-lokmat-ratnagiri", ["ratnagiri"]],
  ["regional-lokmat-chandrapur", ["chandrapur"]],
  ["regional-lokmat-dhule", ["dhule"]],
  ["regional-lokmat-beed", ["beed"]],
  ["regional-lokmat-dharashiv", ["osmanabad"]],
  ["regional-lokmat-yavatmal", ["yavatmal"]]
]);
for (const [id, cityCodes] of lokmatMarathi) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured after live extraction proof`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-marathi");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
  assert.match(source.url, /^https:\/\/www\.lokmat\.com\//);
}

const otherMarathiRegional = new Map([
  ["regional-esakal-jalna", ["jalna"]],
  ["regional-dainikgomantak-sindhudurg", ["sindhudurg"]]
]);
for (const [id, cityCodes] of otherMarathiRegional) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.ok(source, `${id} must be configured after live extraction proof`);
  assert.equal(source.enabled, true);
  assert.equal(source.category, "regional-marathi");
  assert.equal(source.sourceMode, "ACTIVE_FOR_REVIEW");
  assert.deepEqual(source.cityCodes, cityCodes);
}

delete process.env.ENABLE_EXPERIMENTAL_SOURCES;
const defaultRuntime = (await import("../src/index.js")).getSourceUrls();
assert.equal(defaultRuntime.some((url) => url.includes("jagran.com")), false, "experimental sources must still require explicit runtime opt-in");

process.env.ENABLE_EXPERIMENTAL_SOURCES = "true";
const productionRuntime = (await import(`../src/index.js?production-opt-in=${Date.now()}`)).getSourceUrls();
assert.equal(productionRuntime.filter((url) => url.includes("jagran.com")).length, expected.size, "all verified Jagran surfaces must remain in the production runtime");
assert.equal(productionRuntime.filter((url) => url.includes("anandabazar.com/topic/real-estate")).length, 1, "verified Bengali surface must be selectable with experimental opt-in");
assert.equal(productionRuntime.filter((url) => url.includes("newindianexpress.com/cities/")).length, expressExpected.size, "verified New Indian Express city surfaces must be selectable with experimental opt-in");
assert.equal(productionRuntime.filter((url) => /dinamani\.com|dinamalar\.com/.test(url)).length, tamilExpected.size, "verified Tamil surfaces must be selectable with experimental opt-in");
assert.equal(productionRuntime.filter((url) => /patrika\.com\/(?:jaipur|bhopal|indore|jabalpur|raipur|udaipur|noida|gwalior|ujjain|sagar|dewas|satna|ratlam|rewa|kota|jodhpur|ajmer|alwar|bhiwadi)-news/i.test(url)).length, patrikaExpected.size, "verified Patrika city surfaces must be selectable with experimental opt-in");
assert.equal(productionRuntime.filter((url) => url === kotputliBehror.url).length, 1, "Kotputli-Behror must be selectable only with experimental opt-in");
assert.equal(productionRuntime.filter((url) => url === amarUjalaAlwar.url).length, 1, "Amar Ujala Alwar must be selectable only with experimental opt-in");
assert.equal(productionRuntime.filter((url) => url.includes("divyabhaskar.co.in/local/gujarat/")).length, divyaBhaskarGujarati.size, "verified Gujarati local desks must be selectable only with experimental opt-in");
assert.equal(productionRuntime.filter((url) => [...lokmatMarathi.keys()].some((id) => settings.manualSources.find((source) => source.id === id)?.url === url)).length, lokmatMarathi.size, "verified Marathi local desks must be selectable only with experimental opt-in");
assert.equal(productionRuntime.filter((url) => [...otherMarathiRegional.keys()].some((id) => settings.manualSources.find((source) => source.id === id)?.url === url)).length, otherMarathiRegional.size, "verified Sakal-family Marathi desks must be selectable only with experimental opt-in");
assert.equal(defaultRuntime.includes(mintRealEstate.url), true, "verified Mint real-estate source must be selected in the normal runtime");
for (const id of retiredSourceIds) {
  const source = settings.manualSources.find((candidate) => candidate.id === id);
  assert.equal(defaultRuntime.includes(source.url), false, `${id} must not consume normal runtime capacity`);
}

console.log(`India source expansion safety regression passed: ${sources.length} verified Jagran city surfaces are enabled after the clean event-core dry proof.`);
