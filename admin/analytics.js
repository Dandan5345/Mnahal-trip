import {
  adminWorkerPost,
  attachSharedUi,
  createAdminShell,
  debounce
} from "./shared.js";

const app = document.getElementById("app");

const state = {
  user: null,
  data: null,
  userQuery: "",
  userFilter: "all",
  userSort: "creations",
  tripQuery: "",
  tripFilter: "all",
  tripSort: "updated"
};

const $ = (id) => document.getElementById(id);
const numberFormatter = new Intl.NumberFormat("he-IL");

renderPage();

function renderPage() {
  app.innerHTML = createAdminShell({
    activeKey: "analytics",
    title: "מרכז האנליטיקות",
    subtitle: "תמונה ניהולית של משתמשים, טיולי ענן ותוכן שכבר קיים ב-Firestore.",
    actions: `
      <button class="primary-action" type="button" id="reloadAnalyticsButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן נתונים</span>
      </button>
    `,
    content: `
      <section class="analytics-hero panel">
        <div class="analytics-hero-copy">
          <span class="analytics-live-badge"><span></span> נתוני Firestore קיימים</span>
          <h2>כל מה שקורה בענן, במסך אחד.</h2>
          <p>העמוד קורא נתונים שכבר נשמרים היום — בלי צורך בגרסה חדשה של האפליקציה.</p>
          <div class="analytics-hero-meta">
            <span><i data-lucide="shield-check"></i> מנהל מאומת בלבד</span>
            <span><i data-lucide="database"></i> מטא־דאטה בלבד</span>
            <span id="analyticsUpdatedAt"><i data-lucide="clock-3"></i> טרם נטען</span>
          </div>
        </div>
        <div class="analytics-hero-orbit" aria-hidden="true">
          <span class="analytics-orbit analytics-orbit-one"></span>
          <span class="analytics-orbit analytics-orbit-two"></span>
          <div class="analytics-hero-mark"><i data-lucide="chart-spline"></i></div>
        </div>
      </section>

      <div class="analytics-loading panel" id="analyticsLoading" aria-live="polite">
        <span class="analytics-loader" aria-hidden="true"></span>
        <div><strong>אוסף את נתוני הענן…</strong><p>משתמשים, טיולים, מקומות, סרטונים ודיווחים</p></div>
      </div>

      <div class="analytics-error panel is-hidden" id="analyticsError" role="alert">
        <i data-lucide="triangle-alert"></i>
        <div><strong>לא הצלחנו לטעון את האנליטיקות</strong><p id="analyticsErrorMessage"></p></div>
        <button class="ghost-action" type="button" id="retryAnalyticsButton">נסה שוב</button>
      </div>

      <div class="analytics-content is-hidden" id="analyticsContent">
        <section class="analytics-stat-grid" id="analyticsStats" aria-label="נתונים מרכזיים"></section>

        <section class="analytics-insights-grid">
          <article class="panel analytics-chart-panel analytics-registration-panel">
            <div class="analytics-panel-heading">
              <div><p class="eyebrow">30 ימים</p><h2>הרשמות משתמשים</h2></div>
              <span class="analytics-heading-value" id="registrationsTotal">0</span>
            </div>
            <div class="analytics-bars" id="registrationChart" aria-label="גרף הרשמות ב-30 הימים האחרונים"></div>
          </article>

          <article class="panel analytics-chart-panel">
            <div class="analytics-panel-heading">
              <div><p class="eyebrow">Cloud trips</p><h2>מצב טיולי הענן</h2></div>
            </div>
            <div class="analytics-donut-layout">
              <div class="analytics-donut" id="tripStatusDonut">
                <div><strong id="tripDonutTotal">0</strong><span>טיולים</span></div>
              </div>
              <div class="analytics-legend" id="tripStatusLegend"></div>
            </div>
          </article>

          <article class="panel analytics-chart-panel">
            <div class="analytics-panel-heading">
              <div><p class="eyebrow">Content</p><h2>תוכן ופעילות</h2></div>
            </div>
            <div class="analytics-breakdown" id="contentBreakdown"></div>
          </article>
        </section>

        <section class="panel analytics-dataset-panel">
          <div class="analytics-panel-heading analytics-table-heading">
            <div><p class="eyebrow">Creators</p><h2>פעילות לפי משתמש</h2><p>פירוט יצירות ענן בלבד, ללא תוכן פרטי של הטיול.</p></div>
            <span class="analytics-result-count" id="visibleCreatorsCount">0 משתמשים</span>
          </div>
          <div class="analytics-controls">
            <label class="search-input-row analytics-search">
              <i data-lucide="search" aria-hidden="true"></i>
              <input id="analyticsUserSearch" type="search" autocomplete="off" placeholder="חיפוש לפי שם, username או UID" />
            </label>
            <label class="analytics-select-field"><span>מיון</span>
              <select id="analyticsUserSort">
                <option value="creations">הכי הרבה יצירות</option>
                <option value="newest">החדשים ביותר</option>
                <option value="oldest">הוותיקים ביותר</option>
                <option value="trips">הכי הרבה טיולים</option>
                <option value="places">הכי הרבה מקומות</option>
                <option value="videos">הכי הרבה סרטונים</option>
                <option value="name">לפי שם</option>
              </select>
            </label>
          </div>
          <div class="analytics-filter-row" id="creatorFilters" role="group" aria-label="סינון משתמשים">
            ${filterChip("creator", "all", "users", "הכול", true)}
            ${filterChip("creator", "creators", "sparkles", "יצרו תוכן")}
            ${filterChip("creator", "trips", "route", "עם טיולים")}
            ${filterChip("creator", "premium", "crown", "Premium")}
            ${filterChip("creator", "blocked", "ban", "חסומים/נמחקו")}
            ${filterChip("creator", "empty", "circle-minus", "ללא יצירות ענן")}
          </div>
          <div class="analytics-user-table" id="analyticsUserTable"></div>
        </section>

        <section class="panel analytics-dataset-panel">
          <div class="analytics-panel-heading analytics-table-heading">
            <div><p class="eyebrow">Trips</p><h2>טיולי ענן</h2><p>איחוד ללא כפילויות של shared_trips ושל trips.</p></div>
            <span class="analytics-result-count" id="visibleTripsCount">0 טיולים</span>
          </div>
          <div class="analytics-controls">
            <label class="search-input-row analytics-search">
              <i data-lucide="search" aria-hidden="true"></i>
              <input id="analyticsTripSearch" type="search" autocomplete="off" placeholder="חיפוש לפי שם טיול, בעלים או מזהה" />
            </label>
            <label class="analytics-select-field"><span>מיון</span>
              <select id="analyticsTripSort">
                <option value="updated">עודכנו לאחרונה</option>
                <option value="start">תאריך התחלה</option>
                <option value="members">מספר משתתפים</option>
                <option value="name">שם הטיול</option>
              </select>
            </label>
          </div>
          <div class="analytics-filter-row" id="tripFilters" role="group" aria-label="סינון טיולים">
            ${filterChip("trip", "all", "layout-grid", "הכול", true)}
            ${filterChip("trip", "active", "radio", "פעילים עכשיו")}
            ${filterChip("trip", "upcoming", "calendar-clock", "עתידיים")}
            ${filterChip("trip", "past", "history", "הסתיימו")}
            ${filterChip("trip", "undated", "calendar-off", "ללא תאריך מלא")}
          </div>
          <div class="analytics-trip-table" id="analyticsTripTable"></div>
        </section>

        <section class="panel analytics-scope-panel">
          <div class="analytics-scope-icon"><i data-lucide="info"></i></div>
          <div><p class="eyebrow">Data scope</p><h2>מה המספרים כוללים — ומה לא</h2><div id="analyticsLimitations"></div></div>
        </section>
      </div>

      <dialog class="analytics-dialog" id="creatorDetailsDialog">
        <div class="analytics-dialog-shell">
          <div class="analytics-dialog-head">
            <div><p class="eyebrow">User activity</p><h2 id="creatorDialogTitle">פירוט משתמש</h2><p id="creatorDialogSubtitle"></p></div>
            <button class="icon-button" type="button" id="closeCreatorDialog" aria-label="סגירה"><i data-lucide="x"></i></button>
          </div>
          <div id="creatorDialogContent"></div>
        </div>
      </dialog>
    `
  });

  attachSharedUi({
    activeKey: "analytics",
    requireAuth: true,
    onAuthed: (user) => {
      state.user = user;
      bindAnalytics();
      loadAnalytics();
    }
  });
}

