import {
  createAdminShell,
  attachSharedUi,
  resolveAdminView,
  setupUnsavedChangesWarning,
  adminPixabaySearch,
  adminPixabayLookupById,
  adminUnsplashSearch
} from "./shared.js";

const WORKFLOW_URL = "https://trip-planner-ai-workflow.nakachedoron37.workers.dev";
const R2_PLACE_IMAGE_FOLDER = "place_img";

const PLACE_TYPES = [
  ["place_type_restaurant", "מסעדה/אוכל"],
  ["place_type_supermarket", "סופר"],
  ["place_type_museum", "מוזיאון"],
  ["place_type_mall", "קניון"],
  ["place_type_attraction", "אטרקציה"],
  ["place_type_beach", "חוף"],
  ["place_type_tour", "סיור"],
  ["place_type_nature", "טבע"],
  ["place_type_nightlife", "חיי לילה"],
  ["place_type_bar", "בר"]
];

const PLACE_EMOJI = {
  place_type_restaurant: "🍔",
  place_type_supermarket: "🛒",
  place_type_museum: "🏛️",
  place_type_mall: "🛍️",
  place_type_attraction: "🎢",
  place_type_beach: "🏖️",
  place_type_tour: "🚶",
  place_type_nature: "🌿",
  place_type_nightlife: "🌃",
  place_type_bar: "🍸"
};

const FOOD_TYPE_LABELS = {
  food_type_italian: "איטלקי",
  food_type_dairy: "חלבי",
  food_type_meat: "בשרי",
  food_type_vegetarian: "צמחוני",
  food_type_asian: "אסייתי",
  food_type_shawarma: "שווארמה",
  food_type_pizza: "פיצה",
  food_type_burger: "בורגר",
  food_type_cafe: "קפה",
  food_type_other: "אחר"
};

const AI_PREFERENCE_STORAGE_PREFIX = "places-admin-ai";

const state = {
  firebase: null,
  user: null,
  view: "current",
  destinations: { import: null, duplicates: null, delete: null, currentFilter: null },
  currentPlaces: [],
  currentSearch: "",
  currentRadiusKm: 50,
  selectedCurrentPlaceId: null,
  editingCurrentPlaceId: null,
  refreshImagePlaces: [],
  selectedRefreshImageIds: new Set(),
  refreshImageLoaded: false,
  refreshImageSaving: false,
  approvalPlaces: [],
  selectedApprovalIds: new Set(),
  approvalLoaded: false,
  approvalLoading: false,
  approvalSaving: false,
  drafts: [],
  addressFixDraftId: null,
  addressFixSelection: null,
  addressFixTimer: null,
  addressFixSeq: 0,
  addressSearchCache: new Map(),
  reviewingDraftId: null,
  expandedDraftSearchId: null,
  duplicatePlaces: [],
  deletePlaces: [],
  selectedDuplicateIds: new Set(),
  selectedDeleteIds: new Set(),
  duplicateGroups: [],
  duplicateAiModel: storedAiPreference("duplicates", "model", "deepseek-v4-pro"),
  duplicateThinkingEnabled: storedAiPreference("duplicates", "thinkingEnabled", "true") !== "false",
  duplicateReasoningEffort: storedAiPreference("duplicates", "reasoningEffort", "high"),
  duplicateLiveReasoning: "",
  duplicateLiveAnswer: "",
  duplicateLiveModel: null,
  isCheckingDuplicates: false,
  imageDraftId: null,
  imageTarget: null,
  imageSource: "unsplash",
  importProgress: { active: false, total: 0, completed: 0, label: "" },
  brokenPlaces: [],
  brokenLoaded: false,
  brokenLoading: false,
  brokenSaving: false,
  brokenEdits: { /* placeId -> { coverImageUrl, credit fields, pixabayId, pixabayPageUrl, isAtmosphereImage } */ },
  openingHoursPlaces: [],
  selectedOpeningHoursIds: new Set(),
  openingHoursLoaded: false,
  openingHoursLoading: false,
  openingHoursSaving: false,
  openingHoursAiModel: storedAiPreference("opening-hours", "model", "deepseek-v4-pro"),
  openingHoursThinkingEnabled: storedAiPreference("opening-hours", "thinkingEnabled", "true") !== "false",
  openingHoursReasoningEffort: storedAiPreference("opening-hours", "reasoningEffort", "high"),
  openingHoursLiveReasoning: "",
  openingHoursLiveAnswer: "",
  openingHoursLiveModel: null,
  aiBusyNoticeOpen: false
};

const DUPLICATE_SEARCH_RADIUS_KM = 50;
const DEEPSEEK_V4_FLASH_MODEL = "deepseek-v4-flash";
const DEEPSEEK_V4_PRO_MODEL = "deepseek-v4-pro";
const DEEPSEEK_MODEL_OPTIONS = [
  { value: DEEPSEEK_V4_FLASH_MODEL, label: "DeepSeek Flash" },
  { value: DEEPSEEK_V4_PRO_MODEL, label: "DeepSeek Pro" }
];
const DEEPSEEK_REASONING_OPTIONS = [
  { value: "off", label: "ללא חשיבה" },
  { value: "low", label: "מהירה" },
  { value: "medium", label: "ממוקדת" },
  { value: "high", label: "מעמיקה" },
  { value: "max", label: "מקסימלית" }
];
const DUPLICATE_AI_ENDPOINT = `${WORKFLOW_URL}/deepseek`;
const OPENING_HOURS_AI_ENDPOINT = `${WORKFLOW_URL}/deepseek`;
const BROKEN_IMAGE_SCAN_CONCURRENCY = 6;
const BROKEN_IMAGE_RENDER_THROTTLE_MS = 120;
const IMAGE_PROBE_TIMEOUT_MS = 20000;
const PIXABAY_IMAGE_PROBE_TIMEOUT_MS = 30000;
const IMAGE_PROBE_RETRY_DELAY_MS = 450;
const R2_REFRESH_CONCURRENCY = 4;

const DUPLICATE_SYSTEM_PROMPT = `
אתה מנקה כפילויות של כרטיסיות מקומות באפליקציית Trip Planner.
תקבל רשימת כרטיסיות מ-TripInspo מאותו אזור. לכל כרטיסיה יש card_id, source, name, address, website, type.
המטרה: לקבץ רק כרטיסיות שמייצגות את אותו מקום פיזי / אותו עסק אמיתי, גם אם השם כתוב אחרת.
חשוב: אל תסתפק בבדיקת שם זהה או קישור זהה בלבד. עבור ממש על כל הכרטיסיות והשווה משמעות, הקשר, כתובת, סוג מקום, תיאור ואתר. למשל "הכותל בירושלים", "הכותל המערבי" ו-"Western Wall" יכולים להיות אותו מקום גם בלי שם זהה אחד-לאחד.

החזר JSON תקין בלבד. אסור להחזיר markdown, טקסט חופשי, הערות, או שדות שלא מופיעים בסכמה.
הפורמט המדויק היחיד שמותר להחזיר:
{
  "result": "duplicates_found או no_duplicates",
  "duplicate_groups": [
    {
      "title": "שם המקום המאוחד לתצוגה, למשל מוזיאון המדע",
      "reason": "משפט קצר בעברית שמסביר למה אלה אותו מקום",
      "recommended_keep_card_id": "card_id אחד שהכי כדאי להשאיר",
      "card_ids": ["card_id ראשון", "card_id שני"]
    }
  ]
}

כללים מחייבים:
- החזר רק קבוצות שיש בהן לפחות 2 כרטיסיות שהן אותו מקום אמיתי.
- אין להחזיר בכלל כרטיסיות שאין להן כפילות. הן לא צריכות להופיע בתשובה.
- אם אין אף כפילות, החזר בדיוק:
  {"result":"no_duplicates","duplicate_groups":[]}
- אם נמצאו כפילויות, החזר:
  {"result":"duplicates_found","duplicate_groups":[...]}
- title צריך להיות שם מקום קצר וברור לתצוגה, לא כתובת ולא עיר. למשל "מוזיאון הלובר".
- card_ids חייב להכיל רק מזהים שהופיעו בקלט, ללא כפילויות, ולפחות 2 מזהים.
- recommended_keep_card_id חייב להיות אחד מתוך card_ids ולייצג את הכרטיסיה הכי מלאה/אמינה.
- בדוק יחד name, address, website, source, type וכל מידע תיאורי לפני החלטה.
- אל תגביל כפילות לשם זהה בדיוק או לקישור זהה בדיוק. כפילות יכולה להיות שם נרדף, תרגום, תעתיק, קיצור, שם רשמי מול שם עממי, או ניסוח שמצביע בבירור על אותו אתר/עסק.
- שם דומה בלבד לא מספיק, אבל שם משמעותי שמצביע בבירור על אותו מוסד כן יכול להספיק כשהוא נתמך בהקשר כמו עיר/כתובת/סוג.
- כפול אמיתי יכול להופיע בשפה אחרת, בקיצור, עם תעתיק, או עם סימני פיסוק שונים.
- אתר זהה הוא סימן חזק מאוד לכפילות.
- כתובת זהה או כמעט זהה היא סימן חזק מאוד לכפילות.
- אל תסמן שני מקומות רק בגלל שהם באותה עיר, באותה שכונה, או מאותו סוג.
- אם יש ספק, אל תכניס אותם לקבוצת כפולים.
- אל תמציא מזהים, שמות, כתובות או אתרים.
`;

const OPENING_HOURS_SYSTEM_PROMPT = `
אתה מתקן שעות פתיחה לכרטיסיות מקומות באפליקציית Trip Planner.
תקבל רשימת מקומות עם place_id, name, destination, address, website, raw_hours.
המטרה: להחזיר את raw_hours בפורמט קצר וברור שהאפליקציה יודעת לקרוא, בלי להמציא שעות חדשות.

החזר JSON תקין בלבד. אסור להחזיר markdown, טקסט חופשי, הערות, או שדות שלא מופיעים בסכמה.
הפורמט המדויק היחיד שמותר להחזיר:
{
  "places": [
    {
      "place_id": "אותו מזהה שקיבלת",
      "normalized_hours": "שעות מתוקנות",
      "approved": true,
      "note": "משפט קצר בעברית, אפשר ריק"
    }
  ]
}

כללי פלט מחייבים:
- החזר פריט אחד לכל place_id שקיבלת, באותו סדר.
- אל תשנה place_id ואל תמציא מזהים.
- normalized_hours חייב להיות מחרוזת אחת.
- אם יש שעות אמיתיות, חובה להחזיר את כל שבעת הימים במפורש, יום אחד בכל שורה, בסדר הזה: ראשון, שני, שלישי, רביעי, חמישי, שישי, שבת.
- אסור לקצר טווחי ימים. אסור לכתוב "ראשון-חמישי". גם אם כמה ימים זהים, כתוב כל יום בשורה נפרדת.
- פורמט חובה לכל יום: "ראשון- 09:00-18:00" עם שעות 24h HH:mm.
- אם יום סגור, כתוב: "שבת- סגור".
- אם יש כמה טווחים ביום, כתוב: "ראשון- 09:00-13:00, 16:00-20:00".
- אם המקום פתוח כל הזמן או 24 שעות, אל תחזיר "24/7"; החזר את כל שבעת הימים כך:
  ראשון- 00:00-24:00
  שני- 00:00-24:00
  שלישי- 00:00-24:00
  רביעי- 00:00-24:00
  חמישי- 00:00-24:00
  שישי- 00:00-24:00
  שבת- 00:00-24:00
- אם הטקסט אומר לבדוק באתר, אין שעות ברורות, שעות משתנות, או מידע לא מספיק ברור, החזר בדיוק: "מומלץ לבדוק באתר".
- אל תבצע חיפוש באינטרנט ואל תשלים שעות שלא מופיעות בקלט.
- אל תתרגם שמות מקומות, אל תתקן כתובות, ואל תשנה שום מידע מלבד normalized_hours.
- approved תמיד true כאשר החזרת normalized_hours לפי הכללים.
`;

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const PLACES_VIEW_CONFIG = {
  current: {
    title: "מקומות מצב נוכחי",
    subtitle: "כל המקומות שקיימים ב-TripInspo, חיפוש, פרטים, עריכה ומחיקה.",
    actions: `
      <button class="primary-action" type="button" id="reloadCurrentPlacesButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>רענן מקומות</span>
      </button>
    `
  },
  "refresh-images": {
    title: "רענן תמונות ל-R2",
    subtitle: "כל הכרטיסיות שהתמונה שלהן עדיין לא נשמרה ב-R2. בוחרים כרטיסיות ושומרים בבת אחת.",
    actions: `
      <button class="primary-action" type="button" id="reloadRefreshImagesButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>סנן מקומות</span>
      </button>
    `
  },
  import: {
    title: "הוספת מקומות",
    subtitle: "יעד, prompt, JSON ושמירה.",
    actions: `
      <button class="primary-action" type="button" id="jumpToJsonButton">
        <i data-lucide="braces" aria-hidden="true"></i>
        <span>הדבק JSON</span>
      </button>
    `
  },
  approve: {
    title: "אישור מקומות",
    subtitle: "מעבר על מקומות חדשים שנוספו ל-TripInspo לפני שהם מקבלים אישור מנהל.",
    actions: `
      <button class="primary-action" type="button" id="reloadApprovalPlacesButton">
        <i data-lucide="download-cloud" aria-hidden="true"></i>
        <span>טען מקומות חדשים</span>
      </button>
    `
  },
  "broken-images": {
    title: "תיקון תמונות שבורות",
    subtitle: "כל הכרטיסיות שאיבדו תמונה. בחירת תמונה חדשה מ-Pixabay/Unsplash/Wikimedia ושמירה.",
    actions: `
      <button class="primary-action" type="button" id="reloadBrokenImagesButton">
        <i data-lucide="refresh-cw" aria-hidden="true"></i>
        <span>סרוק שוב</span>
      </button>
    `
  },
  "fix-hours": {
    title: "תקן שעות פתיחה",
    subtitle: "טעינה של מקומות עם שעות שהאפליקציה לא מצליחה לקרוא, תיקון עם AI וסימון כמטופל.",
    actions: `
      <button class="primary-action" type="button" id="reloadOpeningHoursButton">
        <i data-lucide="download-cloud" aria-hidden="true"></i>
        <span>טען מקומות</span>
      </button>
    `
  },
  duplicates: {
    title: "מחיקת כפילויות",
    subtitle: "טעינה לפי יעד, בדיקה ומחיקה.",
    actions: ""
  },
  delete: {
    title: "מחיקה מלאה",
    subtitle: "חיפוש יעד ומחיקה מלאה מ-public_places.",
    actions: ""
  }
};

function normalizePlacesView(view) {
  return Object.prototype.hasOwnProperty.call(PLACES_VIEW_CONFIG, view) ? view : "current";
}

function storedAiPreference(feature, key, fallback) {
  try {
    return localStorage.getItem(`${AI_PREFERENCE_STORAGE_PREFIX}:${feature}:${key}`) || fallback;
  } catch (_) {
    return fallback;
  }
}

function saveAiPreference(feature, key, value) {
  try {
    localStorage.setItem(`${AI_PREFERENCE_STORAGE_PREFIX}:${feature}:${key}`, String(value));
  } catch (_) {
    // Ignore storage failures in private mode.
  }
}

function modelDisplayName(model) {
  return DEEPSEEK_MODEL_OPTIONS.find((option) => option.value === model)?.label || model;
}

function reasoningDisplayName(effort) {
  return DEEPSEEK_REASONING_OPTIONS.find((option) => option.value === effort)?.label || effort;
}

function selectedReasoningValue(thinkingEnabled, reasoningEffort) {
  return thinkingEnabled ? reasoningEffort : "off";
}

function aiModeSummary(model, thinkingEnabled, reasoningEffort) {
  return `${modelDisplayName(model)} · ${thinkingEnabled ? `חשיבה ${reasoningDisplayName(reasoningEffort)}` : "ללא חשיבה"} · טמפ׳ ${thinkingTemperature(thinkingEnabled, reasoningEffort)}`;
}

function thinkingTemperature(thinkingEnabled, reasoningEffort) {
  if (!thinkingEnabled) return 0.7;
  return {
    low: 0.7,
    medium: 0.5,
    high: 0.2,
    max: 0.1
  }[reasoningEffort] ?? 0.2;
}

