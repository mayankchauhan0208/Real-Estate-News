import fs from "node:fs/promises";
import { extractArticleEvidence } from "./article-body-extractor.mjs";
import { workbookCityRules } from "../src/city-config.js";

const fixture = (body, extra = "") => `<html><head><meta name="description" content="Development update"><script type="application/ld+json">${JSON.stringify({ "@type": "NewsArticle", headline: "Project development update", datePublished: "2026-09-30", articleBody: extra })}</script></head><body>${body}</body></html>`;
const cases = [
  { name: "clean", html: fixture(`<article><h1>Delhi development update</h1><p>Delhi authorities approved a new housing project near the planned corridor.</p><p>The project adds homes and public infrastructure for local residents.</p><p>Construction planning will proceed under the published development framework.</p></article>`), city: "delhi" },
  { name: "js-and-navigation", html: fixture(`<header>Login Get App Subscribe</header><nav>Home View all News Advertise With Us</nav><article><h1>Delhi map update</h1><p>Delhi planning officials released a digital map for land-use planning.</p><p>The map supports transparent development decisions across the city.</p><p>Residents can review the project and planning information.</p></article><script>function bad(){document.querySelector('nav');}</script>`), city: "delhi" },
  { name: "ht-style", html: fixture(`<div class="story-details"><h1>Greater Noida project update</h1><p>Greater Noida approved a landmark development near Yamuna Expressway.</p><p>The authority said the project will improve the regional gateway.</p><p>Work will follow the notified development plan and approvals.</p></div>`), city: "noida" },
  { name: "index", html: fixture(`<header>Latest News</header><main><a href="/a">Read more</a></main>`) },
  { name: "negative", html: fixture(`<article><h1>Housing project court dispute</h1><p>A court ordered a halt after a fraud complaint by homebuyers.</p><p>The dispute concerns refunds and alleged irregularities.</p><p>Authorities issued a notice while the case continues.</p></article>`) },
  { name: "statewide", html: fixture(`<article><h1>Maharashtra redevelopment policy</h1><p>Maharashtra announced a statewide redevelopment framework.</p><p>The policy applies across districts and does not identify one supported city.</p><p>Officials published the general implementation schedule.</p></article>`) }
];
for (const test of cases) {
  const result = extractArticleEvidence(test.html, { url: `https://example.test/${test.name}`, title: test.name, cityRules: workbookCityRules });
  if (test.name === "index" && result.readable) throw new Error("index fixture passed quality gate");
  if (test.name !== "index" && !result.textLength) throw new Error(`${test.name} extracted no evidence`);
  if (test.city && !result.geoEvidence.some((item) => item.candidateCity === test.city)) throw new Error(`${test.name} lost geo evidence`);
}
await fs.access("reports/source-audits/task17/editorial-review-audited-v2.csv");
console.log(JSON.stringify({ passed: true, fixtures: cases.length, offline: true }));
