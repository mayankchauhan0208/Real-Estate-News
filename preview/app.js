const state = {
  data: null,
  city: "all",
  search: ""
};

const cityLabels = {
  all: "All",
  gurugram: "Gurugram",
  faridabad: "Faridabad",
  noida: "Noida"
};

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function shortUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`.replace(/^www\./, "");
  } catch {
    return value || "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMetrics() {
  const { summary, mode, generatedAt } = state.data;
  const metrics = [
    ["Generated", formatDate(generatedAt)],
    ["Sources", summary.sourcesChecked],
    ["Fetched", summary.fetchedRaw],
    ["In Window", summary.inDateWindow],
    ["Publishable", summary.publishable],
    ["Rejected", summary.rejectedSample]
  ];

  document.getElementById("metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  const cities = mode.targetCities.length ? mode.targetCities.join(", ") : "all cities";
  document.getElementById("apiStatus").textContent = `Dry run only - ${cities}`;
}

function renderTabs() {
  const cities = ["all", ...new Set(state.data.publishable.map((article) => article.cityCode).filter(Boolean))];
  document.getElementById("cityTabs").innerHTML = cities.map((city) => `
    <button class="${city === state.city ? "active" : ""}" data-city="${escapeHtml(city)}">
      ${escapeHtml(cityLabels[city] || city)}
    </button>
  `).join("");

  document.querySelectorAll("[data-city]").forEach((button) => {
    button.addEventListener("click", () => {
      state.city = button.dataset.city;
      render();
    });
  });
}

function filteredArticles() {
  const search = state.search.toLowerCase();
  return state.data.publishable.filter((article) => {
    const cityMatch = state.city === "all" || article.cityCode === state.city;
    const haystack = `${article.title} ${article.description} ${article.postedBy} ${article.cityCode}`.toLowerCase();
    return cityMatch && (!search || haystack.includes(search));
  });
}

function renderFeed() {
  const articles = filteredArticles();
  document.getElementById("feedCount").textContent = `${articles.length} visible`;
  document.getElementById("feedList").innerHTML = articles.length
    ? articles.map((article) => `
      <article class="article">
        <img class="thumb" src="${escapeHtml(article.thumbnailImage || article.postedByLogo || "")}" alt="">
        <div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.description || article.articleText || "")}</p>
          <div class="meta">
            <span class="tag">${escapeHtml(cityLabels[article.cityCode] || article.cityCode || "City")}</span>
            <span class="tag">${escapeHtml(article.classification || "publishable")}</span>
            <span>${escapeHtml(article.postedBy || "Source")}</span>
            <span>${escapeHtml(formatDate(article.publishedAt))}</span>
          </div>
          <p>${escapeHtml(shortUrl(article.newsLink))}</p>
        </div>
      </article>
    `).join("")
    : `<div class="empty">No publishable articles match this view.</div>`;
}

function renderSourceHealth() {
  const failed = state.data.sources.filter((source) => source.status === "failed");
  const ok = state.data.sources.filter((source) => source.status === "ok");
  const topSources = [...failed, ...ok.slice(0, 12)];
  document.getElementById("sourceHealth").innerHTML = `
    <div class="source-row">
      <strong>${ok.length} OK / ${failed.length} failed</strong>
      <span>Local dry-run source checks only.</span>
    </div>
    ${topSources.map((source) => `
      <div class="source-row ${source.status === "failed" ? "failed" : ""}">
        <strong>${escapeHtml(source.status === "failed" ? "Failed" : `${source.fetched} fetched`)}</strong>
        <span>${escapeHtml(source.source)}</span>
        ${source.error ? `<span>${escapeHtml(source.error)}</span>` : ""}
      </div>
    `).join("")}
  `;
}

function renderRejected() {
  const rows = state.data.rejected.slice(0, 10);
  document.getElementById("rejectList").innerHTML = rows.length
    ? rows.map((item) => `
      <div class="reject-row">
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.reasons.join("; "))}</span>
        <span>${escapeHtml(shortUrl(item.newsLink))}</span>
      </div>
    `).join("")
    : `<div class="empty">No rejected sample in this preview run.</div>`;
}

function render() {
  renderMetrics();
  renderTabs();
  renderFeed();
  renderSourceHealth();
  renderRejected();
}

async function init() {
  const response = await fetch("/data/feed-preview.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Run npm run preview:generate first.");
  }

  state.data = await response.json();
  document.getElementById("searchInput").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderFeed();
  });
  render();
}

init().catch((error) => {
  document.body.innerHTML = `<main class="shell"><div class="empty">${escapeHtml(error.message)}</div></main>`;
});