function renderAiPreferenceControls(feature, noteId) {
  const config = feature === "duplicates"
    ? {
      model: state.duplicateAiModel,
      thinkingEnabled: state.duplicateThinkingEnabled,
      reasoningEffort: state.duplicateReasoningEffort,
      modelSelectId: "duplicateAiModelSelect",
      reasoningSelectId: "duplicateAiThinkingSelect"
    }
    : {
      model: state.openingHoursAiModel,
      thinkingEnabled: state.openingHoursThinkingEnabled,
      reasoningEffort: state.openingHoursReasoningEffort,
      modelSelectId: "openingHoursAiModelSelect",
      reasoningSelectId: "openingHoursAiThinkingSelect"
    };
  return `
    <div class="duplicate-ai-controls" aria-label="הגדרות DeepSeek">
      <div class="ai-controls-grid">
        <label class="edit-field ai-control-field">
          <span>מודל</span>
          <select id="${config.modelSelectId}">
            ${DEEPSEEK_MODEL_OPTIONS.map((option) => `<option value="${option.value}" ${config.model === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
        <label class="edit-field ai-control-field">
          <span>רמת חשיבה</span>
          <select id="${config.reasoningSelectId}">
            ${DEEPSEEK_REASONING_OPTIONS.map((option) => `<option value="${option.value}" ${selectedReasoningValue(config.thinkingEnabled, config.reasoningEffort) === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="ai-mode-note" id="${noteId}"></div>
    </div>
  `;
}

renderPage();

function renderPage() {
  const activeView = normalizePlacesView(resolveAdminView("current"));
  state.view = activeView;
  const viewConfig = PLACES_VIEW_CONFIG[activeView];
  const app = $("app");
  app.innerHTML = createAdminShell({
    activeKey: "places",
    activeSubKey: activeView,
    title: viewConfig.title,
    subtitle: viewConfig.subtitle,
    actions: viewConfig.actions,
    content: `
      <div class="tool-view ${activeView === "current" ? "is-active" : ""}" data-tool-view="current">
        <div class="workspace-grid single-search-grid">
          <article class="panel wide-panel current-search-panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="map" aria-hidden="true"></i></span>
              <div>
                <h2>כל המקומות ב-TripInspo</h2>
                <p>שליטה מלאה במה שמשתמשים והאדמין הוסיפו.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="currentPlacesSearchInput">חיפוש לפי יעד או שם מקום</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateCurrentPlacesSearchButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row current-search-row">
                <i data-lucide="search" aria-hidden="true"></i>
                <input id="currentPlacesSearchInput" type="text" placeholder="לדוגמה: Paris, מוזיאון, מסעדה, שם מקום או כתובת" autocomplete="off" />
              </div>
            </div>
            <div class="current-summary-row">
              <span class="count-pill" id="currentPlacesCountPill">0 מקומות</span>
              <span class="count-pill" id="currentPlacesFilteredPill">0 מוצגים</span>
              <span class="count-pill" id="currentPlacesFilterPill">ללא סינון מרחק</span>
              <button class="ghost-action small-action" type="button" id="openCurrentFilterButton">
                <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
                <span>סינונים</span>
              </button>
            </div>
            <p class="status-line" id="currentPlacesStatus"></p>
          </article>
        </div>

        <section class="result-section current-places-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">TripInspo Live</p>
              <h2>כרטיסיות מקומות קיימות</h2>
            </div>
          </div>
          <div class="current-place-grid" id="currentPlacesGrid"></div>
        </section>
      </div>

      <div class="tool-view ${activeView === "refresh-images" ? "is-active" : ""}" data-tool-view="refresh-images">
        <div class="workspace-grid single-search-grid">
          <article class="panel wide-panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="images" aria-hidden="true"></i></span>
              <div>
                <h2>כרטיסיות שעדיין לא שמורות ב-R2</h2>
                <p>המערכת תציג רק מקומות עם תמונה חיצונית. בחר את הכרטיסיות הרצויות ולחץ שמור כדי להעלות את התמונות ל-R2.</p>
              </div>
            </div>
            <div class="current-summary-row">
              <span class="count-pill" id="refreshImagesCountPill">0 לטעינה</span>
              <span class="count-pill" id="refreshImagesSelectedPill">0 מסומנים</span>
              <button class="ghost-action small-action" type="button" id="selectAllRefreshImagesButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר הכל</span>
              </button>
            </div>
            <p class="status-line" id="refreshImagesStatus"></p>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">R2 Refresh</p>
              <h2>בחירה ושמירה מרוכזת</h2>
            </div>
            <div class="action-row tight">
              <button class="primary-action" type="button" id="saveRefreshImagesButton">
                <i data-lucide="cloud-upload" aria-hidden="true"></i>
                <span id="saveRefreshImagesButtonLabel">שמור תמונה ב-R2</span>
              </button>
            </div>
          </div>
          <div class="cards-grid compact-grid" id="refreshImagesCards"></div>
          <div class="sticky-save-footer broken-save-footer is-hidden" id="refreshImagesSaveFooter">
            <button class="primary-action wide" type="button" id="saveRefreshImagesFooterButton">
              <i data-lucide="cloud-upload" aria-hidden="true"></i>
              <span id="saveRefreshImagesFooterButtonLabel">שמור תמונה ב-R2</span>
            </button>
          </div>
        </section>
      </div>

      <div class="tool-view ${activeView === "import" ? "is-active" : ""}" data-tool-view="import">
        <div class="workspace-grid">
          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="wand-sparkles" aria-hidden="true"></i></span>
              <div>
                <h2>עיר יעד ופרומפט מדויק</h2>
                <p>אותו prompt של מצב מתכנת.</p>
              </div>
            </div>

            <div class="micro-note">OpenStreetMap פעיל. אותו schema.</div>

            <div class="field-block">
              <label for="importDestinationInput">יעד</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateImportDestinationButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row">
                <i data-lucide="map-pin" aria-hidden="true"></i>
                <input id="importDestinationInput" type="text" placeholder="כתוב עיר: Vienna, Rome, Paris, תל אביב" />
              </div>
              <div class="suggestions" id="importDestinationSuggestions"></div>
            </div>

            <div class="selected-place" id="selectedImportDestination">
              <i data-lucide="map" aria-hidden="true"></i>
              <span>בחר הצעה כדי לקבל כתובת, קואורדינטות ומקור מפה.</span>
            </div>

            <div class="import-hints">
              <span><i data-lucide="map" aria-hidden="true"></i> <b id="addressProviderStatus">OpenStreetMap פעיל</b></span>
              <span><i data-lucide="shield-check" aria-hidden="true"></i> כתובות בשפת המקור</span>
              <span><i data-lucide="list-checks" aria-hidden="true"></i> JSON בלבד</span>
            </div>

            <div class="action-row">
              <button class="primary-action" type="button" id="copyPlacePromptButton">
                <i data-lucide="copy" aria-hidden="true"></i>
                <span>העתק פרומפט</span>
              </button>
              <button class="ghost-action" type="button" id="copyJsonSchemaButton">
                <i data-lucide="braces" aria-hidden="true"></i>
                <span>העתק JSON לדוגמה</span>
              </button>
            </div>

            <div class="prompt-preview-card">
              <div class="prompt-preview-heading">
                <span>פרומפט שנוצר</span>
                <button class="ghost-action small-action" type="button" id="refreshPromptButton">
                  <i data-lucide="refresh-cw" aria-hidden="true"></i>
                  <span>רענן</span>
                </button>
              </div>
              <textarea id="promptPreview" class="prompt-preview" readonly spellcheck="false"></textarea>
            </div>
          </article>

          <article class="panel" id="jsonPanel">
            <div class="panel-heading">
              <span class="panel-icon amber"><i data-lucide="file-json-2" aria-hidden="true"></i></span>
              <div>
                <h2>הדבקת JSON מוכן</h2>
                <p>JSON מדויק בלבד.</p>
              </div>
            </div>

            <div class="schema-strip" aria-label="שדות חובה מומלצים">
              <span>name</span>
              <span>destination</span>
              <span>category</span>
              <span>address</span>
              <span>lat/lon</span>
              <span>description</span>
              <span>image_search_query</span>
            </div>

            <textarea id="jsonInput" class="json-input" spellcheck="false"></textarea>
            <div class="action-row split-actions">
              <button class="primary-action" type="button" id="parseJsonButton">
                <i data-lucide="sparkles" aria-hidden="true"></i>
                <span>צור כרטיסיות</span>
              </button>
              <button class="ghost-action" type="button" id="pasteJsonButton">
                <i data-lucide="clipboard-paste" aria-hidden="true"></i>
                <span>הדבק מהלוח</span>
              </button>
              <button class="ghost-action danger-lite" type="button" id="clearJsonButton">
                <i data-lucide="eraser" aria-hidden="true"></i>
                <span>נקה</span>
              </button>
            </div>
            <p class="status-line" id="importStatus"></p>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">כרטיסיות מוכנות</p>
              <h2>בדיקה, תמונות ושמירה</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="draftCountPill">0 כרטיסיות</span>
              <button class="primary-action" type="button" id="saveAllDraftsButton">
                <i data-lucide="cloud-upload" aria-hidden="true"></i>
                <span>שמור הכל ל-TripInspo</span>
              </button>
            </div>
          </div>
          <div class="cards-grid" id="draftCards"></div>
          <div class="sticky-save-footer">
            <button class="primary-action wide" type="button" id="saveAllDraftsFooterButton">
              <i data-lucide="cloud-upload" aria-hidden="true"></i>
              <span>שמור את כל המקומות</span>
            </button>
          </div>
        </section>
      </div>

      <div class="tool-view ${activeView === "approve" ? "is-active" : ""}" data-tool-view="approve">
        <div class="workspace-grid single-search-grid">
          <article class="panel wide-panel approval-hero-panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="badge-check" aria-hidden="true"></i></span>
              <div>
                <h2>מקומות שממתינים לאישור מנהל</h2>
                <p>טען מקומות שלא קיבלו אישור, פתח כרטיסיה לפרטים מלאים, בדוק באינטרנט ואשר רק מה שבטוח לפרסום.</p>
              </div>
            </div>
            <div class="current-summary-row">
              <span class="count-pill" id="approvalLoadedPill">0 ממתינים</span>
              <span class="count-pill" id="approvalSelectedPill">0 מסומנים</span>
              <button class="ghost-action small-action" type="button" id="selectApprovalAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר הכל</span>
              </button>
              <button class="primary-action small-action" type="button" id="loadApprovalPlacesButton">
                <i data-lucide="download-cloud" aria-hidden="true"></i>
                <span>טען מקומות חדשים</span>
              </button>
            </div>
            <p class="status-line" id="approvalStatus"></p>
          </article>
        </div>

        <section class="result-section approval-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">Review Queue</p>
              <h2>כרטיסיות לאישור</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="approvalQueuePill">0 לבדיקה</span>
            </div>
          </div>
          <div class="approval-grid" id="approvalCards"></div>
          <div class="sticky-save-footer approval-save-footer is-hidden" id="approvalSaveFooter">
            <button class="primary-action wide" type="button" id="approveSelectedPlacesButton">
              <i data-lucide="badge-check" aria-hidden="true"></i>
              <span id="approveSelectedPlacesButtonLabel">אשר מנהל</span>
            </button>
          </div>
        </section>
      </div>

      <div class="tool-view ${activeView === "broken-images" ? "is-active" : ""}" data-tool-view="broken-images">
        <div class="workspace-grid single-search-grid">
          <article class="panel wide-panel">
            <div class="panel-heading">
              <span class="panel-icon coral"><i data-lucide="image-off" aria-hidden="true"></i></span>
              <div>
                <h2>כרטיסיות עם תמונה שבורה</h2>
                <p>סורק את כל המקומות, מציג רק כאלה שאין להם תמונה תקינה. בכל כרטיסיה ניתן לבחור תמונה מ-Pixabay, Unsplash או Wikimedia ולשמור.</p>
              </div>
            </div>
            <div class="current-summary-row">
              <span class="count-pill" id="brokenImagesCountPill">0 שבורות</span>
              <span class="count-pill" id="brokenImagesScannedPill">0 נבדקו</span>
            </div>
            <p class="status-line" id="brokenImagesStatus"></p>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">תיקון מהיר</p>
              <h2>בחירת תמונה חדשה</h2>
            </div>
          </div>
          <div class="broken-images-grid" id="brokenImagesGrid"></div>
          <div class="sticky-save-footer broken-save-footer is-hidden" id="brokenSaveFooter">
            <button class="primary-action wide" type="button" id="brokenSaveButton">
              <i data-lucide="cloud-upload" aria-hidden="true"></i>
              <span id="brokenSaveButtonLabel">שמור שינויים</span>
            </button>
          </div>
        </section>
      </div>

      <div class="tool-view ${activeView === "fix-hours" ? "is-active" : ""}" data-tool-view="fix-hours">
        <div class="workspace-grid duplicate-layout">
          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="clock-alert" aria-hidden="true"></i></span>
              <div>
                <h2>מקומות עם שעות לא קריאות</h2>
                <p>הסריקה מדלגת על מקומות שכבר סומנו כמאושרים על ידי מנהל.</p>
              </div>
            </div>
            <div class="current-summary-row">
              <span class="count-pill" id="openingHoursLoadedPill">0 מקומות</span>
              <span class="count-pill" id="openingHoursSelectedPill">0 מסומנים</span>
              <button class="ghost-action small-action" type="button" id="selectOpeningHoursAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר הכל</span>
              </button>
            </div>
            <div class="action-row">
              <button class="primary-action" type="button" id="loadOpeningHoursButton">
                <i data-lucide="download-cloud" aria-hidden="true"></i>
                <span>טען מקומות</span>
              </button>
            </div>
            <p class="status-line" id="openingHoursStatus"></p>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon violet"><i data-lucide="brain-circuit" aria-hidden="true"></i></span>
              <div>
                <h2>עדכון שעות פתיחה</h2>
                <p>בחר מודל ורמת חשיבה. ה-AI מסדר רק את הטקסט הקיים ומחזיר JSON עם מזהה המקום.</p>
              </div>
            </div>
            ${renderAiPreferenceControls("opening-hours", "openingHoursAiModeNote")}
            <button class="primary-action wide" type="button" id="updateOpeningHoursButton">
              <i data-lucide="sparkles" aria-hidden="true"></i>
              <span id="updateOpeningHoursButtonLabel">עדכן שעות פתיחה</span>
            </button>
            <div class="duplicate-live-panel is-hidden" id="openingHoursLivePanel">
              <div class="duplicate-live-heading">
                <strong>DeepSeek Live</strong>
                <span id="openingHoursLiveMeta"></span>
              </div>
              <div class="duplicate-live-grid">
                <div>
                  <span>חשיבה</span>
                  <pre id="openingHoursLiveReasoning"></pre>
                </div>
                <div>
                  <span>תשובה</span>
                  <pre id="openingHoursLiveAnswer"></pre>
                </div>
              </div>
            </div>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">שעות לטיפול</p>
              <h2>בחר מקומות לעדכון</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="openingHoursProblemPill">0 לא קריאות</span>
            </div>
          </div>
          <div class="cards-grid compact-grid" id="openingHoursCards"></div>
        </section>
      </div>

      <div class="tool-view ${activeView === "duplicates" ? "is-active" : ""}" data-tool-view="duplicates">
        <div class="workspace-grid duplicate-layout">
          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon coral"><i data-lucide="copy-x" aria-hidden="true"></i></span>
              <div>
                <h2>טעינת מקומות לפי יעד</h2>
                <p>טווח 50 ק״מ.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="duplicateDestinationInput">יעד לבדיקה</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateDuplicateDestinationButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row">
                <i data-lucide="radar" aria-hidden="true"></i>
                <input id="duplicateDestinationInput" type="text" placeholder="בחר יעד למחיקת כפילויות" />
              </div>
              <div class="suggestions" id="duplicateDestinationSuggestions"></div>
            </div>
            <div class="action-row">
              <button class="primary-action" type="button" id="loadDuplicatePlacesButton">
                <i data-lucide="download-cloud" aria-hidden="true"></i>
                <span>טען מקומות</span>
              </button>
              <button class="ghost-action" type="button" id="selectDuplicateAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר/בטל הכל</span>
              </button>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon violet"><i data-lucide="brain-circuit" aria-hidden="true"></i></span>
              <div>
                <h2>בדיקת כפילויות</h2>
                <p>בחר מודל ורמת חשיבה לפני שליחת הבדיקה.</p>
              </div>
            </div>
            ${renderAiPreferenceControls("duplicates", "duplicateAiModeNote")}
            <div class="action-row">
              <button class="primary-action" type="button" id="runLocalDuplicateButton">
                <i data-lucide="scan-search" aria-hidden="true"></i>
                <span>בדיקה מקומית</span>
              </button>
              <button class="ghost-action" type="button" id="runAiDuplicateButton">
                <i data-lucide="sparkles" aria-hidden="true"></i>
                <span>בדיקת AI</span>
              </button>
              <button class="ghost-action" type="button" id="copyDuplicatePromptButton">
                <i data-lucide="copy" aria-hidden="true"></i>
                <span>העתק פרומפט</span>
              </button>
            </div>
            <p class="status-line" id="duplicateStatus"></p>
            <div class="duplicate-live-panel is-hidden" id="duplicateLivePanel">
              <div class="duplicate-live-heading">
                <strong id="duplicateLiveTitle">תשובת DeepSeek האחרונה</strong>
                <span id="duplicateLiveMeta"></span>
              </div>
              <div class="duplicate-live-grid">
                <div>
                  <span>חשיבה</span>
                  <pre id="duplicateLiveReasoning"></pre>
                </div>
                <div>
                  <span>תשובה</span>
                  <pre id="duplicateLiveAnswer"></pre>
                </div>
              </div>
            </div>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">תוצאות כפילויות</p>
              <h2>קבוצות ומקומות לבדיקה</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="duplicateLoadedPill">0 מקומות</span>
              <span class="count-pill" id="duplicateSelectedPill">0 מסומנים</span>
              <button class="danger-action" type="button" id="deleteSelectedDuplicatesButton">
                <i data-lucide="trash" aria-hidden="true"></i>
                <span>מחק מסומנים</span>
              </button>
            </div>
          </div>
          <div class="duplicate-groups" id="duplicateGroups"></div>
          <div class="cards-grid compact-grid" id="duplicateCards"></div>
        </section>
      </div>

      <div class="tool-view ${activeView === "delete" ? "is-active" : ""}" data-tool-view="delete">
        <div class="workspace-grid duplicate-layout">
          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon red"><i data-lucide="trash-2" aria-hidden="true"></i></span>
              <div>
                <h2>מחיקה מלאה מ-TripInspo</h2>
                <p>טען יעד ומחק.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="deleteDestinationInput">יעד למחיקה</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateDeleteDestinationButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row">
                <i data-lucide="map-pin-x" aria-hidden="true"></i>
                <input id="deleteDestinationInput" type="text" placeholder="בחר יעד למחיקה מלאה" />
              </div>
              <div class="suggestions" id="deleteDestinationSuggestions"></div>
            </div>
            <div class="action-row">
              <button class="primary-action" type="button" id="loadDeletePlacesButton">
                <i data-lucide="download" aria-hidden="true"></i>
                <span>טען מקומות</span>
              </button>
              <button class="ghost-action" type="button" id="selectDeleteAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר/בטל הכל</span>
              </button>
            </div>
          </article>

          <article class="panel danger-panel">
            <div class="panel-heading">
              <span class="panel-icon red"><i data-lucide="shield-alert" aria-hidden="true"></i></span>
              <div>
                <h2>פעולה רגישה</h2>
                <p>נמחקים רק פריטים שהמשתמש פרסם.</p>
              </div>
            </div>
            <button class="danger-action wide" type="button" id="deleteSelectedPlacesButton">
              <i data-lucide="trash" aria-hidden="true"></i>
              <span>מחק מקומות מסומנים</span>
            </button>
            <p class="status-line" id="deleteStatus"></p>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">מקומות למחיקה</p>
              <h2>בחר נקודתית או הכל</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="deleteLoadedPill">0 מקומות</span>
              <span class="count-pill" id="deleteSelectedPill">0 מסומנים</span>
            </div>
          </div>
          <div class="cards-grid compact-grid" id="deleteCards"></div>
        </section>
      </div>

      <dialog class="image-dialog" id="imageDialog">
        <form method="dialog" class="image-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">חיפוש תמונות</p>
              <h2 id="imageDialogTitle">בחירת תמונה</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="action-row image-source-row">
            <button class="ghost-action small-action" type="button" data-image-source="unsplash">Unsplash</button>
            <button class="ghost-action small-action" type="button" data-image-source="wikimedia">Wikimedia</button>
            <button class="ghost-action small-action" type="button" data-image-source="pixabay">Pixabay</button>
          </div>
          <div class="image-search-row">
            <input id="imageSearchInput" class="plain-input" type="text" placeholder="חיפוש תמונה" />
            <button class="ghost-action" type="button" id="translateImageSearchButton"><i data-lucide="languages"></i><span>תרגם לאנגלית</span></button>
            <button class="primary-action" type="button" id="runImageSearchButton"><i data-lucide="search"></i><span>חפש</span></button>
          </div>
          <div class="image-results" id="imageResults"></div>
        </form>
      </dialog>

      <dialog class="image-dialog current-place-dialog" id="currentPlaceDialog">
        <form method="dialog" class="image-dialog-shell current-place-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">פרטי מקום</p>
              <h2 id="currentPlaceDialogTitle">מקום</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div id="currentPlaceDetails"></div>
          <div class="action-row split-actions">
            <button class="primary-action" type="button" id="editCurrentPlaceButton"><i data-lucide="square-pen"></i><span>עריכה</span></button>
            <button class="ghost-action danger-lite" type="button" id="deleteCurrentPlaceButton"><i data-lucide="trash-2"></i><span>מחיקה</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog current-filter-dialog" id="currentFilterDialog">
        <form method="dialog" class="image-dialog-shell current-filter-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">סינון מקומות</p>
              <h2>יעד ורדיוס</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="field-block">
            <label for="currentFilterDestinationInput">כתובת או יעד</label>
            <div class="field-mini-toolbar">
              <button class="mini-toggle" type="button" id="translateCurrentFilterDestinationButton">
                <i data-lucide="languages" aria-hidden="true"></i>
                <span>תרגם לאנגלית</span>
              </button>
            </div>
            <div class="search-input-row">
              <i data-lucide="map-pinned" aria-hidden="true"></i>
              <input id="currentFilterDestinationInput" type="text" placeholder="לדוגמה: Rome, Athens, תל אביב" autocomplete="off" />
            </div>
            <div class="suggestions" id="currentFilterDestinationSuggestions"></div>
          </div>
          <div class="selected-place" id="selectedCurrentFilterDestination">
            <i data-lucide="radar" aria-hidden="true"></i>
            <span>בחר נקודה מתוך ההשלמה האוטומטית.</span>
          </div>
          <div class="field-block">
            <label for="currentRadiusRange">מרחק להצגה</label>
            <div class="range-row">
              <input id="currentRadiusRange" type="range" min="1" max="150" step="1" value="50" />
              <b id="currentRadiusValue">50 ק"מ</b>
            </div>
          </div>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="clearCurrentFilterButton"><i data-lucide="rotate-ccw"></i><span>נקה</span></button>
            <button class="primary-action" type="button" id="applyCurrentFilterButton"><i data-lucide="check"></i><span>החל</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog edit-dialog" id="currentPlaceEditDialog">
        <form method="dialog" class="image-dialog-shell edit-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">עריכת מקום</p>
              <h2 id="currentPlaceEditTitle">מקום</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="edit-form-grid" id="currentPlaceEditFields"></div>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="searchEditPlaceImageButton"><i data-lucide="image"></i><span>חפש תמונה</span></button>
            <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור וסגור</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog edit-dialog" id="draftReviewDialog">
        <form method="dialog" class="image-dialog-shell edit-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">בדיקת כרטיסיה</p>
              <h2 id="draftReviewTitle">כרטיסיה</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="edit-form-grid" id="draftReviewFields"></div>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="searchDraftImageButton"><i data-lucide="image"></i><span>בחירת תמונה</span></button>
            <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>עדכן כרטיסיה</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog address-fix-dialog" id="draftAddressDialog">
        <form method="dialog" class="image-dialog-shell address-fix-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">תיקון כתובת וקואורדינטות</p>
              <h2 id="draftAddressTitle">בחירת כתובת</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="field-block">
            <label for="draftAddressInput">כתובת לחיפוש</label>
            <div class="search-input-row">
              <i data-lucide="map-pin" aria-hidden="true"></i>
              <input id="draftAddressInput" type="text" placeholder="כתוב כתובת מדויקת ובחר מההשלמה האוטומטית" autocomplete="off" />
            </div>
            <div class="suggestions" id="draftAddressSuggestions"></div>
          </div>
          <div class="selected-place" id="selectedDraftAddress">
            <i data-lucide="radar" aria-hidden="true"></i>
            <span>חובה לבחור כתובת מתוך ההשלמה האוטומטית כדי לעדכן קואורדינטות.</span>
          </div>
          <p class="status-line" id="draftAddressStatus"></p>
          <div class="action-row split-actions">
            <button class="ghost-action" value="cancel">ביטול</button>
            <button class="primary-action" type="button" id="applyDraftAddressButton"><i data-lucide="check"></i><span>עדכן כתובת</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog progress-dialog" id="importProgressDialog">
        <form method="dialog" class="image-dialog-shell progress-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">יוצר כרטיסיות</p>
              <h2>משלים אוטומטית נתונים</h2>
            </div>
          </div>
          <div class="progress-copy">
            <strong id="importProgressTitle">מתחיל...</strong>
            <p id="importProgressSubtitle">0 / 0</p>
            <p id="importProgressNote">אנחנו משלימים כתובות, תמונות ושדות חסרים.</p>
          </div>
          <div class="progress-track"><span id="importProgressBar"></span></div>
        </form>
      </dialog>

      <dialog class="image-dialog confirm-dialog" id="confirmDialog">
        <div class="image-dialog-shell confirm-dialog-shell">
          <div class="confirm-dialog-icon">
            <i data-lucide="circle-alert" id="confirmDialogIcon" aria-hidden="true"></i>
          </div>
          <div class="confirm-dialog-copy">
            <p class="eyebrow">צריך אישור</p>
            <h2 id="confirmDialogTitle">אישור פעולה</h2>
            <p id="confirmDialogMessage">להמשיך?</p>
          </div>
          <div class="action-row split-actions confirm-dialog-actions">
            <button class="ghost-action" type="button" id="confirmDialogCancelButton">ביטול</button>
            <button class="primary-action" type="button" id="confirmDialogConfirmButton">אישור</button>
          </div>
        </div>
      </dialog>
    `
  });

  attachSharedUi({
    activeKey: "places",
    requireAuth: true,
    onAuthed: (user, firebase) => {
      state.user = user;
      state.firebase = firebase;
      init();
    }
  });
}

function init() {
  installAdminInteractionGuards();
  bindCurrentPlaces();
  bindRefreshImages();
  bindApprovalTools();
  bindImport();
  bindDuplicateTools();
  bindDeleteTools();
  bindImageDialog();
  bindBrokenImages();
  bindOpeningHoursTools();
  setupUnsavedChangesWarning({
    hasUnsavedChanges: hasUnsavedPlacesWork,
    message: "יש לך עבודה שלא נשמרה בדף המקומות. לצאת מהעמוד בלי לשמור?"
  });
  setJsonPlaceholder();
  updatePromptPreview();
  if (state.view === "current") loadCurrentPlaces();
  if (state.view === "refresh-images") loadRefreshImagePlaces();
  if (state.view === "approve") loadApprovalPlaces();
  if (state.view === "broken-images") loadBrokenImages();
  refreshIcons();
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function installAdminInteractionGuards() {
  window.tripTapConfirm = confirmAction;
  if (window.__tripTapPlacesInteractionGuardsBound) return;
  window.__tripTapPlacesInteractionGuardsBound = true;

  window.addEventListener("beforeunload", (event) => {
    if (!isAiBusy()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("click", (event) => {
    if (!isAiBusy() || event.defaultPrevented) return;
    const link = event.target?.closest?.("a[href]");
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || /^javascript:/i.test(href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showAiBusyNotice();
  }, true);
}

function isAiBusy() {
  return state.isCheckingDuplicates || state.openingHoursSaving;
}

async function ensureFreshAdminAuthToken() {
  if (!state.user?.getIdToken) return;
  await state.user.getIdToken(true);
}

async function showAiBusyNotice() {
  if (state.aiBusyNoticeOpen) return;
  state.aiBusyNoticeOpen = true;
  try {
    await confirmAction({
      title: "ה-AI עדיין עובד",
      message: "אי אפשר לעזוב את הדף הנוכחי עד שהתשובה תסתיים. חכה לסיום הפעולה ואז תוכל לנווט כרגיל.",
      confirmText: "הבנתי",
      hideCancel: true,
      tone: "warning",
      icon: "loader-circle"
    });
  } finally {
    state.aiBusyNoticeOpen = false;
  }
}

function confirmAction({
  title = "אישור פעולה",
  message = "",
  confirmText = "אישור",
  cancelText = "ביטול",
  hideCancel = false,
  tone = "default",
  icon = "circle-alert"
} = {}) {
  const dialog = $("confirmDialog");
  if (!dialog?.showModal) return unavailableConfirmFallback(message || title);

  const titleEl = $("confirmDialogTitle");
  const messageEl = $("confirmDialogMessage");
  const confirmButton = $("confirmDialogConfirmButton");
  const cancelButton = $("confirmDialogCancelButton");
  const iconEl = $("confirmDialogIcon");
  if (!titleEl || !messageEl || !confirmButton || !cancelButton || !iconEl) {
    return unavailableConfirmFallback(message || title);
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  confirmButton.textContent = confirmText;
  cancelButton.textContent = cancelText;
  cancelButton.hidden = Boolean(hideCancel);
  iconEl.setAttribute("data-lucide", icon);
  dialog.dataset.tone = tone;
  refreshIcons();

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmButton.removeEventListener("click", onConfirm);
      cancelButton.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onDialogCancel);
      dialog.removeEventListener("close", onDialogClose);
      if (dialog.open) dialog.close();
      resolve(value);
    };
    const onConfirm = () => finish(true);
    const onCancel = () => finish(false);
    const onDialogCancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    const onDialogClose = () => finish(false);

    confirmButton.addEventListener("click", onConfirm);
    cancelButton.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onDialogCancel);
    dialog.addEventListener("close", onDialogClose);

    try {
      dialog.showModal();
      confirmButton.focus();
    } catch (_) {
      showToast(message || title, "warning");
      finish(false);
    }
  });
}

function unavailableConfirmFallback(message) {
  showToast(message || "צריך אישור פעולה, אבל חלון האישור לא זמין כרגע.", "warning");
  return Promise.resolve(false);
}

function bindCurrentPlaces() {
  setupDestinationSearch("currentFilter", $("currentFilterDestinationInput"), $("currentFilterDestinationSuggestions"), $("selectedCurrentFilterDestination"));
  $("reloadCurrentPlacesButton")?.addEventListener("click", loadCurrentPlaces);
  $("translateCurrentPlacesSearchButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("currentPlacesSearchInput", event.currentTarget);
    if (!translated) return;
    state.currentSearch = translated;
    renderCurrentPlaces();
  });
  $("translateCurrentFilterDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("currentFilterDestinationInput", event.currentTarget);
    if (translated) $("currentFilterDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("openCurrentFilterButton")?.addEventListener("click", () => {
    $("currentRadiusRange").value = String(state.currentRadiusKm);
    $("currentRadiusValue").textContent = `${state.currentRadiusKm} ק"מ`;
    $("currentFilterDialog")?.showModal();
  });
  $("currentRadiusRange")?.addEventListener("input", (event) => {
    state.currentRadiusKm = Number(event.target.value || 50);
    $("currentRadiusValue").textContent = `${state.currentRadiusKm} ק"מ`;
  });
  $("applyCurrentFilterButton")?.addEventListener("click", () => {
    $("currentFilterDialog")?.close();
    renderCurrentPlaces();
  });
  $("clearCurrentFilterButton")?.addEventListener("click", () => {
    state.destinations.currentFilter = null;
    state.currentRadiusKm = 50;
    if ($("currentFilterDestinationInput")) $("currentFilterDestinationInput").value = "";
    if ($("selectedCurrentFilterDestination")) $("selectedCurrentFilterDestination").innerHTML = `<i data-lucide="radar" aria-hidden="true"></i><span>בחר נקודה מתוך ההשלמה האוטומטית.</span>`;
    $("currentRadiusRange").value = "50";
    $("currentRadiusValue").textContent = `50 ק"מ`;
    $("currentFilterDialog")?.close();
    renderCurrentPlaces();
    refreshIcons();
  });
  $("currentPlacesSearchInput")?.addEventListener("input", (event) => {
    state.currentSearch = event.target.value;
    renderCurrentPlaces();
  });
  $("editCurrentPlaceButton")?.addEventListener("click", () => openCurrentPlaceEditDialog(state.selectedCurrentPlaceId));
  $("deleteCurrentPlaceButton")?.addEventListener("click", () => deleteCurrentPlace(state.selectedCurrentPlaceId));
  $("currentPlaceEditDialog")?.querySelector("form")?.addEventListener("submit", saveCurrentPlaceEdit);
  $("searchEditPlaceImageButton")?.addEventListener("click", () => {
    const query = [fieldValue("currentPlaceEditFields", "name"), fieldValue("currentPlaceEditFields", "destination"), fieldValue("currentPlaceEditFields", "location")].filter(Boolean).join(" ");
    openImageDialog(state.editingCurrentPlaceId, query, { kind: "currentEdit" });
  });
  $("draftReviewDialog")?.querySelector("form")?.addEventListener("submit", saveDraftReviewChanges);
  $("searchDraftImageButton")?.addEventListener("click", () => {
    const query = [fieldValue("draftReviewFields", "name"), fieldValue("draftReviewFields", "destination"), fieldValue("draftReviewFields", "location")].filter(Boolean).join(" ");
    openImageDialog(state.reviewingDraftId, query, { kind: "draftEdit" });
  });
  bindDraftAddressDialog();
}

function bindRefreshImages() {
  $("reloadRefreshImagesButton")?.addEventListener("click", () => {
    loadRefreshImagePlaces({ force: true });
  });
  $("selectAllRefreshImagesButton")?.addEventListener("click", toggleAllRefreshImages);
  $("saveRefreshImagesButton")?.addEventListener("click", saveSelectedRefreshImages);
  $("saveRefreshImagesFooterButton")?.addEventListener("click", saveSelectedRefreshImages);
}

function bindApprovalTools() {
  $("reloadApprovalPlacesButton")?.addEventListener("click", () => loadApprovalPlaces({ force: true }));
  $("loadApprovalPlacesButton")?.addEventListener("click", () => loadApprovalPlaces({ force: true }));
  $("selectApprovalAllButton")?.addEventListener("click", toggleAllApprovalPlaces);
  $("approveSelectedPlacesButton")?.addEventListener("click", approveSelectedPlaces);
}

function bindImport() {
  setupDestinationSearch("import", $("importDestinationInput"), $("importDestinationSuggestions"), $("selectedImportDestination"));
  $("importDestinationInput").addEventListener("input", updatePromptPreview);
  $("translateImportDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("importDestinationInput", event.currentTarget);
    if (!translated) return;
    updatePromptPreview();
    $("importDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("refreshPromptButton").addEventListener("click", updatePromptPreview);
  $("jumpToJsonButton")?.addEventListener("click", () => $("jsonPanel").scrollIntoView({ behavior: "smooth" }));
  $("copyPlacePromptButton").addEventListener("click", () => {
    updatePromptPreview();
    copyText(buildPlacePrompt(), "פרומפט המקומות הועתק.");
  });
  $("copyJsonSchemaButton").addEventListener("click", () => copyText(JSON.stringify([examplePlace()], null, 2), "JSON לדוגמה הועתק."));
  $("pasteJsonButton").addEventListener("click", async () => {
    $("jsonInput").value = await navigator.clipboard.readText();
    parseJsonInput();
  });
  $("clearJsonButton").addEventListener("click", () => {
    $("jsonInput").value = "";
    state.drafts = [];
    renderDrafts();
  });
  $("parseJsonButton").addEventListener("click", parseJsonInput);
  $("saveAllDraftsButton").addEventListener("click", saveAllDrafts);
  $("saveAllDraftsFooterButton")?.addEventListener("click", saveAllDrafts);
}

function bindDuplicateTools() {
  setupDestinationSearch("duplicates", $("duplicateDestinationInput"), $("duplicateDestinationSuggestions"));
  $("translateDuplicateDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("duplicateDestinationInput", event.currentTarget);
    if (translated) $("duplicateDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("duplicateAiModelSelect")?.addEventListener("change", (event) => {
    state.duplicateAiModel = event.target.value;
    saveAiPreference("duplicates", "model", state.duplicateAiModel);
    syncDuplicateAiControls();
  });
  $("duplicateAiThinkingSelect")?.addEventListener("change", (event) => {
    const nextValue = event.target.value;
    state.duplicateThinkingEnabled = nextValue !== "off";
    if (nextValue !== "off") state.duplicateReasoningEffort = nextValue;
    saveAiPreference("duplicates", "thinkingEnabled", state.duplicateThinkingEnabled);
    saveAiPreference("duplicates", "reasoningEffort", state.duplicateReasoningEffort);
    syncDuplicateAiControls();
  });
  $("loadDuplicatePlacesButton").addEventListener("click", () => loadPlacesFor("duplicates"));
  $("selectDuplicateAllButton").addEventListener("click", () => toggleAll("duplicates"));
  $("runLocalDuplicateButton").addEventListener("click", runLocalDuplicateCheck);
  $("copyDuplicatePromptButton").addEventListener("click", () => copyDuplicatePrompt());
  $("runAiDuplicateButton").addEventListener("click", runAiDuplicateCheck);
  $("deleteSelectedDuplicatesButton").addEventListener("click", () => deleteSelected("duplicates"));
  syncDuplicateAiControls();
}

function bindDeleteTools() {
  setupDestinationSearch("delete", $("deleteDestinationInput"), $("deleteDestinationSuggestions"));
  $("translateDeleteDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("deleteDestinationInput", event.currentTarget);
    if (translated) $("deleteDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("loadDeletePlacesButton").addEventListener("click", () => loadPlacesFor("delete"));
  $("selectDeleteAllButton").addEventListener("click", () => toggleAll("delete"));
  $("deleteSelectedPlacesButton").addEventListener("click", () => deleteSelected("delete"));
}

function bindOpeningHoursTools() {
  $("reloadOpeningHoursButton")?.addEventListener("click", () => loadOpeningHoursPlaces({ force: true }));
  $("loadOpeningHoursButton")?.addEventListener("click", () => loadOpeningHoursPlaces({ force: true }));
  $("selectOpeningHoursAllButton")?.addEventListener("click", toggleAllOpeningHours);
  $("updateOpeningHoursButton")?.addEventListener("click", updateSelectedOpeningHours);
  $("openingHoursAiModelSelect")?.addEventListener("change", (event) => {
    state.openingHoursAiModel = event.target.value;
    saveAiPreference("opening-hours", "model", state.openingHoursAiModel);
    syncOpeningHoursAiControls();
  });
  $("openingHoursAiThinkingSelect")?.addEventListener("change", (event) => {
    const nextValue = event.target.value;
    state.openingHoursThinkingEnabled = nextValue !== "off";
    if (nextValue !== "off") state.openingHoursReasoningEffort = nextValue;
    saveAiPreference("opening-hours", "thinkingEnabled", state.openingHoursThinkingEnabled);
    saveAiPreference("opening-hours", "reasoningEffort", state.openingHoursReasoningEffort);
    syncOpeningHoursAiControls();
  });
  syncOpeningHoursAiControls();
  renderOpeningHoursPlaces();
}

function setupDestinationSearch(key, input, suggestionsEl, selectedEl) {
  let timer = null;
  let requestSeq = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(timer);
    const query = input.value.trim();
    requestSeq += 1;
    const currentSeq = requestSeq;
    if (query.length < 2) {
      suggestionsEl.innerHTML = "";
      return;
    }
    suggestionsEl.innerHTML = `<div class="suggestion-empty">מחפש כתובת...</div>`;
    timer = window.setTimeout(async () => {
      let results = [];
      try {
        results = await searchAddress(query);
      } catch (error) {
        setAddressProviderStatus(`חיפוש נכשל: ${error.message}`, true);
      }
      if (currentSeq !== requestSeq) return;
      if (!results.length) {
        suggestionsEl.innerHTML = `<div class="suggestion-empty">לא נמצאו תוצאות. נסה שם מקום מלא יותר או כתובת עם עיר.</div>`;
        return;
      }
      suggestionsEl.innerHTML = results.map((item, index) => `
        <button class="suggestion-item" type="button" data-index="${index}">
          <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
          <b>${escapeHtml(item.sourceLabel || "OpenStreetMap")}</b>
          <i data-lucide="chevron-left"></i>
        </button>
      `).join("");
      suggestionsEl.querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
        const item = results[Number(button.dataset.index)];
        state.destinations[key] = await normalizeSelectedDestination(item);
        input.value = state.destinations[key].label;
        suggestionsEl.innerHTML = "";
        if (selectedEl) selectedEl.innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destinations[key].address)}</span><b>${escapeHtml(state.destinations[key].sourceLabel)}</b>`;
        if (key === "import") updatePromptPreview();
        refreshIcons();
      }));
      refreshIcons();
    }, 140);
  });
}

async function loadCurrentPlaces() {
  if (!state.user) {
    setStatus("currentPlacesStatus", "צריך להתחבר לפני טעינת מקומות.", true);
    return;
  }
  setStatus("currentPlacesStatus", "טוען את כל המקומות מ-TripInspo...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "public_places"));
    state.currentPlaces = snap.docs.map(docToPlace).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
    renderCurrentPlaces();
    const requestedPlaceId = new URLSearchParams(window.location.search).get("placeId");
    if (requestedPlaceId && state.currentPlaces.some((place) => place.id === requestedPlaceId)) {
      openCurrentPlaceDialog(requestedPlaceId);
    }
    setStatus("currentPlacesStatus", `נטענו ${state.currentPlaces.length} מקומות.`);
  } catch (error) {
    setStatus("currentPlacesStatus", `טעינת המקומות נכשלה: ${error.message}`, true);
  }
}

async function loadRefreshImagePlaces({ force = false } = {}) {
  if (!state.user) {
    setStatus("refreshImagesStatus", "צריך להתחבר לפני טעינת המקומות.", true);
    return;
  }
  if (state.refreshImageLoaded && !force) {
    renderRefreshImagePlaces();
    return;
  }
  setStatus("refreshImagesStatus", "טוען את כל המקומות ובודק מה עדיין לא עלה ל-R2...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "public_places"));
    const allPlaces = snap.docs.map(docToPlace).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
    state.currentPlaces = allPlaces;
    state.refreshImagePlaces = allPlaces.filter(placeNeedsR2Refresh);
    state.selectedRefreshImageIds.clear();
    state.refreshImageLoaded = true;
    renderRefreshImagePlaces();
    setStatus(
      "refreshImagesStatus",
      state.refreshImagePlaces.length
        ? `נמצאו ${state.refreshImagePlaces.length} כרטיסיות עם תמונה שעדיין לא נשמרה ב-R2.`
        : "כל הכרטיסיות כבר שמורות ב-R2."
    );
  } catch (error) {
    setStatus("refreshImagesStatus", `טעינת המקומות נכשלה: ${firebaseErrorMessage(error)}`, true);
  }
}

function placeNeedsR2Refresh(place) {
  const candidates = refreshImageSourceCandidates(place);
  return !candidates.some((url) => text(url).toLowerCase().includes("place_img"));
}

function renderRefreshImagePlaces() {
  if ($("refreshImagesCountPill")) {
    $("refreshImagesCountPill").textContent = `${state.refreshImagePlaces.length} לטעינה`;
  }
  if ($("refreshImagesSelectedPill")) {
    $("refreshImagesSelectedPill").textContent = `${state.selectedRefreshImageIds.size} מסומנים`;
  }
  const selectAllLabel = $("selectAllRefreshImagesButton")?.querySelector("span");
  if (selectAllLabel) {
    const allSelected = state.refreshImagePlaces.length > 0 && state.refreshImagePlaces.every((place) => state.selectedRefreshImageIds.has(place.id));
    selectAllLabel.textContent = allSelected ? "בטל בחירה" : "בחר הכל";
  }

  const container = $("refreshImagesCards");
  if (!container) return;
  if (!state.refreshImagePlaces.length) {
    container.innerHTML = emptyHtml(state.refreshImageLoaded ? "אין כרטיסיות שצריך לרענן." : "טוען...");
    syncRefreshImagesSaveFooter();
    refreshIcons();
    return;
  }
  container.innerHTML = state.refreshImagePlaces.map((place) => `<article class="place-card">
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-refresh-image-id="${escapeAttr(place.id)}" ${state.selectedRefreshImageIds.has(place.id) ? "checked" : ""} /> בחירה</label>
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <div class="place-meta">${escapeHtml(place.location || "אין כתובת")}<br>${escapeHtml(place.website || "אין אתר")}</div>
      <small class="place-meta">${escapeHtml(place.sharedByUsername || "")} · ${escapeHtml(imageCreditDisplay(place) || "תמונה חיצונית")}</small>
    </div>
  </article>`).join("");
  $$('[data-refresh-image-id]').forEach((checkbox) => checkbox.addEventListener("change", () => {
    const id = checkbox.dataset.refreshImageId;
    if (!id) return;
    checkbox.checked ? state.selectedRefreshImageIds.add(id) : state.selectedRefreshImageIds.delete(id);
    renderRefreshImagePlaces();
  }));
  syncRefreshImagesSaveFooter();
  applyPixabayResolvers(container);
  refreshIcons();
}

function toggleAllRefreshImages() {
  const allSelected = state.refreshImagePlaces.length > 0 && state.refreshImagePlaces.every((place) => state.selectedRefreshImageIds.has(place.id));
  state.selectedRefreshImageIds.clear();
  if (!allSelected) {
    state.refreshImagePlaces.forEach((place) => state.selectedRefreshImageIds.add(place.id));
  }
  renderRefreshImagePlaces();
}

function syncRefreshImagesSaveFooter() {
  const count = state.selectedRefreshImageIds.size;
  $("refreshImagesSaveFooter")?.classList.toggle("is-hidden", count === 0);
  if ($("saveRefreshImagesButtonLabel")) {
    $("saveRefreshImagesButtonLabel").textContent = count ? `שמור תמונה ב-R2 (${count})` : "שמור תמונה ב-R2";
  }
  if ($("saveRefreshImagesFooterButtonLabel")) {
    $("saveRefreshImagesFooterButtonLabel").textContent = count ? `שמור תמונה ב-R2 (${count})` : "שמור תמונה ב-R2";
  }
}

async function saveSelectedRefreshImages() {
  if (state.refreshImageSaving) return;
  if (!state.firebase || !state.user) {
    setStatus("refreshImagesStatus", "מחכה להתחברות...", true);
    return;
  }
  const selected = state.refreshImagePlaces.filter((place) => state.selectedRefreshImageIds.has(place.id));
  if (!selected.length) {
    setStatus("refreshImagesStatus", "בחר לפחות כרטיסיה אחת לפני שמירה.", true);
    return;
  }
  const confirmed = await confirmAction({
    title: "שמירת תמונות ב-R2",
    message: `להעלות ${selected.length} תמונות ל-R2 ולעדכן את הכרטיסיות?`,
    confirmText: "שמור ב-R2",
    tone: "warning",
    icon: "cloud-upload"
  });
  if (!confirmed) return;

  state.refreshImageSaving = true;
  if ($("saveRefreshImagesButton")) $("saveRefreshImagesButton").disabled = true;
  if ($("saveRefreshImagesFooterButton")) $("saveRefreshImagesFooterButton").disabled = true;
  setStatus("refreshImagesStatus", `שומר ${selected.length} כרטיסיות ומעלה את התמונות ל-R2...`);
  state.importProgress = {
    active: true,
    total: selected.length,
    completed: 0,
    label: "מעלה תמונות ל-R2",
    note: "מתחיל לשמור את הכרטיסיות שבחרת.",
    done: false
  };
  syncImportProgressDialog();
  $("importProgressDialog")?.showModal();

  const fs = state.firebase.firestore;
  let saved = 0;
  let failed = 0;
  let authRefreshFailed = false;
  let completed = 0;
  const failures = [];
  const savedIds = new Set();
  try {
    await ensureFreshAdminAuthToken();
    await mapWithConcurrency(selected, R2_REFRESH_CONCURRENCY, async (place, index) => {
      try {
        setStatus("refreshImagesStatus", `מעלה ל-R2: ${place.name || place.id}...`);
        state.importProgress = {
          active: true,
          total: selected.length,
          completed,
          label: place.name || `מקום ${index + 1}`,
          note: `שומר תמונה ל-R2. עד ${R2_REFRESH_CONCURRENCY} העלאות במקביל.`,
          done: false
        };
        syncImportProgressDialog();
        const uploadedDraft = await ensurePlaceImageOnR2(currentPlaceToDraft(place), {
          sourceCandidates: refreshImageSourceCandidates(place)
        });
        const url = uploadedDraft.coverImageUrl || "";
        if (!url || !isR2ImageUrl(url)) throw new Error("לא התקבל קישור R2 תקין");

        const data = {
          coverImageUrl: url,
          imageUrls: [url],
          imageStoredOnR2: true,
          coverPhotographerName: nullable(uploadedDraft.coverPhotographerName),
          coverPhotographerUsername: nullable(uploadedDraft.coverPhotographerUsername),
          pixabayId: null,
          pixabayPageUrl: null,
          updatedAt: fs.serverTimestamp()
        };
        const ref = fs.doc(state.firebase.db, "public_places", place.id);
        await fs.setDoc(ref, data, { merge: true });
        Object.assign(place, data);
        const currentPlace = state.currentPlaces.find((item) => item.id === place.id);
        if (currentPlace) Object.assign(currentPlace, data);
        saved += 1;
        savedIds.add(place.id);
        state.selectedRefreshImageIds.delete(place.id);
      } catch (error) {
        failed += 1;
        failures.push(`${place.name || place.id}: ${friendlyImageUploadError(error)}`);
        console.error("[refresh-images] save failed", place.id, error);
      } finally {
        completed += 1;
        state.importProgress = {
          active: true,
          total: selected.length,
          completed,
          label: place.name || `מקום ${index + 1}`,
          note: failed
            ? `נשמרו ${saved} מתוך ${selected.length}. נכשלו ${failed}. ${failures.slice(-1)[0] || ""}`
            : `נשמרו ${saved} מתוך ${selected.length}.`,
          done: false
        };
        syncImportProgressDialog();
      }
    });
    state.importProgress = {
      active: true,
      total: selected.length,
      completed: selected.length,
      label: failed ? "ההעלאה הסתיימה חלקית" : "העלאת התמונות הושלמה",
      note: failed
        ? `נשמרו ${saved} תמונות, נכשלו ${failed}. ${failures.slice(0, 2).join(" | ")}`
        : `כל ${saved} התמונות נשמרו ב-R2.`,
      done: true
    };
    syncImportProgressDialog();
    await sleep(900);
    $("importProgressDialog")?.close();
  } catch (error) {
    authRefreshFailed = true;
    failed = selected.length;
    setStatus("refreshImagesStatus", `שמירת התמונות נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    state.refreshImageSaving = false;
    if ($("saveRefreshImagesButton")) $("saveRefreshImagesButton").disabled = false;
    if ($("saveRefreshImagesFooterButton")) $("saveRefreshImagesFooterButton").disabled = false;
    state.importProgress.active = false;
    $("importProgressDialog")?.close();
  }

  state.refreshImagePlaces = state.refreshImagePlaces.filter((place) => !savedIds.has(place.id));
  setStatus(
    "refreshImagesStatus",
    authRefreshFailed
      ? `שמירת התמונות נכשלה בגלל הרשאות/חיבור. נסה להתחבר מחדש.`
      : failed
      ? `הועלו ${saved} תמונות ל-R2, נכשלו ${failed}: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? ` ועוד ${failures.length - 3}` : ""}`
      : `הועלו ${saved} תמונות ל-R2 בהצלחה.`,
    Boolean(failed || authRefreshFailed)
  );
  renderRefreshImagePlaces();
}

async function loadApprovalPlaces({ force = false } = {}) {
  if (state.approvalLoading) return;
  if (!state.user) {
    setStatus("approvalStatus", "צריך להתחבר לפני טעינת מקומות לאישור.", true);
    return;
  }
  if (state.approvalLoaded && !force) {
    renderApprovalPlaces();
    return;
  }

  state.approvalLoading = true;
  state.approvalLoaded = false;
  state.approvalPlaces = [];
  state.selectedApprovalIds.clear();
  renderApprovalPlaces();
  setStatus("approvalStatus", "טוען מקומות שלא עברו אישור מנהל...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "public_places"));
    const allPlaces = snap.docs.map(docToPlace).sort((a, b) => timestampMillis(b.sharedAt) - timestampMillis(a.sharedAt));
    state.currentPlaces = allPlaces;
    state.approvalPlaces = allPlaces.filter((place) => place.adminApproved !== true);
    state.approvalLoaded = true;
    renderApprovalPlaces();
    setStatus("approvalStatus", state.approvalPlaces.length ? `נטענו ${state.approvalPlaces.length} מקומות שממתינים לאישור מנהל.` : "אין כרגע מקומות שממתינים לאישור.");
  } catch (error) {
    setStatus("approvalStatus", `טעינת המקומות נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    state.approvalLoading = false;
    renderApprovalPlaces();
  }
}

function renderApprovalPlaces() {
  const count = state.approvalPlaces.length;
  const selectedCount = state.selectedApprovalIds.size;
  if ($("approvalLoadedPill")) $("approvalLoadedPill").textContent = `${count} ממתינים`;
  if ($("approvalQueuePill")) $("approvalQueuePill").textContent = `${count} לבדיקה`;
  if ($("approvalSelectedPill")) $("approvalSelectedPill").textContent = `${selectedCount} מסומנים`;
  const selectAllLabel = $("selectApprovalAllButton")?.querySelector("span");
  if (selectAllLabel) {
    const allSelected = count > 0 && state.approvalPlaces.every((place) => state.selectedApprovalIds.has(place.id));
    selectAllLabel.textContent = allSelected ? "בטל בחירה" : "בחר הכל";
  }
  if ($("approveSelectedPlacesButtonLabel")) $("approveSelectedPlacesButtonLabel").textContent = selectedCount ? `אשר מנהל ל-${selectedCount} מקומות` : "אשר מנהל";
  $("approvalSaveFooter")?.classList.toggle("is-hidden", selectedCount === 0);
  if ($("approveSelectedPlacesButton")) $("approveSelectedPlacesButton").disabled = state.approvalSaving;

  const container = $("approvalCards");
  if (!container) return;
  if (!count) {
    container.innerHTML = emptyHtml(state.approvalLoading ? "טוען מקומות חדשים..." : state.approvalLoaded ? "אין מקומות שממתינים לאישור." : "לחץ טען מקומות חדשים כדי להתחיל.");
    refreshIcons();
    return;
  }

  container.innerHTML = state.approvalPlaces.map(renderApprovalCard).join("");
  container.querySelectorAll("[data-approval-card-id]").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest("a,button,input,label")) return;
    openCurrentPlaceDialog(card.dataset.approvalCardId);
  }));
  container.querySelectorAll("[data-approval-id]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const id = checkbox.dataset.approvalId;
    if (!id) return;
    checkbox.checked ? state.selectedApprovalIds.add(id) : state.selectedApprovalIds.delete(id);
    renderApprovalPlaces();
  }));
  container.querySelectorAll("[data-approval-detail-id]").forEach((button) => button.addEventListener("click", () => openCurrentPlaceDialog(button.dataset.approvalDetailId)));
  applyPixabayResolvers(container);
  refreshIcons();
}

function renderApprovalCard(place) {
  const searchUrl = webSearchUrl([place.name, place.destination || destinationHint(place), place.location].filter(Boolean).join(" "));
  return `<article class="place-card approval-card" data-approval-card-id="${escapeAttr(place.id)}">
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row approval-check"><input type="checkbox" data-approval-id="${escapeAttr(place.id)}" ${state.selectedApprovalIds.has(place.id) ? "checked" : ""} /> בחירה לאישור</label>
      <div class="compact-card-title-row">
        <h3>${escapeHtml(place.name || "ללא שם")}</h3>
        <span class="booking-link-pill">${escapeHtml(placeTypeLabel(place.type))}</span>
      </div>
      ${renderPlaceTags(place)}
      <p class="compact-card-summary">${escapeHtml(place.shortDescription || place.description || "אין פירוט קצר")}</p>
      <div class="compact-card-meta">
        <span>${escapeHtml(place.destination || destinationHint(place) || "ללא יעד")}</span>
        <span>${escapeHtml(place.sharedByUsername || "משתמש")}</span>
      </div>
      <div class="card-actions approval-card-actions">
        <a class="ghost-action small-action" href="${escapeAttr(searchUrl)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="search-check" aria-hidden="true"></i>
          <span>חיפוש באינטרנט</span>
        </a>
        <button class="ghost-action small-action" type="button" data-approval-detail-id="${escapeAttr(place.id)}" onclick="event.stopPropagation();">
          <i data-lucide="panel-top-open" aria-hidden="true"></i>
          <span>פרטים</span>
        </button>
      </div>
    </div>
  </article>`;
}

function toggleAllApprovalPlaces() {
  const allSelected = state.approvalPlaces.length > 0 && state.approvalPlaces.every((place) => state.selectedApprovalIds.has(place.id));
  state.selectedApprovalIds.clear();
  if (!allSelected) state.approvalPlaces.forEach((place) => state.selectedApprovalIds.add(place.id));
  renderApprovalPlaces();
}

async function approveSelectedPlaces() {
  if (state.approvalSaving) return;
  if (!state.user) {
    setStatus("approvalStatus", "צריך להתחבר לפני אישור מקומות.", true);
    return;
  }
  const selected = state.approvalPlaces.filter((place) => state.selectedApprovalIds.has(place.id));
  if (!selected.length) {
    setStatus("approvalStatus", "בחר לפחות מקום אחד לאישור.", true);
    return;
  }
  const confirmed = await confirmAction({
    title: "אישור מקומות לפרסום",
    message: `לאשר ${selected.length} מקומות ולסמן אותם כמאושרים על ידי מנהל?`,
    confirmText: "אשר מקומות",
    tone: "warning",
    icon: "shield-check"
  });
  if (!confirmed) return;

  state.approvalSaving = true;
  renderApprovalPlaces();
  setStatus("approvalStatus", `מאשר ${selected.length} מקומות...`);
  const fs = state.firebase.firestore;
  let approved = 0;
  const failures = [];
  const approvedIds = new Set();
  try {
    await ensureFreshAdminAuthToken();
    for (const place of selected) {
      try {
        const data = {
          adminApproved: true,
          adminApprovedAt: fs.serverTimestamp(),
          adminApprovedBy: state.user.email || "admin",
          adminApprovedByUid: state.user.uid || null,
          updatedAt: fs.serverTimestamp()
        };
        const ref = fs.doc(state.firebase.db, "public_places", place.id);
        await fs.setDoc(ref, data, { merge: true });
        Object.assign(place, data, { adminApproved: true });
        const currentPlace = state.currentPlaces.find((item) => item.id === place.id);
        if (currentPlace) Object.assign(currentPlace, data, { adminApproved: true });
        approved += 1;
        approvedIds.add(place.id);
        state.selectedApprovalIds.delete(place.id);
      } catch (error) {
        failures.push(`${place.name || place.id}: ${firebaseErrorMessage(error)}`);
      }
    }
  } catch (error) {
    failures.push(firebaseErrorMessage(error));
  } finally {
    state.approvalSaving = false;
  }
  state.approvalPlaces = state.approvalPlaces.filter((place) => !approvedIds.has(place.id));
  renderApprovalPlaces();
  setStatus(
    "approvalStatus",
    failures.length ? `אושרו ${approved} מקומות. ${failures.length} נכשלו: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? ` ועוד ${failures.length - 3}` : ""}` : `אושרו ${approved} מקומות על ידי מנהל.`,
    failures.length > 0
  );
}

async function loadOpeningHoursPlaces({ force = false } = {}) {
  if (state.openingHoursLoading) return;
  if (!state.user) {
    setStatus("openingHoursStatus", "צריך להתחבר לפני טעינת המקומות.", true);
    return;
  }
  if (state.openingHoursLoaded && !force) {
    renderOpeningHoursPlaces();
    return;
  }

  state.openingHoursLoading = true;
  state.openingHoursLoaded = false;
  state.openingHoursPlaces = [];
  state.selectedOpeningHoursIds.clear();
  renderOpeningHoursPlaces();
  setStatus("openingHoursStatus", "טוען מקומות מ-Firestore ובודק פורמט שעות...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "public_places"));
    const allPlaces = snap.docs.map(docToPlace).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
    state.currentPlaces = allPlaces;
    state.openingHoursPlaces = allPlaces.filter(placeNeedsOpeningHoursFix);
    state.openingHoursLoaded = true;
    renderOpeningHoursPlaces();
    setStatus(
      "openingHoursStatus",
      state.openingHoursPlaces.length
        ? `נמצאו ${state.openingHoursPlaces.length} מקומות עם שעות שהאפליקציה לא יודעת לקרוא.`
        : "לא נמצאו מקומות שדורשים תיקון שעות."
    );
  } catch (error) {
    setStatus("openingHoursStatus", `טעינת המקומות נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    state.openingHoursLoading = false;
    renderOpeningHoursPlaces();
  }
}

function placeNeedsOpeningHoursFix(place) {
  const hours = text(place.hours);
  if (!hours) return false;
  if (place.hoursAdminApproved === true) return false;
  return !parseAdminOpeningHours(hours);
}

function renderOpeningHoursPlaces() {
  const count = state.openingHoursPlaces.length;
  if ($("openingHoursLoadedPill")) $("openingHoursLoadedPill").textContent = `${count} מקומות`;
  if ($("openingHoursProblemPill")) $("openingHoursProblemPill").textContent = `${count} לא קריאות`;
  if ($("openingHoursSelectedPill")) $("openingHoursSelectedPill").textContent = `${state.selectedOpeningHoursIds.size} מסומנים`;
  const selectAllLabel = $("selectOpeningHoursAllButton")?.querySelector("span");
  if (selectAllLabel) {
    const allSelected = count > 0 && state.openingHoursPlaces.every((place) => state.selectedOpeningHoursIds.has(place.id));
    selectAllLabel.textContent = allSelected ? "בטל בחירה" : "בחר הכל";
  }
  const updateLabel = $("updateOpeningHoursButtonLabel");
  if (updateLabel) {
    const selectedCount = state.selectedOpeningHoursIds.size;
    updateLabel.textContent = selectedCount ? `עדכן שעות פתיחה (${selectedCount})` : "עדכן שעות פתיחה";
  }
  const updateButton = $("updateOpeningHoursButton");
  if (updateButton) updateButton.disabled = state.openingHoursSaving;
  syncOpeningHoursAiControls();

  renderOpeningHoursLivePanel();
  const container = $("openingHoursCards");
  if (!container) return;
  if (!count) {
    container.innerHTML = emptyHtml(
      state.openingHoursLoading
        ? "טוען מקומות..."
        : state.openingHoursLoaded
          ? "אין מקומות שדורשים תיקון שעות."
          : "לחץ טען מקומות כדי להתחיל."
    );
    refreshIcons();
    return;
  }

  container.innerHTML = state.openingHoursPlaces.map(renderOpeningHoursCard).join("");
  $$("[data-opening-hours-id]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const id = checkbox.dataset.openingHoursId;
    if (!id) return;
    checkbox.checked ? state.selectedOpeningHoursIds.add(id) : state.selectedOpeningHoursIds.delete(id);
    renderOpeningHoursPlaces();
  }));
  refreshIcons();
}

function renderOpeningHoursCard(place) {
  const searchUrl = webSearchUrl([place.name, place.destination || destinationHint(place), "opening hours"].filter(Boolean).join(" "));
  const rawHours = text(place.hours);
  return `<article class="place-card opening-hours-card">
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-opening-hours-id="${escapeAttr(place.id)}" ${state.selectedOpeningHoursIds.has(place.id) ? "checked" : ""} /> בחירה</label>
      <div class="compact-card-title-row">
        <h3>${escapeHtml(place.name || "ללא שם")}</h3>
        <span class="booking-link-pill">לא קריא</span>
      </div>
      <div class="compact-card-meta">
        <span>${escapeHtml(place.destination || destinationHint(place) || "ללא יעד")}</span>
        <span>${escapeHtml(place.location || "אין כתובת")}</span>
      </div>
      <pre class="opening-hours-raw">${escapeHtml(rawHours)}</pre>
      <div class="card-actions">
        <a class="ghost-action small-action" href="${escapeAttr(searchUrl)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="search-check" aria-hidden="true"></i>
          <span>חיפוש באינטרנט</span>
        </a>
      </div>
    </div>
  </article>`;
}

function toggleAllOpeningHours() {
  const allSelected = state.openingHoursPlaces.length > 0 && state.openingHoursPlaces.every((place) => state.selectedOpeningHoursIds.has(place.id));
  state.selectedOpeningHoursIds.clear();
  if (!allSelected) state.openingHoursPlaces.forEach((place) => state.selectedOpeningHoursIds.add(place.id));
  renderOpeningHoursPlaces();
}

async function updateSelectedOpeningHours() {
  if (state.openingHoursSaving) return;
  if (!state.user) {
    setStatus("openingHoursStatus", "צריך להתחבר לפני עדכון שעות.", true);
    return;
  }
  const selected = state.openingHoursPlaces.filter((place) => state.selectedOpeningHoursIds.has(place.id));
  if (!selected.length) {
    setStatus("openingHoursStatus", "בחר לפחות מקום אחד לפני עדכון.", true);
    return;
  }
  const confirmed = await confirmAction({
    title: "תיקון שעות עם AI",
    message: `לעדכן שעות פתיחה עבור ${selected.length} מקומות ולסמן אותם בשדה אושר השעות? בזמן שה-AI עובד אי אפשר לעזוב את הדף.`,
    confirmText: "התחל תיקון",
    tone: "warning",
    icon: "clock"
  });
  if (!confirmed) return;

  state.openingHoursSaving = true;
  state.openingHoursLiveReasoning = "";
  state.openingHoursLiveAnswer = "";
  state.openingHoursLiveModel = null;
  renderOpeningHoursPlaces();
  syncOpeningHoursAiControls();
  setStatus("openingHoursStatus", `שולח ${selected.length} מקומות ל-${aiModeSummary(state.openingHoursAiModel, state.openingHoursThinkingEnabled, state.openingHoursReasoningEffort)}...`);

  const fs = state.firebase.firestore;
  let saved = 0;
  const failures = [];
  const savedIds = new Set();
  try {
    await ensureFreshAdminAuthToken();
    const batches = chunkArray(selected, 20);
    for (const [batchIndex, batch] of batches.entries()) {
      setStatus("openingHoursStatus", `מעבד קבוצה ${batchIndex + 1} מתוך ${batches.length}...`);
      const result = await requestOpeningHoursFix(batch);
      state.openingHoursLiveAnswer = result.rawText || state.openingHoursLiveAnswer;
      state.openingHoursLiveModel = result.model || state.openingHoursLiveModel;
      renderOpeningHoursLivePanel();
      const byId = new Map(batch.map((place) => [place.id, place]));
      const returnedIds = new Set();
      for (const item of result.items) {
        const place = byId.get(item.place_id);
        if (!place) continue;
        returnedIds.add(place.id);
        const normalizedHours = text(item.normalized_hours);
        if (!isAcceptableNormalizedHours(normalizedHours)) {
          failures.push(`${place.name || place.id}: ה-AI החזיר פורמט לא תקין`);
          continue;
        }
        try {
          const data = {
            hours: normalizedHours,
            hoursAdminApproved: true,
            hoursReviewedAt: fs.serverTimestamp(),
            hoursReviewedBy: state.user.email || state.user.uid || "admin",
            hoursAiModel: result.model || state.openingHoursAiModel,
            updatedAt: fs.serverTimestamp()
          };
          if (normalizedHours !== text(place.hours)) data.hoursOriginalBeforeAdminFix = text(place.hours);
          const ref = fs.doc(state.firebase.db, "public_places", place.id);
          await fs.setDoc(ref, data, { merge: true });
          Object.assign(place, data, { hours: normalizedHours, hoursAdminApproved: true });
          saved += 1;
          savedIds.add(place.id);
          state.selectedOpeningHoursIds.delete(place.id);
        } catch (error) {
          failures.push(`${place.name || place.id}: ${firebaseErrorMessage(error)}`);
        }
      }
      batch
        .filter((place) => !returnedIds.has(place.id))
        .forEach((place) => failures.push(`${place.name || place.id}: ה-AI לא החזיר תוצאה למקום הזה`));
    }
  } catch (error) {
    failures.push(error.message || String(error));
  } finally {
    state.openingHoursSaving = false;
  }

  state.openingHoursPlaces = state.openingHoursPlaces.filter((place) => !savedIds.has(place.id));
  renderOpeningHoursPlaces();
  setStatus(
    "openingHoursStatus",
    failures.length
      ? `עודכנו ${saved} מקומות. ${failures.length} נכשלו: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? ` ועוד ${failures.length - 3}` : ""}`
      : `עודכנו ${saved} מקומות וסומנו כמאושרים.`,
    failures.length > 0
  );
}

async function requestOpeningHoursFix(places) {
  const idToken = await state.user.getIdToken();
  const response = await fetch(OPENING_HOURS_AI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({
      feature: "admin_tool",
      systemPrompt: OPENING_HOURS_SYSTEM_PROMPT,
      userPrompt: buildOpeningHoursPrompt(places),
      maxTokens: 8192,
      preferredModel: state.openingHoursAiModel,
      thinkingEnabled: state.openingHoursThinkingEnabled,
      reasoningEffort: state.openingHoursReasoningEffort,
      temperature: thinkingTemperature(state.openingHoursThinkingEnabled, state.openingHoursReasoningEffort),
      jsonObjectResponse: true,
      stream: true
    })
  });
  if (!response.ok) throw new Error(await response.text());
  const payload = await readDeepSeekResponse(response, {
    getFallbackModel: () => state.openingHoursAiModel,
    onModel: (model) => {
      state.openingHoursLiveModel = model;
    },
    onReasoningDelta: (delta) => {
      state.openingHoursLiveReasoning = appendLiveText(state.openingHoursLiveReasoning, delta);
    },
    onContentDelta: (delta) => {
      state.openingHoursLiveAnswer = appendLiveText(state.openingHoursLiveAnswer, delta);
    },
    onText: (value) => {
      state.openingHoursLiveAnswer = value;
    },
    render: renderOpeningHoursLivePanel
  });
  const rawText = payload.text || "";
  const decoded = JSON.parse(extractJsonObjectText(rawText));
  const items = Array.isArray(decoded?.places) ? decoded.places : [];
  return {
    model: payload.model || state.openingHoursAiModel,
    rawText,
    items: items
      .map((item) => ({
        place_id: text(item?.place_id),
        normalized_hours: text(item?.normalized_hours),
        approved: item?.approved === true,
        note: text(item?.note)
      }))
      .filter((item) => item.place_id)
  };
}

function buildOpeningHoursPrompt(places) {
  return JSON.stringify({
    task: "Normalize existing opening-hours text for Trip Planner. Do not invent hours.",
    expected_output: {
      places: [
        {
          place_id: "same id",
          normalized_hours: "seven explicit Hebrew day lines, or מומלץ לבדוק באתר",
          approved: true,
          note: ""
        }
      ]
    },
    places: places.map((place) => ({
      place_id: place.id,
      name: place.name || "",
      destination: place.destination || destinationHint(place) || "",
      address: place.location || "",
      website: place.website || "",
      raw_hours: place.hours || ""
    }))
  }, null, 2);
}

function renderOpeningHoursLivePanel() {
  const panel = $("openingHoursLivePanel");
  if (!panel) return;
  const hasContent = text(state.openingHoursLiveReasoning) || text(state.openingHoursLiveAnswer);
  panel.classList.toggle("is-hidden", !hasContent);
  if ($("openingHoursLiveMeta")) $("openingHoursLiveMeta").textContent = aiModeSummary(state.openingHoursLiveModel || state.openingHoursAiModel, state.openingHoursThinkingEnabled, state.openingHoursReasoningEffort);
  if ($("openingHoursLiveReasoning")) $("openingHoursLiveReasoning").textContent = state.openingHoursLiveReasoning.trim() || "אין תוכן חשיבה להצגה.";
  if ($("openingHoursLiveAnswer")) $("openingHoursLiveAnswer").textContent = state.openingHoursLiveAnswer || "אין תשובה להצגה.";
}

function isAcceptableNormalizedHours(value) {
  const hours = text(value);
  if (!hours) return false;
  if (isCheckWebsiteHours(hours)) return true;
  return Boolean(parseAdminOpeningHours(hours));
}

function isCheckWebsiteHours(value) {
  return /מומלץ\s*לבדוק\s*באתר|בדקו?\s*באתר|יש\s*לבדוק\s*באתר|ראו?\s*באתר/i.test(text(value));
}

function parseAdminOpeningHours(input) {
  const raw = text(input);
  if (!raw) return null;
  const days = new Set();
  const dayNames = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  const segments = raw
    .split(/[\n;،]/)
    .flatMap((part) => part.split(/,\s*(?=ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/))
    .map((item) => item.trim())
    .filter(Boolean);
  for (const segment of segments) {
    const dayMatch = adminHoursDayRangeRe().exec(segment);
    if (!dayMatch || dayMatch[2]) continue;
    const isClosed = /(סגור|closed)/i.test(segment);
    const ranges = extractAdminHourRanges(segment);
    if (isClosed || ranges.length) days.add(dayMatch[1]);
  }
  return dayNames.every((day) => days.has(day)) ? { explicitDays: true, fullWeek: true } : null;
}

function adminHoursDayRangeRe() {
  return /(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(?:\s*[-–—]\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת))?/;
}

function extractAdminHourRanges(segment) {
  const ranges = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*[-–—]\s*(\d{1,2})(?::(\d{2}))?/g;
  let match;
  while ((match = re.exec(segment)) !== null) {
    const sh = Number(match[1]);
    const sm = Number(match[2] || 0);
    const eh = Number(match[3]);
    const em = Number(match[4] || 0);
    if (sh <= 24 && eh <= 24 && sm <= 59 && em <= 59) ranges.push([sh * 60 + sm, eh * 60 + em]);
  }
  return ranges;
}

function filteredCurrentPlaces() {
  const query = normalize(state.currentSearch);
  const anchor = state.destinations.currentFilter;
  return state.currentPlaces.filter((place) => {
    if (query && !currentPlaceSearchText(place).includes(query)) return false;
    if (!anchor) return true;
    if (place.lat == null || place.lon == null) return false;
    return distanceKm(anchor.lat, anchor.lon, place.lat, place.lon) <= state.currentRadiusKm;
  });
}

function currentPlaceSearchText(place) {
  return [
    place.name,
    place.destination,
    place.location,
    place.type,
    place.shortDescription,
    place.description,
    place.sharedByUsername,
    place.sharedByUid
  ].map(normalize).join(" ");
}

function renderCurrentPlaces() {
  const visible = filteredCurrentPlaces();
  if ($("currentPlacesCountPill")) $("currentPlacesCountPill").textContent = `${state.currentPlaces.length} מקומות`;
  if ($("currentPlacesFilteredPill")) $("currentPlacesFilteredPill").textContent = `${visible.length} מוצגים`;
  if ($("currentPlacesFilterPill")) $("currentPlacesFilterPill").textContent = state.destinations.currentFilter ? `${state.currentRadiusKm} ק"מ מ-${state.destinations.currentFilter.label}` : "ללא סינון מרחק";
  const container = $("currentPlacesGrid");
  if (!container) return;
  container.innerHTML = visible.map(renderCurrentPlaceCard).join("") || emptyHtml("אין מקומות להצגה.");
  container.querySelectorAll("[data-current-place-id]").forEach((card) => {
    card.addEventListener("click", () => openCurrentPlaceDialog(card.dataset.currentPlaceId));
  });
  applyPixabayResolvers(container);
  refreshIcons();
}

function renderCurrentPlaceCard(place) {
  return `<article class="place-card current-place-card" data-current-place-id="${escapeAttr(place.id)}">
    ${imageHtml(place)}
    <div class="place-body">
      <div class="compact-card-title-row">
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <span class="booking-link-pill">${escapeHtml(placeTypeLabel(place.type))}</span>
      </div>
      ${renderPlaceTags(place)}
      <p class="compact-card-summary">${escapeHtml(place.shortDescription || place.description || "אין תיאור")}</p>
      <div class="compact-card-meta">
      <span>${escapeHtml(place.destination || destinationHint(place) || "ללא יעד")}</span>
      <span>${escapeHtml(place.sharedByUsername || "משתמש")}</span>
      </div>
    </div>
    </article>`;
}

function openCurrentPlaceDialog(placeId) {
  const place = state.currentPlaces.find((item) => item.id === placeId);
  if (!place) return;
  state.selectedCurrentPlaceId = placeId;
  $("currentPlaceDialogTitle").textContent = place.name || "מקום";
  $("currentPlaceDetails").innerHTML = renderCurrentPlaceDetails(place);
  $("currentPlaceDialog").showModal();
  applyPixabayResolvers($("currentPlaceDetails"));
  refreshIcons();
}

function renderCurrentPlaceDetails(place) {
  const destination = text(place.destination || destinationHint(place));
  const location = text(place.location);
  const website = normalizedExternalUrl(place.website);
  const reservation = reservationDisplayLabel(place.reservationLabel);
  const hasCoords = place.lat != null && place.lon != null;
  const shortDescription = text(place.shortDescription);
  const description = text(place.description);
  const adminDetails = currentPlaceAdminDetails(place, website);
  return `<div class="admin-place-detail-sheet">
    <section class="admin-place-hero">
      ${imageHtml(place)}
      <div class="admin-place-hero-label">
        <span>${escapeHtml(place.coverEmoji || PLACE_EMOJI[place.type] || "📌")}</span>
        <b>${escapeHtml(placeTypeLabel(place.type))}</b>
      </div>
    </section>

    <section class="admin-place-title-block">
      <h3>${escapeHtml(place.name || "מקום ללא שם")}</h3>
      ${renderCurrentPlaceMetaChips(place)}
    </section>

    ${shortDescription ? `<section class="admin-place-short-description">${escapeHtml(shortDescription)}</section>` : ""}
    ${place.isAtmosphereImage ? `<section class="admin-place-warning"><i data-lucide="sparkles" aria-hidden="true"></i><span>זו תמונת אווירה ואינה קשורה בהכרח למקום עצמו.</span></section>` : ""}

    <section class="admin-place-actions">
      ${hasCoords ? `<a class="primary-action" href="${escapeAttr(googleMapsUrl(place))}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation" aria-hidden="true"></i><span>ניווט למקום</span></a>` : `<button class="primary-action" type="button" disabled><i data-lucide="navigation" aria-hidden="true"></i><span>אין קואורדינטות</span></button>`}
      ${website ? `<a class="ghost-action" href="${escapeAttr(website)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link" aria-hidden="true"></i><span>פתח אתר</span></a>` : ""}
    </section>

    <section class="admin-place-detail-card-grid">
      ${destination ? detailCardHtml("map", "יעד", destination) : ""}
      ${location ? detailCardHtml("map-pin", "כתובת", location) : ""}
      ${text(place.hours) ? detailCardHtml("clock", "שעות פתיחה", text(place.hours)) : ""}
      ${reservation ? detailCardHtml("calendar-check", "הזמנה מראש", reservation) : ""}
      ${website ? detailCardHtml("globe", "אתר המקום", website) : ""}
      ${hasCoords ? detailCardHtml("crosshair", "קואורדינטות", `${place.lat}, ${place.lon}`) : ""}
    </section>

    <section class="admin-place-section">
      <h4>פירוט מלא</h4>
      <div class="admin-place-description">${escapeHtml(description && description !== shortDescription ? description : "אין תיאור נוסף עבור המקום כרגע.")}</div>
    </section>

    ${(location || hasCoords) ? `<section class="admin-place-section">
      <h4>מיקום וקישורי ניווט</h4>
      ${location ? `<div class="admin-place-location-note"><i data-lucide="map-pinned" aria-hidden="true"></i><span>${escapeHtml(location)}</span></div>` : ""}
      ${hasCoords ? `<div class="admin-place-map-links">
        <a class="ghost-action small-action" href="${escapeAttr(googleMapsUrl(place))}" target="_blank" rel="noopener noreferrer"><i data-lucide="map" aria-hidden="true"></i><span>Google Maps</span></a>
        <a class="ghost-action small-action" href="${escapeAttr(wazeUrl(place))}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation-2" aria-hidden="true"></i><span>Waze</span></a>
        <a class="ghost-action small-action" href="${escapeAttr(appleMapsUrl(place))}" target="_blank" rel="noopener noreferrer"><i data-lucide="compass" aria-hidden="true"></i><span>Apple Maps</span></a>
      </div>` : ""}
    </section>` : ""}

    <section class="admin-place-section">
      <h4>מידע מנהל</h4>
      <div class="detail-list admin-place-admin-list">
        ${adminDetails.map(([label, value]) => `<div><b>${escapeHtml(label)}</b><span>${escapeHtml(value || "-")}</span></div>`).join("")}
      </div>
    </section>
  </div>`;
}

function renderCurrentPlaceMetaChips(place) {
  const chips = [
    `<span class="info-chip rating-chip">⭐ ${escapeHtml(place.rating ? Number(place.rating).toFixed(1) : "ללא דירוג")}</span>`,
    `<span class="info-chip type-chip">${escapeHtml(place.coverEmoji || PLACE_EMOJI[place.type] || "📌")} ${escapeHtml(placeTypeLabel(place.type))}</span>`
  ];
  chips.push(`<span class="info-chip ${place.adminApproved === true ? "approval-chip" : "pending-chip"}">${place.adminApproved === true ? "אושר מנהל" : "ממתין לאישור"}</span>`);
  if (place.hoursAdminApproved === true) chips.push(`<span class="info-chip hours-chip">אושרו שעות</span>`);
  if (place.isKosher) chips.push(`<span class="info-chip kosher-chip">כשר ✓</span>`);
  if (text(place.foodType)) chips.push(`<span class="info-chip food-chip">${escapeHtml(foodEmoji(place.foodType))} ${escapeHtml(foodTypeLabel(place.foodType))}</span>`);
  return `<div class="place-card-tags admin-place-meta-chips">${chips.join("")}</div>`;
}

function detailCardHtml(icon, label, value) {
  return `<article class="admin-place-detail-card">
    <span class="detail-card-icon"><i data-lucide="${escapeAttr(icon)}" aria-hidden="true"></i></span>
    <div><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>
  </article>`;
}

function currentPlaceAdminDetails(place, website) {
  return [
    ["ID", place.id],
    ["שם", place.name],
    ["יעד", place.destination || destinationHint(place)],
    ["סוג", place.type],
    ["כתובת", place.location],
    ["שעות", place.hours],
    ["אתר", website || place.website],
    ["הזמנה", place.reservationLabel],
    ["כשר", place.isKosher ? "כן" : "לא"],
    ["סוג אוכל", place.foodType],
    ["דירוג", place.rating],
    ["תמונת אווירה", place.isAtmosphereImage ? "כן" : "לא"],
    ["URL תמונה", imageCandidates(place)[0] || place.coverImageUrl],
    ["קרדיט תמונה", imageCreditDisplay(place)],
    ["Pixabay ID", place.pixabayId],
    ["Pixabay Page", place.pixabayPageUrl],
    ["Emoji", place.coverEmoji],
    ["צבע רקע", place.coverBackgroundHex],
    ["אישור מנהל", place.adminApproved === true ? "אושר על ידי מנהל" : "לא אושר עדיין"],
    ["אושר בתאריך", formatAdminDate(place.adminApprovedAt)],
    ["אושר על ידי", place.adminApprovedBy],
    ["אישור שעות", place.hoursAdminApproved === true ? "אושר השעות" : "לא סומן"],
    ["שעות אושרו בתאריך", formatAdminDate(place.hoursReviewedAt)],
    ["שעות אושרו על ידי", place.hoursReviewedBy],
    ["משתף", [place.sharedByUsername, place.sharedByUid].filter(Boolean).join(" · ")],
    ["שיתוף", formatAdminDate(place.sharedAt)],
    ["עדכון", formatAdminDate(place.updatedAt)]
  ];
}

function reservationDisplayLabel(value) {
  const key = text(value);
  if (!key || key === "reservation_no" || key === "no") return "";
  if (key === "reservation_yes" || key === "yes") return "חובה";
  if (key === "reservation_recommended" || key === "recommended") return "מומלץ";
  return key;
}

function normalizedExternalUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function googleMapsUrl(place) {
  if (place.lat != null && place.lon != null) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([place.name, place.location].filter(Boolean).join(" "))}`;
}

function wazeUrl(place) {
  return `https://waze.com/ul?ll=${encodeURIComponent(`${place.lat},${place.lon}`)}&navigate=yes`;
}

function appleMapsUrl(place) {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(`${place.lat},${place.lon}`)}`;
}

function formatAdminDate(value) {
  if (!value) return "";
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

function timestampMillis(value) {
  if (!value) return 0;
  const date = value.toDate?.() || (value.seconds ? new Date(value.seconds * 1000) : new Date(value));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function openCurrentPlaceEditDialog(placeId) {
  const place = state.currentPlaces.find((item) => item.id === placeId);
  if (!place) return;
  state.editingCurrentPlaceId = placeId;
  const draft = currentPlaceToDraft(place);
  $("currentPlaceDialog")?.close();
  $("currentPlaceEditTitle").textContent = draft.name || "עריכת מקום";
  $("currentPlaceEditFields").innerHTML = renderPlaceEditFields(draft);
  $("currentPlaceEditDialog").showModal();
  refreshIcons();
}

function renderPlaceEditFields(draft) {
  return `
      ${editInput("name", "שם המקום", draft.name)}
      ${editInput("destination", "יעד", draft.destination)}
      <label class="edit-field"><span>סוג מקום</span><select data-edit-field="type">${PLACE_TYPES.map(([key, label]) => `<option value="${key}" ${draft.type === key ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      ${editInput("location", "כתובת", draft.location)}
      ${editInput("lat", "Latitude", draft.lat ?? "")}
      ${editInput("lon", "Longitude", draft.lon ?? "")}
      ${editTextarea("shortDescription", "תיאור קצר", draft.shortDescription)}
      ${editTextarea("description", "תיאור ארוך", draft.description)}
      ${editInput("hours", "שעות פתיחה", draft.hours)}
      ${editInput("website", "אתר", draft.website)}
      ${editInput("reservationLabel", "הזמנה", draft.reservationLabel)}
      ${editInput("foodType", "סוג אוכל", draft.foodType)}
      ${editInput("rating", "דירוג", draft.rating ?? "")}
      ${editInput("coverEmoji", "אימוג׳י", draft.coverEmoji)}
      ${editInput("coverBackgroundHex", "צבע רקע", draft.coverBackgroundHex)}
      ${editInput("coverImageUrl", "תמונה", draft.coverImageUrl)}
      ${editInput("coverPhotographerName", "קרדיט תמונה", draft.coverPhotographerName)}
      ${editInput("coverPhotographerUsername", "קישור קרדיט", draft.coverPhotographerUsername)}
      <input type="hidden" data-edit-field="pixabayId" value="${escapeAttr(draft.pixabayId ?? "")}" />
      <input type="hidden" data-edit-field="pixabayPageUrl" value="${escapeAttr(draft.pixabayPageUrl ?? "")}" />
      <label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="isAtmosphereImage" ${draft.isAtmosphereImage ? "checked" : ""} /><span>תמונת אווירה</span></label>
      <label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="isKosher" ${draft.isKosher ? "checked" : ""} /><span>כשר</span></label>
    `;
}

async function saveCurrentPlaceEdit(event) {
  event.preventDefault();
  const place = state.currentPlaces.find((item) => item.id === state.editingCurrentPlaceId);
  if (!place) return;
  const draft = draftFromEditFields("currentPlaceEditFields", place);
  const saveButton = event.submitter || $("currentPlaceEditDialog")?.querySelector('button[value="save"]');
  try {
    if (saveButton) saveButton.disabled = true;
    setStatus("currentPlacesStatus", `שומר עריכה עבור ${draft.name || place.name || "המקום"} ומעלה תמונה ל-R2...`);
    await ensureFreshAdminAuthToken();
    await ensurePlaceImageOnR2(draft);
    const data = publicPlaceData(draft, place);
    const placeRef = state.firebase.firestore.doc(state.firebase.db, "public_places", place.id);
    await state.firebase.firestore.setDoc(placeRef, data, { merge: true });
    const savedSnap = await state.firebase.firestore.getDocFromServer(placeRef);
    if (!savedSnap.exists()) throw new Error("Firestore לא החזיר את המקום אחרי השמירה.");
    Object.assign(place, { id: place.id, ...savedSnap.data() });
    $("currentPlaceEditDialog").close();
    renderCurrentPlaces();
    setStatus("currentPlacesStatus", `${draft.name || place.name || "המקום"} עודכן בהצלחה.`);
  } catch (error) {
    setStatus("currentPlacesStatus", `שמירת העריכה נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    if (saveButton) saveButton.disabled = false;
  }
}

async function deleteCurrentPlace(placeId) {
  const place = state.currentPlaces.find((item) => item.id === placeId);
  if (!place) return;
  const confirmed = await confirmAction({
    title: "מחיקת מקום",
    message: `למחוק את ${place.name || "המקום"} מ-TripInspo? הפעולה תמחק את המסמך מ-Firestore.`,
    confirmText: "מחק מקום",
    tone: "danger",
    icon: "trash-2"
  });
  if (!confirmed) return;
  const button = $("deleteCurrentPlaceButton");
  try {
    if (button) button.disabled = true;
    setStatus("currentPlacesStatus", `מוחק את ${place.name || "המקום"}...`);
    await ensureFreshAdminAuthToken();
    const placeRef = state.firebase.firestore.doc(state.firebase.db, "public_places", placeId);
    await state.firebase.firestore.deleteDoc(placeRef);
    const deletedSnap = await state.firebase.firestore.getDocFromServer(placeRef);
    if (deletedSnap.exists()) throw new Error("Firestore לא מחק את המסמך. בדוק הרשאות Rules או פריסה.");
    state.currentPlaces = state.currentPlaces.filter((item) => item.id !== placeId);
    $("currentPlaceDialog").close();
    renderCurrentPlaces();
    setStatus("currentPlacesStatus", `${place.name || "המקום"} נמחק בהצלחה.`);
  } catch (error) {
    setStatus("currentPlacesStatus", `מחיקה נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function searchAddress(queryText) {
  const queries = buildAddressSearchQueries(queryText);
  for (const query of queries) {
    const cacheKey = normalize(query);
    if (state.addressSearchCache.has(cacheKey)) {
      setAddressProviderStatus("OpenStreetMap פעיל");
      return state.addressSearchCache.get(cacheKey);
    }
    let fastResults = [];
    let fallbackResults = [];
    try {
      fastResults = await searchPhotonAddress(query);
    } catch (error) {
      fastResults = [];
    }
    if (!fastResults.length) {
      try {
        fallbackResults = await searchFallbackAddress(query);
      } catch (error) {
        fallbackResults = [];
      }
    }
    const results = fastResults.length ? fastResults : fallbackResults;
    state.addressSearchCache.set(cacheKey, results);
    if (results.length) {
      setAddressProviderStatus(fastResults.length ? "OpenStreetMap מהיר פעיל" : "OpenStreetMap פעיל");
      return results;
    }
  }
  setAddressProviderStatus("OpenStreetMap פעיל");
  return [];
}

async function searchPhotonAddress(queryText) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", queryText);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lang", "en");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const payload = await response.json();
  return (payload.features || []).map(photonFeatureToAddress).filter(Boolean);
}

function photonFeatureToAddress(feature) {
  const props = feature?.properties || {};
  const coords = feature?.geometry?.coordinates || [];
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const city = props.city || props.town || props.village || props.county || "";
  const streetLine = compactAddressParts([props.street, props.housenumber].filter(Boolean).join(" "));
  const displayName = compactAddressParts([
    props.name,
    streetLine,
    city,
    props.state,
    props.country
  ]);
  return {
    display_name: displayName || props.name || "",
    lat,
    lon,
    type: props.osm_value || props.type || "",
    class: props.osm_key || "",
    source: "photon",
    sourceLabel: "OpenStreetMap",
    address: {
      city,
      town: props.town || "",
      village: props.village || "",
      county: props.county || "",
      state: props.state || "",
      country: props.country || "",
      road: props.street || "",
      house_number: props.housenumber || "",
      name: props.name || ""
    }
  };
}

async function searchFallbackAddress(queryText) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", queryText);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "en,he");
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!response.ok) return [];
  const results = await response.json();
  return results.map((item) => ({ ...item, source: "fallback", sourceLabel: "OpenStreetMap" }));
}

async function normalizeSelectedDestination(item) {
  return normalizeDestinationResult(item);
}

function normalizeDestinationResult(item) {
  const address = item.display_name || "";
  return {
    label: shortPlaceLabel(item),
    address,
    lat: Number(item.lat),
    lon: Number(item.lon),
    source: item.source || "fallback",
    sourceLabel: item.sourceLabel || "OpenStreetMap"
  };
}

function shortPlaceLabel(item) {
  const address = item.address || {};
  return address.name || address.city || address.town || address.village || address.state || (item.display_name || "").split(",")[0].trim();
}

function buildAddressSearchQueries(queryText) {
  const clean = text(queryText).replace(/\s+/g, " ").trim();
  const withoutExtraPunctuation = clean.replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(",").map((part) => part.trim()).filter(Boolean);
  const queries = [
    clean,
    withoutExtraPunctuation,
    parts.slice(0, 3).join(", "),
    parts.slice(0, 2).join(", ")
  ].filter((query) => query.length >= 2);
  return Array.from(new Set(queries));
}

function translateHebrewAddressQuery(queryText) {
  if (!/[\u0590-\u05FF]/.test(queryText)) return "";
  const aliases = {
    "וינה": "Vienna",
    "ווין": "Vienna",
    "מוזיאון": "Museum",
    "מוזיאונים": "Museums",
    "מסעדה": "Restaurant",
    "מסעדות": "Restaurants",
    "קניון": "Mall",
    "קניות": "Shopping",
    "מלון": "Hotel",
    "חוף": "Beach",
    "פארק": "Park",
    "שדה תעופה": "Airport",
    "תחנת רכבת": "Train Station",
    "אוסטריה": "Austria",
    "רומא": "Rome",
    "איטליה": "Italy",
    "פריז": "Paris",
    "פרי": "Paris",
    "צרפת": "France",
    "פראג": "Prague",
    "צכיה": "Czechia",
    "צ'כיה": "Czechia",
    "בודפשט": "Budapest",
    "הונגריה": "Hungary",
    "ברלין": "Berlin",
    "גרמניה": "Germany",
    "אמסטרדם": "Amsterdam",
    "הולנד": "Netherlands",
    "לונדון": "London",
    "אנגליה": "England",
    "בריטניה": "United Kingdom",
    "מדריד": "Madrid",
    "ברצלונה": "Barcelona",
    "ספרד": "Spain",
    "ליסבון": "Lisbon",
    "פורטוגל": "Portugal",
    "אתונה": "Athens",
    "יוון": "Greece",
    "ניו יורק": "New York",
    "לוס אנגלס": "Los Angeles",
    "מיאמי": "Miami",
    "ארצות הברית": "United States",
    "ארהב": "United States",
    "דובאי": "Dubai",
    "אבו דאבי": "Abu Dhabi",
    "איחוד האמירויות": "United Arab Emirates",
    "איסטנבול": "Istanbul",
    "טורקיה": "Turkey",
    "בנגקוק": "Bangkok",
    "תאילנד": "Thailand",
    "טוקיו": "Tokyo",
    "יפן": "Japan",
    "תל אביב": "Tel Aviv",
    "ירושלים": "Jerusalem",
    "חיפה": "Haifa",
    "אילת": "Eilat",
    "ישראל": "Israel"
  };
  let translated = queryText;
  Object.entries(aliases)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([hebrew, english]) => {
      translated = translated.replace(new RegExp(escapeRegExp(hebrew), "g"), english);
    });
  return translated === queryText ? "" : translated;
}

function compactAddressParts(parts) {
  const values = Array.isArray(parts) ? parts : [parts];
  return Array.from(new Set(values.map(text).filter(Boolean))).join(", ");
}

function setAddressProviderStatus(message) {
  const label = $("addressProviderStatus");
  if (label) label.textContent = message;
}

function setJsonPlaceholder() {
  $("jsonInput").placeholder = JSON.stringify([examplePlace()], null, 2);
}

function examplePlace() {
  return {
    name: "Colosseum (קולוסיאום)",
    destination: "Rome",
    category: "place_type_attraction",
    address: "Piazza del Colosseo, 1, Roma",
    description: "תיאור עשיר בעברית על המקום והחוויה.",
    short_description: "אייקון היסטורי בלב רומא",
    opening_hours: "מומלץ לבדוק באתר",
    website: "https://www.il-colosseo.it/",
    reservation: "reservation_recommended",
    is_kosher: false,
    food_type: "",
    cover_emoji: "🏛️",
    cover_background_hex: "#8B5CF6",
    rating: 4.8,
    lat: 41.8902,
    lon: 12.4922,
    image_search_query: "Colosseum Rome"
  };
}

function buildPlacePrompt() {
  const destination = state.destinations.import?.label || $("importDestinationInput").value.trim() || "[יעד]";
  const address = state.destinations.import?.address || "";
  const coordinates = state.destinations.import ? `קואורדינטות ייחוס של היעד: ${state.destinations.import.lat}, ${state.destinations.import.lon}` : "";
  return `**תפקיד ומטרה (Role & Context):**
אתה משמש כמנוע עיבוד נתונים ומדריך טיולים וירטואלי מומחה עבור אפליקציית התיירות TripEase. תפקידך הוא לקבל יעד וכמות מקומות מבוקשת, לאסוף מידע עדכני מהאינטרנט, ולהפיק רשימת מקומות עשירה, ממוינת ושיווקית במבנה JSON קפדני.
**נתוני הבקשה:**
היעד המבוקש הוא: ${destination}
${address ? `כתובת הייחוס של היעד: ${address}
` : ""}${coordinates ? `${coordinates}
` : ""}**חוקי יסוד ואמינות המידע (Core Rules):**
 1. **דיוק מוחלט:** חובה עליך להשתמש בחיפוש רשת כדי לוודא שעות פתיחה, כתובות ופרטים עדכניים. לעולם אל תמציא מידע. אם נתון אינו ניתן לאימות, השאר אותו כמחרוזת ריקה "".
 2. **כתובות לניווט:** הכתובת (address) חייבת להיות מדויקת ובשפת המקור כדי להבטיח זיהוי של 100% במערכות Apple Maps ו-Google Maps. בשדה address כתוב רק את הכתובת המלאה עצמה, בלי שם המקום, בלי שם המותג, בלי הסבר ובלי סוגריים. אל תתרגם כתובת לעברית אם הכתובת המקומית כתובה באנגלית, גרמנית, צ'כית, איטלקית, צרפתית או כל שפת מקור אחרת.
 3. **שעות פתיחה מפורטות:** יש לציין את שעות הפתיחה לכל ימי השבוע במדויק, כאשר כל יום מופיע בשורה נפרדת בתוך המחרוזת, בפורמט הבא בלבד:
   ראשון- 08:00-20:00
   שני- 08:00-20:00
   (וכן הלאה לכל ימי השבוע).
 4. **מיון וקיבוץ:** חובה למיין את המקומות במערך ה-JSON לפי קטגוריות. קבץ יחד את כל המוזיאונים, לאחר מכן את כל המסעדות, וכו'.
**סגנון כתיבה - שיווקי וחווייתי (Tone & Style):**
את התיאורים (description ו-short_description) יש לכתוב ב**עברית בלבד**. התיאור הארוך צריך להיות שיווקי, מלהיב ומושך - כתוב אותו כאילו אתה מדריך הטיולים הטוב בעולם הממליץ לחבר קרוב על חוויה בלתי נשכחת.
**מבנה הנתונים והנחיות (JSON Schema Mapping):**
 * name: שם המקום באנגלית ובעברית (למשל: "קולוסיאום (Colosseum)"). אם היעד בישראל, מספיק לכתוב בעברית בלבד.
 * destination: העיר/האזור. עבור כל האובייקטים בתשובה הזו הערך חייב להיות בדיוק "${destination}". אל תחליף לשכונה, רובע, אזור משנה או ניסוח אחר.
 * category: חובה להשתמש **אך ורק** באחד מהערכים הבאים:
   place_type_restaurant, place_type_supermarket, place_type_museum, place_type_mall, place_type_attraction, place_type_beach, place_type_tour, place_type_nature, place_type_nightlife, place_type_bar.
 * address: כתובת מלאה ומדויקת בשפת המקור (כאמור בסעיף 2). חובה: רק כתובת ניווט מלאה, ללא שם המקום בתחילת השדה. לדוגמה נכון: "Mariahilfer Str. 45, 1060 Wien, Austria"; לא נכון: "Haus des Meeres, Mariahilfer Str. 45, 1060 Wien, Austria".
 * description: תיאור ארוך, חוויתי ושיווקי בעברית.
 * short_description: משפט קצר ותמציתי בעברית (עד 12 מילים).
 * opening_hours: שעות פתיחה מדויקות ומפורטות לפי ימים (כאמור בסעיף 3). אם אין שעות פתיחה מדויקות, כתוב: "מומלץ לבדוק באתר".
 * website: כתובת האתר הרשמי. אם אין קישור מדויק, שים קישור חיפוש של שם המקום ושם היעד באינטרנט, אבל תמיד תשאף לקישור הרשמי.
 * reservation: חובה להשתמש **אך ורק** באחד מהערכים: reservation_no, reservation_recommended, reservation_yes.
 * is_kosher: בוליאני (true או false).
 * food_type: רלוונטי למסעדות בלבד. בחר אחד מהבאים:
   food_type_italian, food_type_dairy, food_type_meat, food_type_vegetarian, food_type_asian, food_type_shawarma, food_type_pizza, food_type_burger, food_type_cafe, food_type_other.
   *(הערה קריטית: אם הקטגוריה אינה מסעדה, שדה זה חייב להיות מחרוזת ריקה "" ושדה ה-is_kosher חייב להיות false).*
 * cover_emoji: אמוג'י בודד המייצג את אופי המקום.
 * cover_background_hex: קוד צבע בפורמט #RRGGBB שמתאים ומשלים את האמוג'י הנבחר.
 * rating: מספר עשרוני בין 1.0 ל-5.0 (ספרה אחת אחרי הנקודה). החזר 0 רק אם אין כל מידע על דירוג.
 * image_search_query: מחרוזת ממוקדת לחיפוש תמונה של המקום:
   * אם מדובר במסעדה, חיי לילה או בר: כתוב מילת חיפוש מדויקת באנגלית שקשורה לשם המקום והאווירה (למשל: "Hard Rock Cafe NYC interior").
   * למקומות אחרים: ציין את השם המלא של המקום באנגלית או בשפת המקור (למשל: "Colosseum Rome").
**פורמט פלט נדרש (Strict Output constraints):**
 1. החזר **אך ורק** מערך של אובייקטים בפורמט JSON תקני.
 2. ללא סמני Markdown (ללא \`\`\`json בתחילה ובסוף).
 3. ללא שום טקסט מקדים, ללא מילות קישור וללא הסברים. הפלט חייב להיות טקסט גולמי הניתן לפענוח ישיר.
 4. אל תוסיף שדות שלא הוגדרו בסכמה זו.
 5. אם אין לך קישור מדויק של המקום, שים קישור לחיפוש של שם המקום ושם היעד באינטרנט, אבל תמיד תשאף שיהיה קישור מדויק.
 6. אם אין לך שעות פתיחה מדויקות, כתוב "מומלץ לבדוק באתר". אל תמציא, אבל תמיד תשאף שיהיו שעות פתיחה מדויקות.
 7. שמור על עקביות מלאה בשדה destination. תמיד כתוב "${destination}" בדיוק, ואל תכתוב פתאום שכונה או אזור משנה במקום היעד הראשי.
מבנה התוצר הנדרש:
${JSON.stringify([{ ...examplePlace(), destination }], null, 2)}`;
}

function updatePromptPreview() {
  const preview = $("promptPreview");
  if (preview) preview.value = buildPlacePrompt();
}

async function parseJsonInput() {
  try {
    const raw = $("jsonInput").value.trim();
    if (!raw) throw new Error("חסר JSON");
    const decoded = JSON.parse(cleanJson(raw));
    const list = Array.isArray(decoded) ? decoded : decoded.places || decoded.items || [];
    if (!Array.isArray(list) || list.length === 0) throw new Error("לא נמצא מערך מקומות");
    state.drafts = list.map((item, index) => draftFromJson(item, index));
    renderDrafts();
    setStatus("importStatus", `נוצרו ${state.drafts.length} כרטיסיות. משלים אוטומטית כתובות ותמונות...`);
    await enrichDrafts();
  } catch (error) {
    setStatus("importStatus", `שגיאה בפענוח JSON: ${error.message}`, true);
  }
}

function cleanJson(raw) {
  return raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function draftFromJson(item, index) {
  const destination = text(item.destination) || state.destinations.import?.label || $("importDestinationInput").value.trim();
  const type = text(item.category || item.type) || "place_type_attraction";
  return {
    id: `draft_${Date.now()}_${index}`,
    name: text(item.name),
    destination,
    type,
    shortDescription: text(item.short_description || item.shortDescription),
    description: text(item.description),
    location: text(item.address || item.location),
    lat: number(item.lat || item.latitude),
    lon: number(item.lon || item.lng || item.longitude),
    hours: text(item.opening_hours || item.hours),
    website: text(item.website),
    reservationLabel: text(item.reservation || item.reservationLabel) || "reservation_no",
    isKosher: Boolean(item.is_kosher || item.isKosher),
    foodType: text(item.food_type || item.foodType),
    rating: number(item.rating),
    coverEmoji: text(item.cover_emoji || item.coverEmoji) || PLACE_EMOJI[type] || "📌",
    coverBackgroundHex: text(item.cover_background_hex || item.coverBackgroundHex) || "#3B82F6",
    coverImageUrl: text(item.coverImageUrl || item.image_url || item.imageUrl),
    coverPhotographerName: text(item.coverPhotographerName || item.image_credit),
    coverPhotographerUsername: text(item.coverPhotographerUsername || item.image_credit_url),
    isAtmosphereImage: item.isAtmosphereImage === true,
    imageSearchQuery: text(item.image_search_query || item.imageSearchQuery || item.name),
    validationIssues: []
  };
}

function renderDrafts() {
  $("draftCountPill").textContent = `${state.drafts.length} כרטיסיות`;
  $("draftCards").innerHTML = state.drafts.map(renderDraftCard).join("") || emptyHtml("אין עדיין כרטיסיות. הדבק JSON וצור כרטיסיות.");
  bindDraftCardEvents();
  refreshIcons();
}

function renderDraftCard(draft) {
  const issues = missingDraftFields(draft);
  const hasMissingCoords = draft.lat == null || draft.lon == null;
  return `<article class="place-card draft-card ${issues.length ? "has-issues" : ""}" data-draft-id="${draft.id}">
    ${imageHtml(draft)}
    <div class="place-body">
      <div class="compact-card-title-row">
        <h3>${escapeHtml(draft.name || "ללא שם")}</h3>
        <span class="booking-link-pill">${escapeHtml(placeTypeLabel(draft.type))}</span>
      </div>
      <div class="compact-card-meta"><span>${escapeHtml(draft.destination || "ללא יעד")}</span><span>${escapeHtml(draft.location || "כתובת תושלם אוטומטית")}</span></div>
      ${renderPlaceTags(draft)}
      <p class="compact-card-summary">${escapeHtml(draft.shortDescription || draft.description || "אין תיאור עדיין")}</p>
      <div class="draft-status-row">
        <span class="count-pill ${issues.length ? "draft-warning-pill" : "draft-ready-pill"}">${issues.length ? "דורש השלמות" : "מוכן לשמירה"}</span>
        ${draft.rating ? `<span class="count-pill">⭐ ${escapeHtml(Number(draft.rating).toFixed(1))}</span>` : ""}
        <button class="atmosphere-toggle ${draft.isAtmosphereImage ? "is-on" : ""}" type="button" data-action="atmosphere" aria-pressed="${draft.isAtmosphereImage ? "true" : "false"}">
          <i data-lucide="${draft.isAtmosphereImage ? "toggle-right" : "toggle-left"}" aria-hidden="true"></i>
          <span>תמונת אווירה ${draft.isAtmosphereImage ? "ON" : "OFF"}</span>
        </button>
      </div>
      ${issues.length ? `<button class="draft-issues ${hasMissingCoords ? "is-clickable" : ""}" type="button" data-action="${hasMissingCoords ? "address" : "review"}"><i data-lucide="${hasMissingCoords ? "map-pin-off" : "triangle-alert"}" aria-hidden="true"></i><span>חסר להשלים: ${escapeHtml(issues.join(", "))}</span></button>` : ""}
      <div class="card-actions">
        <button class="ghost-action danger-lite" type="button" data-action="remove"><i data-lucide="trash-2"></i><span>מחק</span></button>
        <button class="ghost-action" type="button" data-action="image"><i data-lucide="image"></i><span>בחירת תמונה</span></button>
        <button class="primary-action" type="button" data-action="save"><i data-lucide="cloud-upload"></i><span>שמור</span></button>
        <button class="ghost-action" type="button" data-action="web"><i data-lucide="search-check"></i><span>חיפוש באינטרנט</span></button>
      </div>
    </div>
  </article>`;
}

function bindDraftCardEvents() {
  $$('[data-draft-id]').forEach((card) => {
    const id = card.dataset.draftId;
    card.addEventListener("click", () => openDraftReviewDialog(id));
    card.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDraftAction(id, button.dataset.action);
    }));
    card.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => event.stopPropagation()));
  });
}

