import { tripTapAdminFirebase } from "./firebase.js";

export const ADMIN_EMAIL = "doronenakache@gmail.com";

const NAV_ITEMS = [
  {
    key: "users",
    href: "./users.html",
    icon: "users",
    label: "ניהול משתמשים"
  },
  {
    key: "places",
    href: "./places.html?view=current",
    icon: "map-pin-plus",
    label: "מקומות",
    subItems: [
      { key: "current", href: "./places.html?view=current", label: "מצב נוכחי" },
      { key: "refresh-images", href: "./places.html?view=refresh-images", label: "רענן תמונות" },
      { key: "import", href: "./places.html?view=import", label: "הוספת מקומות" },
      { key: "approve", href: "./places.html?view=approve", label: "אישור מקומות" },
      { key: "broken-images", href: "./places.html?view=broken-images", label: "תיקון תמונות שבורות" },
      { key: "fix-hours", href: "./places.html?view=fix-hours", label: "תקן שעות פתיחה" },
      { key: "duplicates", href: "./places.html?view=duplicates", label: "מחיקת כפילויות" },
      { key: "delete", href: "./places.html?view=delete", label: "מחיקה מלאה" }
    ]
  },
  {
    key: "trips",
    href: "./trips.html?view=manage",
    icon: "route",
    label: "טיולים",
    subItems: [
      { key: "manage", href: "./trips.html?view=manage", label: "טיולים מצב נוכחי" },
      { key: "compose", href: "./trips.html?view=compose&step=builder", label: "יצירת טיול" }
    ]
  },
  {
    key: "hotels",
    href: "./hotels.html?view=manage",
    icon: "hotel",
    label: "מלונות",
    subItems: [
      { key: "manage", href: "./hotels.html?view=manage", label: "מלונות מצב נוכחי" },
      { key: "compose", href: "./hotels.html?view=compose", label: "הוספת מלון" }
    ]
  },
  {
    key: "bookings",
    href: "./bookings.html?view=manage",
    icon: "ticket",
    label: "קישורי הזמנות",
    subItems: [
      { key: "manage", href: "./bookings.html?view=manage", label: "קישורי אטרקציות מצב נוכחי" },
      { key: "compose", href: "./bookings.html?view=compose", label: "הוספת קישור אטרקציה" }
    ]
  },
  {
    key: "reports",
    href: "./reports.html?view=incorrect",
    icon: "message-square-warning",
    label: "ניהול דיווחים",
    subItems: [
      { key: "incorrect", href: "./reports.html?view=incorrect", label: "דיווחי מידע שגוי" },
      { key: "spam", href: "./reports.html?view=spam", label: "תוכן לא ראוי/ספאם" },
      { key: "resolved", href: "./reports.html?view=resolved", label: "דיווחים שטופלו" }
    ]
  },
  { key: "settings", href: "./settings.html", icon: "settings", label: "הגדרות" }
];

export function createAdminShell({ activeKey, activeSubKey = "", title, subtitle, content, actions = "", requireAuth = true }) {
  const activeItem = NAV_ITEMS.find((item) => item.key === activeKey) || null;
  const activeSubItems = activeItem?.subItems || [];
  return `
    <div class="admin-app">
      <header class="admin-topbar">
        <div class="topbar-main">
          <a class="brand" href="./places.html?view=current" aria-label="TripTap Admin">
            <span class="brand-mark">T</span>
            <span>
              <strong>TripTap Admin</strong>
              <small>ניהול תוכן</small>
            </span>
          </a>

          <nav class="top-nav" aria-label="תפריט אדמין">
            ${NAV_ITEMS.map((item) => `
              <a class="top-nav-item ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
                <i data-lucide="${item.icon}" aria-hidden="true"></i>
                <span>${item.label}</span>
              </a>
            `).join("")}
          </nav>

          <div class="top-status">
            <span class="connection-dot" id="firebaseDot"></span>
            <span id="firebaseStatus">Firebase נטען</span>
          </div>
        </div>

        ${activeSubItems.length ? `
          <nav class="sub-nav" aria-label="תת תפריט">
            ${activeSubItems.map((item) => `
              <a class="sub-nav-item ${item.key === activeSubKey ? "is-active" : ""}" href="${item.href}" data-sub-key="${item.key}">
                <span>${item.label}</span>
              </a>
            `).join("")}
          </nav>
        ` : ""}
      </header>

      <main class="admin-main">
        <section class="section-view is-active">
          <div class="page-heading">
            <div>
              <p class="eyebrow">מצב אדמין</p>
              <h1>${title}</h1>
              <p class="page-subtitle">${subtitle}</p>
            </div>
            ${actions}
          </div>
          ${requireAuth ? createAuthBanner() : ""}
          ${content}
        </section>
      </main>
    </div>
  `;
}

