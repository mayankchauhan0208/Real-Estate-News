import assert from "node:assert/strict";
import {
  applyCityCode,
  detectCityCodes,
  getRejectionReasons,
  isPublishableArticle
} from "../src/index.js";

const base = {
  description: "",
  newsLink: "https://example.com/article",
  postedBy: "Test source",
  fullArticleRead: true,
  articleReadAttempted: true,
  isActive: true
};

const cci = {
  ...base,
  title: "CCI approves JSW internal restructuring, three more deals",
  description: "CCI approved deals involving highways, hospitality, steel and pharmaceuticals.",
  articleText: "The Competition Commission of India approved four deals. JSW will restructure BMM Ispat into JSW Steel. A hospitality developer and highway companies were also involved. The road companies operate highway stretches in Andhra Pradesh, Odisha and Gujarat.",
  cityCode: "gujarat",
  newsLink: "https://economictimes.indiatimes.com/news/company/corporate-trends/cci-jsw-deals"
};

const prayagraj = {
  ...base,
  title: "Prayagraj plans to build 1,200 government flats in Naini, Jhunsi amid housing shortage",
  description: "Prayagraj administration proposes 1,200 new government flats in Naini and Jhunsi.",
  articleText: "PRAYAGRAJ: The administration plans to construct nearly 1,200 flats for government employees in Naini and Jhunsi using vacant government land. The proposal covers residential colonies and housing construction.",
  cityCode: "allahabad",
  newsLink: "https://realty.economictimes.indiatimes.com/news/residential/prayagraj-flats"
};

const wayanad = {
  ...base,
  title: "Rehabilitation township to be ready by Oct-end: Kerala agriculture minister",
  description: "Wayanad rehabilitation township construction is nearing completion.",
  articleText: "KOZHIKODE: The reconstruction of homes for landslide survivors in Kalpetta, Wayanad will be completed by October-end. The township includes residences, a market, playground and health centre.",
  cityCode: "calicut",
  newsLink: "https://realty.economictimes.indiatimes.com/news/residential/wayanad-township"
};

const corporateProperty = {
  ...base,
  title: "CCI approves developer acquisition of residential land parcel",
  description: "A developer acquired a named residential land parcel for a housing project.",
  articleText: "The Competition Commission approved the acquisition of a residential land parcel for development of a named housing project in Noida.",
  cityCode: "noida",
  newsLink: "https://example.com/noida-residential-land"
};

const substringOnly = {
  ...base,
  title: "Goahead housing project receives approval",
  description: "A housing project received approval.",
  articleText: "A housing project received approval, but the article does not identify Goa or another supported event city.",
  newsLink: "https://example.com/goahead-project"
};

const headlineCityAgainstComparison = {
  ...base,
  title: "County Group to invest Rs 2,500 cr to develop luxury homes in Gurugram",
  description: "County Group plans a residential project in Sector 151, Noida.",
  articleText: "County Group will develop 844 apartments in Sector 88A, Gurugram. The article also notes an earlier 226-apartment project in Sector 151, Noida.",
  cityCode: "noida",
  sourceUrl: "https://torbitrealty.com/category/news/city-updates/gurugram/",
  newsLink: "https://torbitrealty.com/county-group-to-invest-rs-2500-cr-to-develop-luxury-homes-in-gurugram/"
};

const reraSeminar = {
  ...base,
  title: "Ranchi RERA seminar to guide stakeholders on the Act",
  description: "Jharkhand RERA will hold a seminar for stakeholders in Ranchi.",
  articleText: "The authority is organising a seminar to explain the RERA Act and guide stakeholders. The event is a routine awareness session and announces no project registration, approval, development, or property transaction.",
  cityCode: "ranchi",
  newsLink: "https://hindi.news24online.com/gov-news/jharkhand-rera-seminar-ranchi-real-estate/1739397/"
};

const urbanTechCollaboration = {
  ...base,
  title: "CMC joins hands with T-Works to develop tech solutions for urban challenges",
  description: "The organisations will collaborate on technology solutions for civic challenges.",
  articleText: "CMC and T-Works signed an agreement to develop technology solutions for urban challenges, including digital tools and civic innovation. No land, housing, property, real-estate project, or development approval was announced.",
  cityCode: "hyderabad",
  newsLink: "https://proppuls.in/cmc-joins-hands-with-t-works-to-develop-tech-solutions-for-urban-challenges"
};

const routedCci = applyCityCode(cci);
assert.equal(routedCci.cityCode, "", "CCI corporate transaction must not inherit Gujarat");
assert.equal(isPublishableArticle(routedCci, new Set()), false, "CCI corporate transaction must not publish");
assert.ok(getRejectionReasons(routedCci, new Set()).some((reason) => reason.includes("not positive target")));

const routedPrayagraj = applyCityCode(prayagraj);
assert.equal(routedPrayagraj.cityCode, "allahabad", "Prayagraj must retain the intended Allahabad destination");
assert.equal(isPublishableArticle(routedPrayagraj, new Set()), true, "Prayagraj housing construction must remain publishable");

const routedWayanad = applyCityCode(wayanad);
assert.equal(routedWayanad.cityCode, "", "Unsupported Wayanad event must not route to Calicut");
assert.ok(getRejectionReasons(routedWayanad, new Set()).includes("review: NO_SUPPORTED_EVENT_CITY"));

const detectedCorporateProperty = detectCityCodes(corporateProperty);
assert.deepEqual(detectedCorporateProperty, ["noida"], "Concrete corporate property event must remain routable");
assert.equal(isPublishableArticle(applyCityCode(corporateProperty), new Set()), true, "Concrete corporate property event must remain publishable");

assert.deepEqual(detectCityCodes(substringOnly), [], "City aliases must not match inside unrelated words");

assert.deepEqual(
  detectCityCodes(headlineCityAgainstComparison),
  ["gurugram"],
  "A single explicit headline event city must outrank secondary comparison geography"
);
assert.equal(
  applyCityCode(headlineCityAgainstComparison).cityCode,
  "gurugram",
  "Headline event city must not be reassigned to a comparison city"
);

assert.equal(isPublishableArticle(reraSeminar, new Set()), false, "Routine non-official RERA seminar coverage must not publish");
assert.ok(getRejectionReasons(reraSeminar, new Set()).some((reason) => reason.includes("not positive target")));
assert.equal(isPublishableArticle(urbanTechCollaboration, new Set()), false, "Urban-tech collaboration without a property event must not publish");
assert.ok(getRejectionReasons(urbanTechCollaboration, new Set()).some((reason) => reason.includes("not positive target")));

console.log("Targeted live defect regression passed: corporate FP blocked, Gujarat fallback removed, Wayanad nearest-city fallback blocked, Prayagraj preserved, property corporate contrast preserved, substring geo blocked, headline city precedence protected, routine RERA seminar blocked, urban-tech collaboration blocked.");