async function handleDraftAction(id, action) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  if (action === "atmosphere") {
    draft.isAtmosphereImage = !draft.isAtmosphereImage;
    renderDrafts();
    return;
  }
  if (action === "remove") state.drafts = state.drafts.filter((item) => item.id !== id);
  if (action === "image") openImageDialog(id, draft.imageSearchQuery || draft.name);
  if (action === "address") openDraftAddressDialog(id);
  if (action === "review") openDraftReviewDialog(id);
  if (action === "web") {
    window.open(draftSearchUrl(draft), "_blank", "noopener,noreferrer");
    return;
  }
  if (action === "save") await saveDraft(draft);
  renderDrafts();
}

function openDraftReviewDialog(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  state.reviewingDraftId = id;
  $("draftReviewTitle").textContent = draft.name || "בדיקת כרטיסיה";
  $("draftReviewFields").innerHTML = renderPlaceEditFields(draft);
  $("draftReviewDialog")?.showModal();
  refreshIcons();
}

function saveDraftReviewChanges(event) {
  event.preventDefault();
  const draft = state.drafts.find((item) => item.id === state.reviewingDraftId);
  if (!draft) return;
  Object.assign(draft, draftFromEditFields("draftReviewFields", draft));
  draft.validationIssues = missingDraftFields(draft);
  $("draftReviewDialog")?.close();
  renderDrafts();
}

