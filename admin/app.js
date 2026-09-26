let state = null;
let staticMode = false;
let sourceVisibleLimit = 258;
const staticAdminLogin = {
  username: "9992713289",
  passwordHash: "fd8c443bc86313672c1eb071a05a436101eae60ca7bdc6436bab43865332d12f"
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  metrics: $("#metrics"),
  sourceTabCount: $("#sourceTabCount"),
  pageTitle: $("#pageTitle"),
  pageSubtitle: $("#pageSubtitle"),
  postedRows: $("#postedRows"),
  newsCountLabel: $("#newsCountLabel"),
  newsGroupTitle: $("#newsGroupTitle"),
  readonlyNotice: $("#readonlyNotice"),
  newsStateFilter: $("#newsStateFilter"),
  newsCityFilter: $("#newsCityFilter"),
  newsSourceFilter: $("#newsSourceFilter"),
  newsStatusFilter: $("#newsStatusFilter"),
  newsFromDate: $("#newsFromDate"),
  newsToDate: $("#newsToDate"),
  postedSearch: $("#postedSearch"),
  sourceRows: $("#sourceRows"),
  sourceSearch: $("#sourceSearch"),
  sourceTypeFilter: $("#sourceTypeFilter"),
  sourceStatusFilter: $("#sourceStatusFilter"),
  sourceCountLabel: $("#sourceCountLabel"),
  sourceCitySelect: $("#sourceCitySelect"),
  sourceForm: $("#sourceForm"),
  cityRows: $("#cityRows"),
  citySearch: $("#citySearch"),
  backfillCitySelect: $("#backfillCitySelect"),
  masterControls: $("#masterControls"),
  controlSummary: $("#controlSummary"),
  dryRunLog: $("#dryRunLog"),
  modal: $("#newsModal"),
  manualNewsForm: $("#manualNewsForm"),
  manualNewsState: $("#manualNewsState"),
  manualNewsCity: $("#manualNewsCity"),
  manualNewsMessage: $("#manualNewsMessage"),
  loadLiveNewsBtn: $("#loadLiveNewsBtn"),
  auditRunMeta: $("#auditRunMeta"),
  auditMetrics: $("#auditMetrics"),
  rejectionRows: $("#rejectionRows"),
  sourceFailureRows: $("#sourceFailureRows"),
  cityAuditRows: $("#cityAuditRows"),
  rejectedAuditRows: $("#rejectedAuditRows"),
  rejectedAuditCount: $("#rejectedAuditCount")
};

const titles = {
  news: ["News management", "Review, edit and control every article shown in the Brokket app."],
  sources: ["Source directory", "Every publisher, developer and official channel monitored by automation."],
  control: ["Automation control", "Switch cities, run dry checks and protect API publishing."]
};

$$("[data-tab]").forEach((button) => button.addEventListener("click", () => activateTab(button.dataset.tab)));
$("#refreshBtn").addEventListener("click", loadState);
$("#dryRunBtn").addEventListener("click", startDryRun);
$("#addNewsBtn").addEventListener("click", openNewsModal);
elements.loadLiveNewsBtn.addEventListener("click", loadLiveNews);
$("#clearNewsFilters").addEventListener("click", clearNewsFilters);
$$("[data-modal-close]").forEach((node) => node.addEventListener("click", closeNewsModal));
elements.manualNewsForm.addEventListener("submit", createManualArticleDraft);
elements.manualNewsState.addEventListener("change", renderManualCityOptions);
elements.manualNewsForm.querySelectorAll("[data-media-preview]").forEach((input) => input.addEventListener("input", updateMediaPreview));
elements.sourceForm.addEventListener("submit", addSource);
elements.newsStateFilter.addEventListener("change", () => {
  elements.newsCityFilter.value = "all";
  renderNewsFilters();
  renderNews();
});

[
  elements.postedSearch,
  elements.newsCityFilter,
  elements.newsSourceFilter,
  elements.newsStatusFilter,
  elements.newsFromDate,
  elements.newsToDate
]
  .forEach((el) => el.addEventListener("input", debounce(renderNews, 120)));
[elements.sourceSearch, elements.sourceTypeFilter, elements.sourceStatusFilter]
  .forEach((el) => el.addEventListener("input", debounce(() => { sourceVisibleLimit = 258; renderSources(); }, 120)));
elements.citySearch.addEventListener("input", debounce(renderCities, 120));

initAdmin();
setInterval(refreshDryRun, 4000);

