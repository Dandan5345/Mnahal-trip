import { createAdminShell, attachSharedUi, resolveAdminView } from "./shared.js";

const app = document.getElementById("app");

const REPORT_VIEWS = {
  incorrect: {
    title: "דיווחי מידע שגוי",
    subtitle: "דיווחים על שעות, כתובת, תיאור, כשרות, סגנון מקום ופרטי כרטיסייה.",
    kind: "incorrect_info",
    empty: "אין כרגע דיווחי מידע שגוי פתוחים."
  },
  spam: {
    title: "דיווחי תוכן לא ראוי/ספאם",
    subtitle: "דיווחים על תוכן פוגעני, ספאם, קישורים חשודים, תמונות וקרדיטים.",
    kind: "inappropriate_spam",
    empty: "אין כרגע דיווחי תוכן לא ראוי או ספאם פתוחים."
  },
  resolved: {
    title: "דיווחים שטופלו",
    subtitle: "כל הדיווחים שסומנו כטופלו, כולל תגובת האדמין והמצב לאחר הטיפול.",
    kind: null,
    empty: "עדיין אין דיווחים שטופלו."
  }
};

const FIELD_LABELS = {
  name: "שם המקום",
  destination: "יעד",
  type: "סוג מקום",
  shortDescription: "תיאור קצר",
  description: "תיאור ארוך",
  location: "כתובת",
  hours: "שעות",
  website: "אתר",
  reservationLabel: "הזמנה",
  isKosher: "כשרות",
  foodType: "סוג אוכל",
  rating: "דירוג",
  coverImageUrl: "תמונה",
  coverPhotographerName: "קרדיט תמונה"
};

const state = {
  firebase: null,
  user: null,
  view: normalizeReportsView(resolveAdminView("incorrect")),
  reports: [],
  selectedReportId: null
};

const $ = (id) => document.getElementById(id);

renderPage();

function normalizeReportsView(view) {
  return Object.prototype.hasOwnProperty.call(REPORT_VIEWS, view) ? view : "incorrect";
}

function renderPage() {
  const config = REPORT_VIEWS[state.view];
  app.innerHTML = createAdminShell({
    activeKey: "reports",
    activeSubKey: state.view,
    title: config.title,
    subtitle: config.subtitle,
    actions: `
      <button class="primary-action" type="button" id="reloadReportsButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן דיווחים</span>
      </button>
    `,
    content: `
      <section class="reports-dashboard">
        <article class="panel reports-summary-panel">
          <div class="panel-heading">
            <span class="panel-icon amber"><i data-lucide="clipboard-list" aria-hidden="true"></i></span>
            <div>
              <h2>מרכז טיפול בדיווחים</h2>
              <p>פתיחה, מעבר לכרטיסייה, עריכה בדף מקומות ושליחת תגובה למשתמש.</p>
            </div>
          </div>
          <div class="report-stat-row">
            <span class="report-stat"><b id="incorrectCount">0</b><small>מידע שגוי פתוחים</small></span>
            <span class="report-stat"><b id="spamCount">0</b><small>ספאם פתוחים</small></span>
            <span class="report-stat"><b id="resolvedCount">0</b><small>טופלו</small></span>
          </div>
          <p class="status-line" id="reportsStatus"></p>
        </article>
      </section>

      <section class="result-section">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Reports Queue</p>
            <h2>${escapeHtml(config.title)}</h2>
          </div>
          <span class="count-pill" id="visibleReportsCount">0 דיווחים</span>
        </div>
        <div class="reports-table" id="reportsTable"></div>
      </section>

      <dialog class="image-dialog report-dialog" id="reportDialog">
        <form method="dialog" class="image-dialog-shell report-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow" id="reportDialogEyebrow">דיווח</p>
              <h2 id="reportDialogTitle">פרטי דיווח</h2>
            </div>
            <button class="icon-button" type="button" id="closeReportDialogButton" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div id="reportDialogBody"></div>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="openPlaceButton">
              <i data-lucide="external-link"></i>
              <span>מעבר לכרטיסייה בדף מקומות</span>
            </button>
            <button class="primary-action" type="button" id="respondReportButton">
              <i data-lucide="send"></i>
              <span>תגובה לדיווח</span>
            </button>
            <button class="ghost-action danger-lite" type="button" id="deleteResolvedReportButton" hidden>
              <i data-lucide="trash-2"></i>
              <span>מחק לצמיתות</span>
            </button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog response-dialog" id="responseDialog">
        <form method="dialog" class="image-dialog-shell response-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">סגירת טיפול</p>
              <h2>תגובה לדיווח</h2>
            </div>
            <button class="icon-button" type="button" id="closeResponseDialogButton" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="edit-form-grid">
            <label class="edit-field"><span>כותרת</span><input id="responseTitleInput" type="text" placeholder="לדוגמה: המקום נערך בחזרה" /></label>
            <label class="edit-field wide-field"><span>פירוט נוסף</span><textarea id="responseDetailsInput" rows="6" placeholder="תודה על המידע, ערכנו את הכרטיסייה ועדכנו את הפרטים."></textarea></label>
          </div>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="cancelResponseButton">ביטול</button>
            <button class="primary-action" value="save" type="submit"><i data-lucide="check"></i><span>שלח וסמן כטופל</span></button>
          </div>
        </form>
      </dialog>
    `
  });

  attachSharedUi({
    activeKey: "reports",
    requireAuth: true,
    onAuthed: (user, firebase) => {
      state.user = user;
      state.firebase = firebase;
      bindReports();
      loadReports();
    }
  });
}

