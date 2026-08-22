import {
  adminWorkerPost,
  attachSharedUi,
  createAdminShell,
  debounce
} from "./shared.js";

const app = document.getElementById("app");

const state = {
  firebase: null,
  user: null,
  users: [],
  moderationByUid: new Map(),
  query: "",
  filter: "all",
  sort: "newest",
  pendingUsernames: new Set()
};

const $ = (id) => document.getElementById(id);

renderPage();

function renderPage() {
  app.innerHTML = createAdminShell({
    activeKey: "users",
    title: "ניהול משתמשים",
    subtitle: "איתור משתמשים, ניהול Premium, חסימות וסטטוסי חשבון במקום אחד.",
    actions: `
      <button class="primary-action" type="button" id="reloadUsersButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן נתונים</span>
      </button>
    `,
    content: `
      <section class="users-dashboard">
        <article class="panel users-summary-panel" aria-label="סיכום משתמשים">
          ${summaryCard("totalUsersCount", "users", "משתמשים", "is-blue")}
          ${summaryCard("premiumUsersCount", "crown", "Premium", "is-gold")}
          ${summaryCard("regularUsersCount", "user-round", "רגילים", "is-teal")}
          ${summaryCard("blockedUsersCount", "ban", "חסומים", "is-red")}
        </article>

        <article class="panel users-control-panel">
          <div class="users-control-top">
            <label class="search-input-row users-search">
              <i data-lucide="search" aria-hidden="true"></i>
              <input id="userSearchInput" type="search" autocomplete="off"
                placeholder="חיפוש לפי שם, שם משתמש או UID" />
            </label>
            <label class="users-sort-field">
              <span>מיון</span>
              <select id="usersSortSelect" aria-label="מיון משתמשים">
                <option value="newest">החדשים ביותר</option>
                <option value="oldest">הוותיקים ביותר</option>
                <option value="name-asc">שם א׳–ת׳</option>
                <option value="name-desc">שם ת׳–א׳</option>
                <option value="premium-first">Premium תחילה</option>
                <option value="status">לפי סטטוס</option>
              </select>
            </label>
          </div>
          <div class="users-filter-row" role="group" aria-label="סינון משתמשים">
            ${filterButton("all", "layout-grid", "הכול")}
            ${filterButton("premium", "crown", "Premium")}
            ${filterButton("regular", "user-round", "רגילים")}
            ${filterButton("active", "circle-check", "פעילים")}
            ${filterButton("blocked", "ban", "חסומים")}
          </div>
          <p class="status-line" id="usersStatus" aria-live="polite"></p>
        </article>
      </section>

      <section class="result-section users-result-section">
        <div class="section-heading compact users-list-heading">
          <div><p class="eyebrow">Users</p><h2>כל המשתמשים</h2></div>
          <span class="users-visible-count" id="visibleUsersCount">0 בתצוגה</span>
        </div>
        <div class="users-table" id="usersTable" aria-live="polite"></div>
      </section>

      <div class="trip-toast-stack" id="usersToastStack" aria-live="polite"></div>
    `
  });

  attachSharedUi({
    activeKey: "users",
    requireAuth: true,
    onAuthed: (user, firebase) => {
      state.user = user;
      state.firebase = firebase;
      bindUsers();
      loadUsers();
    }
  });
}

function summaryCard(id, icon, label, tone) {
  return `<div class="user-stat ${tone}">
    <span class="user-stat-icon"><i data-lucide="${icon}" aria-hidden="true"></i></span>
    <span class="user-stat-copy"><b id="${id}">0</b><small>${label}</small></span>
  </div>`;
}

function filterButton(value, icon, label) {
  return `<button class="users-filter-chip ${value === "all" ? "is-active" : ""}"
    type="button" data-user-filter="${value}" aria-pressed="${value === "all"}">
    <i data-lucide="${icon}" aria-hidden="true"></i><span>${label}</span>
  </button>`;
}

function bindUsers() {
  $("reloadUsersButton")?.addEventListener("click", loadUsers);
  const debouncedRenderUsers = debounce(renderUsers);
  $("userSearchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    debouncedRenderUsers();
  });
  $("usersSortSelect")?.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderUsers();
  });
  document.querySelectorAll("[data-user-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.userFilter || "all";
      document.querySelectorAll("[data-user-filter]").forEach((item) => {
        const active = item.dataset.userFilter === state.filter;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderUsers();
    });
  });
}