async function initAdmin() {
  const isStaticHost = window.location.protocol === "file:" || /github\.io$/i.test(window.location.hostname);
  const loginGate = $("#loginGate");
  const appShell = $(".app-shell");
  if (!isStaticHost || sessionStorage.getItem("brokketAdminAuthed") === "true") {
    if (loginGate) loginGate.hidden = true;
    if (appShell) appShell.hidden = false;
    await loadState();
    return;
  }
  if (appShell) appShell.hidden = true;
  if (loginGate) loginGate.hidden = false;
  const form = $("#loginForm");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = $("#adminLoginId")?.value.trim() || "";
    const password = $("#adminLoginPassword")?.value || "";
    const message = $("#loginMessage");
    const hash = await sha256(password);
    if (username === staticAdminLogin.username && hash === staticAdminLogin.passwordHash) {
      sessionStorage.setItem("brokketAdminAuthed", "true");
      if (loginGate) loginGate.hidden = true;
      if (appShell) appShell.hidden = false;
      await loadState();
      return;
    }
    if (message) message.textContent = "Wrong ID or password.";
  });
}

async function sha256(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function loadState() {
  const isStaticHost = window.location.protocol === "file:" || /github\.io$/i.test(window.location.hostname);
  try {
    if (isStaticHost) throw new Error("Static admin host");
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`API state failed: ${response.status}`);
    state = await response.json();
    state.liveNews = state.liveNews || [];
    staticMode = false;
  } catch {
    const response = await fetch("./static-state.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Admin state is unavailable. Run npm run admin locally or regenerate admin/static-state.json.");
    state = await response.json();
    staticMode = true;
  }
  render();
}

function render() {
  document.body.classList.toggle("static-mode", staticMode);
  activateTab($("[data-tab].active")?.dataset.tab || "news");
  renderMetrics();
  renderCityOptions();
  renderNewsFilters();
  renderNews();
  renderSources();
  renderCities();
  renderMasterControls();
  renderControlSummary();
  renderAudit();
  renderDryRun(state.dryRun);
}