function bindDraftAddressDialog() {
  const input = $("draftAddressInput");
  const suggestions = $("draftAddressSuggestions");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("input", () => {
    window.clearTimeout(state.addressFixTimer);
    state.addressFixSelection = null;
    state.addressFixSeq += 1;
    const currentSeq = state.addressFixSeq;
    const query = input.value.trim();
    if ($("selectedDraftAddress")) {
      $("selectedDraftAddress").innerHTML = `<i data-lucide="radar" aria-hidden="true"></i><span>בחר כתובת מתוך ההשלמה האוטומטית.</span>`;
    }
    if (query.length < 2) {
      suggestions.innerHTML = "";
      return;
    }
    suggestions.innerHTML = `<div class="suggestion-empty">מחפש כתובת...</div>`;
    state.addressFixTimer = window.setTimeout(async () => {
      let results = [];
      try {
        results = await searchAddress(query);
      } catch (error) {
        setStatus("draftAddressStatus", `חיפוש הכתובת נכשל: ${error.message}`, true);
      }
      if (currentSeq !== state.addressFixSeq) return;
      if (!results.length) {
        suggestions.innerHTML = `<div class="suggestion-empty">לא נמצאו תוצאות. נסה לכתוב שם מקום מלא יותר או עיר.</div>`;
        return;
      }
      suggestions.innerHTML = results.map((item, index) => `
        <button class="suggestion-item" type="button" data-address-index="${index}">
          <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
          <b>${escapeHtml(item.sourceLabel || "OpenStreetMap")}</b>
          <i data-lucide="chevron-left"></i>
        </button>
      `).join("");
      suggestions.querySelectorAll("[data-address-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const item = results[Number(button.dataset.addressIndex)];
          const normalized = await normalizeSelectedDestination(item);
          state.addressFixSelection = normalized;
          input.value = normalized.address || normalized.label;
          suggestions.innerHTML = "";
          $("selectedDraftAddress").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(normalized.address)}</span><b>${escapeHtml(formatCoords(normalized.lat, normalized.lon))}</b>`;
          setStatus("draftAddressStatus", "כתובת נבחרה. לחץ עדכן כתובת כדי לשמור בכרטיסייה.");
          refreshIcons();
        });
      });
      refreshIcons();
    }, 140);
  });
  $("applyDraftAddressButton")?.addEventListener("click", applyDraftAddressFix);
}

function openDraftAddressDialog(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  state.addressFixDraftId = id;
  state.addressFixSelection = null;
  $("draftAddressTitle").textContent = draft.name || "בחירת כתובת";
  $("draftAddressInput").value = [draft.name, draft.location, draft.destination].filter(Boolean).join(" ");
  $("draftAddressSuggestions").innerHTML = "";
  $("selectedDraftAddress").innerHTML = `<i data-lucide="radar" aria-hidden="true"></i><span>חובה לבחור כתובת מתוך ההשלמה האוטומטית כדי לעדכן קואורדינטות.</span>`;
  setStatus("draftAddressStatus", "");
  $("draftAddressDialog")?.showModal();
  window.setTimeout(() => $("draftAddressInput")?.dispatchEvent(new Event("input", { bubbles: true })), 0);
  refreshIcons();
}

function applyDraftAddressFix() {
  const draft = state.drafts.find((item) => item.id === state.addressFixDraftId);
  if (!draft) return;
  const selected = state.addressFixSelection;
  if (!selected || selected.lat == null || selected.lon == null) {
    setStatus("draftAddressStatus", "צריך לבחור כתובת מתוך ההשלמה האוטומטית לפני עדכון.", true);
    return;
  }
  draft.location = selected.address || selected.label || draft.location;
  draft.lat = selected.lat;
  draft.lon = selected.lon;
  if (!draft.destination) draft.destination = selected.label;
  draft.validationIssues = missingDraftFields(draft);
  $("draftAddressDialog")?.close();
  renderDrafts();
  setStatus("importStatus", `${draft.name || "הכרטיסייה"} עודכנה עם כתובת וקואורדינטות.`);
}

async function checkDraftDuplicate(draft) {
  const places = await fetchPublicPlacesByExactName(draft.name);
  const match = places.find((place) => isLikelyDuplicate(draft, place));
  setStatus("importStatus", match ? `נמצאה כפילות אפשרית: ${match.name}` : `לא נמצאה כפילות ברורה עבור ${draft.name}.`, Boolean(match));
}

async function saveAllDrafts() {
  if (!state.drafts.length) return;
  setSaveAllButtonsLoading(true);
  state.importProgress = { active: true, total: state.drafts.length, completed: 0, label: "שומר את כל המקומות", note: "מעלה את הכרטיסיות ל-TripInspo.", done: false };
  syncImportProgressDialog();
  $("importProgressDialog")?.showModal();
  let saved = 0;
  const total = state.drafts.length;
  const failedIds = new Set();
  try {
    for (const [index, draft] of [...state.drafts].entries()) {
      state.importProgress = { active: true, total, completed: index, label: draft.name || "מקום", note: "מוריד את התמונה, מעלה ל-R2 ושומר את הכרטיסייה.", done: false };
      syncImportProgressDialog();
      const ok = await saveDraft(draft, { quiet: true });
      if (ok) saved += 1;
      else failedIds.add(draft.id);
    }
    state.drafts = state.drafts.filter((draft) => failedIds.has(draft.id));
    renderDrafts();
    state.importProgress = {
      active: true,
      total,
      completed: total,
      label: failedIds.size ? "השמירה הסתיימה חלקית" : "סיימנו לשמור",
      note: failedIds.size ? `נשמרו ${saved} מקומות, ו-${failedIds.size} נשארו לטיפול ידני.` : `נשמרו ${saved} מקומות ל-TripInspo.`,
      done: true
    };
    syncImportProgressDialog();
    await sleep(900);
    $("importProgressDialog")?.close();
    if (!failedIds.size && $("jsonInput")) $("jsonInput").value = "";
    setStatus("importStatus", failedIds.size ? `נשמרו ${saved} מקומות. ${failedIds.size} כרטיסיות לא נשמרו ונשארו ברשימה.` : `נשמרו ${saved} מקומות ל-TripInspo.`, failedIds.size > 0);
    showToast(failedIds.size ? `השמירה הסתיימה. ${saved} נשמרו ו-${failedIds.size} נשארו להשלמה.` : `השמירה הושלמה. נשמרו ${saved} מקומות.`, failedIds.size ? "warning" : "success");
  } finally {
    $("importProgressDialog")?.close();
    setSaveAllButtonsLoading(false);
  }
}

async function enrichDrafts() {
  if (!state.drafts.length) return;
  state.importProgress = { active: true, total: state.drafts.length, completed: 0, label: "מתחיל לעבור על המקומות", note: "משלים כתובות, קואורדינטות ותמונות.", done: false };
  syncImportProgressDialog();
  $("importProgressDialog")?.showModal();
  for (let index = 0; index < state.drafts.length; index += 1) {
    const draft = state.drafts[index];
    state.importProgress = { active: true, total: state.drafts.length, completed: index, label: draft.name || `מקום ${index + 1}`, note: "בודק תמונה וכתובת לכרטיסייה.", done: false };
    syncImportProgressDialog();
    await enrichSingleDraft(draft);
    state.importProgress = { active: true, total: state.drafts.length, completed: index + 1, label: draft.name || `מקום ${index + 1}`, note: "הכרטיסייה הושלמה.", done: false };
    syncImportProgressDialog();
  }
  const unresolved = state.drafts.filter((draft) => missingDraftFields(draft).length).length;
  state.importProgress = {
    active: true,
    total: state.drafts.length,
    completed: state.drafts.length,
    label: unresolved ? "השלמנו את רוב הנתונים" : "הכל מוכן לשמירה",
    note: unresolved ? `${unresolved} כרטיסיות עדיין צריכות השלמות ידניות.` : "כל הכרטיסיות מוכנות לשמירה.",
    done: true
  };
  syncImportProgressDialog();
  await sleep(900);
  $("importProgressDialog")?.close();
  state.importProgress.active = false;
  renderDrafts();
  setStatus("importStatus", unresolved ? `הושלמו ${state.drafts.length} כרטיסיות. ${unresolved} עדיין דורשות השלמות.` : `הושלמו ${state.drafts.length} כרטיסיות ומוכנות לשמירה.`);
  showToast(unresolved ? `ההשלמה האוטומטית הסתיימה. ${unresolved} כרטיסיות צריכות מגע ידני.` : "ההשלמה האוטומטית הסתיימה והכרטיסיות מוכנות.", unresolved ? "warning" : "success");
}

async function enrichSingleDraft(draft) {
  try {
    await autoCompleteDraftAddress(draft);
  } catch (_) { }
  try {
    await autoPickDraftImage(draft);
  } catch (_) { }
  draft.validationIssues = missingDraftFields(draft);
}

async function autoCompleteDraftAddress(draft) {
  if (draft.location && draft.lat != null && draft.lon != null) return;
  const queries = [
    [draft.name, draft.destination, draft.location].filter(Boolean).join(" "),
    [draft.name, draft.destination].filter(Boolean).join(" "),
    [draft.name, draft.location].filter(Boolean).join(" "),
    draft.location
  ].map(text).filter(Boolean);
  for (const query of queries) {
    const results = await searchAddress(query);
    if (!results.length) continue;
    const preferred = chooseBestAddressResult(results, draft);
    if (!preferred) continue;
    const normalized = await normalizeSelectedDestination(preferred);
    draft.location = normalized.address || draft.location;
    draft.lat = normalized.lat;
    draft.lon = normalized.lon;
    draft.destination = draft.destination || normalized.label;
    return;
  }
}

function chooseBestAddressResult(results, draft) {
  const draftName = normalize(draft.name);
  const destination = normalize(draft.destination);
  const location = normalize(draft.location);
  const scored = results.map((item) => {
    const display = normalize(item.display_name);
    const label = normalize(shortPlaceLabel(item));
    const type = normalize(item.type);
    const category = normalize(item.category || item.class);
    let score = 0;
    if (draftName && display.includes(draftName)) score += 10;
    if (draftName && label && (draftName.includes(label) || label.includes(draftName))) score += 7;
    if (destination && display.includes(destination)) score += 4;
    if (location && display.includes(location)) score += 5;
    if (["tourism", "amenity", "leisure", "shop", "historic"].some((value) => category.includes(value))) score += 3;
    if (["museum", "restaurant", "attraction", "hotel", "viewpoint", "artwork", "mall", "bar", "cafe"].some((value) => type.includes(value))) score += 2;
    if (destination && label === destination && draftName && !display.includes(draftName)) score -= 8;
    return { item, score };
  }).sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best) return null;
  return best.score > 0 ? best.item : null;
}

async function autoPickDraftImage(draft) {
  if (draft.coverImageUrl) return;
  const queries = [draft.imageSearchQuery, [draft.name, draft.destination].filter(Boolean).join(" ")].map(text).filter(Boolean);
  for (const query of queries) {
    const searchQuery = await translateSearchQueryToEnglish(query);
    const images = await fetchPixabayImages(searchQuery || query);
    if (!images.length) continue;
    const image = images[0];
    draft.coverImageUrl = normalizeImageUrl(image.url) || image.url;
    const credit = imageCreditFields(image, draft.coverImageUrl);
    draft.coverPhotographerName = credit.name;
    draft.coverPhotographerUsername = credit.reference;
    draft.pixabayId = pixabayIdValue(image.pixabayId);
    draft.pixabayPageUrl = text(image.pageUrl);
    return;
  }
}

function syncImportProgressDialog() {
  const total = state.importProgress.total || 1;
  const percent = Math.max(0, Math.min(100, Math.round((state.importProgress.completed / total) * 100)));
  $("importProgressDialog")?.classList.toggle("is-complete", state.importProgress.done === true);
  if ($("importProgressTitle")) $("importProgressTitle").textContent = state.importProgress.label || "מעבד כרטיסיות";
  if ($("importProgressSubtitle")) $("importProgressSubtitle").textContent = `${state.importProgress.completed} / ${state.importProgress.total}`;
  if ($("importProgressNote")) $("importProgressNote").textContent = state.importProgress.note || "";
  if ($("importProgressBar")) $("importProgressBar").style.width = `${percent}%`;
}

async function saveDraft(draft, options = {}) {
  if (!state.user) {
    setStatus("importStatus", "צריך להתחבר לפני שמירה ל-TripInspo.", true);
    return false;
  }
  const duplicate = (await fetchPublicPlacesByExactName(draft.name)).find((place) => isLikelyDuplicate(draft, place));
  if (duplicate) {
    const confirmed = await confirmAction({
      title: "נמצאה כפילות אפשרית",
      message: `נמצאה כפילות אפשרית: ${duplicate.name}. לשמור בכל זאת?`,
      confirmText: "שמור בכל זאת",
      tone: "warning",
      icon: "copy"
    });
    if (!confirmed) return false;
  }
  if (!options.quiet) setStatus("importStatus", `מוריד ומעלה תמונה ל-R2 עבור ${draft.name || "המקום"}...`);
  await ensureFreshAdminAuthToken();
  await ensurePlaceImageOnR2(draft);
  const data = publicPlaceData(draft);
  await state.firebase.firestore.addDoc(state.firebase.firestore.collection(state.firebase.db, "public_places"), data);
  if (!options.quiet) setStatus("importStatus", `${draft.name} נשמר ל-TripInspo.`);
  state.drafts = state.drafts.filter((item) => item.id !== draft.id);
  return true;
}

function publicPlaceData(draft, existing = null) {
  const username = existing?.sharedByUsername || state.user?.displayName || state.user?.email?.split("@")[0] || "admin";
  const uid = existing?.sharedByUid || state.user?.uid || null;
  const coverImageUrl = normalizeImageUrl(draft.coverImageUrl);
  const credit = imageCreditFields(draft, coverImageUrl);
  const storedOnR2 = isR2ImageUrl(coverImageUrl);
  return {
    name: draft.name,
    destination: nullable(draft.destination),
    type: draft.type,
    shortDescription: nullable(draft.shortDescription),
    description: nullable(draft.description),
    location: nullable(draft.location),
    lat: draft.lat ?? null,
    lon: draft.lon ?? null,
    hours: nullable(draft.hours),
    website: nullable(draft.website),
    reservationLabel: draft.reservationLabel || "reservation_no",
    isKosher: Boolean(draft.isKosher),
    foodType: nullable(draft.foodType),
    rating: draft.rating ?? null,
    imageUrls: coverImageUrl ? [coverImageUrl] : [],
    imageStoredOnR2: storedOnR2,
    coverEmoji: nullable(draft.coverEmoji),
    coverBackgroundHex: nullable(draft.coverBackgroundHex),
    coverImageUrl: nullable(coverImageUrl),
    coverPhotographerName: nullable(credit.name),
    coverPhotographerUsername: nullable(credit.reference),
    isAtmosphereImage: Boolean(draft.isAtmosphereImage),
    pixabayId: storedOnR2 ? null : pixabayIdValue(draft.pixabayId),
    pixabayPageUrl: storedOnR2 ? null : nullable(draft.pixabayPageUrl),
    sharedByUsername: username,
    sharedByUid: uid,
    sharedAt: existing?.sharedAt || state.firebase.firestore.serverTimestamp(),
    updatedAt: state.firebase.firestore.serverTimestamp()
  };
}

async function fetchPublicPlacesByExactName(name) {
  if (!state.firebase || !state.user || !name) return [];
  const fs = state.firebase.firestore;
  const snap = await fs.getDocs(fs.query(fs.collection(state.firebase.db, "public_places"), fs.where("name", "==", name), fs.limit(20)));
  return snap.docs.map(docToPlace);
}

async function loadPlacesFor(mode) {
  const statusId = mode === "delete" ? "deleteStatus" : "duplicateStatus";
  if (!state.user) {
    setStatus(statusId, "צריך להתחבר לפני טעינת מקומות מ-Firestore.", true);
    return;
  }
  const destination = state.destinations[mode];
  if (!destination?.lat || !destination?.lon) {
    setStatus(statusId, "בחר יעד מהרשימה לפני טעינת מקומות.", true);
    return;
  }
  setStatus(statusId, "טוען מקומות...");
  let places = [];
  try {
    places = await fetchPlacesByRadius(destination.lat, destination.lon, 50);
  } catch (error) {
    setStatus(statusId, `טעינת המקומות נכשלה: ${error.message}`, true);
    return;
  }
  if (mode === "delete") {
    state.deletePlaces = places;
    state.selectedDeleteIds.clear();
    renderDeletePlaces();
    setStatus("deleteStatus", `נטענו ${places.length} מקומות.`);
  } else {
    state.duplicatePlaces = places;
    state.selectedDuplicateIds.clear();
    state.duplicateGroups = [];
    renderDuplicatePlaces();
    setStatus("duplicateStatus", `נטענו ${places.length} מקומות.`);
  }
}

async function fetchPlacesByRadius(lat, lon, radiusKm) {
  const fs = state.firebase.firestore;
  const latDelta = radiusKm / 111;
  const snap = await fs.getDocs(fs.query(
    fs.collection(state.firebase.db, "public_places"),
    fs.where("lat", ">=", lat - latDelta),
    fs.where("lat", "<=", lat + latDelta)
  ));
  return snap.docs.map(docToPlace).filter((place) => place.lat != null && place.lon != null && distanceKm(lat, lon, place.lat, place.lon) <= radiusKm);
}

function docToPlace(document) {
  const data = document.data() || {};
  const imageUrls = collectImageCandidates(data.imageUrls || data.images || data.galleryImages);
  const coverImageUrl = normalizeImageUrl(data.coverImageUrl || data.imageUrl || data.image_url || imageUrls[0]);
  return {
    id: document.id,
    ...data,
    coverImageUrl: coverImageUrl || data.coverImageUrl || data.imageUrl || data.image_url || "",
    imageUrls
  };
}

function renderDuplicatePlaces() {
  $("duplicateLoadedPill").textContent = `${state.duplicatePlaces.length} מקומות`;
  $("duplicateSelectedPill").textContent = `${state.selectedDuplicateIds.size} מסומנים`;
  renderPlaceSelectionGrid("duplicateCards", state.duplicatePlaces, state.selectedDuplicateIds, "duplicates");
  renderDuplicateGroups();
}

function renderDeletePlaces() {
  $("deleteLoadedPill").textContent = `${state.deletePlaces.length} מקומות`;
  $("deleteSelectedPill").textContent = `${state.selectedDeleteIds.size} מסומנים`;
  renderPlaceSelectionGrid("deleteCards", state.deletePlaces, state.selectedDeleteIds, "delete");
}

function renderPlaceSelectionGrid(containerId, places, selectedSet, mode) {
  $(containerId).innerHTML = places.map((place) => `<article class="place-card">
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-select-place="${place.id}" data-mode="${mode}" ${selectedSet.has(place.id) ? "checked" : ""} /> בחירה</label>
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <div class="place-meta">${escapeHtml(place.location || "אין כתובת")}<br>${escapeHtml(place.website || "אין אתר")}</div>
      <small class="place-meta">${escapeHtml(place.sharedByUsername || "")} · ${escapeHtml(place.sharedByUid || "")}</small>
    </div>
  </article>`).join("") || emptyHtml("אין מקומות להצגה.");
  $$(`[data-mode="${mode}"]`).forEach((checkbox) => checkbox.addEventListener("change", () => {
    const set = mode === "delete" ? state.selectedDeleteIds : state.selectedDuplicateIds;
    checkbox.checked ? set.add(checkbox.dataset.selectPlace) : set.delete(checkbox.dataset.selectPlace);
    mode === "delete" ? renderDeletePlaces() : renderDuplicatePlaces();
  }));
  refreshIcons();
}

function toggleAll(mode) {
  const places = mode === "delete" ? state.deletePlaces : state.duplicatePlaces;
  const set = mode === "delete" ? state.selectedDeleteIds : state.selectedDuplicateIds;
  const allSelected = places.length > 0 && places.every((place) => set.has(place.id));
  set.clear();
  if (!allSelected) places.forEach((place) => set.add(place.id));
  mode === "delete" ? renderDeletePlaces() : renderDuplicatePlaces();
}

function syncDuplicateAiControls() {
  const modelSelect = $("duplicateAiModelSelect");
  if (modelSelect) {
    modelSelect.value = state.duplicateAiModel;
    modelSelect.disabled = state.isCheckingDuplicates;
  }
  const thinkingSelect = $("duplicateAiThinkingSelect");
  if (thinkingSelect) {
    thinkingSelect.value = selectedReasoningValue(state.duplicateThinkingEnabled, state.duplicateReasoningEffort);
    thinkingSelect.disabled = state.isCheckingDuplicates;
  }
  const note = $("duplicateAiModeNote");
  if (note) {
    note.innerHTML = `<i data-lucide="brain-circuit" aria-hidden="true"></i><span>${aiModeSummary(state.duplicateAiModel, state.duplicateThinkingEnabled, state.duplicateReasoningEffort)} · JSON בלבד.</span>`;
  }
  const aiButton = $("runAiDuplicateButton");
  if (aiButton) {
    aiButton.disabled = state.isCheckingDuplicates;
    aiButton.innerHTML = state.isCheckingDuplicates
      ? `<i data-lucide="loader-circle" aria-hidden="true"></i><span>בודק כפילויות עם ${modelDisplayName(state.duplicateAiModel)}...</span>`
      : `<i data-lucide="sparkles" aria-hidden="true"></i><span>בדוק כפילויות עם DeepSeek</span>`;
  }
  refreshIcons();
}

function duplicateAiModelLabel() {
  return modelDisplayName(state.duplicateAiModel);
}

function syncOpeningHoursAiControls() {
  const modelSelect = $("openingHoursAiModelSelect");
  if (modelSelect) {
    modelSelect.value = state.openingHoursAiModel;
    modelSelect.disabled = state.openingHoursSaving;
  }
  const thinkingSelect = $("openingHoursAiThinkingSelect");
  if (thinkingSelect) {
    thinkingSelect.value = selectedReasoningValue(state.openingHoursThinkingEnabled, state.openingHoursReasoningEffort);
    thinkingSelect.disabled = state.openingHoursSaving;
  }
  const note = $("openingHoursAiModeNote");
  if (note) {
    note.innerHTML = `<i data-lucide="brain-circuit" aria-hidden="true"></i><span>${aiModeSummary(state.openingHoursAiModel, state.openingHoursThinkingEnabled, state.openingHoursReasoningEffort)} · JSON בלבד.</span>`;
  }
  refreshIcons();
}

function duplicateDestinationQuery() {
  return (state.destinations.duplicates?.label || $("duplicateDestinationInput")?.value.trim() || "").trim();
}

async function copyDuplicatePrompt() {
  await copyText(
    buildDuplicatePrompt(duplicateDestinationQuery(), state.duplicatePlaces),
    "פרומפט כפילויות הועתק.",
    "duplicateStatus"
  );
}

function runLocalDuplicateCheck() {
  const groups = [];
  const buckets = new Map();
  state.duplicatePlaces.forEach((place) => {
    const keys = [normalize(place.name), normalize(place.location), normalizeWebsite(place.website)].filter(Boolean);
    keys.forEach((key) => {
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(place);
    });
  });
  const seen = new Set();
  buckets.forEach((items, key) => {
    const unique = [...new Map(items.map((item) => [item.id, item])).values()];
    if (unique.length < 2) return;
    const ids = unique.map((item) => item.id).sort().join("|");
    if (seen.has(ids)) return;
    seen.add(ids);
    groups.push({ title: unique[0].name || key, reason: `התאמה מקומית לפי ${key}`, card_ids: unique.map((item) => item.id), recommended_keep_card_id: unique[0].id });
  });
  state.duplicateGroups = groups;
  groups.forEach((group) => group.card_ids.filter((id) => id !== group.recommended_keep_card_id).forEach((id) => state.selectedDuplicateIds.add(id)));
  renderDuplicatePlaces();
  setStatus("duplicateStatus", groups.length ? `נמצאו ${groups.length} קבוצות כפילות.` : "לא נמצאו כפילויות מקומיות.");
}

function renderDuplicateGroups() {
  $("duplicateGroups").innerHTML = state.duplicateGroups.map((group) => `<div class="duplicate-group"><strong>${escapeHtml(group.title)}</strong><small>${escapeHtml(group.reason || "")}</small><small>${group.card_ids.length} מקומות · מומלץ להשאיר: ${escapeHtml(group.recommended_keep_card_id || "לא הוגדר")}</small></div>`).join("");
}

function parseDuplicateResponse(response, candidates) {
  const byId = new Map(candidates.map((place) => [place.id, place]));
  const decoded = JSON.parse(extractJsonObjectText(response));
  if (decoded && typeof decoded === "object" && !Array.isArray(decoded) && text(decoded.result) === "no_duplicates") return [];
  const rawGroups = Array.isArray(decoded) ? decoded : decoded?.duplicate_groups;
  if (!Array.isArray(rawGroups)) return [];

  const groups = [];
  rawGroups.forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    let explicitIds = Array.isArray(raw.card_ids)
      ? raw.card_ids.map((id) => text(id)).filter(Boolean)
      : [];
    if (!explicitIds.length) {
      const keepId = text(raw.keep_card_id);
      if (keepId) explicitIds.push(keepId);
      if (Array.isArray(raw.delete_card_ids)) {
        explicitIds.push(...raw.delete_card_ids.map((id) => text(id)).filter(Boolean));
      }
    }

    const uniqueIds = [...new Set(explicitIds)].filter((id) => byId.has(id));
    if (uniqueIds.length < 2) return;

    const requestedKeepId = text(raw.recommended_keep_card_id || raw.keep_card_id);
    const keepId = uniqueIds.includes(requestedKeepId) ? requestedKeepId : uniqueIds[0];
    const firstPlace = byId.get(uniqueIds[0]);
    groups.push({
      title: text(raw.title || raw.canonical_name || raw.place_name) || firstPlace?.name || "קבוצת כפילות",
      reason: text(raw.reason),
      recommended_keep_card_id: keepId,
      card_ids: uniqueIds
    });
  });

  return groups.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase(), "he"));
}

function extractJsonObjectText(response) {
  let output = text(response);
  if (output.startsWith("```")) {
    const firstNewline = output.indexOf("\n");
    if (firstNewline !== -1) output = output.slice(firstNewline + 1);
    if (output.endsWith("```")) output = output.slice(0, -3);
  }
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start !== -1 && end > start) return output.slice(start, end + 1);
  return cleanJson(output);
}

async function runAiDuplicateCheck() {
  const endpoint = DUPLICATE_AI_ENDPOINT;
  if (!state.user) {
    setStatus("duplicateStatus", "צריך להתחבר לפני בדיקת AI.", true);
    return;
  }
  if (!state.destinations.duplicates?.lat || !state.destinations.duplicates?.lon) {
    setStatus("duplicateStatus", "בחר יעד מהרשימה כדי שנוכל לחשב רדיוס של 50 ק\"מ.", true);
    return;
  }
  if (state.duplicatePlaces.length < 2) {
    setStatus("duplicateStatus", `יש כרגע רק ${state.duplicatePlaces.length} מקומות ברשימה שנטענה. צריך לפחות 2 כדי לבדוק כפילויות.`, true);
    return;
  }
  const candidates = [...state.duplicatePlaces];
  try {
    state.isCheckingDuplicates = true;
    state.duplicateGroups = [];
    state.duplicateLiveReasoning = "";
    state.duplicateLiveAnswer = "";
    state.duplicateLiveModel = null;
    renderDuplicatePlaces();
    renderDuplicateLivePanel();
    syncDuplicateAiControls();
    setStatus("duplicateStatus", `שולח בדיקת כפילויות ל-${aiModeSummary(state.duplicateAiModel, state.duplicateThinkingEnabled, state.duplicateReasoningEffort)}...`);
    const idToken = await state.user.getIdToken();
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({
        feature: "admin_tool",
        systemPrompt: DUPLICATE_SYSTEM_PROMPT,
        userPrompt: buildDuplicatePrompt(duplicateDestinationQuery(), candidates),
        maxTokens: 8192,
        preferredModel: state.duplicateAiModel,
        thinkingEnabled: state.duplicateThinkingEnabled,
        reasoningEffort: state.duplicateReasoningEffort,
        temperature: thinkingTemperature(state.duplicateThinkingEnabled, state.duplicateReasoningEffort),
        jsonObjectResponse: true,
        stream: true
      })
    });
    if (!response.ok) throw new Error(await response.text());
    const payload = await readDeepSeekResponse(response, {
      getFallbackModel: () => state.duplicateAiModel,
      onModel: (model) => {
        state.duplicateLiveModel = model;
      },
      onReasoningDelta: (delta) => {
        state.duplicateLiveReasoning = appendLiveText(state.duplicateLiveReasoning, delta);
      },
      onContentDelta: (delta) => {
        state.duplicateLiveAnswer = appendLiveText(state.duplicateLiveAnswer, delta);
      },
      onText: (value) => {
        state.duplicateLiveAnswer = value;
      },
      render: renderDuplicateLivePanel
    });
    state.duplicateLiveModel = payload.model || state.duplicateLiveModel || state.duplicateAiModel;
    const parsed = parseDuplicateResponse(payload.text || state.duplicateLiveAnswer, candidates);
    state.duplicateGroups = parsed;
    state.selectedDuplicateIds.clear();
    state.duplicateGroups.forEach((group) => group.card_ids.filter((id) => id !== group.recommended_keep_card_id).forEach((id) => state.selectedDuplicateIds.add(id)));
    renderDuplicatePlaces();
    renderDuplicateLivePanel();
    setStatus("duplicateStatus", state.duplicateGroups.length ? `נמצאו ${state.duplicateGroups.length} קבוצות כפולים מתוך ${candidates.length} מקומות מ-TripInspo עם ${modelDisplayName(state.duplicateLiveModel || state.duplicateAiModel)}.` : `${modelDisplayName(state.duplicateLiveModel || state.duplicateAiModel)} החזיר JSON מפורש של no_duplicates עבור ${candidates.length} מקומות מ-TripInspo.`);
  } catch (error) {
    setStatus("duplicateStatus", `בדיקת AI נכשלה: ${error.message}`, true);
  } finally {
    state.isCheckingDuplicates = false;
    syncDuplicateAiControls();
  }
}

