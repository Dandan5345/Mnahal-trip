import { createAdminShell, attachSharedUi, resolveAdminView } from "./shared.js";

const COLLECTION = "admin_announcements";
const DEFAULT_ACCENT = "#7C3AED";

const state = {
    firebase: null,
    user: null,
    view: resolveAdminView("compose"),
    items: [],
    loading: false,
    saving: false
};

const $ = (id) => document.getElementById(id);
const text = (value) => (value === null || value === undefined ? "" : String(value));
const escapeHtml = (value) =>
    text(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));
const refreshIcons = () => { if (window.lucide) window.lucide.createIcons(); };

document.getElementById("app").innerHTML = createAdminShell({
    activeKey: "announcements",
    activeSubKey: state.view,
    title: state.view === "manage" ? "התראות שנשלחו" : "שליחת התראה למשתמשים",
    subtitle:
        state.view === "manage"
            ? "כל ההתראות שנשלחו. אפשר לכבות, להפעיל מחדש או למחוק."
            : "שליחת הודעה שתקפוץ למשתמש כשייכנס לאפליקציה — לכולם או למייל ספציפי.",
    content: state.view === "manage" ? renderManageView() : renderComposeView()
});

attachSharedUi({
    activeKey: "announcements",
    requireAuth: true,
    onAuthed: (user, firebase) => {
        state.user = user;
        state.firebase = firebase;
        if (state.view === "manage") {
            loadAnnouncements();
        } else {
            bindComposeForm();
            updatePreview();
        }
        refreshIcons();
    }
});

// ──────────────────────────────────────────────────────────────
// Compose view
// ──────────────────────────────────────────────────────────────

function renderComposeView() {
    return `
    <div class="workspace-grid announce-compose-grid">
      <article class="panel wide-panel">
        <div class="panel-heading">
          <span class="panel-icon violet"><i data-lucide="megaphone" aria-hidden="true"></i></span>
          <div>
            <h2>תוכן ההתראה</h2>
            <p>הכותרת והתוכן יוצגו במודל קופץ ובמעטפת ההתראות באפליקציה.</p>
          </div>
        </div>

        <div class="field-block">
          <label for="annAudience">למי לשלוח</label>
          <select id="annAudience">
            <option value="all">כל המשתמשים</option>
            <option value="user">משתמש לפי מייל</option>
          </select>
        </div>

        <div class="field-block" id="annTargetEmailBlock" style="display:none;">
          <label for="annTargetEmail">מייל המשתמש</label>
          <input id="annTargetEmail" type="email" placeholder="user@example.com" autocomplete="off" />
          <div class="micro-note">בדיוק המייל שאיתו המשתמש מחובר (אותיות קטנות).</div>
        </div>

        <div class="field-block">
          <label for="annTitle">כותרת</label>
          <input id="annTitle" type="text" maxlength="120" placeholder="כותרת ההתראה" autocomplete="off" />
        </div>

        <div class="field-block">
          <label for="annBody">תוכן ההודעה</label>
          <textarea id="annBody" maxlength="4000" placeholder="תוכן ההודעה המלא..."></textarea>
        </div>

        <div class="announce-row">
          <div class="field-block">
            <label for="annEmoji">אימוג'י (לא חובה)</label>
            <input id="annEmoji" type="text" maxlength="8" placeholder="🎉" autocomplete="off" />
          </div>
          <div class="field-block">
            <label for="annAccent">צבע ראשי</label>
            <input id="annAccent" type="color" value="${DEFAULT_ACCENT}" style="height:46px;padding:4px;" />
          </div>
        </div>

        <div class="announce-row">
          <div class="field-block">
            <label for="annTitleSize">גודל כותרת</label>
            <input id="annTitleSize" type="number" min="14" max="40" step="1" value="22" />
          </div>
          <div class="field-block">
            <label for="annBodySize">גודל תוכן</label>
            <input id="annBodySize" type="number" min="11" max="28" step="1" value="15" />
          </div>
        </div>

        <div class="field-block">
          <label for="annActionUrl">קישור כפתור (לא חובה)</label>
          <input id="annActionUrl" type="url" placeholder="https://..." autocomplete="off" />
        </div>
        <div class="field-block">
          <label for="annActionLabel">טקסט הכפתור (לא חובה)</label>
          <input id="annActionLabel" type="text" maxlength="40" placeholder="פתח" autocomplete="off" />
        </div>

        <div class="field-block">
          <label for="annExpires">תפוגה (לא חובה)</label>
          <input id="annExpires" type="datetime-local" />
          <div class="micro-note">אחרי תאריך זה ההתראה תפסיק להופיע. השאר ריק להתראה ללא תפוגה.</div>
        </div>

        <div class="action-row" style="margin-top:8px;">
          <button class="primary-action" type="button" id="sendAnnounceButton">
            <i data-lucide="send" aria-hidden="true"></i>
            <span>שלח התראה</span>
          </button>
        </div>
        <p class="status-line" id="annStatus"></p>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <span class="panel-icon blue"><i data-lucide="eye" aria-hidden="true"></i></span>
          <div>
            <h2>תצוגה מקדימה</h2>
            <p>כך זה ייראה למשתמש.</p>
          </div>
        </div>
        <div class="announce-preview" id="annPreview"></div>
      </article>
    </div>
  `;
}