function filterChip(group, value, icon, label, active = false) {
  return `<button class="analytics-filter-chip ${active ? "is-active" : ""}" type="button"
    data-analytics-filter="${group}" data-filter-value="${value}" aria-pressed="${active}">
    <i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>
  </button>`;
}

function bindAnalytics() {
  $("reloadAnalyticsButton")?.addEventListener("click", loadAnalytics);
  $("retryAnalyticsButton")?.addEventListener("click", loadAnalytics);

  const renderUsersDebounced = debounce(renderUsers);
  $("analyticsUserSearch")?.addEventListener("input", (event) => {
    state.userQuery = event.target.value.trim().toLowerCase();
    renderUsersDebounced();
  });
  $("analyticsUserSort")?.addEventListener("change", (event) => {
    state.userSort = event.target.value;
    renderUsers();
  });

  const renderTripsDebounced = debounce(renderTrips);
  $("analyticsTripSearch")?.addEventListener("input", (event) => {
    state.tripQuery = event.target.value.trim().toLowerCase();
    renderTripsDebounced();
  });
  $("analyticsTripSort")?.addEventListener("change", (event) => {
    state.tripSort = event.target.value;
    renderTrips();
  });

  document.querySelectorAll("[data-analytics-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.analyticsFilter;
      const value = button.dataset.filterValue || "all";
      if (group === "creator") state.userFilter = value;
      if (group === "trip") state.tripFilter = value;
      document.querySelectorAll(`[data-analytics-filter="${group}"]`).forEach((item) => {
        const active = item.dataset.filterValue === value;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      group === "creator" ? renderUsers() : renderTrips();
    });
  });

  $("closeCreatorDialog")?.addEventListener("click", closeCreatorDialog);
  $("creatorDetailsDialog")?.addEventListener("click", (event) => {
    if (event.target === event.currentTarget) closeCreatorDialog();
  });
}

