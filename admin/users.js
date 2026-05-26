import { createAdminShell, attachSharedUi } from "./shared.js";

const app = document.getElementById("app");

const state = {
  firebase: null,
  user: null,
  users: [],
  moderationByUid: new Map(),
  query: ""
};

const $ = (id) => document.getElementById(id);

renderPage();

function renderPage() {
  app.innerHTML = createAdminShell({
    activeKey: "users",
    title: "ניהול משתמשים",
    subtitle: "רשימת משתמשים, חסימה, הסרת חסימה ומחיקת פרופיל משתמש.",
    actions: `
      <button class="primary-action" type="button" id="reloadUsersButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן</span>
      </button>
    `,
    content: `
      <section class="users-dashboard">
        <article class="panel users-summary-panel">
          <div class="user-stat">
            <b id="totalUsersCount">0</b>
            <span>משתמשים</span>
          </div>
          <div class="user-stat">
            <b id="blockedUsersCount">0</b>
            <span>חסומים</span>
          </div>
          <div class="user-stat">
            <b id="visibleUsersCount">0</b>
            <span>בתצוגה</span>
          </div>
        </article>

        <article class="panel users-search-panel">
          <label class="search-input-row users-search">
            <i data-lucide="search" aria-hidden="true"></i>
            <input id="userSearchInput" type="search" autocomplete="off" placeholder="חיפוש לפי שם משתמש, שם או UID" />
          </label>
          <p class="status-line" id="usersStatus"></p>
        </article>
      </section>

      <section class="result-section">
        <div class="section-heading compact">
          <div>
            <p class="eyebrow">Users</p>
            <h2>כל המשתמשים</h2>
          </div>
        </div>
        <div class="users-table" id="usersTable"></div>
      </section>
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

function bindUsers() {
  $("reloadUsersButton")?.addEventListener("click", loadUsers);
  $("userSearchInput")?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderUsers();
  });
}

async function loadUsers() {
  if (!state.firebase || !state.user) return;
  setStatus("טוען משתמשים מ-Firestore...");
  try {
    const fs = state.firebase.firestore;
    const [usersSnap, moderationSnap] = await Promise.all([
      fs.getDocs(fs.collection(state.firebase.db, "users")),
      fs.getDocs(fs.collection(state.firebase.db, "user_moderation"))
    ]);

    state.moderationByUid = new Map(
      moderationSnap.docs.map((doc) => [doc.id, { id: doc.id, ...doc.data() }])
    );

    state.users = usersSnap.docs
      .map(docToUser)
      .sort((a, b) => {
        const blockedDelta = Number(isBlocked(b)) - Number(isBlocked(a));
        if (blockedDelta) return blockedDelta;
        return userDisplayName(a).localeCompare(userDisplayName(b), "he");
      });

    renderUsers();
    setStatus(`נטענו ${state.users.length} משתמשים.`);
  } catch (error) {
    setStatus(`טעינת המשתמשים נכשלה: ${error.message}`, true);
  }
}

function renderUsers() {
  const visible = filteredUsers();
  $("totalUsersCount").textContent = state.users.length;
  $("blockedUsersCount").textContent = state.users.filter(isBlocked).length;
  $("visibleUsersCount").textContent = visible.length;

  const container = $("usersTable");
  container.innerHTML = visible.map(renderUserRow).join("") || emptyHtml("אין משתמשים להצגה.");

  container.querySelectorAll("[data-user-action]").forEach((button) => {
    button.addEventListener("click", () => handleUserAction(button.dataset.userAction, button.dataset.username));
  });

  refreshIcons();
}

function filteredUsers() {
  if (!state.query) return state.users;
  return state.users.filter((user) => userSearchText(user).includes(state.query));
}

function renderUserRow(user) {
  const moderation = getModeration(user);
  const blocked = isBlocked(user);
  const deleted = moderation.status === "deleted";
  const fullName = userDisplayName(user);
  const uid = text(user.uid);
  const initials = initialsFor(user);

  return `<article class="user-row ${blocked ? "is-blocked" : ""}">
    <div class="user-identity">
      <span class="user-avatar">${escapeHtml(initials)}</span>
      <div>
        <h3>${escapeHtml(fullName)}</h3>
        <p>@${escapeHtml(user.username || user.id)}</p>
      </div>
    </div>
    <div class="user-fields">
      <span><small>UID</small><b dir="ltr">${uid ? escapeHtml(compact(uid, 28)) : "חסר"}</b></span>
      <span><small>נוצר</small><b>${escapeHtml(formatDate(user.createdAt))}</b></span>
      <span><small>סטטוס</small><b class="status-badge ${blocked ? "is-red" : "is-green"}">${deleted ? "נמחק" : blocked ? "חסום" : "פעיל"}</b></span>
    </div>
    <div class="user-actions">
      ${blocked ? `
        <button class="ghost-action small-action" type="button" data-user-action="unblock" data-username="${escapeAttr(user.id)}">
          <i data-lucide="shield-check" aria-hidden="true"></i>
          <span>הסר חסימה</span>
        </button>
      ` : `
        <button class="ghost-action danger-lite small-action" type="button" data-user-action="block" data-username="${escapeAttr(user.id)}">
          <i data-lucide="ban" aria-hidden="true"></i>
          <span>חסום</span>
        </button>
      `}
      <button class="danger-action small-action" type="button" data-user-action="delete" data-username="${escapeAttr(user.id)}">
        <i data-lucide="trash-2" aria-hidden="true"></i>
        <span>מחק</span>
      </button>
    </div>
  </article>`;
}

async function handleUserAction(action, username) {
  const user = state.users.find((item) => item.id === username);
  if (!user || !state.firebase || !state.user) return;
  if (!user.uid) {
    setStatus("לא ניתן לבצע פעולה על משתמש בלי UID.", true);
    return;
  }

  if (user.email === state.user.email || user.uid === state.user.uid) {
    setStatus("לא ניתן לחסום או למחוק את משתמש האדמין הפעיל.", true);
    return;
  }

  if (action === "block") {
    const reason = window.prompt(`סיבת חסימה עבור @${user.username || user.id}:`, "");
    if (reason === null) return;
    await setUserModeration(user, "blocked", reason.trim());
    return;
  }

  if (action === "unblock") {
    if (!window.confirm(`להסיר חסימה מ-@${user.username || user.id}?`)) return;
    await setUserModeration(user, "active", "");
    return;
  }

  if (action === "delete") {
    const label = user.email || `@${user.username || user.id}`;
    const confirmed = window.confirm(`למחוק את פרופיל המשתמש ${label} ולחסום כניסה עתידית?`);
    if (!confirmed) return;
    await deleteUserProfile(user);
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

  await fs.setDoc(moderationRef, payload, { merge: true });
  await writeAdminLog(status === "blocked" ? "block_user" : "unblock_user", user, { reason });
  await loadUsers();
}

async function deleteUserProfile(user) {
  const fs = state.firebase.firestore;
  const now = fs.serverTimestamp();
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
  await loadUsers();
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

function docToUser(document) {
  const data = document.data();
  return {
    id: document.id,
    ...data,
    username: data.username || document.id
  };
}

function getModeration(user) {
  return state.moderationByUid.get(user.uid) || {};
}

function isBlocked(user) {
  const status = getModeration(user).status;
  return status === "blocked" || status === "deleted";
}

function userDisplayName(user) {
  const first = text(user.firstName);
  const last = text(user.lastName);
  const full = [first, last].filter(Boolean).join(" ");
  return full || text(user.displayName) || text(user.name) || user.username || user.id || "משתמש";
}

function userSearchText(user) {
  return [
    user.id,
    user.username,
    user.firstName,
    user.lastName,
    user.displayName,
    user.name,
    user.uid,
    getModeration(user).status
  ].map(text).join(" ").toLowerCase();
}

function initialsFor(user) {
  const full = userDisplayName(user);
  const parts = full.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  return (user.username || user.id || "?").slice(0, 2).toUpperCase();
}

function formatDate(value) {
  const ms = timestampMs(value);
  if (!ms) return "לא ידוע";
  return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(ms));
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