function bindComposeForm() {
    const ids = [
        "annAudience", "annTargetEmail", "annTitle", "annBody", "annEmoji",
        "annAccent", "annTitleSize", "annBodySize", "annActionUrl", "annActionLabel"
    ];
    ids.forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener("input", onFormInput);
    });
    const audience = $("annAudience");
    if (audience) audience.addEventListener("change", onFormInput);
    const sendButton = $("sendAnnounceButton");
    if (sendButton) sendButton.addEventListener("click", sendAnnouncement);
}

function onFormInput() {
    const audience = $("annAudience")?.value || "all";
    const emailBlock = $("annTargetEmailBlock");
    if (emailBlock) emailBlock.style.display = audience === "user" ? "" : "none";
    updatePreview();
}

function readForm() {
    const audience = $("annAudience")?.value || "all";
    return {
        audience,
        targetEmail: ($("annTargetEmail")?.value || "").trim().toLowerCase(),
        title: ($("annTitle")?.value || "").trim(),
        body: ($("annBody")?.value || "").trim(),
        emoji: ($("annEmoji")?.value || "").trim(),
        accentColor: ($("annAccent")?.value || DEFAULT_ACCENT).trim(),
        titleFontSize: Number($("annTitleSize")?.value) || 22,
        bodyFontSize: Number($("annBodySize")?.value) || 15,
        actionUrl: ($("annActionUrl")?.value || "").trim(),
        actionLabel: ($("annActionLabel")?.value || "").trim(),
        expires: ($("annExpires")?.value || "").trim()
    };
}

function updatePreview() {
    const preview = $("annPreview");
    if (!preview) return;
    const form = readForm();
    const accent = form.accentColor || DEFAULT_ACCENT;
    const header = form.emoji
        ? `<span style="font-size:40px;">${escapeHtml(form.emoji)}</span>`
        : `<i data-lucide="megaphone" style="color:#fff;width:38px;height:38px;"></i>`;
    const bodyHtml = form.body
        ? `<p class="announce-card-body" style="font-size:${form.bodyFontSize}px;">${escapeHtml(form.body).replace(/\n/g, "<br>")}</p>`
        : "";
    const actionHtml = form.actionUrl
        ? `<div class="announce-card-action" style="background:${accent};">${escapeHtml(form.actionLabel || "פתח")}</div>`
        : "";
    preview.innerHTML = `
      <div class="announce-card">
        <div class="announce-card-head" style="background:linear-gradient(135deg, ${accent}, ${accent}b3);">
          ${header}
        </div>
        <div class="announce-card-content">
          <h3 class="announce-card-title" style="font-size:${form.titleFontSize}px;">${escapeHtml(form.title || "כותרת ההתראה")}</h3>
          ${bodyHtml}
          <span class="announce-card-date">עכשיו</span>
          ${actionHtml}
          <div class="announce-card-cta" style="background:${form.actionUrl ? "transparent" : accent};border:1px solid ${accent};color:${form.actionUrl ? accent : "#fff"};">קראתי</div>
        </div>
      </div>
    `;
    refreshIcons();
}