async function loadAnalytics() {
  if (!state.user) return;
  setLoading(true);
  try {
    state.data = await adminWorkerPost(state.user, "/admin/analytics", {});
    renderAnalytics();
    $("analyticsError")?.classList.add("is-hidden");
    $("analyticsContent")?.classList.remove("is-hidden");
  } catch (error) {
    $("analyticsContent")?.classList.add("is-hidden");
    $("analyticsError")?.classList.remove("is-hidden");
    if ($("analyticsErrorMessage")) {
      $("analyticsErrorMessage").textContent = friendlyError(error);
    }
  } finally {
    setLoading(false);
    refreshIcons();
  }
}

function setLoading(loading) {
  $("analyticsLoading")?.classList.toggle("is-hidden", !loading);
  const button = $("reloadAnalyticsButton");
  button?.classList.toggle("is-loading", loading);
  if (button) button.disabled = loading;
}

function renderAnalytics() {
  if (!state.data) return;
  const generatedAt = dateTime(state.data.generatedAt);
  $("analyticsUpdatedAt").innerHTML = `<i data-lucide="clock-3"></i> עודכן ${escapeHtml(generatedAt)}`;
  renderStats();
  renderRegistrationChart();
  renderTripDonut();
  renderContentBreakdown();
  renderUsers();
  renderTrips();
  renderLimitations();
}

function renderStats() {
  const s = state.data?.summary || {};
  const cards = [
    ["users", "users", "משתמשים", "פרופילים קיימים", "blue"],
    ["premiumUsers", "crown", "Premium", "ללא מגבלת AI", "gold"],
    ["cloudTrips", "route", "טיולי ענן", "קיימים כעת ב-Firestore", "violet"],
    ["activeTrips", "radio", "פעילים עכשיו", "לפי תאריכי הטיול", "green"],
    ["upcomingTrips", "calendar-clock", "טיולים עתידיים", "מתחילים אחרי היום", "teal"],
    ["pastTrips", "history", "טיולים שהסתיימו", "לפי תאריך סיום", "slate"],
    ["publicPlaces", "map-pinned", "מקומות ששותפו", "ב-TripInspo", "coral"],
    ["videos", "clapperboard", "סרטוני Trip Vibes", "כל סטטוסי העיבוד", "pink"]
  ];
  $("analyticsStats").innerHTML = cards.map(([key, icon, label, note, tone]) => `
    <article class="analytics-stat-card is-${tone}">
      <div class="analytics-stat-top"><span class="analytics-stat-icon"><i data-lucide="${icon}"></i></span><span class="analytics-stat-spark"></span></div>
      <strong>${formatNumber(s[key])}</strong><h3>${label}</h3><p>${note}</p>
    </article>
  `).join("");
}

