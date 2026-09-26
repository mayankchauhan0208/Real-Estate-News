# Brokket News Admin Guide

This project has two parts:

- News runner: fetches, filters, dedupes, and can publish approved news.
- Admin control center: local UI for city toggles, source management, dry-run review, reports, and safety controls.

## Start Admin Locally

```bash
npm install
npm run admin
```

Open:

```text
http://localhost:3000
```

The admin panel is designed for review and control. Its dry-run button forces safe environment values so it does not push to the API.

## Safety Rules

- Keep API Push Enabled off while editing sources, cities, or filters.
- Use Start Safe Dry Run before enabling any new city or source batch.
- Review Ready To Post and Rejected With Reasons before any live run.
- Enable cities slowly. New cities should be dry-run reviewed city by city before being made live.
- Generated reports stay in the workflow artifact and the latest successful report is copied into the hosted admin snapshot.

## Static Check Before Git Upload

```bash
npm run check
```

This checks the main runner, smoke-test file, admin server, and admin browser JavaScript syntax. It does not publish news.

Do not run `npm run build` unless you intentionally want to run the filter smoke test as well.

## Production Run

Only run the news runner when the API endpoint and secrets are ready:

```bash
npm start
```

For GitHub Actions, use repository secrets and variables described in `README.md`. Keep manual backfills reviewed through the admin reports before enabling API push.

## Admin Capabilities

- Master safety toggles for full tool, API push, and all-cities mode.
- City-wise enable/disable control.
- Source library with add, enable, disable, remove manual source, and status filters.
- Safe dry-run panel with city/date scope and dedupe controls.
- Review queue for ready and rejected news.
- Posted-news history from saved run reports.
- Readiness strip showing Git/API safety signals.