async function readDeepSeekResponse(response, handlers = {}) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = await response.json();
    if (payload.model) handlers.onModel?.(payload.model);
    if (payload.reasoning) handlers.onReasoningDelta?.(payload.reasoning);
    if (payload.text) handlers.onText?.(payload.text);
    handlers.render?.();
    return payload;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let fullReasoning = "";
  let model = handlers.getFallbackModel?.() || state.duplicateAiModel;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const rawEvent of parts) {
      const event = parseSseData(rawEvent);
      if (!event) continue;
      if (event.error) {
        throw new Error(event.detail ? `${event.error}: ${event.detail}` : event.error);
      }
      if (event.model) {
        model = event.model;
        handlers.onModel?.(model);
      }
      if (event.reasoningDelta) {
        fullReasoning += event.reasoningDelta;
        handlers.onReasoningDelta?.(event.reasoningDelta);
      }
      if (event.contentDelta) {
        handlers.onContentDelta?.(event.contentDelta);
        fullText += event.contentDelta;
      }
      if (event.text) {
        handlers.onText?.(event.text);
        fullText = event.text;
      }
      handlers.render?.();
    }
  }

  if (buffer.trim()) {
    const event = parseSseData(buffer);
    if (event?.error) {
      throw new Error(event.detail ? `${event.error}: ${event.detail}` : event.error);
    }
    if (event?.text) {
      fullText = event.text;
      handlers.onText?.(event.text);
      handlers.render?.();
    }
  }

  return { text: fullText, reasoning: fullReasoning, model };
}