function activateTab(name) {
  $$('[data-tab]').forEach((item) => item.classList.toggle('active', item.dataset.tab === name));
  $$('[data-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === name));
  const [title, subtitle] = titles[name] || titles.news;
  elements.pageTitle.textContent = title;
  elements.pageSubtitle.textContent = staticMode ? `${subtitle} GitHub Pages is a read-only preview; run local admin to save repo config changes.` : `${subtitle} Local changes save to config/admin-settings.json; commit and push for the next automatic run.`;
}

function renderMetrics() {
  const postedCount = state.postedNews?.length || 0;
  const candidateCount = state.candidateNews?.length || 0;
  const reviewCount = state.needsReviewNews?.length || 0;
  const totalResults = state.liveNews?.length || postedCount + candidateCount + reviewCount || state.analytics?.totals?.readyToPost || 0;
  const totalCities = state.totals?.requestedCities || state.cities.length;
  const monitoredSources = state.totals?.enabledSources || state.sources.filter((source) => source.enabled).length;
  elements.sourceTabCount.textContent = state.sources.length;
  elements.metrics.innerHTML = [
    ["Total results", totalResults, `${postedCount} posted, ${candidateCount} ready, ${reviewCount} review`],
    ["Configured cities", totalCities, `${state.totals?.liveCities || 0} currently live`],
    ["Monitored sources", monitoredSources, `${state.totals?.disabledSources || 0} disabled`]
  ].map(([label, value, hint]) => `
    <article class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(hint)}</small></article>
  `).join("");
}

function renderCityOptions() {
  const enabledCities = getEnabledCities();
  const groupedCityOptions = renderCityOptionGroups(enabledCities);
  elements.sourceCitySelect.innerHTML = groupedCityOptions;
  elements.backfillCitySelect.innerHTML = groupedCityOptions;

  const currentState = elements.manualNewsState.value;
  const states = groupCitiesByState(enabledCities).map((group) => group.state);
  elements.manualNewsState.innerHTML = `<option value="">Select state</option>${states
    .map((stateName) => `<option value="${escapeAttribute(stateName)}">${escapeHtml(stateName)}</option>`)
    .join("")}`;
  if (states.includes(currentState)) elements.manualNewsState.value = currentState;
  renderManualCityOptions();

  const lastBackfill = state.settings.lastBackfill || {};
  for (const option of elements.backfillCitySelect.options) option.selected = (lastBackfill.cityCodes || []).includes(option.value);
  $("#backfillFrom").value = lastBackfill.from || "";
  $("#backfillTo").value = lastBackfill.to || "";
  $("#resendBackfill").checked = lastBackfill.resendBackfill === true;
}
function renderNewsFilters() {
  const cityCounts = new Map();
  const sources = new Set();
  for (const item of getNewsItems()) {
    if (item.cityCode) cityCounts.set(item.cityCode, (cityCounts.get(item.cityCode) || 0) + 1);
    if (item.postedBy) sources.add(item.postedBy);
  }

  const allCities = getEnabledCities();
  const stateGroups = groupCitiesByState(allCities);
  const currentState = elements.newsStateFilter.value || "all";
  const currentCity = elements.newsCityFilter.value || "all";
  const currentSource = elements.newsSourceFilter.value || "all";
  const selectedState = stateGroups.some((group) => group.state === currentState) ? currentState : "all";
  const visibleCities = selectedState === "all" ? allCities : allCities.filter((city) => city.state === selectedState);

  elements.newsStateFilter.innerHTML = `<option value="all">All states</option>` +
    stateGroups.map((group) => {
      const count = group.cities.reduce((total, city) => total + (cityCounts.get(city.code) || 0), 0);
      return `<option value="${escapeAttribute(group.state)}">${escapeHtml(group.state)} (${count})</option>`;
    }).join("");
  elements.newsStateFilter.value = selectedState;

  const cityLabelText = selectedState === "all" ? "All cities" : `All ${selectedState} cities`;
  if (!visibleCities.length) {
    elements.newsCityFilter.disabled = true;
    elements.newsCityFilter.innerHTML = `<option value="all">No cities</option>`;
  } else {
    elements.newsCityFilter.disabled = false;
    elements.newsCityFilter.innerHTML = `<option value="all">${escapeHtml(cityLabelText)}</option>` +
      renderNewsCityOptions(visibleCities, cityCounts, selectedState === "all");
  }

  elements.newsSourceFilter.innerHTML = `<option value="all">All sources</option>` +
    [...sources].sort().map((source) => `<option value="${escapeAttribute(source)}">${escapeHtml(source)}</option>`).join("");
  elements.newsCityFilter.value = [...elements.newsCityFilter.options].some((option) => option.value === currentCity) ? currentCity : "all";
  elements.newsSourceFilter.value = [...elements.newsSourceFilter.options].some((option) => option.value === currentSource) ? currentSource : "all";
}
function getNewsItems() {
  const live = (state.liveNews || []).map((item) => ({ ...item, sourceKind: "live", uiStatus: item.uiStatus || (item.isActive ? "Published" : "Inactive") }));
  const posted = (state.postedNews || []).map((item) => ({ ...item, uiStatus: item.uiStatus || "Published", sourceKind: "posted" }));
  const ready = (state.candidateNews || []).map((item) => ({ ...item, uiStatus: "Ready", sourceKind: "candidate" }));
  const review = (state.needsReviewNews || []).map((item) => ({ ...item, uiStatus: "Needs review", sourceKind: "review" }));
  return [...live, ...posted, ...ready, ...review].sort((a, b) => new Date(b.publishedAt || b.createdAt || b.reportGeneratedAt || 0) - new Date(a.publishedAt || a.createdAt || a.reportGeneratedAt || 0));
}

function renderNews() {
  const query = elements.postedSearch.value.trim().toLowerCase();
  const selectedState = elements.newsStateFilter.value || "all";
  const city = elements.newsCityFilter.value || "all";
  const source = elements.newsSourceFilter.value || "all";
  const status = elements.newsStatusFilter.value || "published";
  const from = elements.newsFromDate.value ? new Date(`${elements.newsFromDate.value}T00:00:00`) : null;
  const to = elements.newsToDate.value ? new Date(`${elements.newsToDate.value}T23:59:59`) : null;

  const rows = getNewsItems().filter((item) => {
    const text = `${item.title || ""} ${item.cityCode || ""} ${item.postedBy || ""} ${item.newsLink || ""}`.toLowerCase();
    const date = item.publishedAt || item.createdAt || item.reportGeneratedAt;
    const parsed = date ? new Date(date) : null;
    const statusMatch = status === "live" ? item.sourceKind === "live" : status === "all" ||
      (status === "published" && item.uiStatus === "Published") ||
      (status === "ready" && item.uiStatus === "Ready") ||
      (status === "review" && item.uiStatus === "Needs review") ||
      (status === "inactive" && item.uiStatus === "Inactive");
    return statusMatch && (!query || text.includes(query)) &&
      (selectedState === "all" || cityState(item.cityCode) === selectedState) &&
      (city === "all" || item.cityCode === city) &&
      (source === "all" || item.postedBy === source) &&
      (!from || (parsed && parsed >= from)) &&
      (!to || (parsed && parsed <= to));
  });

  elements.newsCountLabel.textContent = `${rows.length} matching items`;
  elements.postedRows.innerHTML = rows.slice(0, 80).map(renderNewsRow).join("") || `<div class="empty-state">No news found for these filters.</div>`;
  elements.newsGroupTitle.textContent = status === "live" ? "Live Brokket app news" : status === "published" ? "Published report news" : status === "all" ? "All local news" : status === "ready" ? "Ready to post" : status === "review" ? "Needs review" : "Inactive news";
  elements.postedRows.querySelectorAll("[data-news-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireLiveAdmin(button.dataset.newsEnabled === "true" ? "activate news" : "deactivate news")) return;
      const enabled = button.dataset.newsEnabled === "true";
      const response = await fetch("/api/news-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: button.dataset.newsKey, enabled })
      });
      if (!response.ok) {
        alert((await response.json()).error || "Could not update news status");
        return;
      }
      state = await response.json();
      render();
    });
  });
}