function renderRegistrationChart() {
  const points = state.data?.trends?.registrations30Days || [];
  const max = Math.max(1, ...points.map((point) => Number(point.count) || 0));
  const total = points.reduce((sum, point) => sum + (Number(point.count) || 0), 0);
  $("registrationsTotal").textContent = `${formatNumber(total)} חדשים`;
  $("registrationChart").innerHTML = points.map((point, index) => {
    const count = Number(point.count) || 0;
    const height = count ? Math.max(9, Math.round((count / max) * 100)) : 3;
    const label = index % 5 === 0 || index === points.length - 1
      ? shortDate(point.date)
      : "";
    return `<div class="analytics-bar-column" title="${escapeHtml(shortDate(point.date))}: ${count}">
      <span class="analytics-bar-value">${count || ""}</span>
      <span class="analytics-bar-track"><span style="height:${height}%"></span></span>
      <small>${escapeHtml(label)}</small>
    </div>`;
  }).join("") || emptyState("bar-chart-3", "אין עדיין נתוני הרשמה");
}

function renderTripDonut() {
  const counts = state.data?.breakdowns?.tripStatuses || {};
  const segments = [
    ["active", "פעילים עכשיו", "#16a34a"],
    ["upcoming", "עתידיים", "#2563eb"],
    ["past", "הסתיימו", "#7c3aed"],
    ["undated", "ללא תאריך מלא", "#94a3b8"]
  ];
  const total = segments.reduce((sum, [key]) => sum + (Number(counts[key]) || 0), 0);
  let cursor = 0;
  const stops = segments.map(([key, , color]) => {
    const start = cursor;
    cursor += total ? ((Number(counts[key]) || 0) / total) * 360 : 0;
    return `${color} ${start}deg ${cursor}deg`;
  });
  $("tripStatusDonut").style.background = total
    ? `conic-gradient(${stops.join(",")})`
    : "conic-gradient(var(--surface-3) 0deg 360deg)";
  $("tripDonutTotal").textContent = formatNumber(total);
  $("tripStatusLegend").innerHTML = segments.map(([key, label, color]) => `
    <div><span class="analytics-legend-dot" style="--legend-color:${color}"></span><span>${label}</span><strong>${formatNumber(counts[key])}</strong></div>
  `).join("");
}

function renderContentBreakdown() {
  const s = state.data?.summary || {};
  const rows = [
    ["templates", "מסלולים מוכנים", s.templates, "#2563eb"],
    ["publicPlaces", "מקומות ציבוריים", s.publicPlaces, "#0d9488"],
    ["videos", "סרטוני Trip Vibes", s.videos, "#db2777"],
    ["openReports", "דיווחים פתוחים", s.openReports, "#e0573e"],
    ["invitations", "הזמנות לשיתוף", s.invitations, "#7c3aed"],
    ["deletedProfiles", "פרופילים שנמחקו", s.deletedProfiles, "#64748b"]
  ];
  const max = Math.max(1, ...rows.map(([, , value]) => Number(value) || 0));
  $("contentBreakdown").innerHTML = rows.map(([key, label, value, color]) => `
    <div class="analytics-breakdown-row" data-metric="${key}">
      <div><span>${label}</span><strong>${formatNumber(value)}</strong></div>
      <span class="analytics-progress"><span style="width:${Math.max(value ? 4 : 0, ((Number(value) || 0) / max) * 100)}%;--bar-color:${color}"></span></span>
    </div>
  `).join("");
}

