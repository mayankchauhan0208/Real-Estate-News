let state = null;
let sourceMode = "all";
let sourceVisibleLimit = 150;
let sourceStatusMode = "all";

const metricsEl = document.querySelector("#metrics");
const readinessStripEl = document.querySelector("#readinessStrip");
const cityRowsEl = document.querySelector("#cityRows");
const sourceRowsEl = document.querySelector("#sourceRows");
const stateSummaryEl = document.querySelector("#stateSummary");
const reportRowsEl = document.querySelector("#reportRows");
const candidateRowsEl = document.querySelector("#candidateRows");
const rejectedRowsEl = document.querySelector("#rejectedRows");
const analyticsMetricsEl = document.querySelector("#analyticsMetrics");
const analyticsCityRowsEl = document.querySelector("#analyticsCityRows");
const rejectionReasonRowsEl = document.querySelector("#rejectionReasonRows");
const postedRowsEl = document.querySelector("#postedRows");
const pushedByDateEl = document.querySelector("#pushedByDate");
const controlSummaryEl = document.querySelector("#controlSummary");
const masterControlsEl = document.querySelector("#masterControls");
const dryRunLogEl = document.querySelector("#dryRunLog");
const citySearchEl = document.querySelector("#citySearch");
const sourceSearchEl = document.querySelector("#sourceSearch");
const postedSearchEl = document.querySelector("#postedSearch");
const sourceCitySelectEl = document.querySelector("#sourceCitySelect");
const backfillCitySelectEl = document.querySelector("#backfillCitySelect");
const sourceCountLabelEl = document.querySelector("#sourceCountLabel");
const pageTitleEl = document.querySelector("#pageTitle");

for (const tab of document.querySelectorAll(".tab")) {
  tab.addEventListener("click", () => activateTab(tab.dataset.tab));
}

document.querySelector("#refreshBtn").addEventListener("click", loadState);
document.querySelector("#dryRunBtn").addEventListener("click", startDryRun);
document.querySelector("#sourceForm").addEventListener("submit", addSource);
document.querySelector("#showManualSources").addEventListener("click", () => {
  sourceMode = "manual";
  sourceVisibleLimit = 150;
  renderSources();
});
document.querySelector("#showAllSources").addEventListener("click", () => {
  sourceMode = "all";
  sourceVisibleLimit = 150;
  renderSources();
});
document.querySelectorAll("[data-source-status]").forEach((button) => {
  button.addEventListener("click", () => {
    sourceStatusMode = button.dataset.sourceStatus || "all";
    sourceVisibleLimit = 150;
    renderSources();
  });
});
citySearchEl.addEventListener("input", debounce(renderCities, 180));
sourceSearchEl.addEventListener("input", debounce(() => {
  sourceVisibleLimit = 150;
  renderSources();
}, 180));
postedSearchEl.addEventListener("input", debounce(renderPostedNews, 180));

loadState();
setInterval(refreshDryRun, 4000);

async function loadState() {
  const response = await fetch("/api/state");
  state = await response.json();
  render();
}

function activateTab(name) {
  const titles = {
    overview: "Command Center",
    reports: "Run & Review",
    sources: "Source Library",
    cities: "City Control",
    posted: "Posted News"
  };
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === name));
  if (pageTitleEl) pageTitleEl.textContent = titles[name] || "Command Center";
}

function render() {
  renderMetrics();
  renderReadiness();
  renderCityOptions();
  renderAnalytics();
  renderStateSummary();
  renderMasterControls();
  renderControlSummary();
  renderCities();
  renderSources();
  renderPostedNews();
  renderReports();
  renderCandidates();
  renderRejectedNews();
  renderDryRun(state.dryRun);
}