function renderNewsRow(item) {
  const image = item.thumbnailImage || item.image || "";
  const logo = getNewsSourceLogo(item);
  const sourceInitials = initials(item.postedBy || "Brokket News");
  const imageCell = image
    ? `<a class="media-link" href="${escapeAttribute(image)}" target="_blank" rel="noreferrer"><img class="news-thumb" src="${escapeAttribute(image)}" alt="Article thumbnail" loading="lazy" onerror="this.closest('a').classList.add('broken')"></a>`
    : `<span class="news-thumb source-logo">${escapeHtml(sourceInitials)}</span>`;
  const logoCell = logo
    ? `<img class="publisher-logo" src="${escapeAttribute(logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'publisher-logo fallback', textContent: '${escapeJsAttribute(sourceInitials)}' }))">`
    : `<span class="publisher-logo fallback">${escapeHtml(sourceInitials)}</span>`;

  const key = newsKey(item);
  const canToggle = item.sourceKind === "posted";
  const toggleLabel = item.uiStatus === "Inactive" ? "Activate in admin" : "Deactivate in admin";
  return `
    <article class="news-row">
      <span>${imageCell}</span>
      <span class="news-title"><b>${escapeHtml(item.title || "Untitled")}</b><a href="${escapeAttribute(item.newsLink || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.newsLink || "No link")}</a></span>
      <span>${escapeHtml(cityLabel(item.cityCode || "unknown"))}</span>
      <span class="source-identity">${logoCell}<span>${escapeHtml(item.postedBy || "Brokket News")}</span></span>
      <span>${formatDate(item.publishedAt || item.createdAt || item.reportGeneratedAt)}</span>
      <span><span class="status-pill status-${escapeAttribute(String(item.uiStatus || "Published").toLowerCase().replaceAll(" ", "-"))}">${escapeHtml(item.uiStatus || "Published")}</span></span>
      <span class="row-actions"><button type="button" title="Open article" onclick="window.open('${escapeJsAttribute(item.newsLink || "#")}', '_blank')">O</button>${canToggle ? `<button type="button" class="toggle-news" data-news-key="${escapeAttribute(key)}" data-news-enabled="${item.uiStatus === "Inactive" ? "true" : "false"}" title="${toggleLabel}">${item.uiStatus === "Inactive" ? "A" : "D"}</button>` : ""}</span>
    </article>
  `;
}

async function loadLiveNews() {
  const isStaticHost = window.location.protocol === "file:" || /github\.io$/i.test(window.location.hostname);
  if (staticMode || isStaticHost) {
    showReadOnlyNotice("Live Brokket app data is available from the local admin only. Open http://localhost:3000 after starting npm run admin.");
    alert("Open the admin at http://localhost:3000 to load live app news. A file:// page cannot call the local API.");
    return;
  }
  elements.loadLiveNewsBtn.disabled = true;
  elements.loadLiveNewsBtn.textContent = "Loading live app news...";
  try {
    const response = await fetch("/api/live-news?page=0&size=1000", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load live app news");
    state.liveNews = body.items || [];
    elements.newsStatusFilter.value = "live";
    renderMetrics();
    renderNewsFilters();
    renderNews();
  } catch (error) {
    alert(error.message || "Could not load live app news");
  } finally {
    elements.loadLiveNewsBtn.disabled = false;
    elements.loadLiveNewsBtn.textContent = "Load live app news";
  }
}

function newsKey(item = {}) {
  return `${item.cityCode || ""}|${normalizeNewsUrl(item.newsLink || item.url || "")}`;
}

function normalizeNewsUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/+$/, "").toLowerCase();
  } catch {
    return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
  }
}