function renderUsers() {
  if (!state.data) return;
  const users = filteredUsers();
  $("visibleCreatorsCount").textContent = `${formatNumber(users.length)} משתמשים`;
  $("analyticsUserTable").innerHTML = users.map(userRow).join("") || emptyState(
    "user-search",
    "לא נמצאו משתמשים שמתאימים לחיפוש או לסינון."
  );
  $("analyticsUserTable").querySelectorAll("[data-creator-details]").forEach((button) => {
    button.addEventListener("click", () => openCreatorDialog(button.dataset.creatorDetails));
  });
  refreshIcons();
}

function filteredUsers() {
  const users = [...(state.data?.users || [])].filter((user) => {
    const search = [user.displayName, user.username, user.uid, user.status].join(" ").toLowerCase();
    if (state.userQuery && !search.includes(state.userQuery)) return false;
    if (state.userFilter === "creators") return user.totalCreated > 0;
    if (state.userFilter === "trips") return user.cloudTrips > 0;
    if (state.userFilter === "premium") return user.isPremium === true;
    if (state.userFilter === "blocked") return user.status === "blocked" || user.status === "deleted";
    if (state.userFilter === "empty") return user.totalCreated === 0;
    return true;
  });
  return users.sort((a, b) => {
    if (state.userSort === "newest") return dateMs(b.createdAt) - dateMs(a.createdAt);
    if (state.userSort === "oldest") return dateMs(a.createdAt) - dateMs(b.createdAt);
    if (state.userSort === "trips") return b.cloudTrips - a.cloudTrips || b.totalCreated - a.totalCreated;
    if (state.userSort === "places") return b.publicPlaces - a.publicPlaces || b.totalCreated - a.totalCreated;
    if (state.userSort === "videos") return b.videos - a.videos || b.totalCreated - a.totalCreated;
    if (state.userSort === "name") return String(a.displayName).localeCompare(String(b.displayName), "he");
    return b.totalCreated - a.totalCreated || dateMs(b.createdAt) - dateMs(a.createdAt);
  });
}

function userRow(user) {
  const status = user.status === "blocked" ? "חסום" : user.status === "deleted" ? "נמחק" : user.hasProfile ? "פעיל" : "ללא פרופיל";
  const statusTone = user.status === "blocked" || user.status === "deleted" ? "danger" : user.hasProfile ? "success" : "muted";
  return `<article class="analytics-user-row ${user.isPremium ? "is-premium" : ""}">
    <div class="analytics-user-identity">
      <span class="analytics-avatar">${escapeHtml(initials(user.displayName || user.username))}${user.isPremium ? `<i data-lucide="crown"></i>` : ""}</span>
      <div><div class="analytics-user-name"><strong>${escapeHtml(user.displayName || user.username || "משתמש")}</strong>${user.isPremium ? `<span class="analytics-premium-badge"><i data-lucide="crown"></i> Premium</span>` : ""}</div>
      <span>@${escapeHtml(user.username || "לא-ידוע")} · נרשם ${escapeHtml(dateOnly(user.createdAt))}</span></div>
    </div>
    <div class="analytics-creation-metrics">
      ${miniMetric("route", user.cloudTrips, "טיולים")}
      ${miniMetric("map-pin", user.publicPlaces, "מקומות")}
      ${miniMetric("clapperboard", user.videos, "סרטונים")}
    </div>
    <div class="analytics-user-end">
      <span class="analytics-status-badge is-${statusTone}"><span></span>${status}</span>
      <button class="ghost-action analytics-details-button" type="button" data-creator-details="${escapeAttribute(user.uid || `username:${user.username}`)}">
        <span>מה המשתמש יצר</span><i data-lucide="chevron-left"></i>
      </button>
    </div>
  </article>`;
}

function miniMetric(icon, value, label) {
  return `<div><i data-lucide="${icon}"></i><span><strong>${formatNumber(value)}</strong><small>${label}</small></span></div>`;
}

function renderTrips() {
  if (!state.data) return;
  const trips = filteredTrips();
  $("visibleTripsCount").textContent = `${formatNumber(trips.length)} טיולים`;
  $("analyticsTripTable").innerHTML = trips.map(tripRow).join("") || emptyState(
    "map-search",
    "לא נמצאו טיולי ענן שמתאימים לחיפוש או לסינון."
  );
  refreshIcons();
}