async function sendAnnouncement() {
    if (state.saving || !state.firebase) return;
    const form = readForm();

    if (!form.title) return setStatus("annStatus", "צריך כותרת.", true);
    if (!form.body) return setStatus("annStatus", "צריך תוכן הודעה.", true);
    if (form.audience === "user") {
        if (!form.targetEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.targetEmail)) {
            return setStatus("annStatus", "צריך מייל תקין למשתמש.", true);
        }
    }

    const fs = state.firebase.firestore;
    const payload = {
        title: form.title,
        body: form.body,
        audience: form.audience,
        active: true,
        titleFontSize: form.titleFontSize,
        bodyFontSize: form.bodyFontSize,
        accentColor: form.accentColor,
        createdAt: fs.serverTimestamp()
    };
    if (form.audience === "user") payload.targetEmail = form.targetEmail;
    if (form.emoji) payload.emoji = form.emoji;
    if (form.actionUrl) payload.actionUrl = form.actionUrl;
    if (form.actionLabel) payload.actionLabel = form.actionLabel;
    if (form.expires) {
        const when = new Date(form.expires);
        if (!Number.isNaN(when.getTime())) payload.expiresAt = when;
    }

    state.saving = true;
    setStatus("annStatus", "שולח...", false);
    const button = $("sendAnnounceButton");
    if (button) button.disabled = true;
    try {
        await fs.addDoc(fs.collection(state.firebase.db, COLLECTION), payload);
        const target = form.audience === "user" ? form.targetEmail : "כל המשתמשים";
        showToast(`ההתראה נשלחה ל${form.audience === "user" ? "־" : ""}${target}`, "success");
        resetForm();
        setStatus("annStatus", "ההתראה נשלחה בהצלחה.", false);
    } catch (error) {
        setStatus("annStatus", `שליחה נכשלה: ${error.message}`, true);
        showToast("שליחת ההתראה נכשלה", "error");
    } finally {
        state.saving = false;
        if (button) button.disabled = false;
    }
}

function resetForm() {
    ["annTargetEmail", "annTitle", "annBody", "annEmoji", "annActionUrl", "annActionLabel", "annExpires"].forEach((id) => {
        const el = $(id);
        if (el) el.value = "";
    });
    if ($("annTitleSize")) $("annTitleSize").value = "22";
    if ($("annBodySize")) $("annBodySize").value = "15";
    if ($("annAccent")) $("annAccent").value = DEFAULT_ACCENT;
    updatePreview();
}

// ──────────────────────────────────────────────────────────────
// Manage view
// ──────────────────────────────────────────────────────────────

function renderManageView() {
    return `
    <section class="result-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">התראות</p>
          <h2>היסטוריית שליחה</h2>
        </div>
        <div class="action-row tight">
          <span class="count-pill" id="annCountPill">0 התראות</span>
          <a class="ghost-action" href="./announcements.html?view=compose">
            <i data-lucide="plus" aria-hidden="true"></i>
            <span>התראה חדשה</span>
          </a>
        </div>
      </div>
      <div class="announce-list" id="annList">
        <div class="empty-screen"><i data-lucide="loader"></i><p>טוען התראות...</p></div>
      </div>
    </section>
  `;
}

async function loadAnnouncements() {
    if (!state.firebase || state.loading) return;
    state.loading = true;
    const fs = state.firebase.firestore;
    try {
        const snap = await fs.getDocs(fs.collection(state.firebase.db, COLLECTION));
        state.items = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        renderAnnouncementList();
    } catch (error) {
        const list = $("annList");
        if (list) list.innerHTML = `<div class="empty-screen"><i data-lucide="alert-triangle"></i><p>טעינה נכשלה: ${escapeHtml(error.message)}</p></div>`;
        refreshIcons();
    } finally {
        state.loading = false;
    }
}