async function loadUsers() {
  if (!state.firebase || !state.user) return;
  const reloadButton = $("reloadUsersButton");
  reloadButton?.classList.add("is-loading");
  if (reloadButton) reloadButton.disabled = true;
  setStatus("טוען את רשימת המשתמשים מ-Firestore...");
  try {
    const fs = state.firebase.firestore;
    const [usersSnap, moderationSnap] = await Promise.all([
      fs.getDocs(fs.collection(state.firebase.db, "users")),
      fs.getDocs(fs.collection(state.firebase.db, "user_moderation"))
    ]);
    state.moderationByUid = new Map(
      moderationSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
    );
    state.users = usersSnap.docs.map(docToUser);
    renderUsers();
    setStatus(`נטענו ${state.users.length} משתמשים. הנתונים מעודכנים לרגע זה.`);
  } catch (error) {
    setStatus(`טעינת המשתמשים נכשלה: ${error.message}`, true);
    showToast("לא הצלחנו לטעון את המשתמשים", "error");
  } finally {
    reloadButton?.classList.remove("is-loading");
    if (reloadButton) reloadButton.disabled = false;
    refreshIcons();
  }
}

function renderUsers() {
  const visible = filteredAndSortedUsers();
  const premiumCount = state.users.filter(isPremium).length;
  $("totalUsersCount").textContent = state.users.length;
  $("premiumUsersCount").textContent = premiumCount;
  $("regularUsersCount").textContent = state.users.length - premiumCount;
  $("blockedUsersCount").textContent = state.users.filter(isBlocked).length;
  $("visibleUsersCount").textContent = `${visible.length} בתצוגה`;

  const container = $("usersTable");
  container.innerHTML = visible.map(renderUserRow).join("") || emptyHtml(
    state.query || state.filter !== "all"
      ? "לא נמצאו משתמשים שמתאימים לחיפוש או לסינון שבחרת."
      : "אין משתמשים להצגה."
  );
  container.querySelectorAll("[data-user-action]").forEach((button) => {
    button.addEventListener("click", () => {
      handleUserAction(button.dataset.userAction, button.dataset.username);
    });
  });
  refreshIcons();
}

function filteredAndSortedUsers() {
  const filtered = state.users.filter((user) => {
    if (state.query && !userSearchText(user).includes(state.query)) return false;
    if (state.filter === "premium") return isPremium(user);
    if (state.filter === "regular") return !isPremium(user);
    if (state.filter === "active") return !isBlocked(user);
    if (state.filter === "blocked") return isBlocked(user);
    return true;
  });

  return filtered.sort((a, b) => {
    if (state.sort === "oldest") return compareDates(a, b, 1);
    if (state.sort === "name-asc") return compareNames(a, b);
    if (state.sort === "name-desc") return compareNames(b, a);
    if (state.sort === "premium-first") {
      return Number(isPremium(b)) - Number(isPremium(a)) || compareNames(a, b);
    }
    if (state.sort === "status") {
      return Number(isBlocked(a)) - Number(isBlocked(b))
        || Number(isPremium(b)) - Number(isPremium(a))
        || compareNames(a, b);
    }
    return compareDates(a, b, -1);
  });
}

function compareDates(a, b, direction) {
  const aMs = timestampMs(a.createdAt);
  const bMs = timestampMs(b.createdAt);
  if (!aMs && !bMs) return compareNames(a, b);
  if (!aMs) return 1;
  if (!bMs) return -1;
  return (aMs - bMs) * direction || compareNames(a, b);
}

function compareNames(a, b) {
  return userDisplayName(a).localeCompare(userDisplayName(b), "he", {
    sensitivity: "base",
    numeric: true
  });
}

