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
  userSort: "creations"
};

const $ = (id) => document.getElementById(id);
const numberFormatter = new Intl.NumberFormat("he-IL");

renderPage();

function renderPage() {
  app.innerHTML = createAdminShell({
    activeKey: "analytics",
    title: "מרכז האנליטיקות",
    subtitle: "נתוני Firestore אמיתיים יחד עם פעילות מצטברת ובטוחה שמגיעה מהאפליקציה.",
    actions: `
      <button class="primary-action" type="button" id="reloadAnalyticsButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן נתונים</span>
      </button>
    `,
    content: `
      <section class="analytics-hero panel">
        <div class="analytics-hero-copy">
          <span class="analytics-live-badge"><span></span> Firestore + פעילות אפליקציה</span>
          <h2>מה קורה ב-TripEase, במסך אחד.</h2>
          <p>טיולים, פעילות אחרונה, משתמשים שלא חזרו, Premium ותוכן ענן — ללא שמירת תוכן פרטי של הטיול.</p>
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
              <div><p class="eyebrow">Trips</p><h2 id="tripStatusTitle">מצב הטיולים</h2></div>
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
            <div><p class="eyebrow">Users</p><h2>פעילות מספרית לפי משתמש</h2><p>ספירות מצטברות בלבד — ללא שמות טיולים, שמות מקומות או תוכן פרטי.</p></div>
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
                <option value="activity">פעילות אחרונה</option>
                <option value="name">לפי שם</option>
              </select>
            </label>
          </div>
          <div class="analytics-filter-row" id="creatorFilters" role="group" aria-label="סינון משתמשים">
            ${filterChip("creator", "all", "users", "הכול", true)}
            ${filterChip("creator", "creators", "sparkles", "יצרו תוכן")}
            ${filterChip("creator", "trips", "route", "עם טיולים")}
            ${filterChip("creator", "premium", "crown", "Premium")}
            ${filterChip("creator", "recent", "activity", "פעילים השבוע")}
            ${filterChip("creator", "inactive", "user-round-x", "לא נכנסו מעל שבוע")}
            ${filterChip("creator", "untracked", "circle-help", "טרם דיווחו")}
            ${filterChip("creator", "blocked", "ban", "חסומים/נמחקו")}
            ${filterChip("creator", "empty", "circle-minus", "ללא יצירות ענן")}
          </div>
          <div class="analytics-user-table" id="analyticsUserTable"></div>
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

  document.querySelectorAll("[data-analytics-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.dataset.analyticsFilter;
      const value = button.dataset.filterValue || "all";
      if (group === "creator") state.userFilter = value;
      document.querySelectorAll(`[data-analytics-filter="${group}"]`).forEach((item) => {
        const active = item.dataset.filterValue === value;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderUsers();
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
  renderLimitations();
}

function renderStats() {
  const s = state.data?.summary || {};
  const hasSnapshots = Number(state.data?.scope?.operationalSnapshots) > 0;
  const cards = [
    ["users", "users", "משתמשים", "פרופילים קיימים", "blue"],
    ["premiumUsers", "crown", "Premium", "ללא מגבלת AI", "gold"],
    ["recentlyActiveUsers", "activity", "פעילים השבוע", "פתחו את האפליקציה ב-7 ימים", "green"],
    ["inactiveUsers7Days", "user-round-x", "לא חזרו מעל שבוע", "מבין המשתמשים שכבר דיווחו", "coral"],
    ["ownedTrips", "route", "טיולים בבעלות", hasSnapshots ? "מה-snapshot האחרון של כל משתמש" : "זמנית: מטיולי הענן הקיימים", "violet"],
    ["activeTrips", "radio", "טיולים פעילים", hasSnapshots ? "כולל טיולים מקומיים שדווחו" : "זמנית: לפי טיולי הענן", "green"],
    ["upcomingTrips", "calendar-clock", "טיולים עתידיים", "מתחילים אחרי היום", "teal"],
    ["pastTrips", "history", "טיולים שהסתיימו", "לפי תאריך סיום", "slate"],
    ["deletedTrips", "trash-2", "טיולים שנמחקו", hasSnapshots ? "נספרים מרגע הפעלת האיסוף" : "יתחיל להיספר לאחר עדכון האפליקציה", "coral"],
    ["savedTripPlaces", "map-pin", "מקומות שמורים בטיולים", hasSnapshots ? "סך הכול בטיולים שבבעלות המשתמשים" : "יתקבל לאחר עדכון האפליקציה", "teal"],
    ["addedTripPlaces", "map-pin-plus", "מקומות שנוספו", hasSnapshots ? "נספרים מרגע הפעלת האיסוף" : "יתחיל להיספר לאחר עדכון האפליקציה", "green"],
    ["appOpens", "smartphone", "פתיחות אפליקציה", hasSnapshots ? "מונה מצטבר מאז הפעלת האיסוף" : "יתחיל להיספר לאחר עדכון האפליקציה", "violet"],
    ["cloudTrips", "cloud", "טיולי ענן", "shared_trips ו-trips ללא כפילויות", "blue"],
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
  const hasSnapshots = Number(state.data?.scope?.operationalSnapshots) > 0;
  const counts = hasSnapshots
    ? state.data?.breakdowns?.operationalTripStatuses || {}
    : state.data?.breakdowns?.tripStatuses || {};
  $("tripStatusTitle").textContent = hasSnapshots
    ? "מצב הטיולים שדווחו מהאפליקציה"
    : "מצב טיולי הענן";
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
    ["trackedUsers", "משתמשים עם snapshot פעילות", s.trackedUsers, "#16a34a"],
    ["activityNotReportedUsers", "משתמשים שטרם דיווחו", s.activityNotReportedUsers, "#94a3b8"],
    ["appOpens", "פתיחות אפליקציה מצטברות", s.appOpens, "#7c3aed"],
    ["savedTripPlaces", "מקומות שמורים בטיולים", s.savedTripPlaces, "#0d9488"],
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
  const activityCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const users = [...(state.data?.users || [])].filter((user) => {
    const search = [user.displayName, user.username, user.uid, user.status].join(" ").toLowerCase();
    if (state.userQuery && !search.includes(state.userQuery)) return false;
    if (state.userFilter === "creators") return user.totalCreated > 0;
    if (state.userFilter === "trips") return user.ownedTrips > 0 || user.cloudTrips > 0;
    if (state.userFilter === "premium") return user.isPremium === true;
    if (state.userFilter === "recent") return dateMs(user.lastActiveAt) >= activityCutoff;
    if (state.userFilter === "inactive") {
      const lastActive = dateMs(user.lastActiveAt);
      return lastActive > 0 && lastActive < activityCutoff;
    }
    if (state.userFilter === "untracked") return !user.lastActiveAt;
    if (state.userFilter === "blocked") return user.status === "blocked" || user.status === "deleted";
    if (state.userFilter === "empty") return user.totalCreated === 0;
    return true;
  });
  return users.sort((a, b) => {
    if (state.userSort === "newest") return dateMs(b.createdAt) - dateMs(a.createdAt);
    if (state.userSort === "oldest") return dateMs(a.createdAt) - dateMs(b.createdAt);
    if (state.userSort === "trips") return b.cloudTrips - a.cloudTrips || b.totalCreated - a.totalCreated;
    if (state.userSort === "places") return b.savedTripPlaces - a.savedTripPlaces || b.totalCreated - a.totalCreated;
    if (state.userSort === "videos") return b.videos - a.videos || b.totalCreated - a.totalCreated;
    if (state.userSort === "activity") return dateMs(b.lastActiveAt) - dateMs(a.lastActiveAt);
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
      <span>@${escapeHtml(user.username || "לא-ידוע")} · נרשם ${escapeHtml(dateOnly(user.createdAt))} · ${escapeHtml(activityLabel(user))}</span></div>
    </div>
    <div class="analytics-creation-metrics">
      ${miniMetric("route", user.ownedTrips, "טיולים בבעלות")}
      ${miniMetric("map-pin", user.savedTripPlaces, "מקומות שמורים")}
      ${miniMetric("smartphone", user.appOpens, "פתיחות")}
    </div>
    <div class="analytics-user-end">
      <span class="analytics-status-badge is-${statusTone}"><span></span>${status}</span>
      <button class="ghost-action analytics-details-button" type="button" data-creator-details="${escapeAttribute(user.uid || `username:${user.username}`)}">
        <span>פירוט מספרי</span><i data-lucide="chevron-left"></i>
      </button>
    </div>
  </article>`;
}

function miniMetric(icon, value, label) {
  return `<div><i data-lucide="${icon}"></i><span><strong>${formatNumber(value)}</strong><small>${label}</small></span></div>`;
}

function activityLabel(user) {
  if (!user.lastActiveAt) return "טרם התקבל דיווח פעילות";
  const platform = user.appPlatform ? ` · ${String(user.appPlatform).toUpperCase()}` : "";
  return `פעילות אחרונה ${dateTime(user.lastActiveAt)}${platform}`;
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
  $("creatorDialogTitle").textContent = user.displayName || `@${user.username}`;
  $("creatorDialogSubtitle").textContent = `@${user.username || "לא-ידוע"} · ${activityLabel(user)}`;
  $("creatorDialogContent").innerHTML = `
    <div class="analytics-dialog-summary">
      ${miniMetric("luggage", user.ownedTrips, "טיולים בבעלות")}
      ${miniMetric("radio", user.activeTrips, "פעילים עכשיו")}
      ${miniMetric("calendar-clock", user.upcomingTrips, "עתידיים")}
      ${miniMetric("history", user.pastTrips, "הסתיימו")}
      ${miniMetric("trash-2", user.deletedTrips, "נמחקו")}
      ${miniMetric("map-pin", user.savedTripPlaces, "מקומות שמורים")}
      ${miniMetric("map-pin-plus", user.addedTripPlaces, "מקומות שנוספו")}
      ${miniMetric("smartphone", user.appOpens, "פתיחות אפליקציה")}
    </div>
    <p class="analytics-dialog-privacy"><i data-lucide="shield-check"></i> מוצגות ספירות מצטברות בלבד. שמות טיולים, שמות מקומות, מזהי טיולים ותוכן פרטי אינם נטענים לעמוד.</p>
  `;
  const dialog = $("creatorDetailsDialog");
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
  refreshIcons();
}

function closeCreatorDialog() {
  const dialog = $("creatorDetailsDialog");
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
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