function renderSources() {
  const query = elements.sourceSearch.value.trim().toLowerCase();
  const type = elements.sourceTypeFilter.value || "all";
  const status = elements.sourceStatusFilter.value || "all";
  const matched = state.sources.filter((source) => {
    const haystack = `${source.label || ""} ${source.url || ""} ${(source.cityCodes || []).join(" ")} ${source.category || ""}`.toLowerCase();
    return (!query || haystack.includes(query)) &&
      (type === "all" || source.category === type) &&
      (status === "all" || (status === "enabled" ? source.enabled : !source.enabled));
  });
  const visible = matched.slice(0, sourceVisibleLimit);
  elements.sourceCountLabel.textContent = `${visible.length} of ${matched.length} monitored sources`;
  elements.sourceRows.innerHTML = visible.map(renderSourceCard).join("") +
    (visible.length < matched.length ? `<button class="source-card" type="button" id="showMoreSources"><b>Show more sources</b><small>${matched.length - visible.length} remaining</small></button>` : "");
  const showMore = $("#showMoreSources");
  if (showMore) showMore.addEventListener("click", () => { sourceVisibleLimit += 258; renderSources(); });
  elements.sourceRows.querySelectorAll("[data-source-enabled]").forEach((input) => {
    input.addEventListener("change", async () => {
      if (!requireLiveAdmin("change sources")) { input.checked = !input.checked; return; }
      await fetch(`/api/sources/${encodeURIComponent(input.dataset.sourceEnabled)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.checked, url: input.dataset.sourceUrl || "" })
      });
      await loadState();
    });
  });
  elements.sourceRows.querySelectorAll("[data-source-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!requireLiveAdmin("remove sources")) return;
      if (!confirm("Remove this manual source?")) return;
      await fetch(`/api/sources/${encodeURIComponent(button.dataset.sourceDelete)}`, { method: "DELETE" });
      await loadState();
    });
  });
}

function renderSourceCard(source) {
  const host = getHost(source.url);
  const logo = source.logo || source.sourceLogo || faviconUrl(host);
  const fallback = initials(source.label || host || "S");
  return `
    <article class="source-card">
      ${logo ? `<img class="source-logo image" src="${escapeAttribute(logo)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'), { className: 'source-logo', textContent: '${escapeJsAttribute(fallback)}' }))">` : `<span class="source-logo">${escapeHtml(fallback)}</span>`}
      <span>
        <b>${escapeHtml(source.label || host || "Source")}</b>
        <small>${escapeHtml(host || source.url)}</small>
        <span class="type-pill">${escapeHtml(source.category || "source")}</span>
        <div class="source-meta">${source.enabled ? "Monitored every 30 minutes" : "Disabled"}</div>
      </span>
      <span class="source-actions">
        <label class="switch"><input type="checkbox" ${source.enabled ? "checked" : ""} data-source-enabled="${escapeAttribute(source.id)}" data-source-url="${escapeAttribute(source.url)}"> ${source.enabled ? "On" : "Off"}</label>
        <button type="button" onclick="window.open('${escapeJsAttribute(source.url)}', '_blank')">Open</button>
        ${source.category === "manual" ? `<button class="danger" type="button" data-source-delete="${escapeAttribute(source.id)}">Remove</button>` : ""}
      </span>
    </article>
  `;
}

function renderCities() {
  const query = elements.citySearch.value.trim().toLowerCase();
  const cities = state.cities.filter((city) => {
    const haystack = `${city.name} ${city.state} ${city.code}`.toLowerCase();
    return !query || haystack.includes(query);
  });
  const groups = groupCitiesByState(cities);
  elements.cityRows.innerHTML = groups.map((group) => {
    const liveCount = group.cities.filter((city) => city.enabled).length;
    const sourceCount = group.cities.reduce((total, city) => total + Number(city.sourceCount || 0), 0);
    return `
      <section class="state-city-group">
        <header class="state-city-head">
          <div><b>${escapeHtml(group.state)}</b><span>${liveCount} of ${group.cities.length} cities live</span></div>
          <small>${sourceCount} mapped sources</small>
        </header>
        ${group.cities.map((city) => `
          <article class="city-row">
            <label class="switch"><input type="checkbox" ${city.enabled ? "checked" : ""} data-city-toggle="${escapeAttribute(city.code)}"> ${city.enabled ? "Live" : "Off"}</label>
            <b>${escapeHtml(city.name)}</b>
            <span class="code-pill">${escapeHtml(city.code)}</span>
            <span>${city.sourceCount || 0} sources</span>
          </article>
        `).join("")}
      </section>
    `;
  }).join("") || `<div class="empty-state">No cities match this search.</div>`;
  elements.cityRows.querySelectorAll("[data-city-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      if (!requireLiveAdmin("change cities")) { input.checked = !input.checked; return; }
      await fetch(`/api/cities/${encodeURIComponent(input.dataset.cityToggle)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: input.checked })
      });
      await loadState();
    });
  });
}
function renderMasterControls() {
  const settings = state.settings;
  elements.masterControls.innerHTML = [
    ["automationEnabled", "Full tool running", "Turn off to pause scheduled fetch/push behavior."],
    ["apiPushEnabled", "API push enabled", "Off means local/admin runs are dry-run only."],
    ["allCitiesEnabled", "All cities enabled", "Use when all city filters are reviewed and ready."]
  ].map(([key, label, hint]) => `
    <label class="control-toggle"><input type="checkbox" data-setting-toggle="${key}" ${settings[key] ? "checked" : ""}><span><b>${label}</b><small>${hint}</small></span></label>
  `).join("");
  elements.masterControls.querySelectorAll("[data-setting-toggle]").forEach((input) => {
    input.addEventListener("change", async () => {
      const key = input.dataset.settingToggle;
      if (!requireLiveAdmin("change settings")) { input.checked = !input.checked; return; }
      if (key === "apiPushEnabled" && input.checked && !confirm("Enable API push? Only continue if reviewed quality is clean.")) {
        input.checked = false;
        return;
      }
      await updateSettings({ [key]: input.checked });
    });
  });
}

