# Source Debt Register

Generated: 2026-09-30T09:15:55.983Z
Baseline audit: reports\source-audits\source-audit-2026-09-30T08-05-40-524Z.json (2026-09-30T08:05:40.522Z)
Production freshness: **UNVERIFIED**

## Baseline counts

| Category | Count |
| --- | ---: |
| Transport failed | 48 |
| Broken URL | 12 |
| Blocked | 2 |
| Needs review | 3 |
| Not sampled | 38 |
| Unique affected sources | 103 |

## Unsampled reconciliation

The full audit labels 38 rows NOT_SAMPLED, while the targeted run attempted those selected sources: 2 sampled successfully, 33 produced zero links, and 3 were too large. Treat the full-audit label as stale until a future full run records article sampling in the same report.

## Highest-priority unresolved sources

| Priority | Source | Health | Status | Cities | Triage |
| --- | --- | --- | ---: | ---: | --- |
| HIGH | MahaRERA | P1 | TRANSPORT_FAILED |  | 28 | REQUIRES_RECHECK |
| HIGH | Gujarat RERA | P1 | TRANSPORT_FAILED |  | 22 | REQUIRES_RECHECK |
| HIGH | Andhra Pradesh RERA | P1 | TRANSPORT_FAILED |  | 16 | REQUIRES_RECHECK |
| HIGH | L&T Realty — News & Blogs | TRANSPORT_FAILED |  | 7 | REQUIRES_RECHECK |
| HIGH | Kerala RERA | P1 | NEEDS_REVIEW | 503 | 6 | HIGH_PRIORITY_RETRY |
| HIGH | Kerala RERA — Announcements | P1 | NEEDS_REVIEW | 503 | 6 | HIGH_PRIORITY_RETRY |
| HIGH | West Bengal RERA | P1 | TRANSPORT_FAILED |  | 5 | REQUIRES_RECHECK |
| HIGH | West Bengal RERA — Notices | P1 | TRANSPORT_FAILED |  | 5 | REQUIRES_RECHECK |
| HIGH | Delhi RERA | P1 | TRANSPORT_FAILED |  | 5 | REQUIRES_RECHECK |
| MEDIUM | Rajasthan RERA | P1 | NOT_SAMPLED | 200 | 19 | REQUIRES_RECHECK |
| MEDIUM | Odisha RERA | P1 | NOT_SAMPLED | 200 | 7 | REQUIRES_RECHECK |
| MEDIUM | Brookfield India REIT — Stock Exchange Filings | NOT_SAMPLED | 200 | 6 | REQUIRES_RECHECK |
| MEDIUM | CapitaLand India Trust — Announcements | NOT_SAMPLED | 202 | 5 | REQUIRES_RECHECK |
| MEDIUM | Eldeco Group — Investor Relations | NOT_SAMPLED | 200 | 5 | REQUIRES_RECHECK |
| MEDIUM | Puri Constructions — Media | NOT_SAMPLED | 200 | 5 | REQUIRES_RECHECK |
| MEDIUM | Uttarakhand RERA | P1 | NOT_SAMPLED | 200 | 5 | REQUIRES_RECHECK |
| MEDIUM | DDA — What's New | P1 | NOT_SAMPLED | 200 | 4 | REQUIRES_RECHECK |
| MEDIUM | Ajmera Realty | P2 | TRANSPORT_FAILED |  | 3 | REQUIRES_RECHECK |
| MEDIUM | Jharkhand RERA | P1 | TRANSPORT_FAILED |  | 3 | REQUIRES_RECHECK |
| MEDIUM | Jharkhand RERA — Notices | P1 | TRANSPORT_FAILED |  | 3 | REQUIRES_RECHECK |

## Required order

1. Verify production freshness and retrieve the latest run/source-audit artifacts read-only.
2. Recheck official RERA and authority endpoints with bounded retries; record redirects, robots behavior, and listing extraction separately.
3. Repair or retire confirmed 404 RSS paths only after a replacement endpoint is verified.
4. Improve article sampling/date extraction for sources that list successfully but have no content-health evidence.
5. Only then evaluate geographic/classification coverage; do not use classifier results to hide source-health loss.
