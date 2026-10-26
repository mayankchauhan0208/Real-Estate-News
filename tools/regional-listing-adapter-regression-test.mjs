import assert from "node:assert/strict";
import {
  applyCityCode,
  cleanArticleFields,
  detectCityCodes,
  discoverRegionalHtmlCandidates,
  isBlockedArticle,
  isPublishableArticle
} from "../src/index.js";

const sourceUrl = "https://www.anandabazar.com/topic/real-estate";
const html = `
  <html><head><title>Real Estate - Anandabazar</title></head><body>
    <nav>
      <a href="/west-bengal/midnapore">পূর্ব ও পশ্চিম মেদিনীপুর</a>
      <a href="/west-bengal/24-parganas">উত্তর ও দক্ষিণ ২৪ পরগনা</a>
    </nav>
    <section class="listing">
      <article>
        <a href="/business/kolkata-housing-sales-rise-dgtl/cid/1715823">
          কলকাতায় আবাসন বিক্রি বেড়েছে, নতুন প্রকল্পে ক্রেতাদের আগ্রহ শেষ আপডেট: ২০ অক্টোবর ২০২৬ ১০:১৫
        </a>
      </article>
      <article>
        <a href="/business/another-property-story-prnt/cid/1714887">
          শহরে নতুন আবাসন প্রকল্পের অনুমোদন দিল কর্তৃপক্ষ
        </a>
      </article>
    </section>
  </body></html>`;

const candidates = discoverRegionalHtmlCandidates(html, sourceUrl);
assert.equal(candidates.length, 2, "only content-id article links should be discovered");
assert.ok(candidates.every((candidate) => /\/cid\/\d+$/.test(candidate.newsLink)));
assert.ok(candidates.every((candidate) => !/midnapore|24-parganas/.test(candidate.newsLink)));
assert.ok(candidates.every((candidate) => candidate.title.length >= 18));
assert.ok(candidates.every((candidate) => !candidate.title.includes("শেষ আপডেট")));

console.log("Regional listing adapter regression passed: Anandabazar navigation links are excluded.");

const expressSource = "https://www.newindianexpress.com/cities/hyderabad";
const expressHtml = `
  <html><head><title>Hyderabad News - New Indian Express</title></head><body>
    <a href="/author/express-news-service">Express News Service</a>
    <a href="/cities/chennai/2026/Oct/26/unrelated-chennai-story">Unrelated Chennai story</a>
    <article>
      <a href="/cities/hyderabad/2026/Oct/26/hyderabad-housing-project-approved">
        Hyderabad housing project receives approval
      </a>
    </article>
  </body></html>`;