function renderMetrics() {
  const totals = state.totals;
  metricsEl.innerHTML = [
    ["Live cities", totals.liveCities, "Enabled now"],
    ["Requested cities", totals.requestedCities, "From sheet"],
    ["More requested", totals.moreRequestedCities, "Not live yet"],
    ["Sources", totals.enabledSources, `${totals.disabledSources || 0} off`],
    ["Ready news", state.analytics?.totals?.readyToPost || totals.candidateNews || 0, "Passed filters"]
  ].map(([label, value, hint]) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(hint)}</small>
    </div>
  `).join("");
}
function renderReadiness() {
  const readiness = state.readiness || { checks: [] };
  const checks = readiness.checks || [];
  readinessStripEl.innerHTML = `
    <article class="readiness-card ${readiness.readyForApiPush ? "ready" : "hold"}">
      <div>
        <span class="status-dot ${readiness.readyForApiPush ? "good" : "warn"}"></span>
        <b>${readiness.readyForApiPush ? "Ready for reviewed API push" : "Safe local mode"}</b>
        <small>${readiness.readyForApiPush ? "Dry-run signals are available. Confirm manually before enabling push." : "Keep this mode while preparing Git upload and reviewing city quality."}</small>
      </div>
      <div class="readiness-meta">
        <span>${state.totals.enabledSources} enabled sources</span>
        <span>${state.totals.disabledSources || 0} disabled</span>
        <span>${readiness.duplicateSourceUrlGroups || 0} duplicate groups</span>
      </div>
    </article>
    ${checks.map((check) => `
      <article class="check-card ${check.ok ? "ok" : "attention"}">
        <span>${check.ok ? "OK" : "Check"}</span>
        <b>${escapeHtml(check.label)}</b>
        <small>${escapeHtml(check.detail)}</small>
      </article>
    `).join("")}
  `;
}

function renderCityOptions() {
  const options = state.cities
    .filter((city) => city.enabled)
    .map((city) => `<option value="${escapeAttribute(city.code)}">${escapeHtml(city.name)} (${escapeHtml(city.code)})</option>`)
    .join("");
  sourceCitySelectEl.innerHTML = options;
  backfillCitySelectEl.innerHTML = options;

  const lastBackfill = state.settings.lastBackfill || {};
  for (const option of backfillCitySelectEl.options) {
    option.selected = (lastBackfill.cityCodes || []).includes(option.value);
  }
  document.querySelector("#backfillFrom").value = lastBackfill.from || "";
  document.querySelector("#backfillTo").value = lastBackfill.to || "";
  document.querySelector("#resendBackfill").checked = lastBackfill.resendBackfill === true;
}

function renderAnalytics() {
  const analytics = state.analytics || { totals: {}, byCity: [], rejectionReasons: [] };
  const totals = analytics.totals || {};
  analyticsMetricsEl.innerHTML = [
    ["Total fetched", totals.fetched || 0, "Raw fetched articles"],
    ["Expanded", totals.expanded || 0, "City-expanded articles"],
    ["Ready to post", totals.readyToPost || 0, "Passed filters"],
    ["Rejected", totals.rejected || 0, "Failed filters"],
    ["Posted", totals.posted || 0, "API pushed"]
  ].map(([label, value, hint]) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <b>${escapeHtml(value)}</b>
      <small>${escapeHtml(hint)}</small>
    </div>
  `).join("");

  analyticsCityRowsEl.innerHTML = analytics.byCity.slice(0, 50).map((row) => `
    <tr>
      <td><span class="tag">${escapeHtml(row.cityCode)}</span></td>
      <td>${row.expanded || 0}</td>
      <td><b>${row.readyToPost || 0}</b></td>
      <td>${row.posted || 0}</td>
      <td>${row.rejected || 0}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="muted">No city analytics yet. Run a dry run to generate more detail.</td></tr>`;

  rejectionReasonRowsEl.innerHTML = analytics.rejectionReasons.slice(0, 15).map((row) => `
    <div class="reason-row">
      <span>${escapeHtml(row.reason)}</span>
      <b>${escapeHtml(row.count)}</b>
    </div>
  `).join("") || `<p class="muted">No rejection reasons yet.</p>`;
}

function renderStateSummary() {
  stateSummaryEl.innerHTML = state.requestedByState.map((row) => `
    <div class="state-card ${row.live > 0 ? "active-state" : ""}">
      <b>${escapeHtml(row.state)}</b>
      <span>${row.live} live / ${row.requested} requested / ${row.moreRequested} more</span>
      ${row.liveCities.length ? `<small>${escapeHtml(row.liveCities.join(", "))}</small>` : ""}
    </div>
  `).join("");
}