function parseSseData(rawEvent) {
  const data = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")
    .trim();
  if (!data || data === "[DONE]") return null;
  try {
    return JSON.parse(data);
  } catch (_) {
    return null;
  }
}

function appendLiveText(current, delta) {
  if (!delta) return current;
  const next = `${current}${delta}`;
  return next.length <= 6000 ? next : next.slice(next.length - 6000);
}

function renderDuplicateLivePanel() {
  const panel = $("duplicateLivePanel");
  if (!panel) return;
  const hasContent = state.duplicateLiveReasoning.trim() || state.duplicateLiveAnswer.trim();
  panel.classList.toggle("is-hidden", !hasContent);
  $("duplicateLiveTitle").textContent = state.isCheckingDuplicates ? "DeepSeek Live" : "תשובת DeepSeek האחרונה";
  $("duplicateLiveMeta").textContent = aiModeSummary(state.duplicateLiveModel || state.duplicateAiModel, state.duplicateThinkingEnabled, state.duplicateReasoningEffort);
  $("duplicateLiveReasoning").textContent = state.duplicateLiveReasoning.trim() || "אין תוכן חשיבה להצגה.";
  $("duplicateLiveAnswer").textContent = state.duplicateLiveAnswer.trim() || "אין תשובה להצגה.";
}

function buildDuplicatePrompt(destinationQuery, places) {
  return JSON.stringify({
    destination_query: destinationQuery,
    search_radius_km: DUPLICATE_SEARCH_RADIUS_KM,
    destination_coordinates: {
      lat: state.destinations.duplicates?.lat ?? null,
      lon: state.destinations.duplicates?.lon ?? null
    },
    task: "Find TripInspo place cards that refer to the same real-world place.",
    places: places.map((place) => ({
      card_id: place.id,
      source: place.sharedByUsername || place.sharedByUid || "TripInspo",
      name: place.name,
      address: place.location || "",
      website: place.website || "",
      type: place.type
    }))
  }, null, 2);
}

async function deleteSelected(mode) {
  const statusId = mode === "delete" ? "deleteStatus" : "duplicateStatus";
  if (!state.user) {
    setStatus(statusId, "צריך להתחבר לפני מחיקה מ-Firestore.", true);
    return;
  }
  const set = mode === "delete" ? state.selectedDeleteIds : state.selectedDuplicateIds;
  const places = mode === "delete" ? state.deletePlaces : state.duplicatePlaces;
  const selected = places.filter((place) => set.has(place.id));
  if (!selected.length) return;
  const confirmed = await confirmAction({
    title: "מחיקה מ-Firestore",
    message: `למחוק ${selected.length} מקומות מ-public_places?`,
    confirmText: "מחק",
    tone: "danger",
    icon: "trash-2"
  });
  if (!confirmed) return;
  setStatus(statusId, `מוחק ${selected.length} מקומות מ-Firestore...`);
  let deleted = 0;
  const deletedIds = new Set();
  const failures = [];
  try {
    await ensureFreshAdminAuthToken();
    for (const place of selected) {
      try {
        const placeRef = state.firebase.firestore.doc(state.firebase.db, "public_places", place.id);
        await state.firebase.firestore.deleteDoc(placeRef);
        const deletedSnap = await state.firebase.firestore.getDocFromServer(placeRef);
        if (deletedSnap.exists()) throw new Error("Firestore לא מחק את המסמך. בדוק הרשאות Rules או פריסה.");
        deleted += 1;
        deletedIds.add(place.id);
      } catch (error) {
        console.warn("delete failed", place.id, error);
        failures.push(`${place.name || place.id}: ${firebaseErrorMessage(error)}`);
      }
    }
  } catch (error) {
    failures.push(firebaseErrorMessage(error));
  }
  if (mode === "delete") {
    state.deletePlaces = state.deletePlaces.filter((place) => !deletedIds.has(place.id));
    deletedIds.forEach((id) => state.selectedDeleteIds.delete(id));
    renderDeletePlaces();
    setStatus("deleteStatus", deleteSummaryMessage(deleted, failures), failures.length > 0);
  } else {
    state.duplicatePlaces = state.duplicatePlaces.filter((place) => !deletedIds.has(place.id));
    state.duplicateGroups = state.duplicateGroups
      .map((group) => ({
        ...group,
        card_ids: group.card_ids.filter((id) => !deletedIds.has(id))
      }))
      .filter((group) => group.card_ids.length >= 2);
    deletedIds.forEach((id) => state.selectedDuplicateIds.delete(id));
    renderDuplicatePlaces();
    setStatus("duplicateStatus", deleteSummaryMessage(deleted, failures), failures.length > 0);
  }
}

function bindImageDialog() {
  $$('[data-image-source]').forEach((button) => button.addEventListener("click", () => {
    state.imageSource = button.dataset.imageSource;
    syncImageSourceButtons();
    searchImages($("imageSearchInput").value.trim());
  }));
  $("translateImageSearchButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("imageSearchInput", event.currentTarget);
    if (translated) searchImages(translated);
  });
  $("runImageSearchButton").addEventListener("click", () => searchImages($("imageSearchInput").value.trim()));
  $("imageSearchInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchImages($("imageSearchInput").value.trim());
    }
  });
}

function openImageDialog(draftId, query, target = { kind: "draft" }) {
  state.imageDraftId = draftId;
  state.imageTarget = { ...target, id: draftId };
  $("imageSearchInput").value = query || "";
  $("imageResults").innerHTML = "";
  syncImageSourceButtons();
  $("imageDialog").showModal();
  if (query) searchImages(query);
}

async function searchImages(queryText) {
  if (!queryText) return;
  $("imageResults").innerHTML = emptyHtml("מחפש תמונות...");
  let images = [];
  try {
    if (state.imageSource === "unsplash") images = await fetchUnsplashImages(queryText);
    if (state.imageSource === "wikimedia") images = await fetchWikimediaImages(queryText);
    if (state.imageSource === "pixabay") images = await fetchPixabayImages(queryText);
  } catch (error) {
    $("imageResults").innerHTML = emptyHtml(`חיפוש התמונות נכשל: ${error.message}`);
    refreshIcons();
    return;
  }
  $("imageResults").innerHTML = images.map((image, index) => `<button class="image-option" type="button" data-image-index="${index}"><img src="${escapeAttr(normalizeImageUrl(image.thumb || image.url) || image.thumb || image.url)}" alt="" referrerpolicy="no-referrer" onerror="this.hidden=true;"><span>${escapeHtml(image.credit || image.source)}</span></button>`).join("") || emptyHtml("לא נמצאו תמונות במקור הזה. נסה מקור אחר או שאילתה אחרת.");
  $("imageResults").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
    applySelectedImage(images[Number(button.dataset.imageIndex)]);
    $("imageDialog").close();
  }));
  refreshIcons();
}

