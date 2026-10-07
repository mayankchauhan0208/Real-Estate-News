# Authoritative 42-Record Resume Ledger Report

This report records a read-only replay of the recovered Task 45 authoritative
42-record corpus against the repaired publication-history semantics. No
acquisition, backfill, production POST, deletion, or scheduler mutation was
performed.

## Recovered artifacts

- Run artifact: `news-run-2026-10-05T21-11-40-813Z.json`
- Run artifact SHA-256: `325B33D96DCD0F923674EC7DCA64645B65533A63FB0D31CCC909EAE0349019D`
- Evidence artifact: `candidate-evidence.json`
- Evidence artifact SHA-256: `CC44C0BC833B321BEF5A90124BAED8086F70E005C6777D8676424D23F76F2BF7`
- Hash verification: PASS
- Corpus: 42 unique candidate IDs; 42 full-evidence records; 0 incomplete

## Current-history replay

| Terminal class | Count | Candidate IDs |
|---|---:|---|
| Final remaining publishable | 19 | 1, 2, 4, 6, 7, 8, 9, 12, 14, 15, 17, 19, 20, 21, 22, 23, 28, 33, 40 |
| Already-backfilled duplicate | 6 | 3, 13, 27, 30, 31, 34 |
| Engine reject | 8 | 5, 11, 16, 24, 29, 32, 38, 39 |
| Geo reject or review | 3 | 10, 18, 42 |
| Semantic duplicate | 3 | 25, 26, 36 |
| Current normal-history duplicate | 3 | 35, 37, 41 |

Invariants: category overlap 0; unclassified 0; total accounted 42.

The eight successful backfill posts are all represented or suppressed by
current history. Six have direct candidate matches in this corpus. The
Prestige 17.14-acre Gurugram land post is not one of the 42 candidate IDs,
and the Gaurs/Alaris event is represented by the normal-history candidate 37
while the alternate backfill candidate 36 is semantically suppressed. This
is why direct corpus IDs are six although verified backfill posts are eight.

## Dedupe protection

The replay explicitly proved zero false suppression for launch versus
sellout, land acquisition versus launch, approval versus launch, and funding
versus sale when city, builder, project, and numeric anchors overlap.

## Checkpoint and firewall

- Source universe: 553
- Accounted: 100
- Pending: 453
- Completed shards: 1
- Pending shards: 5
- Next continuation position: offset 100
- Offset 0: preserved; not rerun
- Detail frontier: preserved by isolated backfill state
- Runtime: unchanged; qualified runtime carried forward
- Full 553-source rerun: not required for this reconciliation
- Production posts, deletions, and mutations: 0
- Backfill resume: not performed; no recurring backfill scheduled

## Result

The authoritative corpus is recovered, hashes match, history reconciliation
is complete, the remaining candidate set is deterministic, and the package
is ready only for a future explicit backfill-resume authorization.
