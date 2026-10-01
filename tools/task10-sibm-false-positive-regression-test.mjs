import assert from 'node:assert/strict';
import { classifyArticle } from '../src/index.js';

const sibm = {
  title: 'SIBM Pune launches new MBA programme in HRM and integrated AI analytics',
  description: 'Applications are open through SNAP 2026 for the two-year residential programme.',
  articleText: 'The university institute announced admissions for students to the new academic programme.',
  newsLink: 'https://example.com/pune/sibm-mba-admissions',
  sourceUrl: 'https://example.com',
  publishedAt: '2026-09-30'
};
const puneRealEstate = {
  title: 'Pune residential project receives approval near Hinjewadi',
  description: 'A new housing project will add homes and supporting infrastructure in Pune.',
  articleText: 'The developer received approval for a residential project with apartments, investment and planned infrastructure in Pune.',
  newsLink: 'https://example.com/pune/residential-project-approval',
  sourceUrl: 'https://example.com',
  publishedAt: '2026-09-30'
};

assert.equal(classifyArticle(sibm), 'reject_relevance');
assert.notEqual(classifyArticle(puneRealEstate), 'reject_relevance');
console.log('Task 10 SIBM false-positive regression passed.');