function renderUserRow(user) {
  const moderation = getModeration(user);
  const blocked = isBlocked(user);
  const deleted = moderation.status === "deleted";
  const premium = isPremium(user);
  const pending = state.pendingUsernames.has(user.id);
  const fullName = userDisplayName(user);
  const uid = text(user.uid);
  const initials = initialsFor(user);

  return `<article class="user-row ${blocked ? "is-blocked" : ""} ${premium ? "is-premium" : ""}">
    <div class="user-identity">
      <span class="user-avatar">
        ${escapeHtml(initials)}
        ${premium ? '<i class="user-avatar-crown" data-lucide="crown" aria-hidden="true"></i>' : ""}
      </span>
      <div class="user-identity-copy">
        <div class="user-name-line"><h3>${escapeHtml(fullName)}</h3>${premiumBadge(premium)}</div>
        <p>@${escapeHtml(user.username || user.id)}</p>
      </div>
    </div>
    <div class="user-fields">
      <span><small>UID</small><b dir="ltr" title="${escapeAttr(uid)}">${uid ? escapeHtml(compact(uid, 24)) : "חסר"}</b></span>
      <span><small>תאריך הרשמה</small><b>${escapeHtml(formatDate(user.createdAt))}</b></span>
      <span><small>חברות</small><b>${premium ? premiumBadge(true) : '<span class="membership-regular">רגיל</span>'}</b></span>
      <span><small>סטטוס</small><b class="status-badge ${blocked ? "is-red" : "is-green"}">${deleted ? "נמחק" : blocked ? "חסום" : "פעיל"}</b></span>
    </div>
    <div class="user-actions">
      <button class="premium-action small-action ${premium ? "is-active" : ""}" type="button"
        data-user-action="${premium ? "revoke-premium" : "grant-premium"}" data-username="${escapeAttr(user.id)}" ${pending ? "disabled" : ""}>
        ${pending ? '<span class="button-spinner" aria-hidden="true"></span>' : '<i data-lucide="crown" aria-hidden="true"></i>'}
        <span>${pending ? "מעדכן..." : premium ? "הסר Premium" : "הפוך ל-Premium"}</span>
      </button>
      ${blocked ? `
        <button class="ghost-action small-action" type="button" data-user-action="unblock" data-username="${escapeAttr(user.id)}" ${pending ? "disabled" : ""}>
          <i data-lucide="shield-check" aria-hidden="true"></i><span>הסר חסימה</span>
        </button>
      ` : `
        <button class="ghost-action danger-lite small-action" type="button" data-user-action="block" data-username="${escapeAttr(user.id)}" ${pending ? "disabled" : ""}>
          <i data-lucide="ban" aria-hidden="true"></i><span>חסום</span>
        </button>
      `}
      <button class="danger-action small-action" type="button" data-user-action="delete" data-username="${escapeAttr(user.id)}" ${pending ? "disabled" : ""}>
        <i data-lucide="trash-2" aria-hidden="true"></i><span>מחק</span>
      </button>
    </div>
  </article>`;
}

function premiumBadge(enabled) {
  return enabled
    ? '<span class="premium-badge"><i data-lucide="crown" aria-hidden="true"></i><span>Premium</span></span>'
    : "";
}

async function handleUserAction(action, username) {
  const user = state.users.find((item) => item.id === username);
  if (!user || !state.firebase || !state.user || state.pendingUsernames.has(username)) return;
  if (!user.uid) {
    setStatus("לא ניתן לבצע פעולה על משתמש בלי UID.", true);
    return;
  }

  if (action === "grant-premium" || action === "revoke-premium") {
    await updatePremium(user, action === "grant-premium");
    return;
  }

  if (user.email === state.user.email || user.uid === state.user.uid) {
    setStatus("לא ניתן לחסום או למחוק את משתמש האדמין הפעיל.", true);
    return;
  }

  if (action === "block") {
    const confirmed = await confirmAction({
      icon: "ban",
      title: `לחסום את @${user.username || user.id}?`,
      message: "המשתמש לא יוכל להיכנס לאפליקציה עד שתסיר את החסימה.",
      confirmLabel: "חסום משתמש",
      tone: "danger"
    });
    if (!confirmed) return;
    const reason = window.prompt("אפשר להוסיף סיבת חסימה (לא חובה):", "");
    if (reason === null) return;
    await setUserModeration(user, "blocked", reason.trim());
    return;
  }

  if (action === "unblock") {
    const confirmed = await confirmAction({
      icon: "shield-check",
      title: `להסיר חסימה מ-@${user.username || user.id}?`,
      message: "המשתמש יוכל לשוב ולהשתמש באפליקציה באופן מיידי.",
      confirmLabel: "הסר חסימה",
      tone: "primary"
    });
    if (confirmed) await setUserModeration(user, "active", "");
    return;
  }

  if (action === "delete") {
    const confirmed = await confirmAction({
      icon: "trash-2",
      title: `למחוק את @${user.username || user.id}?`,
      message: "פרופיל המשתמש יימחק והכניסה העתידית שלו תיחסם. פעולה זו אינה הפיכה מהמסך הזה.",
      confirmLabel: "מחק פרופיל",
      tone: "danger"
    });
    if (confirmed) await deleteUserProfile(user);
  }
}

