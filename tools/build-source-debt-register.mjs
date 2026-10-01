import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const auditDir = path.join(root, 'reports', 'source-audits');
const targetDir = path.join(auditDir, 'targeted');

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function latest(pattern) {
  const files = (await fs.readdir(auditDir))
    .filter((name) => pattern.test(name))
    .sort()
    .reverse();
  if (!files.length) throw new Error(`No report matches ${pattern}`);
  return path.join(auditDir, files[0]);
}

const auditPath = await latest(/^source-audit-.*\.json$/);
const audit = await readJson(auditPath);
const targetedFiles = [
  'unsampled-summary.json',
  'transport-summary.json',
  'regional-date-v2-summary.json',
  'rera-date-v2-summary.json',
  'zero-item-summary.json',
  'classification-evaluation-summary.json',
];
const targeted = {};
for (const name of targetedFiles) {
  try { targeted[name.replace('.json', '')] = await readJson(path.join(targetDir, name)); } catch {}
}

const rows = audit.rows ?? [];
const affectedStatuses = new Set(['TRANSPORT_FAILED', 'BROKEN_URL', 'BLOCKED', 'NEEDS_REVIEW', 'NOT_SAMPLED']);
const affected = rows.filter((row) => affectedStatuses.has(row.contentHealth));
const byUrl = new Map();
for (const row of affected) {
  const existing = byUrl.get(row.url);
  if (!existing || (existing.contentHealth === 'NOT_SAMPLED' && row.contentHealth !== 'NOT_SAMPLED')) {
    byUrl.set(row.url, row);
  }
}

const manualTriage = {
  'https://www.livemint.com/rss/AIRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/budgetRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/companiesRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/industryRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/insuranceRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/marketsRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/moneyRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/newsRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/politicsRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.livemint.com/rss/technologyRSS': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured RSS path returned 404; verify a current official feed or HTML section before replacing.' },
  'https://www.nhsrcl.in/en/media/press-release': { disposition: 'OFFICIAL_BUT_INCONSISTENT', note: 'Official endpoint was observed as 404 in the audit; retain for bounded recheck because the official page is indexed elsewhere.' },
  'https://www.savills.in/research.aspx': { disposition: 'REPLACEMENT_UNVERIFIED', note: 'Configured research landing page returned 404; current research article paths need explicit verification.' },
  'https://www.cbre.co.in/insights': { disposition: 'BLOCKED_KEEP', note: 'Official research page returned 403; do not bypass. Keep only if a public official feed or permitted page is verified.' },
  'https://www.colliers.com/en-in/research': { disposition: 'BLOCKED_KEEP', note: 'Official research page returned 403; do not bypass. Keep only if a public official feed or permitted page is verified.' },
  'https://indiainvestmentgrid.gov.in/index.jsp': { disposition: 'RETRY_REVIEW', note: 'Returned 503; retry with bounded backoff and retain as review-only until a stable listing is observed.' },
  'https://rera.kerala.gov.in': { disposition: 'HIGH_PRIORITY_RETRY', note: 'Official Kerala RERA root returned 503; affects Calicut, Ernakulam, Kochi, Palakkad, Thrissur, and Trivandrum.' },
  'https://rera.kerala.gov.in/announcements': { disposition: 'HIGH_PRIORITY_RETRY', note: 'Official Kerala RERA announcements returned 503; affects Calicut, Ernakulam, Kochi, Palakkad, Thrissur, and Trivandrum.' },
};

const priorityRank = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const unresolved = [...byUrl.values()].map((row) => {
  const triage = manualTriage[row.url] ?? {};
  const cityCount = row.cityCodes?.length ?? 0;
  const priority = triage.disposition === 'HIGH_PRIORITY_RETRY' || (cityCount >= 5 && row.contentHealth !== 'NOT_SAMPLED')
    ? 'HIGH'
    : cityCount ? 'MEDIUM' : 'LOW';
  return {
    priority,
    url: row.url,
    label: row.label,
    host: row.host,
    health: row.contentHealth,
    status: row.status,
    cityCodes: row.cityCodes ?? [],
    category: row.category,
    fallbackUsed: row.fallbackUsed,
    triage: triage.disposition ?? 'REQUIRES_RECHECK',
    note: triage.note ?? 'Run a bounded listing and article sample before changing configuration.',
  };
}).sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || b.cityCodes.length - a.cityCodes.length || a.url.localeCompare(b.url));