function bindReports() {
  $("reloadReportsButton")?.addEventListener("click", loadReports);
  $("closeReportDialogButton")?.addEventListener("click", () => $("reportDialog")?.close());
  $("openPlaceButton")?.addEventListener("click", openSelectedPlace);
  $("respondReportButton")?.addEventListener("click", openResponseDialog);
  $("closeResponseDialogButton")?.addEventListener("click", () => $("responseDialog")?.close());
  $("cancelResponseButton")?.addEventListener("click", () => $("responseDialog")?.close());
  $("deleteResolvedReportButton")?.addEventListener("click", deleteSelectedResolvedReport);
  $("responseDialog")?.querySelector("form")?.addEventListener("submit", resolveSelectedReport);
}

async function loadReports() {
  if (!state.firebase || !state.user) return;
  setStatus("reportsStatus", "טוען דיווחים מ-Firestore...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "place_reports"));
    state.reports = snap.docs.map(docToReport).sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    renderReports();
    setStatus("reportsStatus", `נטענו ${state.reports.length} דיווחים.`);
  } catch (error) {
    setStatus("reportsStatus", `טעינת הדיווחים נכשלה: ${error.message}`, true);
  }
}

function renderReports() {
  const visible = filteredReports();
  $("incorrectCount").textContent = state.reports.filter((report) => report.kind === "incorrect_info" && report.status !== "resolved").length;
  $("spamCount").textContent = state.reports.filter((report) => report.kind === "inappropriate_spam" && report.status !== "resolved").length;
  $("resolvedCount").textContent = state.reports.filter((report) => report.status === "resolved").length;
  $("visibleReportsCount").textContent = `${visible.length} דיווחים`;

  const container = $("reportsTable");
  container.innerHTML = visible.map(renderReportRow).join("") || emptyHtml(REPORT_VIEWS[state.view].empty);
  container.querySelectorAll("[data-report-id]").forEach((row) => {
    row.addEventListener("click", () => openReportDialog(row.dataset.reportId));
  });
  refreshIcons();
}

function filteredReports() {
  const config = REPORT_VIEWS[state.view];
  if (state.view === "resolved") return state.reports.filter((report) => report.status === "resolved");
  return state.reports.filter((report) => report.kind === config.kind && report.status !== "resolved");
}

function renderReportRow(report) {
  const place = report.placeSnapshot || {};
  const selections = report.kind === "incorrect_info" ? report.selectedFields : report.issueTypes;
  return `<article class="report-row" data-report-id="${escapeAttr(report.id)}">
    <div class="report-row-main">
      <span class="report-number ${report.kind === "incorrect_info" ? "is-a" : "is-b"}">${escapeHtml(report.reportNumber)}</span>
      <div>
        <h3>${escapeHtml(report.placeName || place.name || "מקום ללא שם")}</h3>
        <p>${escapeHtml(compact(report.details || "אין פירוט", 150))}</p>
      </div>
    </div>
    <div class="report-row-meta">
      <span>${escapeHtml(kindLabel(report.kind))}</span>
      <span>${escapeHtml(statusLabel(report.status))}</span>
      <span>${escapeHtml(formatDate(report.createdAt))}</span>
      <span>${escapeHtml((selections || []).slice(0, 2).join(", ") || "ללא סיווג")}</span>
    </div>
  </article>`;
}

