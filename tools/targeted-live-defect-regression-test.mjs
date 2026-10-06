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
  title: "County Group to develop luxury homes in Gurugram",
  description: "County Group plans a residential project in Gurugram.",
  articleText: "County Group will develop 844 apartments in Sector 88A, Gurugram. The article also notes an earlier 226-apartment project in Sector 151, Noida.",
  cityCode: "gurugram",
  newsLink: "https://example.com/gurugram-county-project"
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

console.log("Targeted live defect regression passed: corporate FP blocked, Gujarat fallback removed, Wayanad nearest-city fallback blocked, Prayagraj preserved, property corporate contrast preserved, substring geo blocked, headline city precedence protected.");