function renderMasterControls() {
  const settings = state.settings;
  masterControlsEl.innerHTML = `
    <label class="control-toggle">
      <input type="checkbox" data-setting-toggle="automationEnabled" ${settings.automationEnabled ? "checked" : ""}>
      <span><b>Full Tool Running</b><small>Turn off to stop scheduled fetch/push behavior.</small></span>
    </label>
    <label class="control-toggle">
      <input type="checkbox" data-setting-toggle="apiPushEnabled" ${settings.apiPushEnabled ? "checked" : ""}>
      <span><b>API Push Enabled</b><small>Off means runs become dry-run and cannot push to API.</small></span>
    </label>
    <label class="control-toggle">
      <input type="checkbox" data-setting-toggle="allCitiesEnabled" ${settings.allCitiesEnabled ? "checked" : ""}>
      <span><b>All Cities Enabled</b><small>Use only after dry-run checks. Enables every city from the sheet.</small></span>
    </label>
  `;

  masterControlsEl.querySelectorAll("[data-setting-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.settingToggle;
      const confirmed = key !== "apiPushEnabled" || !input.checked || confirm("Enable API push? Only do this when dry-run quality is clean.");
      if (!confirmed) {
        input.checked = false;
        return;
      }
      await updateSettings({ [key]: input.checked });
    });
  });
}

async function updateSettings(patch) {
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) {
    alert((await response.json()).error || "Could not update settings");
    await loadState();
    return;
  }
  state = await response.json();
  render();
}

function renderControlSummary() {
  const lastReport = state.reports[0];
  const liveCities = state.cities.filter((city) => city.enabled).map((city) => city.name).join(", ") || "None";
  controlSummaryEl.innerHTML = `
    <div class="summary-item"><span>Live cities</span><b>${escapeHtml(liveCities)}</b></div>
    <div class="summary-item"><span>Manual sources</span><b>${state.totals.manualSources}</b></div>
    <div class="summary-item"><span>Latest report</span><b>${lastReport ? escapeHtml(lastReport.name) : "No report yet"}</b></div>
    <div class="summary-item"><span>Latest ready news</span><b>${lastReport ? lastReport.candidateCount : 0}</b></div>
    <div class="summary-item"><span>Safety</span><b>${state.settings.apiPushEnabled ? "API push enabled" : "API push off"}</b></div>
  `;
}

function renderCities() {
  const q = citySearchEl.value.trim().toLowerCase();
  const rows = state.cities.filter((city) =>
    !q || city.name.toLowerCase().includes(q) || city.state.toLowerCase().includes(q) || city.code.toLowerCase().includes(q)
  );

  cityRowsEl.innerHTML = rows.map((city) => `
    <tr>
      <td>
        <label class="switch">
          <input type="checkbox" ${city.enabled ? "checked" : ""} data-city-toggle="${escapeHtml(city.code)}">
          <span>${city.enabled ? "Live" : "Off"}</span>
        </label>
      </td>
      <td><b>${escapeHtml(city.name)}</b></td>
      <td>${escapeHtml(city.state)}</td>
      <td><code>${escapeHtml(city.code)}</code></td>
      <td>${city.keywords.slice(0, 8).map((keyword) => `<span class="tag">${escapeHtml(keyword)}</span>`).join("")}</td>
      <td>${city.sourceCount}</td>
    </tr>
  `).join("");

  cityRowsEl.querySelectorAll("[data-city-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      await fetch(`/api/cities/${encodeURIComponent(input.dataset.cityToggle)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.checked, url: input.dataset.sourceUrl || "" })
      });
      await loadState();
    });
  });
}

