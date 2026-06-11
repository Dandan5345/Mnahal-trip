import { tripTapAdminFirebase, getAppCheckToken } from "./firebase.js";

// מצרף את טוקן ה-App Check ל-Headers של בקשות שיוצאות ל-Worker.
// אם אין טוקן זמין, מחזיר את ה-Headers כמו שהם (לא שובר את ה-fetch).
export async function withAppCheckHeaders(headers = {}) {
  const token = await getAppCheckToken();
  return token ? { ...headers, "X-Firebase-AppCheck": token } : { ...headers };
}

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
      { key: "fix-addresses", href: "./places.html?view=fix-addresses", label: "תיקון כתובות" },
      { key: "duplicates", href: "./places.html?view=duplicates", label: "מחיקת כפילויות" },
      { key: "delete", href: "./places.html?view=delete", label: "מחיקה מלאה" },
      { key: "translate", href: "./places.html?view=translate", label: "תרגם כרטיסיות" }
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
      { key: "compose", href: "./hotels.html?view=compose", label: "הוספת מלון" },
      { key: "fix-links", href: "./hotels.html?view=fix-links", label: "תיקון קישורים" }
    ]
  },
  {
    key: "bookings",
    href: "./bookings.html?view=manage",
    icon: "ticket",
    label: "קישורי הזמנות",
    subItems: [
      { key: "manage", href: "./bookings.html?view=manage", label: "קישורי אטרקציות מצב נוכחי" },
      { key: "compose", href: "./bookings.html?view=compose", label: "הוספת קישור אטרקציה" },
      { key: "fix-links", href: "./bookings.html?view=fix-links", label: "תיקון קישורים" }
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
  {
    key: "announcements",
    href: "./announcements.html?view=compose",
    icon: "megaphone",
    label: "התראות",
    subItems: [
      { key: "compose", href: "./announcements.html?view=compose", label: "שליחת התראה" },
      { key: "manage", href: "./announcements.html?view=manage", label: "התראות שנשלחו" }
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
          <button class="nav-toggle" type="button" id="navToggle" aria-label="תפריט" aria-expanded="false" aria-controls="navDrawer">
            <i data-lucide="menu" aria-hidden="true"></i>
          </button>

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
            <button class="theme-toggle" type="button" id="themeToggle" aria-label="החלפת מצב כהה/בהיר" title="מצב כהה/בהיר">
              <i data-lucide="moon" aria-hidden="true"></i>
            </button>
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

      <div class="nav-scrim" id="navScrim" hidden></div>
      <nav class="nav-drawer" id="navDrawer" aria-label="תפריט ניווט" aria-hidden="true">
        <div class="nav-drawer-head">
          <a class="brand nav-drawer-brand" href="./places.html?view=current" aria-label="TripTap Admin">
            <span class="brand-mark">T</span>
            <span>
              <strong>TripTap Admin</strong>
              <small>ניהול תוכן</small>
            </span>
          </a>
          <button class="nav-drawer-close" type="button" id="navDrawerClose" aria-label="סגירת תפריט">
            <i data-lucide="x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="nav-drawer-body">
          ${NAV_ITEMS.map((item) => {
            const subItems = item.subItems || [];
            const hasSub = subItems.length > 0;
            const isExpanded = item.key === activeKey;
            if (!hasSub) {
              return `
                <div class="nav-drawer-group">
                  <a class="nav-drawer-item ${item.key === activeKey ? "is-active" : ""}" href="${item.href}">
                    <i data-lucide="${item.icon}" aria-hidden="true"></i>
                    <span>${item.label}</span>
                  </a>
                </div>`;
            }
            return `
              <div class="nav-drawer-group ${isExpanded ? "is-expanded is-active" : ""}" data-nav-group="${item.key}">
                <button class="nav-drawer-toggle ${item.key === activeKey ? "is-active" : ""}" type="button" aria-expanded="${isExpanded ? "true" : "false"}" aria-controls="navGroup-${item.key}">
                  <i data-lucide="${item.icon}" aria-hidden="true"></i>
                  <span>${item.label}</span>
                  <i data-lucide="chevron-down" class="nav-drawer-chevron" aria-hidden="true"></i>
                </button>
                <div class="nav-drawer-sub" id="navGroup-${item.key}">
                  ${subItems.map((sub) => `
                    <a class="nav-drawer-subitem ${item.key === activeKey && sub.key === activeSubKey ? "is-active" : ""}" href="${sub.href}" data-sub-key="${sub.key}">
                      <span>${sub.label}</span>
                    </a>
                  `).join("")}
                </div>
              </div>`;
          }).join("")}
        </div>
      </nav>

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

export function applyStoredTheme() {
  let theme = "light";
  try {
    theme = localStorage.getItem("triptap-theme")
      || (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (_) { }
  document.documentElement.dataset.theme = theme;
  return theme;
}

function setThemeToggleIcon(theme) {
  const button = document.getElementById("themeToggle");
  if (!button) return;
  button.innerHTML = `<i data-lucide="${theme === "dark" ? "sun" : "moon"}" aria-hidden="true"></i>`;
  if (window.lucide) window.lucide.createIcons();
}

function bindThemeToggle() {
  const button = document.getElementById("themeToggle");
  if (!button || button.dataset.bound === "true") return;
  button.dataset.bound = "true";
  setThemeToggleIcon(document.documentElement.dataset.theme || "light");
  button.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("triptap-theme", next); } catch (_) { }
    setThemeToggleIcon(next);
  });
}

function bindNavDrawer() {
  const toggle = document.getElementById("navToggle");
  const drawer = document.getElementById("navDrawer");
  const scrim = document.getElementById("navScrim");
  const closeBtn = document.getElementById("navDrawerClose");
  if (!toggle || !drawer || !scrim) return;
  if (toggle.dataset.bound === "true") return;
  toggle.dataset.bound = "true";

  const openDrawer = () => {
    document.documentElement.classList.add("nav-drawer-open");
    document.body.classList.add("nav-drawer-open");
    toggle.setAttribute("aria-expanded", "true");
    drawer.setAttribute("aria-hidden", "false");
    scrim.hidden = false;
  };

  const closeDrawer = () => {
    document.documentElement.classList.remove("nav-drawer-open");
    document.body.classList.remove("nav-drawer-open");
    toggle.setAttribute("aria-expanded", "false");
    drawer.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
  };

  toggle.addEventListener("click", () => {
    if (document.documentElement.classList.contains("nav-drawer-open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  scrim.addEventListener("click", closeDrawer);
  closeBtn?.addEventListener("click", closeDrawer);

  drawer.addEventListener("click", (event) => {
    const toggle = event.target?.closest?.(".nav-drawer-toggle");
    if (toggle) {
      event.preventDefault();
      const group = toggle.closest(".nav-drawer-group");
      if (!group) return;
      const expanded = group.classList.toggle("is-expanded");
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      return;
    }
    if (event.target?.closest?.("a[href]")) closeDrawer();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.documentElement.classList.contains("nav-drawer-open")) {
      closeDrawer();
    }
  });
}

export function attachSharedUi({ activeKey, requireAuth = true, onAuthed, onUnauthed }) {
  const firebase = tripTapAdminFirebase;
  const root = document.documentElement;
  root.dataset.page = activeKey;
  applyStoredTheme();
  bindThemeToggle();
  bindNavDrawer();

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

// משהה קריאות רינדור צפופות (למשל הקלדה בחיפוש) כדי שהדף לא ייתקע.
export function debounce(fn, wait = 160) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
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
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
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
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
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
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
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

// ── Shared admin AI (DeepSeek) + URL helpers ─────────────────────────
export const ADMIN_AI_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek Pro" }
];

export const ADMIN_AI_REASONING_OPTIONS = [
  { value: "off", label: "ללא חשיבה" },
  { value: "low", label: "מהירה" },
  { value: "medium", label: "ממוקדת" },
  { value: "high", label: "מעמיקה" },
  { value: "max", label: "מקסימלית" }
];

function adminAiTemperature(reasoningEffort) {
  return { low: 0.7, medium: 0.5, high: 0.2, max: 0.1 }[reasoningEffort] ?? 0.3;
}

export function adminAiModelSelectHtml(id, selected) {
  return `<select id="${id}" class="chat-select">${ADMIN_AI_MODEL_OPTIONS
    .map((option) => `<option value="${option.value}"${option.value === selected ? " selected" : ""}>${option.label}</option>`)
    .join("")}</select>`;
}

export function adminAiReasoningSelectHtml(id, selected) {
  return `<select id="${id}" class="chat-select">${ADMIN_AI_REASONING_OPTIONS
    .map((option) => `<option value="${option.value}"${option.value === selected ? " selected" : ""}>${option.label}</option>`)
    .join("")}</select>`;
}

// Non-streaming completion against the admin DeepSeek worker.
export async function requestAdminAiCompletion(user, { systemPrompt, userPrompt, model = "deepseek-v4-pro", reasoningEffort = "high", maxTokens = 4096 } = {}) {
  if (!user) throw new Error("חסר משתמש מחובר.");
  const thinkingEnabled = Boolean(reasoningEffort) && reasoningEffort !== "off";
  const idToken = await user.getIdToken();
  const response = await fetch(`${ADMIN_WORKFLOW_URL}/deepseek`, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
    body: JSON.stringify({
      feature: "admin_tool",
      systemPrompt,
      userPrompt,
      maxTokens,
      preferredModel: model,
      thinkingEnabled,
      reasoningEffort: thinkingEnabled ? reasoningEffort : "off",
      temperature: adminAiTemperature(reasoningEffort),
      stream: false
    })
  });
  if (!response.ok) throw new Error(await response.text());
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = await response.json().catch(() => null);
    return String(payload?.text || "").trim();
  }
  // Some worker configs always stream — accumulate the deltas into a single string.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  const consume = (rawEvent) => {
    const data = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n")
      .trim();
    if (!data || data === "[DONE]") return;
    let event;
    try { event = JSON.parse(data); } catch (_) { return; }
    if (event.error) throw new Error(event.detail ? `${event.error}: ${event.detail}` : event.error);
    if (event.contentDelta) fullText += event.contentDelta;
    if (event.text) fullText = event.text;
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const rawEvent of parts) consume(rawEvent);
  }
  if (buffer.trim()) consume(buffer);
  return fullText.trim();
}

function unwrapAngleBrackets(value) {
  return String(value ?? "").replace(/^<+|>+$/g, "").trim();
}

function normalizeHttpUrl(value) {
  const raw = unwrapAngleBrackets(String(value ?? "").trim());
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function isSearchRedirectUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if ((host.includes("google.") || host === "google.com") && (parsed.pathname.includes("/search") || parsed.searchParams.has("q"))) return true;
    if (host.includes("bing.com") && parsed.pathname.includes("/search")) return true;
    if (host.includes("duckduckgo.com")) return true;
    return false;
  } catch (_) {
    return false;
  }
}

function isLikelyDirectMediaUrl(url) {
  if (!url) return false;
  if (/\.(jpe?g|png|gif|webp|avif|svg|bmp)(\?|#|$)/i.test(url)) return true;
  return /(?:agoda\.net|bstatic\.com|booking\.com|cloudfront\.net|unsplash\.com|wikimedia\.org|imgur\.com|cdn\.)/i.test(url);
}

function extractUrlFromSearchRedirect(url) {
  if (!isSearchRedirectUrl(url)) return "";
  try {
    const parsed = new URL(url);
    const candidate = parsed.searchParams.get("q") || parsed.searchParams.get("url") || "";
    if (!candidate) return "";
    return normalizeHttpUrl(decodeURIComponent(candidate));
  } catch (_) {
    return "";
  }
}

function pickMarkdownUrl(label, href) {
  const labelUrl = normalizeHttpUrl(label);
  const hrefUrl = normalizeHttpUrl(href);
  if (labelUrl && hrefUrl) {
    if (isSearchRedirectUrl(hrefUrl) && !isSearchRedirectUrl(labelUrl)) return labelUrl;
    if (isLikelyDirectMediaUrl(labelUrl) && !isLikelyDirectMediaUrl(hrefUrl)) return labelUrl;
    return hrefUrl;
  }
  return hrefUrl || labelUrl;
}

// Strips markdown/auto-link wrapping so a bare URL is stored.
// When AI returns [image-url](google-search-url), keep the direct URL in the label.
export function cleanBookingUrl(value) {
  let raw = String(value ?? "").trim();
  if (!raw) return "";

  const markdown = raw.match(/\[([^\]]+)\]\(\s*([^)]+)\s*\)/);
  if (markdown) {
    raw = pickMarkdownUrl(markdown[1], markdown[2]);
  } else {
    raw = unwrapAngleBrackets(raw);
    if (raw.startsWith("[") && raw.endsWith("]") && !raw.includes("(")) {
      raw = normalizeHttpUrl(raw.slice(1, -1).trim()) || raw.slice(1, -1).trim();
    } else {
      raw = normalizeHttpUrl(raw) || raw;
    }
  }

  if (isSearchRedirectUrl(raw)) {
    const extracted = extractUrlFromSearchRedirect(raw);
    if (extracted) return extracted;
  }
  return raw;
}

// A link is "broken" if it is empty or not a structurally valid http(s) URL.
export function isBrokenBookingUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return true;
  if (/[\[\]<>\s]/.test(raw)) return true;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch (_) {
    return true;
  }
  if (!/^https?:$/.test(parsed.protocol)) return true;
  return !parsed.hostname.includes(".");
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

export const PROMPT_NOTES_STORAGE_PREFIX = "triptap-prompt-notes";

export function loadPromptNotes(feature) {
  try {
    return localStorage.getItem(`${PROMPT_NOTES_STORAGE_PREFIX}:${feature}`) || "";
  } catch (_) {
    return "";
  }
}

export function savePromptNotes(feature, value) {
  try {
    localStorage.setItem(`${PROMPT_NOTES_STORAGE_PREFIX}:${feature}`, String(value ?? ""));
  } catch (_) { }
}

export function renderPromptNotesField(feature, inputId) {
  return `
    <div class="field-block prompt-notes-block">
      <label for="${inputId}">פירוט נוסף (הסייענית שלך)</label>
      <textarea id="${inputId}" class="prompt-notes-input" rows="3" spellcheck="true" placeholder="למשל: נתחיל מ-25 מקומות לאכול בהם בניו יורק"></textarea>
    </div>`;
}

export function bindPromptNotesInput(feature, inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.value = loadPromptNotes(feature);
  input.addEventListener("input", () => savePromptNotes(feature, input.value));
}

export function getPromptNotes(inputId) {
  const input = document.getElementById(inputId);
  return (input?.value || "").trim();
}

export function combinePromptWithNotes(notes, prompt) {
  const trimmed = String(notes || "").trim();
  if (!trimmed) return prompt;
  return `${trimmed}\n\n${prompt}`;
}
