import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inventoryPath = path.join(root, "reports/task42-prep/city-coverage-234.json");
const statePath = path.join(root, "reports/source-audits/task42/coverage-research-state.json");
const batchA = [
  "new_delhi", "delhi_ncr", "rohtak", "ambala", "palwal", "indore", "jabalpur", "ujjain",
  "patna", "navi_mumbai", "nashik", "coimbatore", "warangal", "rajkot", "kota", "raigad",
  "jamshedpur", "dhanbad"
];
const verifiedProof = new Map([
  ["new_delhi", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT", evidence: "DDA housing circular register and direct official document proof" }],
  ["indore", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT", evidence: "IDA scheme register with dated bilingual residential property rows" }],
  ["nashik", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT", evidence: "MHADA Nashik Board lottery/booklet/advertisement surface" }],
  ["kota", { status: "BENCHMARKED", result: "NO_QUALIFYING_STORY_FOUND_IN_DEFINED_SEARCH", evidence: "Official Kota UDH/UIT auction archive inspected; no current qualifying event" }],
  ["warangal", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT", evidence: "Official Telangana Housing Board surface lists Warangal LIG-flat allotment results and Telangana plot/flat events" }],
  ["coimbatore", { status: "BENCHMARKED", result: "REVIEW_UNCERTAIN", evidence: "Dinamalar Tamil property-expo report was located, but a generic expo promotion is not sufficient qualifying development evidence; retained as review-only." }],
  ["jabalpur", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT_REJECT_NEGATIVE", evidence: "Hindi local report about alleged illegal plot allocation/developer misconduct; relevant but adverse" }],
  ["rajkot", { status: "BENCHMARKED", result: "VERIFIED_RELEVANT_REJECT_NEGATIVE", evidence: "Rajkot real-estate liquidity-crisis report; relevant but adverse and not positive-only publishable" }],
  ["palwal", { status: "BENCHMARKED", result: "KNOWN_SUPPLY_CAPTURED", evidence: "HRERA official project detail: Pinewood City, Village Prithla Sector 6 Prithla, Palwal; HRERA-PKL-PWL-923-2026; approved 25-Jun-2026 with certificate uploaded." }],
  ["patna", { status: "BENCHMARKED", result: "KNOWN_SUPPLY_CAPTURED", evidence: "Official Patna Metropolitan Area Authority notices: Bihar Building Bylaws 2026 draft and Patliputra Greenfield Satellite Township special-area property-sale notification, published 30-Sep-2026." }],
  ["navi_mumbai", { status: "BENCHMARKED", result: "KNOWN_SUPPLY_CAPTURED", evidence: "CIDCO official 2026 Demand Registration Scheme: 473 apartments at CBD Belapur, Navi Mumbai; official registration/instruction surface inspected." }],
  ["ujjain", { status: "BENCHMARKED", result: "REVIEW_UNCERTAIN", evidence: "Official Ujjain district property guideline 2026-27 located; property/valuation relevance is verified, but qualifying positive news status requires document review." }],
  ["ambala", { status: "BENCHMARKED", result: "NO_QUALIFYING_STORY_FOUND_IN_DEFINED_SEARCH", evidence: "Haryana Housing Board Ambala surface inspected; accessible inventory is old/static and no current qualifying positive event was verified." }]
]);

const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const previous = await fs.readFile(statePath, "utf8").then(JSON.parse).catch(() => null);
const priorCities = new Map((previous?.cities || []).map((city) => [city.cityCode, city]));
const cities = inventory.cities.map((city) => {
  const existing = priorCities.get(city.city_code);
  const proof = verifiedProof.get(city.city_code);
  if (existing && proof && existing.researchStatus !== "BENCHMARKED") {
    return { ...existing, researchStatus: proof.status, researchResult: proof.result, evidence: [...(existing.evidence || []), proof.evidence], lastResearchedAt: new Date().toISOString() };
  }
  if (!existing && proof) {
    return {
      cityCode: city.city_code,
      city: city.city,
      state: city.state,
      baselineStatus: city.status,
      baselineArticles45d: city.articles_45d,
      configuredSources: city.configured_sources,
      nativeSources: city.native_sources,
      reraAuthoritySources: city.rera_authority_sources,
      researchStatus: proof.status,
      researchResult: proof.result,
      evidence: [proof.evidence],
      lastResearchedAt: new Date().toISOString()
    };
  }
  return existing || {
    cityCode: city.city_code,
    city: city.city,
    state: city.state,
    baselineStatus: city.status,
    baselineArticles45d: city.articles_45d,
    configuredSources: city.configured_sources,
    nativeSources: city.native_sources,
    reraAuthoritySources: city.rera_authority_sources,
    researchStatus: "NOT_BENCHMARKED",
    evidence: [],
    lastResearchedAt: ""
  };
});
const nextBatch = cities
  .filter((city) => city.researchStatus !== "BENCHMARKED")
  .sort((left, right) => {
    const leftPriority = batchA.indexOf(left.cityCode);
    const rightPriority = batchA.indexOf(right.cityCode);
    return (leftPriority < 0 ? 999 : leftPriority) - (rightPriority < 0 ? 999 : rightPriority) || left.cityCode.localeCompare(right.cityCode);
  })
  .slice(0, batchA.length)
  .map((city) => city.cityCode);
const state = {
  task: "42",
  generatedAt: new Date().toISOString(),
  readOnlyResearchOnly: true,
  schedulerStateUntouched: true,
  totals: {
    cities: cities.length,
    zeroCities: cities.filter((city) => city.baselineStatus === "ZERO_PRODUCTION_UNKNOWN_CAUSE").length,
    lowCoverageCities: cities.filter((city) => city.baselineStatus === "LOW_COVERAGE").length,
    benchmarked: cities.filter((city) => city.researchStatus === "BENCHMARKED").length,
    remaining: cities.filter((city) => city.researchStatus !== "BENCHMARKED").length
  },
  activeBatch: nextBatch,
  cities
};
await fs.mkdir(path.dirname(statePath), { recursive: true });
await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
console.log(JSON.stringify({ totals: state.totals, activeBatch: state.activeBatch, statePath }, null, 2));