function renderSources() {
  const q = sourceSearchEl.value.trim().toLowerCase();
  const rows = state.sources.filter((source) => {
    const matchesMode = sourceMode === "all" || source.category === "manual";
    const matchesStatus = sourceStatusMode === "all" || (sourceStatusMode === "enabled" ? source.enabled : !source.enabled);
    const matchesSearch = !q || source.url.toLowerCase().includes(q) || source.label.toLowerCase().includes(q) || source.cityCodes.join(",").toLowerCase().includes(q);
    return matchesMode && matchesStatus && matchesSearch;
  });
  const visibleRows = rows.slice(0, sourceVisibleLimit);
  sourceCountLabelEl.textContent = `${visibleRows.length} shown / ${rows.length} matched / ${state.sources.length} total`;

  sourceRowsEl.innerHTML = visibleRows.map((source) => `
    <tr>
      <td>${renderSourceSwitch(source)}</td>
      <td>${escapeHtml(source.category)}</td>
      <td><b>${escapeHtml(source.label || "Source")}</b></td>
      <td><a href="${escapeAttribute(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a></td>
      <td>${source.cityCodes.length ? source.cityCodes.map((code) => `<span class="tag">${escapeHtml(code)}</span>`).join("") : "<span class=\"muted\">shared</span>"}</td>
      <td>${source.category === "manual" ? `<button class="danger" type="button" data-source-delete="${escapeHtml(source.id)}">Remove</button>` : "Disable only"}</td>
    </tr>
  `).join("") + (rows.length > visibleRows.length ? `\n    <tr><td colspan="6"><button class="ghost wide" type="button" id="showMoreSources">Show ${Math.min(150, rows.length - visibleRows.length)} more sources</button></td></tr>` : "");

  const showMoreButton = document.querySelector("#showMoreSources");
  if (showMoreButton) {
    showMoreButton.addEventListener("click", () => {
      sourceVisibleLimit += 150;
      renderSources();
    });
  }
  document.querySelectorAll("[data-source-status]").forEach((button) => {
    button.classList.toggle("active-filter", button.dataset.sourceStatus === sourceStatusMode);
  });

  sourceRowsEl.querySelectorAll("[data-source-enabled]").forEach((input) => {
    input.addEventListener("change", async () => {
      await fetch(`/api/sources/${encodeURIComponent(input.dataset.sourceEnabled)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.checked, url: input.dataset.sourceUrl || "" })
      });
      await loadState();
    });
  });

  sourceRowsEl.querySelectorAll("[data-source-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Remove this manual source?")) return;
      await fetch(`/api/sources/${encodeURIComponent(button.dataset.sourceDelete)}`, { method: "DELETE" });
      await loadState();
    });
  });
}

function renderSourceSwitch(source) {
  return `
    <label class="switch">
      <input type="checkbox" ${source.enabled ? "checked" : ""} data-source-enabled="${escapeHtml(source.id)}" data-source-url="${escapeAttribute(source.url)}">
      <span>${source.enabled ? "On" : "Off"}</span>
    </label>
  `;
}

function renderPostedNews() {
  const q = postedSearchEl.value.trim().toLowerCase();
  pushedByDateEl.innerHTML = state.pushedByDate.slice(0, 12).map((row) => `
    <div class="state-card">
      <b>${escapeHtml(row.date)}</b>
      <span>${row.count} pushed</span>
      <small>${escapeHtml(Object.entries(row.cityCounts).map(([city, count]) => `${city}: ${count}`).join(", "))}</small>
    </div>
  `).join("") || "<p class=\"muted\">No live posted reports found yet.</p>";

  const rows = state.postedNews.filter((item) => {
    const haystack = `${item.title || ""} ${item.cityCode || ""} ${item.postedBy || ""}`.toLowerCase();
    return !q || haystack.includes(q);
  });

  postedRowsEl.innerHTML = rows.map((item) => `
    <tr>
      <td>${formatDate(item.publishedAt || item.reportGeneratedAt)}</td>
      <td><span class="tag">${escapeHtml(item.cityCode || "unknown")}</span></td>
      <td><a href="${escapeAttribute(item.newsLink || "#")}" target="_blank" rel="noreferrer"><b>${escapeHtml(item.title || "Untitled")}</b></a></td>
      <td>${escapeHtml(item.postedBy || "")}</td>
      <td>${escapeHtml(item.reportName || "")}</td>
    </tr>
  `).join("") || `<tr><td colspan="5" class="muted">No posted news found in local reports.</td></tr>`;
}

function renderReports() {
  reportRowsEl.innerHTML = state.reports.slice(0, 10).map((report) => `
    <article class="report">
      <h3>${escapeHtml(report.name)}</h3>
      <div class="report-grid">
        <div><span>Mode</span>${report.dryRun ? "Dry run" : "Live"}</div>
        <div><span>Sources</span>${report.sourceCount}</div>
        <div><span>Fetched</span>${report.fetchedArticleCount}</div>
        <div><span>Ready</span>${report.candidateCount}</div>
        <div><span>Rejected</span>${report.rejectedArticleCount || 0}</div>
      </div>
      ${renderSkipped(report.skippedByReason)}
    </article>
  `).join("") || "<p class=\"muted\">No reports found yet.</p>";
}

function renderCandidates() {
  candidateRowsEl.innerHTML = state.candidateNews.slice(0, 30).map((candidate) => `
    <article class="news-card">
      <div>
        <span class="tag">${escapeHtml(candidate.cityCode || "unknown")}</span>
        <span class="muted">${escapeHtml(candidate.classification || "candidate")}</span>
      </div>
      <a href="${escapeAttribute(candidate.newsLink || "#")}" target="_blank" rel="noreferrer"><b>${escapeHtml(candidate.title || "Untitled")}</b></a>
      <small>${escapeHtml(candidate.postedBy || "")} · ${formatDate(candidate.publishedAt || candidate.reportGeneratedAt)} · ${escapeHtml(candidate.reportName || "")}</small>
    </article>
  `).join("") || "<p class=\"muted\">No ready-to-post candidates found yet.</p>";
}

function renderRejectedNews() {
  const latestReport = state.reports[0];
  const rejected = latestReport
    ? (latestReport.rejectedArticles || []).map((item) => ({
      ...(item.article || {}),
      reasons: item.reasons || [],
      reportName: latestReport.name,
      reportGeneratedAt: latestReport.generatedAt
    }))
    : [];

  rejectedRowsEl.innerHTML = rejected.slice(0, 30).map((item) => `
    <article class="news-card rejected-card">
      <div>
        <span class="tag">${escapeHtml(item.cityCode || "unknown")}</span>
        <span class="muted">${formatDate(item.publishedAt || item.reportGeneratedAt)} · ${escapeHtml(item.reportName || "")}</span>
      </div>
      <a href="${escapeAttribute(item.newsLink || "#")}" target="_blank" rel="noreferrer"><b>${escapeHtml(item.title || "Untitled")}</b></a>
      <div class="skip-list">${item.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}</div>
    </article>
  `).join("") || `<p class="muted">Rejected article detail from the latest run will appear after the next dry run. Older reports remain in Run History.</p>`;
}

function renderSkipped(skippedByReason = {}) {
  const entries = Object.entries(skippedByReason).slice(0, 5);
  if (entries.length === 0) return "";
  return `<div class="skip-list">${entries.map(([reason, count]) => `<span>${escapeHtml(reason)}: <b>${count}</b></span>`).join("")}</div>`;
}

async function addSource(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    label: form.get("label"),
    url: form.get("url"),
    category: form.get("category"),
    cityCodes: [...sourceCitySelectEl.selectedOptions].map((option) => option.value)
  };
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    alert((await response.json()).error || "Could not add source");
    return;
  }
  event.currentTarget.reset();
  await loadState();
  activateTab("sources");
}

async function startDryRun() {
  const payload = {
    enabledCityCodes: state.settings.enabledCityCodes,
    targetCityCodes: [...backfillCitySelectEl.selectedOptions].map((option) => option.value),
    backfillFrom: document.querySelector("#backfillFrom").value,
    backfillTo: document.querySelector("#backfillTo").value,
    resendBackfill: document.querySelector("#resendBackfill").checked,
    maxItemsPerSource: document.querySelector("#maxItemsPerSource").value,
    maxItemsPerRun: document.querySelector("#maxItemsPerRun").value,
    maxPagesPerSource: 1,
    lookbackDays: document.querySelector("#lookbackDays").value
  };
  const response = await fetch("/api/dry-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await response.json();
  if (!response.ok) {
    alert(body.error || "Could not start dry run");
    return;
  }
  activateTab("reports");
  renderDryRun(body);
}

async function refreshDryRun() {
  const response = await fetch("/api/dry-run");
  if (!response.ok) return;
  renderDryRun(await response.json());
}

function renderDryRun(dryRun) {
  if (!dryRun || !dryRun.startedAt) {
    dryRunLogEl.textContent = "No dry run started from admin yet.";
    return;
  }
  const header = [
    `Running: ${dryRun.running}`,
    `Started: ${dryRun.startedAt}`,
    dryRun.finishedAt ? `Finished: ${dryRun.finishedAt}` : "",
    dryRun.exitCode !== null && dryRun.exitCode !== undefined ? `Exit code: ${dryRun.exitCode}` : "",
    "",
    "Forced safe env:",
    JSON.stringify(dryRun.env, null, 2),
    "",
    "Log:"
  ].filter(Boolean).join("\n");
  dryRunLogEl.textContent = `${header}\n${(dryRun.log || []).join("\n")}`;
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}




function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}






