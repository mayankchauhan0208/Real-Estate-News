import assert from "node:assert/strict";
import { discoverRegionalHtmlCandidates } from "../src/index.js";

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