function createAuthBanner() {
  return `
    <div class="auth-panel auth-panel-shell" id="authPanelShell">
      <div>
        <strong id="authTitle">טוען פרטי התחברות...</strong>
        <span id="authSubtitle">הגישה לעמוד זה דורשת התחברות.</span>
      </div>
      <div class="auth-panel-actions">
        <a class="ghost-action" href="./login.html">מעבר לדף התחברות</a>
        <button class="ghost-action is-hidden" type="button" id="signOutButton">
          <i data-lucide="log-out" aria-hidden="true"></i>
          <span>התנתק</span>
        </button>
      </div>
    </div>
  `;
}

export function attachSharedUi({ activeKey, requireAuth = true, onAuthed, onUnauthed }) {
  const firebase = tripTapAdminFirebase;
  const root = document.documentElement;
  root.dataset.page = activeKey;

  firebase.analyticsPromise.then(() => {
    const dot = document.getElementById("firebaseDot");
    const status = document.getElementById("firebaseStatus");
    if (dot) dot.classList.add("ready");
    if (status) status.textContent = "Firebase מחובר";
  });

  firebase.authReady.finally(async () => {
    try {
      await firebase.authFns.getRedirectResult(firebase.auth);
    } catch (_) { }

    firebase.authFns.onAuthStateChanged(firebase.auth, (user) => {
      updateAuthBanner(user);
      if (!user && requireAuth) {
        redirectToLogin();
        return;
      }
      if (!user) {
        onUnauthed?.(firebase);
        return;
      }
      bindSignOut(firebase);
      if (requireAuth && !isAdminUser(user)) {
        updateAuthBanner(user, true);
        return;
      }
      onAuthed?.(user, firebase);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function updateAuthBanner(user, forbidden = false) {
  const title = document.getElementById("authTitle");
  const subtitle = document.getElementById("authSubtitle");
  const signOutButton = document.getElementById("signOutButton");
  if (!title || !subtitle) return;
  if (forbidden) {
    title.textContent = "אין הרשאת אדמין";
    subtitle.textContent = `${user.email || user.displayName || user.uid} מחובר, אבל רק ${ADMIN_EMAIL} יכול לפתוח את מערכת הניהול.`;
    signOutButton?.classList.remove("is-hidden");
  } else if (user) {
    title.textContent = "מחובר לאדמין";
    subtitle.textContent = `${user.email || user.displayName || user.uid} מחובר כעת.`;
    signOutButton?.classList.remove("is-hidden");
  } else {
    title.textContent = "נדרשת התחברות";
    subtitle.textContent = "אם אינך מחובר, תועבר אוטומטית לדף הכניסה.";
    signOutButton?.classList.add("is-hidden");
  }
}

function bindSignOut(firebase) {
  const button = document.getElementById("signOutButton");
  if (!button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";
  button.addEventListener("click", async () => {
    await firebase.authFns.signOut(firebase.auth);
    redirectToLogin();
  });
}

export function redirectToLogin() {
  const next = `${window.location.pathname.split('/').pop()}${window.location.search || ""}${window.location.hash || ""}`;
  window.location.replace(`./login.html?next=${encodeURIComponent(next)}`);
}

export function resolveNextPage() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next) return "./places.html";
  if (/^https?:/i.test(next)) return "./places.html";
  return next.startsWith("./") ? next : `./${next}`;
}

export function resolveAdminView(defaultView) {
  return new URLSearchParams(window.location.search).get("view") || defaultView;
}

export function resolveAdminStep(defaultStep) {
  return new URLSearchParams(window.location.search).get("step") || defaultStep;
}

export function isAdminUser(user) {
  const email = (user?.email || "").trim().toLowerCase();
  return Boolean(email && email === ADMIN_EMAIL && user?.emailVerified === true);
}

export function createEmptyState(icon, title, message) {
  return `<div class="empty-screen"><i data-lucide="${icon}"></i><h1>${title}</h1><p>${message}</p></div>`;
}

const IMGBB_MAX_BYTES = 32 * 1024 * 1024;
export const ADMIN_WORKFLOW_URL = "https://trip-planner-ai-workflow.nakachedoron37.workers.dev";
const ADMIN_R2_WORKFLOW_URL = ADMIN_WORKFLOW_URL;
const ADMIN_R2_MAX_BYTES = 15 * 1024 * 1024;

async function adminWorkerPost(user, path, body) {
  if (!user) throw new Error("Missing Firebase user for worker call");
  const idToken = await user.getIdToken();
  const response = await fetch(`${ADMIN_WORKFLOW_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify(body || {})
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Worker ${path} ${response.status}: ${text}`);
  }
  return await response.json().catch(() => null);
}

async function readFileAsBase64(file) {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const comma = String(result).indexOf(",");
      resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
    };
    reader.onerror = () => reject(reader.error || new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
}

export async function uploadAdminImageFileToImgBB(user, file) {
  if (!(file instanceof Blob)) throw new Error("לא נבחר קובץ תמונה.");
  if (file.size > IMGBB_MAX_BYTES) throw new Error("הקובץ חורג ממגבלת imgbb (32MB).");
  const imageBase64 = await readFileAsBase64(file);
  const json = await adminWorkerPost(user, "/imgbb-upload", {
    imageBase64,
    filename: file.name || undefined
  });
  const data = json?.data || {};
  const url = data.display_url || data.url || data.image?.url || data.medium?.url || data.thumb?.url;
  if (!url) throw new Error("imgbb לא החזיר כתובת תמונה.");
  return String(url);
}

export async function adminPixabaySearch(user, { q, perPage = 12 } = {}) {
  const query = String(q || "").trim();
  if (!query) return { hits: [] };
  return (await adminWorkerPost(user, "/pixabay", { q: query, perPage })) || { hits: [] };
}

export async function adminPixabayLookupById(user, id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return { hits: [] };
  return (await adminWorkerPost(user, "/pixabay", { id: numericId })) || { hits: [] };
}

export async function adminUnsplashSearch(user, { query, perPage = 12, page = 1 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { results: [] };
  return (await adminWorkerPost(user, "/unsplash-search", { query: q, perPage, page })) || { results: [] };
}

export function isAdminR2ImageUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return false;
  try {
    const host = new URL(value).host.toLowerCase();
    return host.includes(".r2.dev") || host.includes(".r2.cloudflarestorage.com");
  } catch (_) {
    return value.includes(".r2.dev/") || value.includes(".r2.cloudflarestorage.com/");
  }
}

export async function ensureAdminImageUrlOnR2(user, sourceUrl, { folder, baseName } = {}) {
  const normalizedUrl = String(sourceUrl || "").trim();
  if (!normalizedUrl || isAdminR2ImageUrl(normalizedUrl)) return normalizedUrl;
  const copiedUrl = await copyAdminRemoteImageToR2(user, normalizedUrl, { folder, baseName });
  if (!copiedUrl) throw new Error("לא הצלחתי לשמור את התמונה ב-R2.");
  return copiedUrl;
}

export async function copyAdminRemoteImageToR2(user, sourceUrl, { folder, baseName, contentType } = {}) {
  const normalizedUrl = String(sourceUrl || "").trim();
  if (!normalizedUrl) return "";
  if (isAdminR2ImageUrl(normalizedUrl)) return normalizedUrl;
  if (!user) throw new Error("Missing Firebase user for R2 upload");
  const key = adminR2ImageKey({ folder, baseName, contentType, sourceUrl: normalizedUrl });
  const idToken = await user.getIdToken(true);
  const response = await fetch(`${ADMIN_R2_WORKFLOW_URL}/r2-copy-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      sourceUrl: normalizedUrl,
      key,
      contentType: contentType || adminContentTypeFromUrl(normalizedUrl)
    })
  });
  if (!response.ok) throw new Error(`R2 copy ${response.status}: ${await response.text()}`);
  const payload = await response.json().catch(() => null);
  return String(payload?.publicUrl || "").trim();
}

export async function uploadAdminImageFileToR2(user, file, { folder, baseName } = {}) {
  if (!(file instanceof Blob)) throw new Error("לא נבחר קובץ תמונה.");
  if (file.size > ADMIN_R2_MAX_BYTES) throw new Error("הקובץ חורג ממגבלת R2 (15MB).");
  if (!user) throw new Error("Missing Firebase user for R2 upload");
  const contentType = file.type || adminContentTypeFromUrl(file.name) || "image/jpeg";
  const key = adminR2ImageKey({ folder, baseName: baseName || file.name, contentType, sourceUrl: file.name });
  const idToken = await user.getIdToken(true);
  const mintResponse = await fetch(`${ADMIN_R2_WORKFLOW_URL}/r2-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ key, contentType, expiresInSeconds: 600 })
  });
  if (!mintResponse.ok) throw new Error(`R2 upload URL ${mintResponse.status}: ${await mintResponse.text()}`);
  const mint = await mintResponse.json().catch(() => null);
  if (!mint?.url) throw new Error("R2 upload URL response missing signed URL");
  const putResponse = await fetch(mint.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  });
  if (!putResponse.ok) throw new Error(`R2 upload ${putResponse.status}: ${await putResponse.text()}`);
  if (!mint.publicUrl) throw new Error("R2 upload response missing public URL");
  return String(mint.publicUrl).trim();
}