async function updatePremium(user, enabled) {
  const confirmed = await confirmAction({
    icon: "crown",
    title: enabled
      ? `להעניק Premium ל-@${user.username || user.id}?`
      : `להסיר Premium מ-@${user.username || user.id}?`,
    message: enabled
      ? "המשתמש יקבל גישת AI ללא מכסת טוקנים וללא מכסות המוצר הרגילות. יתרת הטוקנים הקיימת שלו תישמר."
      : "המשתמש יחזור מיד למסלול הרגיל עם יתרת הטוקנים הקיימת שלו.",
    confirmLabel: enabled ? "הענק Premium" : "הסר Premium",
    tone: enabled ? "premium" : "danger"
  });
  if (!confirmed) return;

  state.pendingUsernames.add(user.id);
  renderUsers();
  setStatus(enabled ? "מעניק הרשאת Premium..." : "מסיר הרשאת Premium...");
  try {
    const result = await adminWorkerPost(state.user, "/admin/users/premium", {
      username: user.id,
      isPremium: enabled
    });
    user.isPremium = result?.isPremium === true;
    setStatus(enabled
      ? `Premium הופעל בהצלחה עבור @${user.username || user.id}.`
      : `Premium הוסר בהצלחה מ-@${user.username || user.id}.`);
    showToast(enabled ? "Premium הופעל בהצלחה" : "Premium הוסר בהצלחה", enabled ? "premium" : "success");
  } catch (error) {
    setStatus(`עדכון Premium נכשל: ${error.message}`, true);
    showToast("עדכון Premium נכשל. לא בוצע שינוי.", "error");
  } finally {
    state.pendingUsernames.delete(user.id);
    renderUsers();
  }
}

async function setUserModeration(user, status, reason) {
  const fs = state.firebase.firestore;
  const now = fs.serverTimestamp();
  const moderationRef = fs.doc(state.firebase.db, "user_moderation", user.uid);
  const payload = {
    uid: user.uid,
    username: user.username || user.id,
    email: user.email || null,
    status,
    reason: reason || null,
    updatedAt: now,
    updatedByUid: state.user.uid,
    updatedByEmail: state.user.email || null
  };
  if (status === "blocked") {
    payload.blockedAt = now;
    payload.blockedByUid = state.user.uid;
    payload.blockedByEmail = state.user.email || null;
  } else {
    payload.unblockedAt = now;
    payload.unblockedByUid = state.user.uid;
    payload.unblockedByEmail = state.user.email || null;
  }

  state.pendingUsernames.add(user.id);
  renderUsers();
  try {
    await fs.setDoc(moderationRef, payload, { merge: true });
    await writeAdminLog(status === "blocked" ? "block_user" : "unblock_user", user, { reason });
    showToast(status === "blocked" ? "המשתמש נחסם" : "החסימה הוסרה", "success");
    await loadUsers();
  } catch (error) {
    setStatus(`עדכון סטטוס המשתמש נכשל: ${error.message}`, true);
    showToast("עדכון סטטוס המשתמש נכשל", "error");
  } finally {
    state.pendingUsernames.delete(user.id);
    renderUsers();
  }
}

async function deleteUserProfile(user) {
  const fs = state.firebase.firestore;
  const now = fs.serverTimestamp();
  state.pendingUsernames.add(user.id);
  renderUsers();
  try {
    await fs.setDoc(fs.doc(state.firebase.db, "user_moderation", user.uid), {
      uid: user.uid,
      username: user.username || user.id,
      email: user.email || null,
      status: "deleted",
      deletedAt: now,
      deletedByUid: state.user.uid,
      deletedByEmail: state.user.email || null,
      updatedAt: now,
      updatedByUid: state.user.uid,
      updatedByEmail: state.user.email || null
    }, { merge: true });
    await fs.deleteDoc(fs.doc(state.firebase.db, "users", user.id));
    await writeAdminLog("delete_user_profile", user, {});
    showToast("פרופיל המשתמש נמחק", "success");
    await loadUsers();
  } catch (error) {
    setStatus(`מחיקת הפרופיל נכשלה: ${error.message}`, true);
    showToast("מחיקת הפרופיל נכשלה", "error");
  } finally {
    state.pendingUsernames.delete(user.id);
    renderUsers();
  }
}