function renderControlSummary() {
  const latest = state.reports?.[0];
  elements.controlSummary.innerHTML = [
    ["Live cities", state.totals?.liveCities || 0],
    ["Enabled sources", state.totals?.enabledSources || 0],
    ["Disabled sources", state.totals?.disabledSources || 0],
    ["Latest report", latest ? latest.name : "No report yet"],
    ["Latest ready news", latest ? latest.candidateCount : 0],
    ["Mode", state.settings.apiPushEnabled ? "API push enabled" : "Dry-run protected"]
  ].map(([label, value]) => `<div class="summary-item"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join("");
}

function renderAudit() {
  const latest = state.reports?.[0];
  const totals = state.analytics?.totals || {};
  if (!latest) {
    elements.auditRunMeta.textContent = "No run report available yet.";
    elements.auditMetrics.innerHTML = elements.rejectionRows.innerHTML = elements.sourceFailureRows.innerHTML = elements.cityAuditRows.innerHTML = elements.rejectedAuditRows.innerHTML = "";
    elements.rejectedAuditCount.textContent = "";
    return;
  }

  elements.auditRunMeta.textContent = `${latest.name} • ${latest.mode}${latest.dryRun ? " • dry run" : " • live push"}`;
  elements.auditMetrics.innerHTML = [
    ["Fetched", latest.fetchedArticleCount],
    ["Expanded", latest.expandedArticleCount],
    ["Ready", latest.candidateCount],
    ["Posted", latest.postedCount],
    ["Rejected", latest.rejectedArticleCount],
    ["Source failures", latest.failureCount]
  ].map(([label, value]) => `<div class="audit-metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`).join("");

  const reasons = Object.entries(latest.skippedByReason || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  elements.rejectionRows.innerHTML = reasons.length
    ? reasons.map(([reason, count]) => `<div class="audit-row"><b>${escapeHtml(count)}</b><span>${escapeHtml(reason)}</span></div>`).join("")
    : `<div class="empty-state">No rejected articles in this run.</div>`;

  const failures = latest.failures || [];
  elements.sourceFailureRows.innerHTML = failures.length
    ? failures.slice(0, 40).map((failure) => `<div class="audit-row failure"><b>${escapeHtml(failure.attempts || 1)}x</b><span>${escapeHtml(failure.source || failure.url || "Unknown source")}<small>${escapeHtml(failure.error || "Fetch failed")}</small></span></div>`).join("")
    : `<div class="empty-state">No failed sources in this run.</div>`;

  const cityRows = state.analytics?.byCity || [];
  elements.cityAuditRows.innerHTML = cityRows.length
    ? `<div class="audit-table-row audit-table-header"><span>City</span><span>Fetched/expanded</span><span>Ready</span><span>Posted</span><span>Rejected</span></div>` +
      cityRows.map((row) => `<div class="audit-table-row"><span>${escapeHtml(cityLabel(row.cityCode))}</span><span>${escapeHtml(row.expanded || 0)}</span><span>${escapeHtml(row.readyToPost || 0)}</span><span>${escapeHtml(row.posted || 0)}</span><span>${escapeHtml(row.rejected || 0)}</span></div>`).join("")
    : `<div class="empty-state">No city breakdown in this report.</div>`;

  const rejectedArticles = latest.rejectedArticles || [];
  const rejectedTotal = Number(latest.rejectedArticleCount || rejectedArticles.length);
  elements.rejectedAuditCount.textContent = `${rejectedArticles.length} of ${rejectedTotal} retained`;
  elements.rejectedAuditRows.innerHTML = rejectedArticles.length
    ? rejectedArticles.map((item) => {
        const article = item.article || item;
        const reasons = (item.reasons || []).join("; ");
        const link = article.newsLink
          ? `<a href="${escapeHtml(article.newsLink)}" target="_blank" rel="noreferrer">Open article</a>`
          : "";
        return `<article class="rejected-audit-item"><div class="rejected-audit-main"><strong>${escapeHtml(article.title || "Untitled article")}</strong><span>${escapeHtml(cityLabel(article.cityCode || "unknown"))} · ${escapeHtml(article.sourceName || article.postedBy || "Unknown source")} · ${escapeHtml(article.publishedAt || "Unknown date")}</span><small>${escapeHtml(reasons || "No reason recorded")}</small></div><div class="rejected-audit-action">${link}</div></article>`;
      }).join("")
    : `<div class="empty-state">No individual rejected articles were retained in this report. Older reports created before this audit was added contain totals only.</div>`;
}

async function updateSettings(patch) {
  if (!requireLiveAdmin("change settings")) return;
  const response = await fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
  if (!response.ok) alert((await response.json()).error || "Could not update settings");
  await loadState();
}

async function addSource(event) {
  event.preventDefault();
  if (!requireLiveAdmin("add sources")) return;
  const form = new FormData(event.currentTarget);
  const payload = {
    label: form.get("label"),
    url: form.get("url"),
    category: form.get("category"),
    cityCodes: [...elements.sourceCitySelect.selectedOptions].map((option) => option.value)
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
  if (!requireLiveAdmin("start dry runs")) return;
  const payload = {
    enabledCityCodes: state.settings.enabledCityCodes,
    targetCityCodes: [...elements.backfillCitySelect.selectedOptions].map((option) => option.value),
    backfillFrom: $("#backfillFrom").value,
    backfillTo: $("#backfillTo").value,
    resendBackfill: $("#resendBackfill").checked,
    maxItemsPerSource: $("#maxItemsPerSource").value,
    maxItemsPerRun: $("#maxItemsPerRun").value,
    maxPagesPerSource: 1,
    lookbackDays: $("#lookbackDays").value
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
  activateTab("control");
  renderDryRun(body);
}

async function refreshDryRun() {
  if (staticMode) return;
  const response = await fetch("/api/dry-run");
  if (response.ok) renderDryRun(await response.json());
}

function renderDryRun(dryRun) {
  if (!dryRun || !dryRun.startedAt) {
    elements.dryRunLog.textContent = "No dry run started from admin yet.";
    return;
  }
  const header = [
    `Running: ${dryRun.running}`,
    `Started: ${dryRun.startedAt}`,
    dryRun.finishedAt ? `Finished: ${dryRun.finishedAt}` : "",
    dryRun.exitCode !== null && dryRun.exitCode !== undefined ? `Exit code: ${dryRun.exitCode}` : "",
    "",
    "Safe env:",
    JSON.stringify(dryRun.env, null, 2),
    "",
    "Log:"
  ].filter(Boolean).join("\n");
  elements.dryRunLog.textContent = `${header}\n${(dryRun.log || []).join("\n")}`;
}

function openNewsModal() {
  elements.manualNewsMessage.textContent = "";
  elements.manualNewsForm.querySelectorAll("[data-media-preview]").forEach(updateMediaPreview);
  elements.modal.classList.add("open");
  elements.modal.setAttribute("aria-hidden", "false");
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  elements.manualNewsForm.elements.publishedAt.value = now.toISOString().slice(0, 16);
}

function closeNewsModal() {
  elements.modal.classList.remove("open");
  elements.modal.setAttribute("aria-hidden", "true");
}

function createManualArticleDraft(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries(form.entries());
  elements.manualNewsMessage.textContent = staticMode ? `Draft preview ready for ${payload.state} / ${cityLabel(payload.cityCode)}. GitHub Pages is read-only; run local admin to save repo changes.` : `Draft ready for ${payload.state} / ${cityLabel(payload.cityCode)}. Manual API publish is intentionally not wired from this local UI yet.`;
}

function requireLiveAdmin(action) {
  if (!staticMode) return true;
  showReadOnlyNotice(`GitHub Pages is preview-only. To ${action}, run local admin at http://localhost:3000, save changes there, then commit and push.`);
  return false;
}

function showReadOnlyNotice(message) {
  if (!elements.readonlyNotice) return;
  elements.readonlyNotice.textContent = message;
  elements.readonlyNotice.hidden = false;
}
function clearNewsFilters() {
  elements.postedSearch.value = "";
  elements.newsStateFilter.value = "all";
  elements.newsCityFilter.value = "all";
  elements.newsSourceFilter.value = "all";
  elements.newsStatusFilter.value = "published";
  elements.newsFromDate.value = "";
  elements.newsToDate.value = "";
  renderNewsFilters();
  renderNews();
}

function getEnabledCities() {
  return [...(state?.cities || [])]
    .filter((city) => city.enabled)
    .sort((a, b) => `${a.state} ${a.name}`.localeCompare(`${b.state} ${b.name}`));
}

function groupCitiesByState(cities) {
  const groups = new Map();
  for (const city of cities || []) {
    const stateName = city.state || "Other";
    if (!groups.has(stateName)) groups.set(stateName, []);
    groups.get(stateName).push(city);
  }
  return [...groups.entries()]
    .map(([stateName, rows]) => ({
      state: stateName,
      cities: rows.sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.state.localeCompare(b.state));
}

function renderCityOptionGroups(cities) {
  return groupCitiesByState(cities).map((group) => `
    <optgroup label="${escapeAttribute(group.state)}">
      ${group.cities.map((city) => `<option value="${escapeAttribute(city.code)}">${escapeHtml(city.name)}</option>`).join("")}
    </optgroup>
  `).join("");
}
function renderNewsCityOptions(cities, cityCounts, grouped) {
  const optionForCity = (city) => `<option value="${escapeAttribute(city.code)}">${escapeHtml(city.name)} (${cityCounts.get(city.code) || 0})</option>`;
  if (!grouped) return cities.map(optionForCity).join("");
  return groupCitiesByState(cities).map((group) => `
    <optgroup label="${escapeAttribute(group.state)}">
      ${group.cities.map(optionForCity).join("")}
    </optgroup>
  `).join("");
}
function renderManualCityOptions() {
  const selectedState = elements.manualNewsState.value;
  const cities = getEnabledCities().filter((city) => city.state === selectedState);
  elements.manualNewsCity.disabled = !selectedState;
  elements.manualNewsCity.innerHTML = selectedState
    ? `<option value="">Select city</option>${cities.map((city) => `<option value="${escapeAttribute(city.code)}">${escapeHtml(city.name)}</option>`).join("")}`
    : `<option value="">Select state first</option>`;
}

function updateMediaPreview(eventOrInput) {
  const input = eventOrInput?.target || eventOrInput;
  if (!input?.dataset?.mediaPreview) return;
  const preview = document.getElementById(input.dataset.mediaPreview);
  const url = input.value.trim();
  if (!url) {
    preview.className = "media-preview empty";
    preview.textContent = preview.id === "thumbnailPreview" ? "No thumbnail selected" : "No logo selected";
    return;
  }
  preview.className = "media-preview";
  preview.innerHTML = `<img src="${escapeAttribute(url)}" alt="Preview" loading="lazy" onerror="this.parentElement.classList.add('empty'); this.parentElement.textContent='Preview could not load';"><span>${escapeHtml(getHost(url) || "Image URL")}</span>`;
}

function getNewsSourceLogo(item) {
  if (item.postedByLogo || item.sourceLogo || item.logo) return item.postedByLogo || item.sourceLogo || item.logo;
  const itemHost = getHost(item.newsLink || "");
  const source = (state?.sources || []).find((candidate) => {
    const candidateHost = getHost(candidate.url || "");
    return candidateHost && itemHost && candidateHost === itemHost;
  });
  return source?.logo || source?.sourceLogo || faviconUrl(itemHost || getHost(source?.url || ""));
}

function faviconUrl(host) {
  return host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64` : "";
}
function cityState(code) {
  const city = state?.cities?.find((item) => item.code === code);
  return city?.state || "";
}

function cityLabel(code) {
  const city = state?.cities?.find((item) => item.code === code);
  return city ? city.name : String(code || "").replaceAll("_", " ");
}

function getHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url || ""; }
}

function initials(value) {
  const words = String(value || "").replace(/[^a-z0-9 ]/gi, " ").split(/\s+/).filter(Boolean);
  return (words[0]?.[0] || "B").toUpperCase() + (words[1]?.[0] || "").toUpperCase();
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

function escapeJsAttribute(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("'", "\\'").replaceAll("\n", "");
}

function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