function renderAnnouncementList() {
    const list = $("annList");
    if (!list) return;
    const pill = $("annCountPill");
    if (pill) pill.textContent = `${state.items.length} התראות`;

    if (!state.items.length) {
        list.innerHTML = `<div class="empty-screen"><i data-lucide="inbox"></i><p>עוד לא נשלחו התראות.</p></div>`;
        refreshIcons();
        return;
    }

    list.innerHTML = state.items.map((item) => {
        const isUser = item.audience === "user";
        const audienceBadge = isUser
            ? `<span class="ann-badge ann-badge-user"><i data-lucide="user" aria-hidden="true"></i>${escapeHtml(item.targetEmail || "")}</span>`
            : `<span class="ann-badge ann-badge-all"><i data-lucide="users" aria-hidden="true"></i>כל המשתמשים</span>`;
        const active = item.active !== false;
        const expired = item.expiresAt && toMillis(item.expiresAt) < Date.now();
        const stateBadge = !active
            ? `<span class="ann-badge ann-badge-off">כבוי</span>`
            : expired
                ? `<span class="ann-badge ann-badge-off">פג תוקף</span>`
                : `<span class="ann-badge ann-badge-on">פעיל</span>`;
        const accent = item.accentColor || DEFAULT_ACCENT;
        return `
          <article class="ann-item" style="border-inline-start:4px solid ${accent};">
            <div class="ann-item-main">
              <div class="ann-item-top">
                ${item.emoji ? `<span class="ann-item-emoji">${escapeHtml(item.emoji)}</span>` : ""}
                <strong>${escapeHtml(item.title || "")}</strong>
                ${stateBadge}
              </div>
              <p class="ann-item-body">${escapeHtml(item.body || "")}</p>
              <div class="ann-item-meta">
                ${audienceBadge}
                <span class="ann-item-date"><i data-lucide="calendar" aria-hidden="true"></i>${formatDate(item.createdAt)}</span>
              </div>
            </div>
            <div class="ann-item-actions">
              <button class="ghost-action" type="button" data-action="toggle" data-id="${item.id}">
                <i data-lucide="${active ? "bell-off" : "bell"}" aria-hidden="true"></i>
                <span>${active ? "כבה" : "הפעל"}</span>
              </button>
              <button class="ghost-action ann-delete" type="button" data-action="delete" data-id="${item.id}">
                <i data-lucide="trash-2" aria-hidden="true"></i>
                <span>מחק</span>
              </button>
            </div>
          </article>
        `;
    }).join("");

    list.querySelectorAll("[data-action]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            if (btn.dataset.action === "toggle") toggleActive(id);
            else if (btn.dataset.action === "delete") deleteAnnouncement(id);
        });
    });
    refreshIcons();
}

async function toggleActive(id) {
    const item = state.items.find((x) => x.id === id);
    if (!item || !state.firebase) return;
    const fs = state.firebase.firestore;
    const next = item.active === false;
    try {
        await fs.setDoc(fs.doc(state.firebase.db, COLLECTION, id), { active: next }, { merge: true });
        item.active = next;
        renderAnnouncementList();
        showToast(next ? "ההתראה הופעלה" : "ההתראה כובתה", "success");
    } catch (error) {
        showToast(`עדכון נכשל: ${error.message}`, "error");
    }
}

async function deleteAnnouncement(id) {
    if (!state.firebase) return;
    if (!window.confirm("למחוק את ההתראה לצמיתות? היא תיעלם מכל המשתמשים.")) return;
    const fs = state.firebase.firestore;
    try {
        await fs.deleteDoc(fs.doc(state.firebase.db, COLLECTION, id));
        state.items = state.items.filter((x) => x.id !== id);
        renderAnnouncementList();
        showToast("ההתראה נמחקה", "success");
    } catch (error) {
        showToast(`מחיקה נכשלה: ${error.message}`, "error");
    }
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function toMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (value instanceof Date) return value.getTime();
    if (value.seconds) return value.seconds * 1000;
    return 0;
}

function formatDate(value) {
    const millis = toMillis(value);
    if (!millis) return "";
    const d = new Date(millis);
    const two = (n) => String(n).padStart(2, "0");
    return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function setStatus(id, message, isError = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = message || "";
    el.style.color = isError ? "var(--red)" : "var(--muted)";
}

function showToast(message, kind = "success") {
    const stack = $("announceToastStack");
    if (!stack) return;
    const toast = document.createElement("div");
    toast.className = `trip-toast trip-toast-${kind}`;
    const icon = kind === "error" ? "alert-triangle" : kind === "warning" ? "info" : "check-circle";
    toast.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    refreshIcons();
    setTimeout(() => toast.classList.add("is-leaving"), 3500);
    setTimeout(() => toast.remove(), 4000);
}