async function writeAdminLog(action, targetUser, details) {
  const fs = state.firebase.firestore;
  await fs.addDoc(fs.collection(state.firebase.db, "admin_action_logs"), {
    action,
    targetUid: targetUser.uid || null,
    targetUsername: targetUser.username || targetUser.id,
    targetEmail: targetUser.email || null,
    adminUid: state.user.uid,
    adminEmail: state.user.email || null,
    details,
    createdAt: fs.serverTimestamp()
  });
}

function confirmAction({ icon, title, message, confirmLabel, tone }) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "users-confirm-overlay";
    overlay.innerHTML = `<div class="users-confirm-dialog ${escapeAttr(`is-${tone}`)}" role="dialog" aria-modal="true" aria-labelledby="usersConfirmTitle">
      <button class="users-confirm-close" type="button" aria-label="סגירה"><i data-lucide="x"></i></button>
      <span class="users-confirm-icon"><i data-lucide="${escapeAttr(icon)}" aria-hidden="true"></i></span>
      <h2 id="usersConfirmTitle"></h2><p class="users-confirm-message"></p>
      <div class="users-confirm-actions">
        <button class="ghost-action" type="button" data-confirm="cancel">ביטול</button>
        <button class="primary-action users-confirm-submit" type="button" data-confirm="accept"></button>
      </div>
    </div>`;
    overlay.querySelector("h2").textContent = title;
    overlay.querySelector(".users-confirm-message").textContent = message;
    overlay.querySelector(".users-confirm-submit").textContent = confirmLabel;
    document.body.appendChild(overlay);
    refreshIcons();

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.classList.add("is-leaving");
      window.setTimeout(() => overlay.remove(), 160);
      resolve(value);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") finish(false);
    };
    document.addEventListener("keydown", onKeydown);
    overlay.querySelector("[data-confirm='accept']").addEventListener("click", () => finish(true));
    overlay.querySelector("[data-confirm='cancel']").addEventListener("click", () => finish(false));
    overlay.querySelector(".users-confirm-close").addEventListener("click", () => finish(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });
    overlay.querySelector("[data-confirm='accept']").focus();
  });
}

function showToast(message, tone = "success") {
  const stack = $("usersToastStack");
  if (!stack) return;
  const toast = document.createElement("div");
  const icon = tone === "error" ? "circle-alert" : tone === "premium" ? "crown" : "circle-check";
  toast.className = `trip-toast users-toast is-${tone}`;
  toast.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span></span>`;
  toast.querySelector("span").textContent = message;
  stack.appendChild(toast);
  refreshIcons();
  window.setTimeout(() => toast.classList.add("is-leaving"), 3300);
  window.setTimeout(() => toast.remove(), 3800);
}

function docToUser(document) {
  const data = document.data();
  return { id: document.id, ...data, username: data.username || document.id, isPremium: data.isPremium === true };
}

function getModeration(user) {
  return state.moderationByUid.get(user.uid) || {};
}

function isBlocked(user) {
  const status = getModeration(user).status;
  return status === "blocked" || status === "deleted";
}

function isPremium(user) {
  return user.isPremium === true;
}

function userDisplayName(user) {
  const full = [text(user.firstName), text(user.lastName)].filter(Boolean).join(" ");
  return full || text(user.displayName) || text(user.name) || user.username || user.id || "משתמש";
}

function userSearchText(user) {
  return [
    user.id, user.username, user.firstName, user.lastName, user.displayName,
    user.name, user.uid, getModeration(user).status,
    isPremium(user) ? "premium פרימיום" : "regular רגיל"
  ].map(text).join(" ").toLowerCase();
}

function initialsFor(user) {
  const parts = userDisplayName(user).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return (user.username || user.id || "?").slice(0, 2).toUpperCase();
}

function formatDate(value) {
  const ms = timestampMs(value);
  if (!ms) return "לא ידוע";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
}

function timestampMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function setStatus(message, isError = false) {
  const el = $("usersStatus");
  if (!el) return;
  el.textContent = message || "";
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