const expressCandidates = discoverRegionalHtmlCandidates(expressHtml, expressSource);
assert.equal(expressCandidates.length, 1, "only same-city dated New Indian Express stories should be discovered");
assert.match(expressCandidates[0].newsLink, /\/cities\/hyderabad\/2026\/Oct\/26\//);

console.log("Regional listing adapter regression passed: New Indian Express author and cross-city links are excluded.");

const dinamaniSource = "https://www.dinamani.com/all-editions/edition-chennai/chennai";
const dinamaniHtml = `
  <html><head><title>Chennai News - Dinamani</title></head><body>
    <a href="/latest-news">தற்போதைய செய்திகள் மற்றும் முக்கிய அறிவிப்புகள்</a>
    <a href="/tamilnadu/2026/Oct/26/statewide-story">தமிழ்நாடு மாநில செய்தி ஒன்று வெளியாகியுள்ளது</a>
    <article>
      <a href="/all-editions/edition-chennai/chennai/2026/Oct/26/chennai-housing-approval">
        சென்னையில் புதிய குடியிருப்பு திட்டத்துக்கு அனுமதி
      </a>
    </article>
  </body></html>`;
const dinamaniCandidates = discoverRegionalHtmlCandidates(dinamaniHtml, dinamaniSource);
assert.equal(dinamaniCandidates.length, 1, "Dinamani Chennai must exclude navigation and statewide links");
assert.match(dinamaniCandidates[0].newsLink, /\/edition-chennai\/chennai\/2026\/Oct\/26\//);

const dinamalarSource = "https://www.dinamalar.com/news/tamil-nadu-news";
const dinamalarHtml = `
  <html><head><title>Tamil Nadu News - Dinamalar</title></head><body>
    <a href="/latestmain">தற்போதைய முக்கிய செய்திகள் அனைத்தும்</a>
    <a href="/news/tamil-nadu-district-news-coimbatore/local-story/4359000">கோவை மாவட்ட செய்தி ஒன்று வெளியாகியுள்ளது</a>
    <article>
      <a href="/news/tamil-nadu-news/housing-board-approves-new-project/4359611">
        வீட்டு வசதி வாரியம் புதிய திட்டத்துக்கு அனுமதி
      </a>
    </article>
  </body></html>`;
const dinamalarCandidates = discoverRegionalHtmlCandidates(dinamalarHtml, dinamalarSource);
assert.equal(dinamalarCandidates.length, 1, "Dinamalar Tamil Nadu must exclude navigation and district-category links");
assert.match(dinamalarCandidates[0].newsLink, /\/news\/tamil-nadu-news\/[^/]+\/\d+$/);

console.log("Regional listing adapter regression passed: Tamil adapters exclude navigation and cross-surface links.");

const tamilPropertyControl = applyCityCode(cleanArticleFields({
  title: "‘ஆன்லைன்’ பத்திரப்பதிவுக்கு அரசு நிறுவனங்களுக்கும் அனுமதி",
  description: "சென்னையில் வீட்டுவசதி வாரியத்துக்கு புதிய திட்டங்களில் வீடு மற்றும் மனை விற்பனை பத்திரங்களை ஆன்லைனில் பதிவு செய்ய அனுமதி",
  articleText: "சென்னை வீட்டுவசதி வாரியம், நகர்ப்புற வாழ்விட மேம்பாட்டு வாரியம் மற்றும் ரியல் எஸ்டேட் மேம்பாட்டாளர்கள் நிலம், கட்டடம் தொடர்பான பத்திரப்பதிவை ஆன்லைனில் மேற்கொள்ளலாம்.",
  newsLink: "https://www.dinamalar.com/news/tamil-nadu-news/government-agencies-also-allowed-to-register-online/4342674",
  postedBy: "Dinamalar",
  postedByLogo: "https://www.dinamalar.com/favicon.ico",
  publishedAt: "2026-10-07T12:36:43.000Z",
  fullArticleRead: true,
  articleReadAttempted: true,
  nativeLanguageSource: true,
  language: "ta",
  languageScript: "Tamil",
  isActive: true
}));
assert.equal(isBlockedArticle(tamilPropertyControl), false, "paired Tamil property and event evidence must not be treated as generic local news");
assert.deepEqual(detectCityCodes(tamilPropertyControl), ["chennai"], "explicit Tamil Chennai evidence must route without source-city forcing");

console.log("Regional listing adapter regression passed: Tamil property-event evidence retains safe explicit-city routing.");

const patrikaSource = "https://www.patrika.com/jaipur-news/";
const patrikaHtml = `
  <html><head><title>Jaipur News - Patrika</title></head><body>
    <a href="/topic/rajasthan-panchayat-election">राजस्थान पंचायत चुनाव की ताजा खबरें यहां पढ़ें</a>
    <a href="/lucknow-news/other-city-story-21010000">दूसरे शहर की खबर यहां प्रकाशित हुई है</a>
    <article>
      <a href="/jaipur-news/jaipur-housing-project-approved-21010074">
        जयपुर में नई आवासीय परियोजना को मंजूरी मिली
      </a>
    </article>
  </body></html>`;
const patrikaCandidates = discoverRegionalHtmlCandidates(patrikaHtml, patrikaSource);
assert.equal(patrikaCandidates.length, 1, "Patrika city adapters must exclude topic and cross-city links");
assert.match(patrikaCandidates[0].newsLink, /\/jaipur-news\/[^/]+-\d+$/);

console.log("Regional listing adapter regression passed: Patrika topic and cross-city links are excluded.");

const heritageConstructionControl = applyCityCode(cleanArticleFields({
  title: "जबलपुर के बैलेंसिंग रॉक के अस्तित्व पर खतरा, आसपास चल रहा निर्माण कार्य",
  description: "प्राकृतिक धरोहर की उपेक्षा और अतिक्रमण के बीच संरक्षण की मांग उठी",
  articleText: "पर्यटन कारोबारियों ने प्राकृतिक धरोहर के संरक्षण की योजना मांगी। आसपास निर्माण और अतिक्रमण से खतरा है।",
  newsLink: "https://www.patrika.com/jabalpur-news/jabalpur-balancing-rock-tourism-heritage-conservation-20996228",
  postedBy: "Patrika",
  postedByLogo: "https://www.patrika.com/favicon.ico",
  publishedAt: "2026-10-20T02:22:41.000Z",
  fullArticleRead: true,
  articleReadAttempted: true,
  nativeLanguageSource: true,
  language: "hi",
  languageScript: "Devanagari",
  isActive: true
}));
assert.equal(isBlockedArticle(heritageConstructionControl), true, "heritage threat coverage must not manufacture a native property nexus from construction/plan words");
assert.equal(isPublishableArticle(heritageConstructionControl, new Set()), false);

const hindiHousingContrast = applyCityCode(cleanArticleFields({
  ...heritageConstructionControl,
  title: "जबलपुर में नई आवासीय परियोजना के निर्माण को मंजूरी",
  description: "शहर में 500 फ्लैट वाली आवासीय परियोजना को मंजूरी मिली",
  articleText: "जबलपुर में 500 फ्लैट और आवास वाली नई परियोजना का निर्माण शुरू होगा।",
  newsLink: "https://www.patrika.com/jabalpur-news/jabalpur-housing-project-approved-21000000"
}));
assert.equal(isBlockedArticle(hindiHousingContrast), false, "a concrete Hindi housing object plus development event must remain eligible");

console.log("Regional listing adapter regression passed: incidental Hindi construction is rejected while concrete housing remains eligible.");
