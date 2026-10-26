import assert from "node:assert/strict";
import http from "node:http";
import { fetchArticleMetadata } from "../src/index.js";

const html = `<!doctype html>
<html>
  <head>
    <meta name="description" content="A structured property article description">
    <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"NewsArticle","datePublished":"2026-10-20T10:15:00+05:30","image":"https://example.com/property.jpg"}
    </script>
  </head>
  <body>
    <nav>Navigation must not become article evidence.</nav>
    <article><h1>Kolkata housing project approved</h1><p>${"Property development evidence. ".repeat(12)}</p></article>
  </body>
</html>`;

const server = http.createServer((request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const { port } = server.address();
  const metadata = await fetchArticleMetadata(`http://127.0.0.1:${port}/article`);
  assert.equal(metadata.publishedAt, "2026-10-20T04:45:00.000Z");
  assert.equal(metadata.publicationDateExtractionMethod, "article-page-metadata");
  assert.equal(metadata.fullArticleRead, true);
  assert.match(metadata.articleText, /Property development evidence/);
  assert.doesNotMatch(metadata.articleText, /Navigation must not become/);
  assert.equal(metadata.thumbnailImage, "https://example.com/property.jpg");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("Article metadata order regression passed: JSON-LD survives full-text cleanup.");

const selfUrl = "https://example.com/news/property-story";
const selfImageHtml = `
  <html><head>
    <title>Property story</title>
    <meta property="og:image" content="${selfUrl}">
  </head><body><article>${"Readable property development evidence. ".repeat(12)}</article></body></html>`;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(selfImageHtml, { status: 200, headers: { "content-type": "text/html" } });
try {
  const selfImageMetadata = await fetchArticleMetadata(selfUrl);
  assert.equal(selfImageMetadata.thumbnailImage, "", "an article URL must never be reused as its thumbnail URL");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Article metadata order regression passed: self-referential thumbnail URLs are rejected.");