function adminR2ImageKey({ folder, baseName, contentType, sourceUrl } = {}) {
  const safeFolder = String(folder || "admin_img").trim().replace(/^\/+|\/+$/g, "") || "admin_img";
  return `${safeFolder}/${adminSafeR2Slug(baseName || "image")}-${adminRandomUploadId()}.${adminImageExtension(contentType, sourceUrl)}`;
}

function adminContentTypeFromUrl(url) {
  const ext = adminExtensionFromUrl(url);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

function adminImageExtension(contentType, sourceUrl = "") {
  const normalized = String(contentType || "").split(";")[0].toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  return adminExtensionFromUrl(sourceUrl) || "jpg";
}

function adminExtensionFromUrl(url) {
  try {
    const path = new URL(String(url || ""), window.location.href).pathname.toLowerCase();
    const match = path.match(/\.([a-z0-9]{2,5})$/);
    const ext = match?.[1] || "";
    if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch (_) { }
  return "";
}

function adminSafeR2Slug(value) {
  const slug = String(value || "image")
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return encodeURIComponent(slug || "image").replace(/%/g, "").toLowerCase() || "image";
}

function adminRandomUploadId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const unsavedWorkGuards = [];

export function setupUnsavedChangesWarning({ hasUnsavedChanges, message } = {}) {
  if (typeof hasUnsavedChanges === "function") {
    unsavedWorkGuards.push({ hasUnsavedChanges, message });
  }
  if (window.__tripTapUnsavedChangesGuardBound) return;
  window.__tripTapUnsavedChangesGuardBound = true;

  window.addEventListener("beforeunload", (event) => {
    if (!hasUnsavedAdminWork()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("click", async (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link || event.defaultPrevented) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    if (link.dataset.skipUnsavedWarning === "true") return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return;
    if (!hasUnsavedAdminWork()) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const confirmed = await confirmUnsavedNavigation(activeUnsavedWarningMessage());
    if (confirmed) window.location.assign(link.href);
  }, true);
}

async function confirmUnsavedNavigation(message) {
  if (typeof window.tripTapConfirm === "function") {
    return await window.tripTapConfirm({
      title: "לצאת בלי לשמור?",
      message,
      confirmText: "צא בלי לשמור",
      cancelText: "הישאר בדף",
      tone: "danger",
      icon: "triangle-alert"
    });
  }
  return false;
}

function hasUnsavedAdminWork() {
  return unsavedWorkGuards.some((guard) => {
    try {
      return guard.hasUnsavedChanges();
    } catch (_) {
      return false;
    }
  });
}

function activeUnsavedWarningMessage() {
  const guard = unsavedWorkGuards.find((item) => {
    try {
      return item.hasUnsavedChanges();
    } catch (_) {
      return false;
    }
  });
  return guard?.message || "יש לך שינויים שלא נשמרו. לצאת מהעמוד בלי לשמור?";
}