function filteredTrips() {
  const trips = [...(state.data?.trips || [])].filter((trip) => {
    const search = [trip.name, trip.id, trip.ownerUsername, trip.ownerUid].join(" ").toLowerCase();
    if (state.tripQuery && !search.includes(state.tripQuery)) return false;
    return state.tripFilter === "all" || trip.status === state.tripFilter;
  });
  return trips.sort((a, b) => {
    if (state.tripSort === "start") return dateMs(a.startDate) - dateMs(b.startDate);
    if (state.tripSort === "members") return b.memberCount - a.memberCount;
    if (state.tripSort === "name") return String(a.name).localeCompare(String(b.name), "he");
    return dateMs(b.lastCloudUpdate) - dateMs(a.lastCloudUpdate);
  });
}

function tripRow(trip) {
  const status = tripStatusMeta(trip.status);
  const owner = trip.ownerUsername ? `@${trip.ownerUsername}` : shortUid(trip.ownerUid);
  const source = (trip.sources || []).includes("shared") ? "שיתוף בענן" : "סנכרון מסלול";
  return `<article class="analytics-trip-row">
    <span class="analytics-trip-icon is-${status.tone}"><i data-lucide="${status.icon}"></i></span>
    <div class="analytics-trip-main"><strong>${escapeHtml(trip.name || "טיול ללא שם")}</strong><span>${escapeHtml(owner || "בעלים לא ידוע")} · ${escapeHtml(source)}</span></div>
    <div class="analytics-trip-dates"><small>תאריכים</small><strong>${escapeHtml(tripDateRange(trip))}</strong></div>
    <div class="analytics-trip-members"><i data-lucide="users"></i><span>${formatNumber(trip.memberCount)} משתתפים</span></div>
    <span class="analytics-trip-status is-${status.tone}"><span></span>${status.label}</span>
    <div class="analytics-trip-updated"><small>עדכון ענן אחרון</small><span>${escapeHtml(dateTime(trip.lastCloudUpdate))}</span></div>
  </article>`;
}

function renderLimitations() {
  const scope = state.data?.scope || {};
  const limitations = state.data?.limitations || [];
  const truncated = scope.truncatedCollections || [];
  $("analyticsLimitations").innerHTML = `
    <ul>${limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    ${truncated.length ? `<p class="analytics-truncation"><i data-lucide="triangle-alert"></i> חלק מהאוספים הגיעו למגבלת הסריקה: ${escapeHtml(truncated.join(", "))}.</p>` : ""}
    <p class="analytics-scope-foot"><i data-lucide="lock-keyhole"></i> הפירוט אינו כולל הערות, מסמכים, הזמנות, כתובות, תיאורים או קישורים פרטיים.</p>
  `;
}

