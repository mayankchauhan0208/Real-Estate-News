# BROKKET BACKFILL HISTORY RECONCILIATION + RESUME PREPARATION

Generated locally after reconciling `origin/main` at `89e305f7a2d7d576609e4cf069b3e0b735c8ce3b`.

## Verified history

- Run `37287495215`: 3 verified normal publications represented by the legacy seed: Raymond Realty, DLF Aureva, and Gaur Alaris.
- Run `37503016396`: 3 verified normal publications: CCI/JSW, Prayagraj government flats, and Wayanad/Kalpetta rehabilitation township.
- Run `37509375673`: 1 verified normal publication: Blue Tokai at Grandthum, Noida.
- Scheduled normal run `37544237655`: 1 verified publication: ICICI Prudential AMC office purchase, Bengaluru.
- Backfill shard run `37559557119`, offset `0`: 8 verified backfill publications, all finalized successfully.
- First backfill attempt `37512197404`: 0 posts; claim permission failure; no production mutation.
- Resumed backfill run `37559557119`: 8 posts, 0 API failures, 0 duplicate groups inside the shard.
- Verified publication records represented locally: 16 records. The two Gaur/Gaurs records form one semantic event cluster and are retained as historical records.

## Semantic repair

The shared ledger now stores conservative semantic identity descriptors: normalized builder, normalized project, material event type, city, and unit-aware numeric anchors. URL/title identity remains authoritative when available. Semantic suppression requires matching city and event type, compatible builder/project identity, and at least one shared material numeric anchor. Existing legacy entries are enriched when their identity keys are encountered.

The Gaur/Gaurs forensic mismatch was:

- normal title: `Gaur Alaris Sells Out Entire Inventory in 48 Hours, Reaching Sales of Rs 1800 Crore`
- backfill title: `Gaurs Group sells 1,088 flats for Rs 1,800 cr in new housing project in NCR`
- normal source: RealtynMore
- backfill source: Economic Times
- normal URL: `https://realtynmore.com/gaur-alaris-sells-out-entire-inventory-in-48-hours`
- backfill URL: `https://economictimes.indiatimes.com/industry/services/property-/-cstruction/gaurs-group-sells-1088-flats-for-rs-1800-cr-in-new-housing-project-in-ncr/articleshow/134704516.cms`
- both city: `noida`
- both project: `gaur-alaris`
- both event type: `residential-sale`
- shared material anchor: `1800:crore`
- root causes: `LEGACY_LEDGER_ENTRY_INCOMPLETE`, `BUILDER_NORMALIZATION`, `NUMERIC_ANCHOR_VARIANT`, and missing legacy event fingerprint

The eight verified backfill records were added to the local publication seed. No production data was deleted or rewritten.

## Replay and safety result

- Raymond alternate source: suppressed by existing seed identity.
- DLF Aureva alternate source: suppressed by existing event identity.
- Gaur alternate source: suppressed by semantic event identity.
- Eight existing backfill posts: represented and suppressed by URL/title history.
- Distinct-event semantic false suppressions: 0 in protected regression coverage.
- Same-event cross-runner claim winners: 1; post-eligible: 1; duplicate window: 0.
- Remote empty/failed list response: cannot erase the durable local ledger.
- Backfill state remains isolated and no backfill was resumed.

## Resume state

- Source universe: 553 runtime sources.
- Last completed backfill shard: offset `0`, batch size `100`.
- Accounted: `100`.
- Pending: `453`.
- The next shard must begin at offset `100`; completed offset `0` must not be reprocessed.
- Backfill run `37559557119` was cancelled after the first shard; no automatic continuation is scheduled.

## Qualification gate

Focused regressions passed: syntax/configuration, shared publication ledger, normal-mode contract, live content policy, targeted live defects, Task 42 false-negative regression, and Task 42 authority/geo regression. No full 553-source requalification was run.

The local repair is committed as a descendant of current `origin/main`, but the final resume authorization remains blocked because no standalone authoritative 42-candidate ledger artifact is present to recompute the required final candidate classes and remaining publishable IDs without guessing. This task therefore prepares the continuation state but does not authorize or start it.

Firewall: push `NO`; deploy `NO`; normal workflow change `NO`; normal run `NO`; backfill resume `NO`; production posts by this task `0`; production deletions `0`.
