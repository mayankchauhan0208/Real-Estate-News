import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { extractDateHierarchy, extractJsonLd, parseSourceDate } from "./extraction-helpers.mjs";

assert.equal(parseSourceDate("03/04/2026", { dateOrder: "DMY" }).value, "2026-04-03T12:00:00.000Z");
assert.equal(parseSourceDate("03/04/2026", {}).value, "");
assert.equal(parseSourceDate("3 April 2026").value, "2026-04-03T12:00:00.000Z");

const jsonLdHtml = `<html><head><script type="application/ld+json">{"@type":"NewsArticle","url":"/article/1","datePublished":"2026-09-30T09:00:00+05:30","articleBody":"A sufficiently long article body."}</script></head><body><article>A sufficiently long article body.</article></body></html>`;
const $jsonLd = cheerio.load(jsonLdHtml);
assert.equal(extractJsonLd($jsonLd).links[0], "/article/1");
assert.equal(extractDateHierarchy($jsonLd).source, "json-ld.datePublished");

const timeHtml = `<article><time datetime="2026-09-29">29 September 2026</time> Development update.</article>`;
assert.equal(extractDateHierarchy(cheerio.load(timeHtml)).source, "time[datetime]");

const visibleHtml = `<article>Project approval published on 29-09-2026. Residential development details.</article>`;
assert.equal(extractDateHierarchy(cheerio.load(visibleHtml)).source, "visible-text");

console.log("Extraction regression fixtures passed.");
