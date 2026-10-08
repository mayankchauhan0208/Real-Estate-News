import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import {
  applyCityCode,
  detectCityCodes,
  getRejectionReasons,
  isPublishableArticle,
  isUpReraPostbackListingPage,
  responseCookieHeader
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

const genericPropertyConference = {
  ...base,
  title: "Developers attend property industry conference in Hyderabad",
  description: "The conference featured panel discussions and knowledge sessions.",
  articleText: "Developers attended a real-estate industry conference with panel discussions and a knowledge session. No project, land transaction, approval, launch, financing, or construction milestone was announced.",
  cityCode: "hyderabad",
  newsLink: "https://example.com/hyderabad-property-conference"
};

const approvalAtSeminar = {
  ...base,
  title: "RERA approves Sunrise Residency during stakeholder seminar in Lucknow",
  description: "UP RERA approved the named 420-home residential project during the seminar.",
  articleText: "During a stakeholder seminar, UP RERA approved Sunrise Residency, a named 420-home residential project in Lucknow, and issued the project registration approval.",
  cityCode: "lucknow",
  newsLink: "https://example.com/lucknow-rera-project-approval"
};

const genericProptechPartnership = {
  ...base,
  title: "Proptech firms announce software platform partnership",
  description: "The companies signed an MoU for a property technology platform.",
  articleText: "Two proptech companies announced a software and platform partnership for digital services. The MoU includes no land, building, development project, property transaction, financing, approval, or construction milestone.",
  cityCode: "bangalore",
  newsLink: "https://example.com/proptech-platform-partnership"
};

const technologyApproval = {
  ...base,
  title: "Authority approves 600-home residential project alongside technology partnership",
  description: "The authority approved a named residential development in Hyderabad.",
  articleText: "Alongside a technology partnership, the authority approved Green Park Residency, a specific 600-home residential project in Hyderabad, and issued its development approval.",
  cityCode: "hyderabad",
  newsLink: "https://example.com/hyderabad-residential-approval"
};

const replayValidAurelia = {
  ...base,
  title: "Rajapushpa Aurelia Targets the Ultra-Luxury Segment with Larger Residences in Tellapur",
  description: "Aurelia offers 3 and 4 BHK homes in a 12.5-acre residential development.",
  articleText: "Rajapushpa Aurelia is a named 12.5-acre residential development in Tellapur with seven towers and 1,561 apartment units. The developer launched larger 3 and 4 BHK corner homes.",
  cityCode: "hyderabad",
  newsLink: "https://proppuls.in/rajapushpa-aurelia-tellapur-luxury-3-4-bhk-corner-homes"
};

const replayValidUpRera = {
  ...base,
  title: "UP RERA approves 12 new realty projects worth Rs 1,664 crore",
  description: "Twelve approved projects will deliver 3,090 homes and shops across six districts.",
  articleText: "UP RERA approved 12 specific real-estate projects worth Rs 1,664 crore across six districts. The approved projects will create 3,090 homes and shops, including named developments in Lucknow.",
  cityCode: "lucknow",
  newsLink: "https://hindi.news24online.com/business/up-rera-approves-12-new-realty-projects-worth-1664-crore-lucknow-ghaziabad-ayodhya/1803624/"
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
assert.equal(isPublishableArticle(genericPropertyConference, new Set()), false, "Generic property conference participation must not publish");
assert.equal(isPublishableArticle(approvalAtSeminar, new Set()), true, "A concrete project approval remains publishable when announced at a seminar");
assert.equal(isPublishableArticle(genericProptechPartnership, new Set()), false, "Generic proptech partnership must not publish");
assert.equal(isPublishableArticle(technologyApproval, new Set()), true, "A concrete residential approval remains publishable alongside a technology partnership");
assert.equal(isPublishableArticle(replayValidAurelia, new Set()), true, "Previously valid Aurelia replay record must remain publishable");
assert.equal(isPublishableArticle(replayValidUpRera, new Set()), true, "Previously valid UP RERA approval report must remain publishable");

const cookieHeaders = {
  getSetCookie: () => [
    "ASP.NET_SessionId=abc123; path=/; HttpOnly; SameSite=Lax",
    "__AntiXsrfToken=token456; path=/; HttpOnly",
    "ASP.NET_SessionId=abc123; path=/; HttpOnly"
  ]
};
assert.equal(
  responseCookieHeader(cookieHeaders),
  "ASP.NET_SessionId=abc123; __AntiXsrfToken=token456",
  "ASP.NET postback must send cookie pairs, not raw Set-Cookie attributes"
);
const returnedListing = cheerio.load(`
  <h1>Press Releases</h1>
  <nav><a href="/pdf/Best_Practices_by_UP-RERA.pdf">Best Practices</a></nav>
  <table><tr><th>View Release</th></tr>
    <tr><td><a id="ctl00_grid_ctl02_lnkdocname" href="javascript:__doPostBack('a','')">View File</a></td></tr>
    <tr><td><a id="ctl00_grid_ctl03_lnkdocname" href="javascript:__doPostBack('b','')">View File</a></td></tr>
  </table>
`);
assert.equal(
  isUpReraPostbackListingPage(returnedListing),
  true,
  "A returned release listing must not donate an unrelated navigation PDF to the selected event"
);

console.log("Targeted live defect regression passed: replay false-positive classes generalized, concrete event contrasts preserved, and ASP.NET cookies normalized.");