const report = {
  reportType: 'read-only-source-debt-register',
  generatedAt: new Date().toISOString(),
  baselineAudit: { path: path.relative(root, auditPath), generatedAt: audit.summary?.generatedAt, summary: audit.summary },
  productionFreshness: 'UNVERIFIED',
  productionFreshnessReason: 'No read-only GitHub Actions/artifact inspection was available in this workspace; local reports stop at the latest file present.',
  rawCategoryCounts: {
    transportFailed: audit.summary?.transportFailed ?? 0,
    brokenUrl: audit.summary?.brokenUrl ?? 0,
    blocked: audit.summary?.blocked ?? 0,
    needsReview: audit.summary?.needsReview ?? 0,
    notSampled: audit.summary?.notSampled ?? 0,
  },
  uniqueAffectedSources: unresolved.length,
  unsampledReconciliation: {
    baselineRows: audit.summary?.notSampled ?? 0,
    targetedSummary: targeted.unsampled,
    interpretation: 'The full audit labels 38 rows NOT_SAMPLED, while the targeted run attempted those selected sources: 2 sampled successfully, 33 produced zero links, and 3 were too large. Treat the full-audit label as stale until a future full run records article sampling in the same report.',
  },
  targetedDiagnostics: targeted,
  unresolved,
  remediationOrder: [
    'Verify production freshness and retrieve the latest run/source-audit artifacts read-only.',
    'Recheck official RERA and authority endpoints with bounded retries; record redirects, robots behavior, and listing extraction separately.',
    'Repair or retire confirmed 404 RSS paths only after a replacement endpoint is verified.',
    'Improve article sampling/date extraction for sources that list successfully but have no content-health evidence.',
    'Only then evaluate geographic/classification coverage; do not use classifier results to hide source-health loss.',
  ],
};

const out = path.join(auditDir, `source-debt-register-${new Date().toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z')}.json`);
await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
const markdown = [
  '# Source Debt Register',
  '',
  `Generated: ${report.generatedAt}`,
  `Baseline audit: ${report.baselineAudit.path} (${report.baselineAudit.generatedAt})`,
  `Production freshness: **${report.productionFreshness}**`,
  '',
  '## Baseline counts',
  '',
  '| Category | Count |',
  '| --- | ---: |',
  `| Transport failed | ${report.rawCategoryCounts.transportFailed} |`,
  `| Broken URL | ${report.rawCategoryCounts.brokenUrl} |`,
  `| Blocked | ${report.rawCategoryCounts.blocked} |`,
  `| Needs review | ${report.rawCategoryCounts.needsReview} |`,
  `| Not sampled | ${report.rawCategoryCounts.notSampled} |`,
  `| Unique affected sources | ${report.uniqueAffectedSources} |`,
  '',
  '## Unsampled reconciliation',
  '',
  report.unsampledReconciliation.interpretation,
  '',
  '## Highest-priority unresolved sources',
  '',
  '| Priority | Source | Health | Status | Cities | Triage |',
  '| --- | --- | --- | ---: | ---: | --- |',
  ...report.unresolved.slice(0, 20).map((item) => `| ${item.priority} | ${item.label} | ${item.health} | ${item.status ?? ''} | ${item.cityCodes.length} | ${item.triage} |`),
  '',
  '## Required order',
  '',
  ...report.remediationOrder.map((item, index) => `${index + 1}. ${item}`),
  '',
].join('\n');
const markdownPath = out.replace(/\.json$/, '.md');
await fs.writeFile(markdownPath, markdown);
console.log(out);
