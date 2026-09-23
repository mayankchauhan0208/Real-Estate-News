let state = null;
let staticMode = false;
let sourceVisibleLimit = 258;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const elements = {
  metrics: $("#metrics"),
  sourceTabCount: $("#sourceTabCount"),
  pageTitle: $("#pageTitle"),
  pageSubtitle: $("#pageSubtitle"),
  postedRows: $("#postedRows"),
  newsCountLabel: $("#newsCountLabel"),
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
  manualNewsMessage: $("#manualNewsMessage")
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

[elements.postedSearch, elements.newsCityFilter, elements.newsSourceFilter, elements.newsStatusFilter, elements.newsFromDate, elements.newsToDate]
  .forEach((el) => el.addEventListener("input", debounce(renderNews, 120)));
[elements.sourceSearch, elements.sourceTypeFilter, elements.sourceStatusFilter]
  .forEach((el) => el.addEventListener("input", debounce(() => { sourceVisibleLimit = 258; renderSources(); }, 120)));
elements.citySearch.addEventListener("input", debounce(renderCities, 120));

loadState();
setInterval(refreshDryRun, 4000);

async function loadState() {
  const isStaticHost = window.location.protocol === "file:" || /github\.io$/i.test(window.location.hostname);
  try {
    if (isStaticHost) throw new Error("Static admin host");
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error(`API state failed: ${response.status}`);
    state = await response.json();
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
  const totalResults = postedCount || candidateCount || state.analytics?.totals?.readyToPost || 0;
  const totalCities = state.totals?.requestedCities || state.cities.length;
  const monitoredSources = state.totals?.enabledSources || state.sources.filter((source) => source.enabled).length;
  elements.sourceTabCount.textContent = state.sources.length;
  elements.metrics.innerHTML = [
    ["Total results", totalResults, postedCount ? "Posted news in reports" : "Latest ready candidates"],
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
  const cityCodes = new Set();
  const sources = new Set();
  for (const item of getNewsItems()) {
    if (item.cityCode) cityCodes.add(item.cityCode);
    if (item.postedBy) sources.add(item.postedBy);
  }

  const newsCities = getEnabledCities().filter((city) => cityCodes.has(city.code));
  const states = groupCitiesByState(newsCities).map((group) => group.state);
  const currentState = elements.newsStateFilter.value || "all";
  const currentCity = elements.newsCityFilter.value || "all";
  const currentSource = elements.newsSourceFilter.value || "all";
  const selectedState = states.includes(currentState) ? currentState : "all";
  const visibleCities = selectedState === "all" ? newsCities : newsCities.filter((city) => city.state === selectedState);

  elements.newsStateFilter.innerHTML = `<option value="all">All states</option>` +
    states.map((stateName) => `<option value="${escapeAttribute(stateName)}">${escapeHtml(stateName)}</option>`).join("");
  elements.newsStateFilter.value = selectedState;

  elements.newsCityFilter.innerHTML = `<option value="all">${selectedState === "all" ? `All ${state.totals?.requestedCities || state.cities.length} cities` : `All ${selectedState} cities`}</option>` +
    renderCityOptionGroups(visibleCities);
  elements.newsSourceFilter.innerHTML = `<option value="all">All sources</option>` +
    [...sources].sort().map((source) => `<option value="${escapeAttribute(source)}">${escapeHtml(source)}</option>`).join("");
  elements.newsCityFilter.value = [...elements.newsCityFilter.options].some((option) => option.value === currentCity) ? currentCity : "all";
  elements.newsSourceFilter.value = [...elements.newsSourceFilter.options].some((option) => option.value === currentSource) ? currentSource : "all";
}

function getNewsItems() {
  const posted = (state.postedNews || []).map((item) => ({ ...item, uiStatus: "Active", sourceKind: "posted" }));
  if (posted.length) return posted;
  return (state.candidateNews || []).map((item) => ({ ...item, uiStatus: "Ready", sourceKind: "candidate" }));
}

function renderNews() {
  const query = elements.postedSearch.value.trim().toLowerCase();
  const selectedState = elements.newsStateFilter.value || "all";
  const city = elements.newsCityFilter.value || "all";
  const source = elements.newsSourceFilter.value || "all";
  const from = elements.newsFromDate.value ? new Date(`${elements.newsFromDate.value}T00:00:00`) : null;
  const to = elements.newsToDate.value ? new Date(`${elements.newsToDate.value}T23:59:59`) : null;

  const rows = getNewsItems().filter((item) => {
    const text = `${item.title || ""} ${item.cityCode || ""} ${item.postedBy || ""} ${item.newsLink || ""}`.toLowerCase();
    const date = item.publishedAt || item.createdAt || item.reportGeneratedAt;
    const parsed = date ? new Date(date) : null;
    return (!query || text.includes(query)) &&
      (selectedState === "all" || cityState(item.cityCode) === selectedState) &&
      (city === "all" || item.cityCode === city) &&
      (source === "all" || item.postedBy === source) &&
      (!from || (parsed && parsed >= from)) &&
      (!to || (parsed && parsed <= to));
  });

  elements.newsCountLabel.textContent = `${rows.length} news items on this page`;
  elements.postedRows.innerHTML = rows.slice(0, 80).map(renderNewsRow).join("") || `<div class="empty-state">No news found for these filters.</div>`;
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

  return `
    <article class="news-row">
      <span>${imageCell}</span>
      <span class="news-title"><b>${escapeHtml(item.title || "Untitled")}</b><a href="${escapeAttribute(item.newsLink || "#")}" target="_blank" rel="noreferrer">${escapeHtml(item.newsLink || "No link")}</a></span>
      <span>${escapeHtml(cityLabel(item.cityCode || "unknown"))}</span>
      <span class="source-identity">${logoCell}<span>${escapeHtml(item.postedBy || "Brokket News")}</span></span>
      <span>${formatDate(item.publishedAt || item.createdAt || item.reportGeneratedAt)}</span>
      <span><span class="status-pill">${escapeHtml(item.uiStatus || "Active")}</span></span>
      <span class="row-actions"><button type="button" title="Open article" onclick="window.open('${escapeJsAttribute(item.newsLink || "#")}', '_blank')">O</button><button type="button" class="danger" title="Delete requires app admin">D</button></span>
    </article>
  `;
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
  elements.newsStatusFilter.value = "active";
  elements.newsFromDate.value = "";
  elements.newsToDate.value = "";
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