function syncImageSourceButtons() {
  $$('[data-image-source]').forEach((button) => button.classList.toggle("is-active", button.dataset.imageSource === state.imageSource));
}

function applySelectedImage(image) {
  if (!image) return;
  const imageUrl = normalizeImageUrl(image.url) || image.url;
  const credit = imageCreditFields(image, imageUrl);
  const pixabayId = image.source === "Pixabay" ? pixabayIdValue(image.pixabayId) : null;
  const pixabayPageUrl = image.source === "Pixabay" ? text(image.pageUrl) : "";
  if (state.imageTarget?.kind === "brokenEdit") {
    applyBrokenImageEdit(image);
    return;
  }
  if (state.imageTarget?.kind === "currentEdit") {
    setEditFieldValue("currentPlaceEditFields", "coverImageUrl", imageUrl);
    setEditFieldValue("currentPlaceEditFields", "coverPhotographerName", credit.name);
    setEditFieldValue("currentPlaceEditFields", "coverPhotographerUsername", credit.reference);
    setEditFieldValue("currentPlaceEditFields", "pixabayId", pixabayId ?? "");
    setEditFieldValue("currentPlaceEditFields", "pixabayPageUrl", pixabayPageUrl);
    return;
  }
  if (state.imageTarget?.kind === "draftEdit") {
    setEditFieldValue("draftReviewFields", "coverImageUrl", imageUrl);
    setEditFieldValue("draftReviewFields", "coverPhotographerName", credit.name);
    setEditFieldValue("draftReviewFields", "coverPhotographerUsername", credit.reference);
    setEditFieldValue("draftReviewFields", "pixabayId", pixabayId ?? "");
    setEditFieldValue("draftReviewFields", "pixabayPageUrl", pixabayPageUrl);
    return;
  }
  const draft = state.drafts.find((item) => item.id === state.imageDraftId);
  if (!draft) return;
  draft.coverImageUrl = imageUrl;
  draft.coverPhotographerName = credit.name;
  draft.coverPhotographerUsername = credit.reference;
  draft.pixabayId = pixabayId;
  draft.pixabayPageUrl = pixabayPageUrl;
  renderDrafts();
}

async function fetchUnsplashImages(query) {
  if (!query) return [];
  const data = await adminUnsplashSearch(state.user, { query, perPage: 12 });
  return (data?.results || []).map((item) => ({
    url: normalizeImageUrl(item.urls?.regular || item.urls?.full),
    thumb: normalizeImageUrl(item.urls?.small || item.urls?.thumb || item.urls?.regular),
    credit: item.user?.name ? `${item.user.name} / Unsplash` : "Unsplash",
    photographerName: item.user?.name || "",
    photographerUsername: item.user?.username || "",
    pageUrl: item.user?.links?.html || item.links?.html,
    source: "Unsplash"
  })).filter((item) => item.url);
}

async function fetchPixabayImages(query) {
  if (!query) return [];
  const data = await adminPixabaySearch(state.user, { q: query, perPage: 12 });
  return (data?.hits || []).map((item) => ({
    url: normalizeImageUrl(item.largeImageURL || item.webformatURL),
    thumb: normalizeImageUrl(item.webformatURL || item.previewURL),
    credit: "Pixabay",
    photographerName: "",
    photographerUsername: "",
    pageUrl: item.pageURL,
    pixabayId: item.id,
    source: "Pixabay"
  })).filter((item) => item.url);
}

async function fetchWikimediaImages(query) {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("origin", "*");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "12");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("iiurlwidth", "700");
  url.searchParams.set("format", "json");
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Wikimedia ${response.status}`);
  const data = await response.json();
  return Object.values(data.query?.pages || {}).map((page) => {
    const info = page.imageinfo?.[0];
    if (!info) return null;
    const artist = stripHtml(info.extmetadata?.Artist?.value || "");
    const title = stripHtml(info.extmetadata?.ObjectName?.value || page.title || "").replace(/^File:/i, "");
    const photographerName = artist || title || "Wikimedia Commons";
    return {
      url: normalizeImageUrl(info.url),
      thumb: normalizeImageUrl(info.thumburl || info.url),
      credit: ["Wikimedia Commons", photographerName].filter(Boolean).join(" · "),
      photographerName,
      photographerUsername: "",
      pageUrl: info.descriptionurl,
      source: "Wikimedia"
    };
  }).filter((item) => item?.url);
}

// ──────────────────────────────────────────────────────────
// Broken images repair view
// ──────────────────────────────────────────────────────────

function bindBrokenImages() {
  $("reloadBrokenImagesButton")?.addEventListener("click", async () => {
    if (!(await confirmDiscardBrokenEdits())) return;
    state.brokenLoaded = false;
    state.brokenEdits = {};
    loadBrokenImages({ force: true });
  });
  $("brokenSaveButton")?.addEventListener("click", saveBrokenEdits);
}

async function confirmDiscardBrokenEdits() {
  if (!Object.keys(state.brokenEdits).length) return true;
  return await confirmAction({
    title: "לסרוק מחדש?",
    message: "יש שינויים שלא נשמרו. להמשיך לסריקה מחדש ולאבד אותם?",
    confirmText: "סרוק מחדש",
    tone: "warning",
    icon: "refresh-cw"
  });
}

async function loadBrokenImages({ force = false } = {}) {
  if (state.brokenLoading) return;
  if (state.brokenLoaded && !force) {
    renderBrokenImages();
    return;
  }
  if (!state.firebase || !state.user) {
    setStatus("brokenImagesStatus", "מחכה להתחברות...", true);
    return;
  }
  state.brokenLoading = true;
  state.brokenLoaded = false;
  state.brokenPlaces = [];
  if ($("brokenImagesCountPill")) $("brokenImagesCountPill").textContent = "0 שבורות";
  if ($("brokenImagesScannedPill")) $("brokenImagesScannedPill").textContent = "0 נבדקו";
  renderBrokenImages();
  setStatus("brokenImagesStatus", "טוען מקומות מ-Firestore...");
  try {
    const fs = state.firebase.firestore;
    const snap = await fs.getDocs(fs.collection(state.firebase.db, "public_places"));
    const allPlaces = snap.docs.map(docToPlace);
    if ($("brokenImagesScannedPill")) $("brokenImagesScannedPill").textContent = `0 / ${allPlaces.length} נבדקו`;
    setStatus("brokenImagesStatus", `סורק ${allPlaces.length} מקומות לאיתור תמונות שבורות...`);
    let renderTimer = null;
    const queueRender = () => {
      if (renderTimer) return;
      renderTimer = window.setTimeout(() => {
        renderTimer = null;
        renderBrokenImages();
      }, BROKEN_IMAGE_RENDER_THROTTLE_MS);
    };
    const broken = await scanBrokenPlaces(allPlaces, {
      onBroken: (place, count) => {
        state.brokenPlaces.push(place);
        if ($("brokenImagesCountPill")) $("brokenImagesCountPill").textContent = `${count} שבורות`;
        queueRender();
      },
      onProgress: (scanned, total) => {
        if ($("brokenImagesScannedPill")) $("brokenImagesScannedPill").textContent = `${scanned} / ${total} נבדקו`;
        if (scanned === total || scanned % 10 === 0) {
          setStatus("brokenImagesStatus", `סורק תמונות... ${scanned} / ${total}. נמצאו עד עכשיו ${state.brokenPlaces.length}.`);
        }
      }
    });
    if (renderTimer) {
      window.clearTimeout(renderTimer);
      renderTimer = null;
    }
    state.brokenPlaces = broken.sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
    state.brokenLoaded = true;
    if ($("brokenImagesCountPill")) $("brokenImagesCountPill").textContent = `${broken.length} שבורות`;
    setStatus("brokenImagesStatus", broken.length ? `נמצאו ${broken.length} כרטיסיות עם תמונה שבורה.` : "כל הכרטיסיות תקינות.");
    renderBrokenImages();
  } catch (error) {
    setStatus("brokenImagesStatus", `סריקה נכשלה: ${firebaseErrorMessage(error)}`, true);
  } finally {
    state.brokenLoading = false;
  }
}

async function scanBrokenPlaces(places, { onBroken = null, onProgress = null } = {}) {
  const broken = [];
  const concurrency = Math.min(BROKEN_IMAGE_SCAN_CONCURRENCY, Math.max(places.length, 1));
  let cursor = 0;
  let scanned = 0;
  async function worker() {
    while (cursor < places.length) {
      const idx = cursor++;
      const place = places[idx];
      let isBroken = false;
      try {
        isBroken = await probePlaceImageBroken(place);
      } catch (error) {
        console.warn("[broken] image probe failed", place?.id, error);
        isBroken = true;
      }
      if (isBroken) {
        broken.push(place);
        onBroken?.(place, broken.length);
      }
      scanned += 1;
      onProgress?.(scanned, places.length);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return broken;
}

async function probePlaceImageBroken(place) {
  const candidates = imageCandidates(place);
  const pixabayId = pixabayIdValue(place.pixabayId);
  if (pixabayId) {
    const fresh = await resolvePixabayImageById(pixabayId);
    if (fresh && await probeImageLoadWithRetry(fresh, { timeoutMs: PIXABAY_IMAGE_PROBE_TIMEOUT_MS })) return false;
  }
  if (!candidates.length) return true;
  for (const candidate of candidates) {
    const resolved = await resolveRenderableImageUrl(candidate).catch(() => "");
    const url = resolved || candidate;
    const timeoutMs = pixabayId || isPixabayImageUrl(url) ? PIXABAY_IMAGE_PROBE_TIMEOUT_MS : IMAGE_PROBE_TIMEOUT_MS;
    if (await probeImageLoadWithRetry(url, { timeoutMs })) return false;
  }
  return true;
}

async function probeImageLoadWithRetry(url, { timeoutMs = IMAGE_PROBE_TIMEOUT_MS, retryDelayMs = IMAGE_PROBE_RETRY_DELAY_MS } = {}) {
  if (await probeImageLoad(url, { timeoutMs })) return true;
  await waitForImageProbeRetry(retryDelayMs);
  return probeImageLoad(url, { timeoutMs });
}

function probeImageLoad(url, { timeoutMs = IMAGE_PROBE_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const img = new Image();
    img.referrerPolicy = "no-referrer";
    let done = false;
    let timeoutId = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    timeoutId = window.setTimeout(() => {
      if (img.complete && img.naturalWidth > 0) {
        finish(true);
      } else {
        finish(false);
      }
    }, timeoutMs);
  });
}

function waitForImageProbeRetry(delayMs) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, delayMs);
  });
}

function renderBrokenImages() {
  const container = $("brokenImagesGrid");
  if (!container) return;
  const places = state.brokenPlaces;
  if (!places.length) {
    container.innerHTML = emptyHtml(state.brokenLoaded ? "אין כרטיסיות שבורות 🎉" : "טוען...");
    syncBrokenSaveFooter();
    refreshIcons();
    return;
  }
  container.innerHTML = places.map(renderBrokenPlaceCard).join("");
  places.forEach((place) => bindBrokenCard(place));
  syncBrokenSaveFooter();
  refreshIcons();
}

function renderBrokenPlaceCard(place) {
  const id = place.id;
  const edit = state.brokenEdits[id];
  const emoji = place.coverEmoji || PLACE_EMOJI[place.type] || "📌";
  const destination = text(place.destination || destinationHint(place) || "");
  const location = text(place.location || "");
  const shortDescription = text(place.shortDescription || place.description || "");
  const previewUrl = edit?.coverImageUrl || "";
  const isAtmosphere = edit ? Boolean(edit.isAtmosphereImage) : Boolean(place.isAtmosphereImage);
  const creditLabel = edit ? brokenCreditLabel(edit) : "";
  const isModified = Boolean(edit);
  const searchLink = `https://www.google.com/search?q=${encodeURIComponent([place.name, destination].filter(Boolean).join(" "))}`;
  return `<article class="broken-card ${isModified ? "is-modified" : ""}" data-broken-id="${escapeAttr(id)}">
    <div class="broken-card-preview">
      ${previewUrl
      ? `<img src="${escapeAttr(previewUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'broken-card-preview-empty',textContent:'${escapeAttr(emoji)}'}));" />`
      : `<div class="broken-card-preview-empty">${escapeHtml(emoji)}</div>`}
      ${creditLabel ? `<span class="broken-card-credit">${escapeHtml(creditLabel)}</span>` : ""}
      ${isModified ? `<span class="broken-card-modified-badge">חדש</span>` : ""}
    </div>
    <div class="broken-card-body">
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <p class="broken-card-meta">${escapeHtml(destination)}${location ? ` · ${escapeHtml(location)}` : ""}</p>
      ${shortDescription ? `<p class="broken-card-desc">${escapeHtml(shortDescription)}</p>` : ""}
      <label class="broken-card-toggle">
        <input type="checkbox" data-broken-action="atmosphere" ${isAtmosphere ? "checked" : ""} />
        <span>תמונת אווירה</span>
      </label>
      <div class="broken-card-actions">
        <button class="primary-action small-action" type="button" data-broken-action="pick">
          <i data-lucide="image-plus" aria-hidden="true"></i>
          <span>בחר תמונה</span>
        </button>
        <a class="ghost-action small-action" href="${escapeAttr(searchLink)}" target="_blank" rel="noopener noreferrer">
          <i data-lucide="search" aria-hidden="true"></i>
          <span>חיפוש באינטרנט</span>
        </a>
        ${isModified ? `<button class="ghost-action small-action" type="button" data-broken-action="reset">
          <i data-lucide="undo-2" aria-hidden="true"></i>
          <span>בטל</span>
        </button>` : ""}
      </div>
    </div>
  </article>`;
}

function brokenCreditLabel(edit) {
  if (edit?.source === "Pixabay") return "Pixabay";
  if (edit?.source === "Wikimedia") {
    const name = text(edit.coverPhotographerName);
    return name ? `Wikimedia · ${name}` : "Wikimedia Commons";
  }
  if (edit?.source === "Unsplash") {
    const name = text(edit.coverPhotographerName);
    return name ? `Unsplash · ${name}` : "Unsplash";
  }
  return "";
}

function bindBrokenCard(place) {
  const id = place.id;
  const card = document.querySelector(`[data-broken-id="${cssEscape(id)}"]`);
  if (!card) return;
  card.querySelector('[data-broken-action="pick"]')?.addEventListener("click", () => {
    openBrokenImagePicker(place);
  });
  card.querySelector('[data-broken-action="atmosphere"]')?.addEventListener("change", (event) => {
    setBrokenAtmosphere(id, event.target.checked, place);
  });
  card.querySelector('[data-broken-action="reset"]')?.addEventListener("click", () => {
    delete state.brokenEdits[id];
    renderBrokenImages();
  });
}

function openBrokenImagePicker(place) {
  state.imageTarget = { kind: "brokenEdit", id: place.id };
  state.imageDraftId = place.id;
  $("imageSearchInput").value = text(place.name);
  $("imageResults").innerHTML = "";
  syncImageSourceButtons();
  $("imageDialog").showModal();
  if ($("imageSearchInput").value) searchImages($("imageSearchInput").value);
}

function setBrokenAtmosphere(id, value, place) {
  const existing = state.brokenEdits[id];
  if (existing) {
    existing.isAtmosphereImage = Boolean(value);
  } else {
    state.brokenEdits[id] = {
      id: place.id,
      name: place.name || "",
      coverImageUrl: place.coverImageUrl || "",
      coverPhotographerName: text(place.coverPhotographerName),
      coverPhotographerUsername: text(place.coverPhotographerUsername),
      pixabayId: pixabayIdValue(place.pixabayId),
      pixabayPageUrl: text(place.pixabayPageUrl),
      source: "",
      isAtmosphereImage: Boolean(value),
      onlyAtmosphereChanged: true
    };
  }
  syncBrokenSaveFooter();
}

function applyBrokenImageEdit(image) {
  const placeId = state.imageTarget?.id;
  if (!placeId) return;
  const place = state.brokenPlaces.find((item) => item.id === placeId);
  if (!place) return;
  const imageUrl = normalizeImageUrl(image.url) || image.url;
  const credit = imageCreditFields(image, imageUrl);
  const previousAtmosphere = state.brokenEdits[placeId]?.isAtmosphereImage ?? Boolean(place.isAtmosphereImage);
  state.brokenEdits[placeId] = {
    id: place.id,
    name: place.name || "",
    coverImageUrl: imageUrl,
    thumbUrl: normalizeImageUrl(image.thumb || ""),
    sourcePageUrl: text(image.pageUrl),
    coverPhotographerName: credit.name,
    coverPhotographerUsername: credit.reference,
    pixabayId: image.source === "Pixabay" ? pixabayIdValue(image.pixabayId) : null,
    pixabayPageUrl: image.source === "Pixabay" ? text(image.pageUrl) : "",
    source: image.source || "",
    isAtmosphereImage: previousAtmosphere,
    onlyAtmosphereChanged: false
  };
  renderBrokenImages();
}

function brokenImageEditSourceCandidates(edit, place = null) {
  return [
    edit?.coverImageUrl,
    edit?.thumbUrl,
    edit?.sourcePageUrl,
    edit?.pixabayPageUrl,
    place?.coverImageUrl,
    ...collectImageCandidates(place?.imageUrls)
  ];
}

function syncBrokenSaveFooter() {
  const footer = $("brokenSaveFooter");
  if (!footer) return;
  const count = Object.keys(state.brokenEdits).length;
  footer.classList.toggle("is-hidden", count === 0);
  const label = $("brokenSaveButtonLabel");
  if (label) label.textContent = count ? `שמור שינויים (${count})` : "שמור שינויים";
}

async function saveBrokenEdits() {
  if (state.brokenSaving) return;
  if (!state.firebase || !state.user) {
    setStatus("brokenImagesStatus", "מחכה להתחברות...", true);
    return;
  }
  const ids = Object.keys(state.brokenEdits);
  if (!ids.length) return;
  state.brokenSaving = true;
  const button = $("brokenSaveButton");
  if (button) button.disabled = true;
  setStatus("brokenImagesStatus", `שומר ${ids.length} שינויים...`);
  const fs = state.firebase.firestore;
  let saved = 0;
  let failed = 0;
  let authRefreshFailed = false;
  const failures = [];
  try {
    await ensureFreshAdminAuthToken();
    for (const id of ids) {
      const edit = state.brokenEdits[id];
      const place = state.brokenPlaces.find((item) => item.id === id);
      try {
        const data = {
          isAtmosphereImage: Boolean(edit.isAtmosphereImage),
          updatedAt: fs.serverTimestamp()
        };
        if (!edit.onlyAtmosphereChanged) {
          const uploadedEdit = await ensurePlaceImageOnR2({ ...place, ...edit, id }, {
            sourceCandidates: brokenImageEditSourceCandidates(edit, place)
          });
          const url = uploadedEdit.coverImageUrl || "";
          if (!url || !isR2ImageUrl(url)) throw new Error("לא התקבל קישור R2 תקין");
          data.coverImageUrl = url || null;
          data.imageUrls = url ? [url] : [];
          data.imageStoredOnR2 = isR2ImageUrl(url);
          data.coverPhotographerName = nullable(uploadedEdit.coverPhotographerName);
          data.coverPhotographerUsername = nullable(uploadedEdit.coverPhotographerUsername);
          data.pixabayId = isR2ImageUrl(url) ? null : pixabayIdValue(uploadedEdit.pixabayId);
          data.pixabayPageUrl = isR2ImageUrl(url) ? null : nullable(uploadedEdit.pixabayPageUrl);
        }
        const ref = fs.doc(state.firebase.db, "public_places", id);
        await fs.setDoc(ref, data, { merge: true });
        saved++;
        delete state.brokenEdits[id];
        if (!edit.onlyAtmosphereChanged && edit.coverImageUrl) {
          state.brokenPlaces = state.brokenPlaces.filter((item) => item.id !== id);
        } else if (edit.onlyAtmosphereChanged) {
          const place = state.brokenPlaces.find((item) => item.id === id);
          if (place) place.isAtmosphereImage = Boolean(edit.isAtmosphereImage);
        }
      } catch (error) {
        failed++;
        failures.push(`${place?.name || edit?.name || id}: ${friendlyImageUploadError(error)}`);
        console.error("[broken] save failed", id, error);
      }
    }
  } catch (error) {
    authRefreshFailed = true;
    failed = ids.length;
    console.error("[broken] auth refresh failed", error);
    setStatus("brokenImagesStatus", `השמירה נכשלה: ${firebaseErrorMessage(error)}`, true);
  }
  if ($("brokenImagesCountPill")) $("brokenImagesCountPill").textContent = `${state.brokenPlaces.length} שבורות`;
  if (!authRefreshFailed) {
    setStatus(
      "brokenImagesStatus",
      failed
        ? `נשמרו ${saved}, נכשלו ${failed}: ${failures.slice(0, 3).join(" | ")}${failures.length > 3 ? ` ועוד ${failures.length - 3}` : ""}`
        : `נשמרו ${saved} שינויים בהצלחה.`,
      Boolean(failed)
    );
  }
  state.brokenSaving = false;
  if (button) button.disabled = false;
  renderBrokenImages();
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.charCodeAt(0).toString(16)} `);
}

function imageHtml(item) {
  const candidates = imageCandidates(item);
  const pixabayId = pixabayIdValue(item.pixabayId);
  const firstCandidate = candidates[0] || "";
  const shouldResolvePixabay = pixabayId && !isR2ImageUrl(firstCandidate);
  const cachedFresh = shouldResolvePixabay ? getCachedPixabayUrl(pixabayId) : "";
  const initialUrl = cachedFresh || candidates[0] || "";
  const fallbacks = candidates.filter((url) => url !== initialUrl);
  const repairUrls = imageRepairCandidates(item, initialUrl);
  const fallback = `<span class="emoji-cover" ${initialUrl ? "hidden" : ""}>${escapeHtml(item.coverEmoji || PLACE_EMOJI[item.type] || "📌")}</span>`;
  const atmosphereBadge = item.isAtmosphereImage ? `<span class="atmosphere-badge">תמונת אווירה</span>` : "";
  const pixabayAttr = shouldResolvePixabay ? ` data-pixabay-id="${escapeAttr(pixabayId)}"` : "";
  return `<div class="place-image">${initialUrl ? `<img src="${escapeAttr(initialUrl)}" data-fallbacks="${escapeAttr(JSON.stringify(fallbacks))}" data-repair-urls="${escapeAttr(JSON.stringify(repairUrls))}"${pixabayAttr} alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="window.tripTapAdminImageFallback?.(this);">` : ""}${fallback}${atmosphereBadge}${imageCreditHtml(item, initialUrl)}</div>`;
}

function currentPlaceToDraft(place) {
  return {
    id: place.id,
    name: text(place.name),
    destination: text(place.destination || destinationHint(place)),
    type: text(place.type) || "place_type_attraction",
    shortDescription: text(place.shortDescription),
    description: text(place.description),
    location: text(place.location),
    lat: number(place.lat),
    lon: number(place.lon),
    hours: text(place.hours),
    website: text(place.website),
    reservationLabel: text(place.reservationLabel) || "reservation_no",
    isKosher: Boolean(place.isKosher),
    foodType: text(place.foodType),
    rating: number(place.rating),
    coverEmoji: text(place.coverEmoji) || PLACE_EMOJI[place.type] || "📌",
    coverBackgroundHex: text(place.coverBackgroundHex) || "#3B82F6",
    coverImageUrl: text(imageCandidates(place)[0] || normalizeImageUrl(place.coverImageUrl || (Array.isArray(place.imageUrls) ? place.imageUrls[0] : ""))),
    coverPhotographerName: text(place.coverPhotographerName),
    coverPhotographerUsername: text(place.coverPhotographerUsername),
    pixabayId: pixabayIdValue(place.pixabayId),
    pixabayPageUrl: text(place.pixabayPageUrl),
    isAtmosphereImage: Boolean(place.isAtmosphereImage),
    imageSearchQuery: text(place.imageSearchQuery || place.name)
  };
}

function pixabayIdValue(raw) {
  if (raw == null || raw === "") return null;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function draftFromEditFields(containerId, fallback = {}) {
  const container = $(containerId);
  const draft = currentPlaceToDraft(fallback);
  container.querySelectorAll("[data-edit-field]").forEach((field) => {
    const key = field.dataset.editField;
    if (field.type === "checkbox") draft[key] = field.checked;
    else if (["rating", "lat", "lon"].includes(key)) draft[key] = number(field.value);
    else if (key === "pixabayId") draft[key] = pixabayIdValue(field.value);
    else draft[key] = field.value;
  });
  return draft;
}

function fieldValue(containerId, field) {
  return text($(containerId)?.querySelector(`[data-edit-field="${field}"]`)?.value);
}

function setEditFieldValue(containerId, field, value) {
  const input = $(containerId)?.querySelector(`[data-edit-field="${field}"]`);
  if (input) input.value = value || "";
}

function editInput(field, label, value) {
  return `<label class="edit-field"><span>${escapeHtml(label)}</span><input data-edit-field="${escapeAttr(field)}" value="${escapeAttr(value ?? "")}" /></label>`;
}

function editTextarea(field, label, value) {
  return `<label class="edit-field full"><span>${escapeHtml(label)}</span><textarea data-edit-field="${escapeAttr(field)}" rows="5">${escapeHtml(value ?? "")}</textarea></label>`;
}

function renderPlaceTags(place) {
  const tags = [];
  tags.push(`<span class="info-chip ${place.adminApproved === true ? "approval-chip" : "pending-chip"}">${place.adminApproved === true ? "אושר מנהל" : "ממתין לאישור"}</span>`);
  if (place.isKosher) tags.push(`<span class="info-chip kosher-chip">כשר ✓</span>`);
  if (text(place.foodType)) tags.push(`<span class="info-chip food-chip">${escapeHtml(foodEmoji(place.foodType))} ${escapeHtml(foodTypeLabel(place.foodType))}</span>`);
  return tags.length ? `<div class="place-card-tags">${tags.join("")}</div>` : "";
}

function placeTypeLabel(type) {
  return PLACE_TYPES.find(([key]) => key === type)?.[1] || text(type) || "מקום";
}

function foodTypeLabel(type) {
  return FOOD_TYPE_LABELS[text(type)] || text(type);
}

function foodEmoji(type) {
  const key = text(type);
  if (key === "food_type_italian") return "🍝";
  if (key === "food_type_dairy") return "🥛";
  if (key === "food_type_meat") return "🥩";
  if (key === "food_type_vegetarian") return "🥗";
  if (key === "food_type_asian") return "🥢";
  if (key === "food_type_shawarma") return "🥙";
  if (key === "food_type_pizza") return "🍕";
  if (key === "food_type_burger") return "🍔";
  if (key === "food_type_cafe") return "☕";
  return "🍴";
}

function creditText(item) {
  return text(item.coverPhotographerName);
}

function imageCreditDisplay(item) {
  const url = imageCandidates(item)[0] || item.coverImageUrl || "";
  if (isPixabayImageRecord(item, url)) return "";
  const name = stripCreditPrefix(item.coverPhotographerName || "");
  if (isWikimediaImageUrl(url)) return name ? `Wikimedia Commons · ${name}` : "Wikimedia Commons";
  if (isUnsplashCredit(item)) return name ? `${name} / Unsplash` : "Unsplash";
  return text(item.coverPhotographerName);
}

function imageCreditFields(image, imageUrl = "") {
  if (isPixabayImageRecord(image, imageUrl)) return { name: "", reference: "" };
  return {
    name: imageCreditName(image),
    reference: imageCreditReference(image) || ""
  };
}

function imageCreditName(image) {
  return stripCreditPrefix(image.photographerName || image.coverPhotographerName || image.credit || image.source || "");
}

function imageCreditReference(image) {
  return text(image.photographerUsername || image.coverPhotographerUsername || image.pageUrl || image.profileUrl || image.creditUrl || "");
}

function imageCreditHtml(item, imageUrl) {
  if (!imageUrl) return "";
  if (isPixabayImageRecord(item, imageUrl)) return "";
  const name = stripCreditPrefix(item.coverPhotographerName || "");
  const reference = text(item.coverPhotographerUsername);
  if (isWikimediaImageUrl(imageUrl)) {
    const label = name ? `Wikimedia Commons · ${name}` : "Wikimedia Commons";
    return `<span class="image-credit-badge image-credit-wikimedia">${escapeHtml(label)}</span>`;
  }
  if (isUnsplashCredit(item)) {
    return `<span class="image-credit-badge image-credit-unsplash"><a href="${escapeAttr(unsplashProfileUrl(reference))}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a><span>/</span><a href="https://unsplash.com/?utm_source=trip_planner&utm_medium=referral" target="_blank" rel="noopener noreferrer">Unsplash</a></span>`;
  }
  if (name) {
    const label = reference ? `<a href="${escapeAttr(reference)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>` : escapeHtml(name);
    return `<span class="image-credit-badge">${label}</span>`;
  }
  return "";
}