function openCreatorDialog(identifier) {
  const user = (state.data?.users || []).find((item) =>
    identifier.startsWith("username:")
      ? item.username === identifier.slice(9)
      : item.uid === identifier
  );
  if (!user) return;
  const matches = (item) => (user.uid && item.ownerUid === user.uid)
    || (user.username && item.ownerUsername === user.username);
  const trips = (state.data?.trips || []).filter(matches);
  const places = (state.data?.places || []).filter(matches);
  const videos = (state.data?.videos || []).filter(matches);
  $("creatorDialogTitle").textContent = user.displayName || `@${user.username}`;
  $("creatorDialogSubtitle").textContent = `@${user.username || "לא-ידוע"} · ${formatNumber(user.totalCreated)} יצירות ענן`;
  $("creatorDialogContent").innerHTML = `
    <div class="analytics-dialog-summary">
      ${miniMetric("route", trips.length, "טיולים")}
      ${miniMetric("map-pin", places.length, "מקומות")}
      ${miniMetric("clapperboard", videos.length, "סרטונים")}
    </div>
    <div class="analytics-creation-list">
      ${creationGroup("טיולי ענן", "route", trips.map((trip) => ({
        title: trip.name,
        meta: `${tripStatusMeta(trip.status).label} · ${tripDateRange(trip)}`,
        date: trip.lastCloudUpdate
      })))}
      ${creationGroup("מקומות ששותפו", "map-pin", places.map((place) => ({
        title: place.name,
        meta: [place.destination, place.type, placeModerationLabel(place.moderationStatus)].filter(Boolean).join(" · "),
        date: place.createdAt
      })))}
      ${creationGroup("סרטוני Trip Vibes", "clapperboard", videos.map((video) => ({
        title: video.destination ? `וידאו · ${video.destination}` : "וידאו Trip Vibes",
        meta: `${videoStatusLabel(video.status)}${video.isPrivate ? " · פרטי" : ""} · ${formatNumber(video.viewCount)} צפיות`,
        date: video.createdAt
      })))}
    </div>
    <p class="analytics-dialog-privacy"><i data-lucide="shield-check"></i> מוצג רק מידע ניהולי מצומצם. תוכן פרטי אינו נטען לעמוד.</p>
  `;
  const dialog = $("creatorDetailsDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  refreshIcons();
}

function creationGroup(title, icon, items) {
  const sorted = [...items].sort((a, b) => dateMs(b.date) - dateMs(a.date));
  return `<section class="analytics-creation-group">
    <div class="analytics-creation-heading"><span><i data-lucide="${icon}"></i>${title}</span><b>${formatNumber(sorted.length)}</b></div>
    <div>${sorted.map((item) => `<article><span class="analytics-creation-dot"></span><div><strong>${escapeHtml(item.title || "ללא שם")}</strong><p>${escapeHtml(item.meta || "אין פרטים נוספים")}</p></div><time>${escapeHtml(dateOnly(item.date))}</time></article>`).join("") || `<p class="analytics-no-creations">אין יצירות מהסוג הזה בנתוני הענן.</p>`}</div>
  </section>`;
}

function closeCreatorDialog() {
  const dialog = $("creatorDetailsDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

function tripStatusMeta(status) {
  if (status === "active") return { label: "פעיל עכשיו", tone: "active", icon: "radio" };
  if (status === "upcoming") return { label: "עתידי", tone: "upcoming", icon: "calendar-clock" };
  if (status === "past") return { label: "הסתיים", tone: "past", icon: "history" };
  return { label: "ללא תאריך מלא", tone: "undated", icon: "calendar-off" };
}

function placeModerationLabel(status) {
  if (status === "approved") return "מאושר";
  if (status === "rejected") return "נדחה";
  return "ממתין לאישור";
}

function videoStatusLabel(status) {
  if (status === "ready") return "מוכן";
  if (status === "failed") return "נכשל";
  return "בעיבוד";
}

function tripDateRange(trip) {
  if (!trip.startDate && !trip.endDate) return "לא הוגדר";
  if (trip.startDate && trip.endDate) return `${dateOnly(trip.startDate)} – ${dateOnly(trip.endDate)}`;
  return dateOnly(trip.startDate || trip.endDate);
}

function emptyState(icon, message) {
  return `<div class="analytics-empty"><i data-lucide="${icon}"></i><p>${escapeHtml(message)}</p></div>`;
}

function formatNumber(value) {
  return numberFormatter.format(Number(value) || 0);
}

function dateMs(value) {
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  const ms = dateMs(value);
  return ms ? new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" }).format(new Date(ms)) : "לא ידוע";
}

function dateTime(value) {
  const ms = dateMs(value);
  return ms ? new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms)) : "לא ידוע";
}

function shortDate(value) {
  const ms = dateMs(value);
  return ms ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric" }).format(new Date(ms)) : "";
}

function shortUid(value) {
  const uid = String(value || "");
  return uid.length > 12 ? `${uid.slice(0, 6)}…${uid.slice(-4)}` : uid;
}

function initials(value) {
  const words = String(value || "?").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0][0] || ""}${words[1][0] || ""}`.toUpperCase();
  return (words[0] || "?").slice(0, 2).toUpperCase();
}

function friendlyError(error) {
  const message = String(error?.message || error || "שגיאה לא ידועה");
  if (message.includes("403")) return "הגישה נדחתה. ודא שנכנסת עם חשבון המנהל המאומת וש-App Check פעיל.";
  if (message.includes("401")) return "פג תוקף ההתחברות. התחבר מחדש ונסה שוב.";
  if (message.includes("404")) return "ה-Worker הפעיל עדיין לא כולל את נתיב האנליטיקות החדש.";
  return "אירעה שגיאה בקריאת נתוני Firestore. לא בוצע שום שינוי בנתונים.";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", "\"": "&quot;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}