function openReportDialog(reportId) {
  const report = state.reports.find((item) => item.id === reportId);
  if (!report) return;
  state.selectedReportId = reportId;
  $("reportDialogEyebrow").textContent = `${kindLabel(report.kind)} · ${statusLabel(report.status)}`;
  $("reportDialogTitle").textContent = `${report.reportNumber} · ${report.placeName || "מקום"}`;
  $("reportDialogBody").innerHTML = renderReportDetails(report);
  $("respondReportButton").disabled = report.status === "resolved";
  $("deleteResolvedReportButton").hidden = report.status !== "resolved";
  $("reportDialog").showModal();
  refreshIcons();
}

function renderReportDetails(report) {
  const place = report.placeSnapshot || {};
  const after = report.placeSnapshotAfter || {};
  const selections = report.kind === "incorrect_info" ? report.selectedFields : report.issueTypes;
  return `<div class="report-detail-grid">
    <section class="report-detail-card">
      <h3>תוכן הפנייה</h3>
      <div class="detail-list">
        <div><b>מספר דיווח</b><span>${escapeHtml(report.reportNumber)}</span></div>
        <div><b>מזהה כרטיסייה</b><span>${escapeHtml(report.placeId)}</span></div>
        <div><b>מה דווח</b><span>${escapeHtml((selections || []).join(", ") || "לא נבחר")}</span></div>
        <div><b>פירוט מלא</b><span>${escapeHtml(report.details)}</span></div>
        <div><b>מידע נוסף</b><span>${escapeHtml(report.updatedInfo || "")}</span></div>
        <div><b>מדווח</b><span>${escapeHtml([report.reportedByName, report.reportedByEmail, report.reportedByUid].filter(Boolean).join(" · "))}</span></div>
      </div>
    </section>
    <section class="report-detail-card">
      <h3>הכרטיסייה שדווחה</h3>
      <div class="reported-place-preview">
        ${place.coverImageUrl ? `<img src="${escapeAttr(place.coverImageUrl)}" alt="" />` : `<span>${escapeHtml(place.coverEmoji || "📍")}</span>`}
        <div>
          <b>${escapeHtml(place.name || report.placeName || "")}</b>
          <p>${escapeHtml(place.location || "")}</p>
          <p>${escapeHtml(place.shortDescription || place.description || "")}</p>
        </div>
      </div>
      <div class="detail-list compact-detail-list">
        ${placeDetails(place).map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value ?? "")}</span></div>`).join("")}
      </div>
    </section>
    ${report.status === "resolved" ? `<section class="report-detail-card wide-report-card">
      <h3>מה השתנה ומה נשלח בחזרה</h3>
      ${renderChanges(place, after)}
      <div class="admin-response-box">
        <b>${escapeHtml(report.adminResponse?.title || "תגובה ללא כותרת")}</b>
        <p>${escapeHtml(report.adminResponse?.details || "")}</p>
      </div>
    </section>` : ""}
  </div>`;
}

function placeDetails(place) {
  return [
    ["סוג", place.type],
    ["שעות", place.hours],
    ["אתר", place.website],
    ["כשרות", place.isKosher ? "כן" : "לא"],
    ["סוג אוכל", place.foodType],
    ["דירוג", place.rating]
  ];
}

function renderChanges(before, after) {
  if (!after || !Object.keys(after).length) {
    return `<p class="muted-copy">לא נשמר snapshot אחרי הטיפול. ניתן לראות את תגובת האדמין.</p>`;
  }
  const changes = Object.keys(FIELD_LABELS)
    .filter((key) => text(before?.[key]) !== text(after?.[key]))
    .map((key) => `<div><b>${escapeHtml(FIELD_LABELS[key])}</b><span>${escapeHtml(text(before?.[key]) || "ריק")} → ${escapeHtml(text(after?.[key]) || "ריק")}</span></div>`);
  return `<div class="detail-list changes-list">${changes.join("") || `<div><b>שינוי</b><span>לא זוהה שינוי בשדות המרכזיים.</span></div>`}</div>`;
}

function openSelectedPlace() {
  const report = selectedReport();
  if (!report?.placeId) return;
  window.open(`./places.html?view=current&placeId=${encodeURIComponent(report.placeId)}`, "_blank", "noopener,noreferrer");
}

function openResponseDialog() {
  const report = selectedReport();
  if (!report) return;
  $("responseTitleInput").value = report.kind === "incorrect_info" ? "המקום נערך בחזרה" : "הדיווח נבדק וטופל";
  $("responseDetailsInput").value = report.kind === "incorrect_info" ? "תודה על המידע. בדקנו את הכרטיסייה ועדכנו את הפרטים הרלוונטיים." : "תודה על הדיווח. בדקנו את התוכן ונקטנו את הפעולה המתאימה.";
  $("responseDialog").showModal();
}

async function resolveSelectedReport(event) {
  event.preventDefault();
  const report = selectedReport();
  if (!report) return;
  const title = $("responseTitleInput").value.trim();
  const details = $("responseDetailsInput").value.trim();
  if (!title || !details) {
    setStatus("reportsStatus", "חובה למלא כותרת ופירוט לתגובה.", true);
    return;
  }
  try {
    const fs = state.firebase.firestore;
    let placeSnapshotAfter = null;
    if (report.placeId) {
      const placeDoc = await fs.getDoc(fs.doc(state.firebase.db, "public_places", report.placeId));
      if (placeDoc.exists()) placeSnapshotAfter = { id: placeDoc.id, ...placeDoc.data() };
    }
    await fs.setDoc(fs.doc(state.firebase.db, "place_reports", report.id), {
      status: "resolved",
      resolvedAt: fs.serverTimestamp(),
      resolvedByUid: state.user.uid,
      updatedAt: fs.serverTimestamp(),
      placeSnapshotAfter,
      adminResponse: {
        title,
        details,
        sentAt: fs.serverTimestamp(),
        byUid: state.user.uid,
        byEmail: state.user.email || null
      }
    }, { merge: true });
    $("responseDialog").close();
    $("reportDialog").close();
    await loadReports();
    setStatus("reportsStatus", `${report.reportNumber} סומן כטופל ונשלחה תגובה.`);
  } catch (error) {
    setStatus("reportsStatus", `שמירת התגובה נכשלה: ${error.message}`, true);
  }
}

async function deleteSelectedResolvedReport() {
  const report = selectedReport();
  if (!report || report.status !== "resolved") return;
  if (!window.confirm(`למחוק לצמיתות את דיווח ${report.reportNumber}?`)) return;
  try {
    const fs = state.firebase.firestore;
    await fs.deleteDoc(fs.doc(state.firebase.db, "place_reports", report.id));
    state.reports = state.reports.filter((item) => item.id !== report.id);
    $("reportDialog").close();
    renderReports();
    setStatus("reportsStatus", `${report.reportNumber} נמחק לצמיתות.`);
  } catch (error) {
    setStatus("reportsStatus", `מחיקת הדיווח נכשלה: ${error.message}`, true);
  }
}

function selectedReport() {
  return state.reports.find((item) => item.id === state.selectedReportId);
}

function docToReport(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    ...data,
    reportNumber: data.reportNumber || doc.id,
    createdAtMs: timestampMs(data.createdAt),
    resolvedAtMs: timestampMs(data.resolvedAt),
    selectedFields: Array.isArray(data.selectedFields) ? data.selectedFields : [],
    issueTypes: Array.isArray(data.issueTypes) ? data.issueTypes : [],
    placeSnapshot: data.placeSnapshot || {},
    placeSnapshotAfter: data.placeSnapshotAfter || null,
    adminResponse: data.adminResponse || null
  };
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return 0;
}

function formatDate(value) {
  const ms = timestampMs(value);
  if (!ms) return "ללא תאריך";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
}

function kindLabel(kind) {
  return kind === "inappropriate_spam" ? "תוכן לא ראוי/ספאם" : "מידע שגוי";
}

function statusLabel(status) {
  if (status === "resolved") return "טופל";
  if (status === "in_review") return "בטיפול";
  return "פתוח";
}

function setStatus(id, message, isError = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function emptyHtml(message) {
  return `<div class="empty-inline"><div><strong>אין נתונים להצגה</strong><p>${escapeHtml(message)}</p></div></div>`;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function compact(value, max) {
  const str = text(value);
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function text(value) {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "כן" : "לא";
  return String(value).trim();
}

function escapeHtml(value) {
  return text(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