function isUnsplashCredit(item) {
  const name = stripCreditPrefix(item.coverPhotographerName || "");
  const reference = text(item.coverPhotographerUsername);
  return Boolean(name && reference && (reference.includes("unsplash.com") || !/^https?:/i.test(reference)));
}

function unsplashProfileUrl(value) {
  const raw = text(value);
  if (/^https?:\/\//i.test(raw)) return addUnsplashUtm(raw);
  return `https://unsplash.com/@${encodeURIComponent(raw)}?utm_source=trip_planner&utm_medium=referral`;
}

function addUnsplashUtm(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("utm_source", "trip_planner");
    parsed.searchParams.set("utm_medium", "referral");
    return parsed.toString();
  } catch (_) {
    return url;
  }
}

function stripCreditPrefix(value) {
  return text(value)
    .replace(/^Unsplash\s*[·/]\s*/i, "")
    .replace(/^Pixabay\s*[·/]\s*/i, "")
    .replace(/^Wikimedia Commons\s*[·/]\s*/i, "")
    .trim();
}

function imageCandidates(item) {
  const rawCandidates = [
    item.coverImageUrl,
    item.imageUrl,
    item.image_url,
    item.photoUrl,
    item.thumbnailUrl,
    ...collectImageCandidates(item.imageUrls),
    ...collectImageCandidates(item.images),
    ...collectImageCandidates(item.galleryImages)
  ];
  const normalized = [];
  const seen = new Set();
  rawCandidates.forEach((candidate) => {
    const url = normalizeImageUrl(candidate);
    if (!url || seen.has(url)) return;
    seen.add(url);
    normalized.push(url);
  });
  const renderable = normalized.filter(isRenderableRemoteImageUrl);
  return renderable.length ? renderable : normalized;
}

function refreshImageSourceCandidates(item) {
  const rawCandidates = [
    item.coverImageUrl,
    item.imageUrl,
    item.image_url,
    item.photoUrl,
    item.thumbnailUrl,
    item.coverSourcePageUrl,
    item.sourcePageUrl,
    item.pageUrl,
    item.coverPhotographerUsername,
    ...collectImageCandidates(item.imageUrls),
    ...collectImageCandidates(item.images),
    ...collectImageCandidates(item.galleryImages)
  ];
  const seen = new Set();
  return rawCandidates
    .map(normalizeImageUrl)
    .filter(Boolean)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function imageRepairCandidates(item, currentUrl = "") {
  const rawCandidates = [
    item.coverSourcePageUrl,
    item.sourcePageUrl,
    item.pageUrl,
    item.coverPhotographerUsername,
    item.coverImageUrl,
    item.imageUrl,
    item.image_url,
    ...collectImageCandidates(item.imageUrls),
    ...collectImageCandidates(item.images),
    ...collectImageCandidates(item.galleryImages)
  ];
  const current = normalizeImageUrl(currentUrl);
  const seen = new Set();
  return rawCandidates
    .map(normalizeImageUrl)
    .filter(Boolean)
    .filter((url) => !current || url !== current)
    .filter((url) => isPixabayImageUrl(url))
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function normalizeImageUrl(raw) {
  const value = text(raw);
  if (!value) return "";
  const unescaped = stripHtml(value).replace(/&amp;/g, "&");
  if (!unescaped) return "";
  if (unescaped !== value) return normalizeImageUrl(unescaped);
  if (value.startsWith("//")) return `https:${value}`;
  let parsed;
  try {
    parsed = new URL(value);
  } catch (_) {
    return value;
  }
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  const host = parsed.host.toLowerCase();
  const decodedPath = safeDecodeURIComponent(parsed.pathname);
  if (host.includes("wikimedia.org") || host.includes("wikipedia.org")) {
    if (decodedPath.startsWith("/wiki/Special:FilePath/")) return parsed.toString();
    if (decodedPath.startsWith("/wiki/Special:Redirect/file/")) {
      const fileName = decodedPath.slice("/wiki/Special:Redirect/file/".length);
      return `https://${parsed.host}/wiki/Special:FilePath/${encodeURIComponent(fileName).replace(/%2F/g, "/")}`;
    }
    if (decodedPath.startsWith("/wiki/File:")) {
      const fileName = decodedPath.slice("/wiki/File:".length);
      return `https://${parsed.host}/wiki/Special:FilePath/${encodeURIComponent(fileName).replace(/%2F/g, "/")}`;
    }
    const title = text(parsed.searchParams.get("title"));
    if (title.startsWith("File:")) {
      return `https://${parsed.host}/wiki/Special:FilePath/${encodeURIComponent(title.slice(5)).replace(/%2F/g, "/")}`;
    }
    if (title.startsWith("Special:Redirect/file/")) {
      return `https://${parsed.host}/wiki/Special:FilePath/${encodeURIComponent(title.slice("Special:Redirect/file/".length)).replace(/%2F/g, "/")}`;
    }
  }
  return parsed.toString();
}

function isR2ImageUrl(raw) {
  const value = text(raw);
  if (!value) return false;
  try {
    const host = new URL(value).host.toLowerCase();
    return host.includes(".r2.dev") || host.includes(".r2.cloudflarestorage.com");
  } catch (_) {
    return value.includes(".r2.dev/") || value.includes(".r2.cloudflarestorage.com/");
  }
}

async function ensurePlaceImageOnR2(draft, options = {}) {
  const sourceCandidates = [
    draft.coverImageUrl,
    ...(Array.isArray(options.sourceCandidates) ? options.sourceCandidates : [])
  ];
  const seen = new Set();
  const candidates = sourceCandidates
    .map(normalizeImageUrl)
    .filter(Boolean)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  if (!candidates.length) {
    draft.coverImageUrl = "";
    return draft;
  }
  const r2Url = candidates.find(isR2ImageUrl);
  if (r2Url) {
    draft.coverImageUrl = r2Url;
    return draft;
  }

  const errors = [];
  for (const originalUrl of candidates) {
    try {
      const renderableUrl = await placeImageDownloadUrl(draft, originalUrl);
      const copiedUrl = await copyRemotePlaceImageToR2(renderableUrl, draft);
      if (copiedUrl) {
        draft.coverImageUrl = copiedUrl;
        return draft;
      }
      const blob = await downloadImageBlob(renderableUrl);
      draft.coverImageUrl = await uploadBlobToR2PlaceImage(blob, renderableUrl, draft);
      return draft;
    } catch (error) {
      errors.push(`${shortUrl(originalUrl)}: ${friendlyImageUploadError(error)}`);
    }
  }
  throw new Error(`לא הצלחתי להעלות אף תמונה ל-R2. ${errors.slice(0, 3).join(" | ")}`);
}

async function placeImageDownloadUrl(draft, originalUrl) {
  const pixabayId = pixabayIdValue(draft.pixabayId);
  if (pixabayId) {
    const fresh = await resolvePixabayImageById(pixabayId);
    if (fresh) return fresh;
  }
  return await resolveRenderableImageUrl(originalUrl) || originalUrl;
}

async function downloadImageBlob(imageUrl) {
  const response = await fetch(imageUrl, {
    mode: "cors",
    credentials: "omit",
    referrerPolicy: "no-referrer"
  });
  if (!response.ok) throw new Error(`Image download ${response.status}`);
  const blob = await response.blob();
  if (!blob || blob.size === 0) throw new Error("Image download returned an empty file");
  return blob;
}

async function uploadBlobToR2PlaceImage(blob, sourceUrl, draft) {
  if (!state.user) throw new Error("Missing Firebase user for R2 upload");
  const contentType = blob.type || contentTypeFromUrl(sourceUrl) || "image/jpeg";
  const key = r2PlaceImageKey(draft, contentType, sourceUrl);
  const idToken = await state.user.getIdToken(true);
  const mintResponse = await fetch(`${WORKFLOW_URL}/r2-upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    },
    body: JSON.stringify({ key, contentType, expiresInSeconds: 600 })
  });
  if (!mintResponse.ok) throw new Error(`R2 upload URL ${mintResponse.status}: ${await mintResponse.text()}`);
  const mint = await mintResponse.json();
  if (!mint?.url) throw new Error("R2 upload URL response missing signed URL");

  const putResponse = await fetch(mint.url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob
  });
  if (!putResponse.ok) throw new Error(`R2 upload ${putResponse.status}: ${await putResponse.text()}`);
  if (mint.publicUrl) return mint.publicUrl;
  throw new Error("R2 upload response missing public URL");
}

async function copyRemotePlaceImageToR2(sourceUrl, draft) {
  if (!state.user) throw new Error("Missing Firebase user for R2 upload");
  const contentType = contentTypeFromUrl(sourceUrl) || "image/jpeg";
  const key = r2PlaceImageKey(draft, contentType, sourceUrl);
  const idToken = await state.user.getIdToken(true);
  try {
    const response = await fetch(`${WORKFLOW_URL}/r2-copy-url`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ sourceUrl, key, contentType })
    });
    if (!response.ok) return "";
    const payload = await response.json();
    return text(payload?.publicUrl);
  } catch (_) {
    return "";
  }
}

function r2PlaceImageKey(draft, contentType, sourceUrl = "") {
  return `${R2_PLACE_IMAGE_FOLDER}/${safeR2Slug(draft.name || draft.id || "place")}-${randomUploadId()}.${imageExtension(contentType, sourceUrl)}`;
}

function contentTypeFromUrl(url) {
  const ext = extensionFromUrl(url);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

function imageExtension(contentType, sourceUrl = "") {
  const normalized = text(contentType).split(";")[0].toLowerCase();
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("avif")) return "avif";
  const fromUrl = extensionFromUrl(sourceUrl);
  return fromUrl || "jpg";
}

function extensionFromUrl(url) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    const match = path.match(/\.([a-z0-9]{2,5})$/);
    const ext = match?.[1] || "";
    if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return ext === "jpeg" ? "jpg" : ext;
  } catch (_) { }
  return "";
}

function safeR2Slug(value) {
  const slug = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return encodeURIComponent(slug || "place").replace(/%/g, "").toLowerCase() || "place";
}

function randomUploadId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRenderableRemoteImageUrl(raw) {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return false;
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch (_) {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;
  if (isKnownImagePageUrl(parsed)) return false;
  const host = parsed.host.toLowerCase();
  const decodedPath = safeDecodeURIComponent(parsed.pathname);
  if (host.includes("wikimedia.org") || host.includes("wikipedia.org")) {
    if (host.startsWith("upload.")) return true;
    if (decodedPath.startsWith("/wiki/Special:FilePath/")) return true;
    if (decodedPath.startsWith("/wiki/")) return false;
    if (decodedPath.startsWith("/w/index.php")) return false;
  }
  return true;
}

function isPixabayImageRecord(item, imageUrl = "") {
  return item?.source === "Pixabay"
    || isPixabayImageUrl(imageUrl)
    || isPixabayImageUrl(item?.coverImageUrl)
    || isPixabayImageUrl(item?.imageUrl)
    || isPixabayImageUrl(item?.pageUrl)
    || isPixabayImageUrl(item?.coverPhotographerUsername)
    || /^Pixabay\b/i.test(text(item?.coverPhotographerName))
    || /^Pixabay\b/i.test(text(item?.credit));
}

function isPixabayImageUrl(raw) {
  const value = text(raw);
  if (!value) return false;
  try {
    const host = new URL(normalizeImageUrl(value)).host.toLowerCase();
    return host === "pixabay.com" || host.endsWith(".pixabay.com") || host === "cdn.pixabay.com" || host.endsWith(".cdn.pixabay.com");
  } catch (_) {
    return value.toLowerCase().includes("pixabay.com");
  }
}

function collectImageCandidates(value) {
  if (!value) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectImageCandidates);
  if (typeof value === "object") {
    return [
      value.url,
      value.imageUrl,
      value.image_url,
      value.src,
      value.full,
      value.regular,
      value.largeImageURL,
      value.webformatURL,
      value.thumb,
      value.thumbnailUrl
    ].flatMap(collectImageCandidates);
  }
  return [];
}

function isKnownImagePageUrl(parsed) {
  const host = parsed.host.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (host === "pixabay.com" || host.endsWith(".pixabay.com")) {
    return !/\.(?:avif|webp|jpe?g|png)(?:$|[?#])/i.test(parsed.href);
  }
  if (host === "unsplash.com" || host.endsWith(".unsplash.com")) {
    return path.startsWith("/photos/") || path.startsWith("/@");
  }
  return false;
}

function isWikimediaImageUrl(url) {
  try {
    const host = new URL(url).host.toLowerCase();
    return host.includes("wikimedia.org") || host.includes("wikipedia.org");
  } catch (_) {
    return text(url).toLowerCase().includes("wikimedia.org") || text(url).toLowerCase().includes("wikipedia.org");
  }
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

window.tripTapAdminImageFallback = async (image) => {
  const pixabayId = pixabayIdValue(image.dataset.pixabayId);
  if (pixabayId && image.dataset.pixabayRefreshed !== "done") {
    image.dataset.pixabayRefreshed = "done";
    clearCachedPixabayUrl(pixabayId);
    const fresh = await resolvePixabayImageById(pixabayId, { force: true });
    if (fresh && fresh !== image.src) {
      image.src = fresh;
      return;
    }
  }
  let fallbacks = [];
  try {
    fallbacks = JSON.parse(image.dataset.fallbacks || "[]");
  } catch (_) { }
  const next = fallbacks.shift();
  if (next) {
    image.dataset.fallbacks = JSON.stringify(fallbacks);
    image.src = next;
    return;
  }
  if (image.dataset.remoteRepair !== "done") {
    image.dataset.remoteRepair = "done";
    let repairUrls = [];
    try {
      repairUrls = JSON.parse(image.dataset.repairUrls || "[]");
    } catch (_) { }
    const candidates = [...repairUrls, image.src];
    for (const candidate of candidates) {
      const repaired = await resolveRenderableImageUrl(candidate);
      if (repaired && repaired !== image.src && isRenderableRemoteImageUrl(repaired)) {
        image.src = repaired;
        return;
      }
    }
  }
  image.hidden = true;
  image.nextElementSibling?.removeAttribute("hidden");
};

function applyPixabayResolvers(root) {
  const scope = root || document;
  const images = scope.querySelectorAll('img[data-pixabay-id]');
  images.forEach((image) => {
    const id = pixabayIdValue(image.dataset.pixabayId);
    if (!id) return;
    if (image.dataset.pixabayResolved === "done") return;
    image.dataset.pixabayResolved = "done";
    const cached = getCachedPixabayUrl(id);
    if (cached && cached !== image.src) {
      image.src = cached;
      return;
    }
    if (cached) return;
    resolvePixabayImageById(id).then((fresh) => {
      if (fresh && fresh !== image.src) image.src = fresh;
    }).catch(() => { });
  });
}

async function resolveRenderableImageUrl(raw) {
  const normalized = normalizeImageUrl(raw);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    if (isPixabayPageUrl(parsed)) return await fetchPixabayImageByPageUrl(parsed);
    return normalized;
  } catch (_) {
    return normalized;
  }
}

function isPixabayPageUrl(parsed) {
  const host = parsed.host.toLowerCase();
  if (host !== "pixabay.com" && !host.endsWith(".pixabay.com")) return false;
  return !/\.(?:avif|webp|jpe?g|png)(?:$|[?#])/i.test(parsed.href);
}

const PIXABAY_URL_CACHE_KEY = "tripTapPixabayUrlCache_v1";
const PIXABAY_URL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const pixabayUrlMemoryCache = new Map();
const pixabayUrlInflight = new Map();

function readPixabayUrlCache() {
  try {
    const raw = localStorage.getItem(PIXABAY_URL_CACHE_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (_) { return {}; }
}

function writePixabayUrlCache(obj) {
  try { localStorage.setItem(PIXABAY_URL_CACHE_KEY, JSON.stringify(obj)); } catch (_) { }
}

function getCachedPixabayUrl(id) {
  if (!id) return "";
  if (pixabayUrlMemoryCache.has(id)) return pixabayUrlMemoryCache.get(id);
  const cache = readPixabayUrlCache();
  const entry = cache[String(id)];
  if (entry && entry.url && Date.now() - (entry.savedAt || 0) < PIXABAY_URL_CACHE_TTL_MS) {
    pixabayUrlMemoryCache.set(id, entry.url);
    return entry.url;
  }
  return "";
}

function setCachedPixabayUrl(id, url) {
  if (!id || !url) return;
  pixabayUrlMemoryCache.set(id, url);
  const cache = readPixabayUrlCache();
  cache[String(id)] = { url, savedAt: Date.now() };
  writePixabayUrlCache(cache);
}

function clearCachedPixabayUrl(id) {
  if (!id) return;
  pixabayUrlMemoryCache.delete(id);
  const cache = readPixabayUrlCache();
  delete cache[String(id)];
  writePixabayUrlCache(cache);
}

async function resolvePixabayImageById(id, { force = false } = {}) {
  const numericId = pixabayIdValue(id);
  if (!numericId) return "";
  if (!force) {
    const cached = getCachedPixabayUrl(numericId);
    if (cached) return cached;
  }
  if (pixabayUrlInflight.has(numericId)) return pixabayUrlInflight.get(numericId);
  const promise = (async () => {
    try {
      const data = await adminPixabayLookupById(state.user, numericId);
      const hit = data?.hits?.[0];
      const fresh = normalizeImageUrl(hit?.largeImageURL || hit?.webformatURL || "");
      if (fresh) setCachedPixabayUrl(numericId, fresh);
      return fresh;
    } catch (_) {
      return "";
    } finally {
      pixabayUrlInflight.delete(numericId);
    }
  })();
  pixabayUrlInflight.set(numericId, promise);
  return promise;
}

async function fetchPixabayImageByPageUrl(parsed) {
  const match = parsed.pathname.match(/-(\d+)\/?$/);
  if (!match) return "";
  try {
    const data = await adminPixabayLookupById(state.user, Number(match[1]));
    const hit = data?.hits?.[0];
    return normalizeImageUrl(hit?.largeImageURL || hit?.webformatURL);
  } catch (_) {
    return "";
  }
}

function hasUnsavedPlacesWork() {
  if (state.drafts.length > 0) return true;
  if (text($("jsonInput")?.value)) return true;
  return [
    "currentPlaceEditDialog",
    "draftReviewDialog",
    "draftAddressDialog",
    "imageDialog"
  ].some((id) => $(id)?.open === true);
}

function destinationHint(place) {
  return text(place.destination) || text(place.city) || text(place.country) || text(place.location).split(",").slice(-2, -1)[0]?.trim() || "";
}

function missingDraftFields(draft) {
  const missing = [];
  if (!text(draft.name)) missing.push("שם המקום");
  if (!text(draft.destination)) missing.push("יעד");
  if (!text(draft.location)) missing.push("כתובת");
  if (draft.lat == null || draft.lon == null) missing.push("קואורדינטות");
  if (!text(draft.hours)) missing.push("שעות פתיחה");
  if (!text(draft.shortDescription)) missing.push("תיאור קצר");
  if (!text(draft.coverImageUrl)) missing.push("תמונה");
  if (draft.type === "place_type_restaurant" && !text(draft.foodType)) missing.push("סוג אוכל");
  return missing;
}

function draftSearchUrl(draft) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent([draft.name, draft.destination].filter(Boolean).join(" "))}`;
}

function webSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(text(query))}`;
}

async function translateSearchQueryToEnglish(queryText) {
  const raw = text(queryText);
  if (!raw || !hasHebrew(raw)) return raw;
  const translated = await translateTextToEnglish(raw);
  return translated && !hasHebrew(translated) ? translated : raw;
}

async function translateInputValueToEnglish(inputId, button = null) {
  const input = $(inputId);
  if (!input) return "";
  const raw = text(input.value);
  if (!raw) return "";
  if (!hasHebrew(raw)) {
    showToast("השדה כבר נראה באנגלית, לא שיניתי אותו.", "warning");
    return "";
  }
  setTranslateButtonLoading(button, true);
  try {
    const translated = await translateTextToEnglish(raw);
    if (!translated || translated === raw || hasHebrew(translated)) {
      showToast("לא הצלחתי לתרגם את הטקסט הזה לאנגלית. נסה ניסוח קצר יותר או שם יעד מלא.", "warning");
      return "";
    }
    input.value = translated;
    showToast(`תרגמתי לאנגלית: ${translated}`, "success");
    return translated;
  } finally {
    setTranslateButtonLoading(button, false);
  }
}

async function translateTextToEnglish(queryText) {
  const raw = text(queryText);
  if (!raw) return "";
  const aliasTranslation = translateHebrewAddressQuery(raw);
  if (aliasTranslation && !hasHebrew(aliasTranslation)) return cleanEnglishTranslation(aliasTranslation);

  const providers = [translateWithGoogle, translateWithMyMemory];
  for (const provider of providers) {
    try {
      const translated = cleanEnglishTranslation(await provider(raw));
      if (translated && translated !== raw && !hasHebrew(translated)) return translated;
    } catch (_) { }
  }

  const fallback = cleanEnglishTranslation(aliasTranslation || "");
  return fallback && !hasHebrew(fallback) ? fallback : "";
}

async function translateWithGoogle(queryText) {
  const url = new URL("https://translate.googleapis.com/translate_a/single");
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "auto");
  url.searchParams.set("tl", "en");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", queryText);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Translate ${response.status}`);
  const payload = await response.json();
  return (payload?.[0] || []).map((part) => part?.[0] || "").join(" ");
}

async function translateWithMyMemory(queryText) {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", queryText);
  url.searchParams.set("langpair", "he|en");
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`Translate ${response.status}`);
  const payload = await response.json();
  return payload?.responseData?.translatedText || "";
}

function cleanEnglishTranslation(value) {
  return stripHtml(value)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function hasHebrew(value) {
  return /[\u0590-\u05FF]/.test(text(value));
}

function setTranslateButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
}

function setSaveAllButtonsLoading(isLoading) {
  ["saveAllDraftsButton", "saveAllDraftsFooterButton"].forEach((id) => {
    const button = $(id);
    if (!button) return;
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
  });
}

function showToast(message, tone = "success") {
  const stack = ensureToastStack();
  const toneClass = tone === "error" ? "trip-toast-error" : tone === "warning" ? "trip-toast-warning" : "";
  const icon = tone === "error" ? "circle-alert" : tone === "warning" ? "triangle-alert" : "circle-check";
  const toast = document.createElement("div");
  toast.className = `trip-toast ${toneClass}`.trim();
  toast.innerHTML = `<i data-lucide="${icon}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  stack.appendChild(toast);
  refreshIcons();
  window.setTimeout(() => {
    toast.classList.add("is-leaving");
    window.setTimeout(() => toast.remove(), 420);
  }, 2800);
}

function ensureToastStack() {
  let stack = document.querySelector(".trip-toast-stack");
  if (stack) return stack;
  stack = document.createElement("div");
  stack.className = "trip-toast-stack";
  document.body.appendChild(stack);
  return stack;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function mapWithConcurrency(items, limit, worker) {
  const queue = [...items.entries()];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const [index, item] = queue.shift();
      await worker(item, index);
    }
  });
  await Promise.all(runners);
}

function isLikelyDuplicate(a, b) {
  const nameMatch = normalize(a.name) && normalize(a.name) === normalize(b.name);
  const locationMatch = normalize(a.location) && normalize(a.location) === normalize(b.location);
  const websiteMatch = normalizeWebsite(a.website) && normalizeWebsite(a.website) === normalizeWebsite(b.website);
  return (nameMatch && locationMatch) || (nameMatch && websiteMatch) || (locationMatch && websiteMatch);
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const radius = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function text(value) { return value == null ? "" : String(value).trim(); }
function number(value) { const raw = String(value ?? "").trim(); if (!raw) return null; const parsed = Number(raw.replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; }
function nullable(value) { const output = text(value); return output || null; }
function normalize(value) { return text(value).toLowerCase().replace(/[\s,./\\-]+/g, " ").trim(); }
function formatCoords(lat, lon) { return lat == null || lon == null ? "" : `${Number(lat).toFixed(6)}, ${Number(lon).toFixed(6)}`; }
function escapeRegExp(value) { return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function normalizeWebsite(value) { return text(value).toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, ""); }
function stripHtml(value) { const div = document.createElement("div"); div.innerHTML = value || ""; return div.textContent || ""; }
function escapeHtml(value) { return text(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#039;"); }
function emptyHtml(message) { return `<div class="empty-screen"><i data-lucide="inbox"></i><p>${escapeHtml(message)}</p></div>`; }
function shortUrl(raw) {
  try {
    const parsed = new URL(text(raw));
    return `${parsed.host}${parsed.pathname}`.slice(0, 90);
  } catch (_) {
    return text(raw).slice(0, 90);
  }
}
function friendlyImageUploadError(error) {
  const message = error?.message || String(error || "שגיאה לא ידועה");
  if (/failed to fetch|cors|network/i.test(message)) return "השרת של התמונה חוסם הורדה מהדפדפן או מהרשת";
  if (/Image download 403|\b403\b/.test(message)) return "שרת התמונה חסם גישה";
  if (/Image download 404|\b404\b/.test(message)) return "קישור התמונה כבר לא קיים";
  if (/Image download 429|\b429\b/.test(message)) return "שרת התמונה הגביל יותר מדי בקשות";
  if (/empty file/i.test(message)) return "הקישור החזיר קובץ ריק";
  if (/R2 upload/i.test(message)) return "העלאה ל-R2 נכשלה";
  if (/R2 copy/i.test(message)) return "העתקה דרך השרת ל-R2 נכשלה";
  return message;
}
function firebaseErrorMessage(error) {
  const code = error?.code || "";
  const message = error?.message || String(error || "שגיאה לא ידועה");
  if (code === "permission-denied" || /permission/i.test(message)) {
    return "אין הרשאה לבצע את הפעולה. אם ניסית לערוך/למחוק מקום שמשתמש אחר הוסיף, צריך לוודא ש-Firestore rules החדשים נפרסו לפרויקט.";
  }
  if (code === "unavailable") return "Firestore לא זמין כרגע או שאין חיבור רשת. נסה שוב בעוד רגע.";
  if (code === "not-found") return "המסמך לא נמצא ב-Firestore.";
  return message;
}
function deleteSummaryMessage(deleted, failures) {
  if (!failures.length) return `נמחקו ${deleted} מקומות בהצלחה.`;
  const failureText = failures.slice(0, 3).join(" | ");
  const more = failures.length > 3 ? ` ועוד ${failures.length - 3} שגיאות` : "";
  return `נמחקו ${deleted} מקומות. ${failures.length} מחיקות נכשלו: ${failureText}${more}`;
}
function setStatus(id, message, isError = false) { const el = $(id); if (!el) return; el.textContent = message || ""; el.style.color = isError ? "var(--red)" : "var(--muted)"; }
async function copyText(value, message, statusId = "importStatus") { await navigator.clipboard.writeText(value); setStatus(statusId, message); }
