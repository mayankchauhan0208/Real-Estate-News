const MONTHS = new Map([
  ["january", 1], ["february", 2], ["march", 3], ["april", 4], ["may", 5], ["june", 6],
  ["july", 7], ["august", 8], ["september", 9], ["october", 10], ["november", 11], ["december", 12]
]);

function isoDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
  return date.getUTCFullYear() === Number(year) && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day)
    ? date.toISOString()
    : "";
}

export function parseSourceDate(value, { dateOrder = "" } = {}) {
  const raw = String(value || "").replace(/\u00a0/g, " ").trim();
  if (!raw) return { value: "", source: "", confidence: "none", format: "" };
  const direct = new Date(raw);
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]|$)/.test(raw) && !Number.isNaN(direct.getTime())) {
    return { value: direct.toISOString(), source: "structured", confidence: "high", format: "ISO-8601" };
  }
  const named = raw.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b|\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (named) {
    const day = named[1] || named[5];
    const month = MONTHS.get((named[2] || named[4]).toLowerCase());
    const year = named[3] || named[6];
    const value = isoDate(year, month, day);
    return value ? { value, source: "visible-or-metadata", confidence: "high", format: "named-month" } : { value: "", source: "", confidence: "none", format: "" };
  }
  const numeric = raw.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (!numeric) return { value: "", source: "", confidence: "none", format: "" };
  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  if (first <= 12 && second <= 12 && dateOrder !== "DMY" && dateOrder !== "MDY") {
    return { value: "", source: "ambiguous", confidence: "none", format: "numeric-ambiguous" };
  }
  const day = dateOrder === "MDY" ? second : first;
  const month = dateOrder === "MDY" ? first : second;
  const parsed = isoDate(numeric[3], month, day);
  return parsed ? { value: parsed, source: "visible-or-metadata", confidence: "medium", format: `${dateOrder}-numeric` } : { value: "", source: "parse-failed", confidence: "none", format: "numeric" };
}

function walkJson(value, visit) {
  if (!value || typeof value !== "object") return;
  visit(value);
  if (Array.isArray(value)) for (const item of value) walkJson(item, visit);
  else for (const child of Object.values(value)) walkJson(child, visit);
}

export function extractJsonLd($, dateOrder = "") {
  const dates = [];
  const links = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const json = JSON.parse($(element).text());
      walkJson(json, (node) => {
        for (const key of ["datePublished", "dateCreated", "dateModified"]) {
          if (node[key]) dates.push({ ...parseSourceDate(node[key], { dateOrder }), source: `json-ld.${key}` });
        }
        for (const key of ["url", "mainEntityOfPage", "item", "contentUrl"]) {
          const candidate = typeof node[key] === "string" ? node[key] : node[key]?.["@id"] || node[key]?.url;
          if (candidate) links.push(candidate);
        }
      });
    } catch {}
  });
  return { dates, links };
}

export function extractDateHierarchy($, { rssDate = "", dateOrder = "" } = {}) {
  const jsonLd = extractJsonLd($, dateOrder);
  const ordered = [
    ...jsonLd.dates.filter((item) => item.source === "json-ld.datePublished"),
    ...jsonLd.dates.filter((item) => item.source === "json-ld.dateCreated"),
    ...$("meta[property='article:published_time'], meta[name='datePublished'], meta[name='publish-date'], meta[name='date']").map((_, el) => parseSourceDate($(el).attr("content"), { dateOrder })).get().filter((item) => item.value).map((item) => ({ ...item, source: "metadata" })),
    ...$("time[datetime]").map((_, el) => parseSourceDate($(el).attr("datetime"), { dateOrder })).get().filter((item) => item.value).map((item) => ({ ...item, source: "time[datetime]" })),
    ...(rssDate ? [{ ...parseSourceDate(rssDate, { dateOrder }), source: "rss-or-atom" }] : [])
  ];
  const valid = ordered.find((item) => item.value);
  if (valid) return valid;
  const visible = parseSourceDate($("article, main, body").first().text(), { dateOrder });
  return visible.value ? { ...visible, source: "visible-text" } : { value: "", source: ordered.some((item) => item.confidence === "none" && item.format === "numeric-ambiguous") ? "ambiguous" : "missing", confidence: "none", format: "" };
}

export function extractionStrategySummary(attempts) {
  return attempts.map((attempt) => ({ strategy: attempt.strategy, outcome: attempt.outcome, items: attempt.items || 0, reason: attempt.reason || "" }));
}
