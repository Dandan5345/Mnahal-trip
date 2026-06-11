import {
  createAdminShell,
  attachSharedUi,
  resolveAdminView,
  setupUnsavedChangesWarning,
  adminPixabaySearch,
  adminPixabayLookupById,
  adminUnsplashSearch,
  withAppCheckHeaders,
  renderPromptNotesField,
  bindPromptNotesInput,
  getPromptNotes,
  combinePromptWithNotes,
  debounce
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
  food_type_cafe: "קפה"
};

const RESERVATION_OPTIONS = [
  ["reservation_no", "לא צריך להזמין"],
  ["reservation_recommended", "מומלץ להזמין"],
  ["reservation_yes", "חובה להזמין"]
];

const CHOICE_OTHER_VALUE = "__other__";

const AI_PREFERENCE_STORAGE_PREFIX = "places-admin-ai";

const state = {
  firebase: null,
  user: null,
  view: "current",
  destinations: { import: null, duplicates: null, delete: null, currentFilter: null, fixAddress: null, translate: null },
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
  fixAddressPlaces: [],
  selectedFixAddressIds: new Set(),
  fixAddressRadiusKm: 50,
  fixAddressRefreshing: false,
  fixAddressModalPlaceId: null,
  fixAddressModalSelection: null,
  fixAddressModalTimer: null,
  fixAddressModalSeq: 0,
  reviewingDraftId: null,
  expandedDraftSearchId: null,
  duplicatePlaces: [],
  deletePlaces: [],
  selectedDuplicateIds: new Set(),
  selectedDeleteIds: new Set(),
  duplicateGroups: [],
  duplicatesCheckActive: false,
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
  pendingEnrich: null,
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
  translatePlaces: [],
  selectedTranslateIds: new Set(),
  translateRadiusKm: 50,
  translateLang: "en",
  translateSending: false,
  translateAiModel: storedAiPreference("translate", "model", "deepseek-v4-pro"),
  translateThinkingEnabled: storedAiPreference("translate", "thinkingEnabled", "true") !== "false",
  translateReasoningEffort: storedAiPreference("translate", "reasoningEffort", "high"),
  translateLiveReasoning: "",
  translateLiveAnswer: "",
  translateLiveModel: null,
  aiBusyNoticeOpen: false
};

const DUPLICATE_SEARCH_RADIUS_KM = 50;
const DUPLICATE_AI_BATCH_SIZE = 40;
const DUPLICATE_NAME_MAX_EDITS = 4;
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
const GOOGLE_PLACES_ENDPOINT = `${WORKFLOW_URL}/google-places`;
const GEMINI_PLACE_HOURS_ENDPOINT = `${WORKFLOW_URL}/gemini-place-hours`;
const CHECK_WEBSITE_HOURS = "מומלץ לבדוק באתר";
const BROKEN_IMAGE_SCAN_CONCURRENCY = 6;
const BROKEN_IMAGE_RENDER_THROTTLE_MS = 120;
const IMAGE_PROBE_TIMEOUT_MS = 20000;
const PIXABAY_IMAGE_PROBE_TIMEOUT_MS = 30000;
const IMAGE_PROBE_RETRY_DELAY_MS = 450;
const R2_REFRESH_CONCURRENCY = 4;
const IMPORT_ENRICH_CONCURRENCY = 5;
const IMPORT_SAVE_CONCURRENCY = 4;

const DUPLICATE_SYSTEM_PROMPT = `
אתה מנקה כפילויות של כרטיסיות מקומות באפליקציית Trip Planner.
תקבל רשימת כרטיסיות מ-TripInspo מאותו אזור. לכל כרטיסיה יש card_id, name, address, website, hours, type.
המטרה: לקבץ רק כרטיסיות שמייצגות את אותו מקום פיזי / אותו עסק אמיתי, גם אם השם כתוב אחרת.
חשוב: כתובת זהה לבד אינה מספיקה. דרוש גם שם דומה (עד כ-4 שינויי אותיות/רווחים/סימנים) או שעות פתיחה דומות. עבור על כל הכרטיסיות והשווה משמעות, הקשר, כתובת, שעות, סוג מקום ואתר. למשל "הכותל בירושלים", "הכותל המערבי" ו-"Western Wall" יכולים להיות אותו מקום גם בלי שם זהה אחד-לאחד.

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

const TRANSLATE_LANG_OPTIONS = [
  { value: "en", label: "אנגלית", english: "English" },
  { value: "fr", label: "צרפתית", english: "French" }
];

function translateLangConfig(lang) {
  return TRANSLATE_LANG_OPTIONS.find((option) => option.value === lang) || TRANSLATE_LANG_OPTIONS[0];
}

function buildTranslateSystemPrompt(lang) {
  const targetEnglish = translateLangConfig(lang).english;
  return `
You translate TripInspo place cards for a Trip Planner app from Hebrew into ${targetEnglish}.
You will receive a JSON array of places, each with: place_id, name, shortDescription, description, hours.

Translate ONLY these four free-text fields into ${targetEnglish}: name, shortDescription, description, hours.
Keep proper nouns sensible and natural for ${targetEnglish} readers (use the common ${targetEnglish} name of well-known places when one exists).
If a source field is empty, return an empty string "" for it.

Return STRICT JSON ONLY. No markdown, no code fences, no prose, no comments, no extra keys.
The output MUST be a single JSON object keyed by each place_id, where each value has ONLY these four translated fields:
{
  "<place_id>": { "name": "...", "shortDescription": "...", "description": "...", "hours": "..." }
}

Hard rules:
- Output exactly one object per input place_id that you were asked to translate, using the same place_id keys.
- Do NOT translate, add, or include any other fields. Specifically do NOT touch type, foodType, reservationLabel, location, or address — those are localized separately by the app and must stay as-is (Hebrew).
- Each value object must contain exactly these keys: name, shortDescription, description, hours.
- Never invent place_ids, names, or content that did not appear in the input.
`;
}

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
  "fix-addresses": {
    title: "תיקון כתובות",
    subtitle: "משיכת מקומות לפי רדיוס, מחיקת קואורדינטות ישנות ומשיכה מחדש מ-Photon לפי הכתובת.",
    actions: ""
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
  },
  translate: {
    title: "תרגם כרטיסיות",
    subtitle: "טעינת כרטיסיות לפי יעד, תרגום עם AI לאנגלית/צרפתית ושמירה ל-public_places.",
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
  let config;
  if (feature === "duplicates") {
    config = {
      model: state.duplicateAiModel,
      thinkingEnabled: state.duplicateThinkingEnabled,
      reasoningEffort: state.duplicateReasoningEffort,
      modelSelectId: "duplicateAiModelSelect",
      reasoningSelectId: "duplicateAiThinkingSelect"
    };
  } else if (feature === "translate") {
    config = {
      model: state.translateAiModel,
      thinkingEnabled: state.translateThinkingEnabled,
      reasoningEffort: state.translateReasoningEffort,
      modelSelectId: "translateAiModelSelect",
      reasoningSelectId: "translateAiThinkingSelect"
    };
  } else {
    config = {
      model: state.openingHoursAiModel,
      thinkingEnabled: state.openingHoursThinkingEnabled,
      reasoningEffort: state.openingHoursReasoningEffort,
      modelSelectId: "openingHoursAiModelSelect",
      reasoningSelectId: "openingHoursAiThinkingSelect"
    };
  }
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

// Design A — "Calm" Places reskin: inject the page-scoped stylesheet once
// and mark the body so places-a.css can scope every selector under .pa-root.
if (!document.getElementById("places-a-css")) {
  const l = document.createElement("link");
  l.id = "places-a-css";
  l.rel = "stylesheet";
  l.href = "./places-a.css";
  document.head.appendChild(l);
}
document.body.classList.add("pa-root");

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

            ${renderPromptNotesField("places-import", "importPromptNotesInput")}

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
            ${renderPromptNotesField("places-duplicates", "duplicatePromptNotesInput")}
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
              <h2>קבוצות כפילויות</h2>
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

      <div class="tool-view ${activeView === "fix-addresses" ? "is-active" : ""}" data-tool-view="fix-addresses">
        <div class="workspace-grid single-search-grid">
          <article class="panel wide-panel">
            <div class="panel-heading">
              <span class="panel-icon teal"><i data-lucide="map-pinned" aria-hidden="true"></i></span>
              <div>
                <h2>תיקון כתובות וקואורדינטות</h2>
                <p>בחר נקודת ייחוס, משוך את כל המקומות ברדיוס, ורענן קואורדינטות מ-Photon לפי הכתובת השמורה.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="fixAddressDestinationInput">נקודת ייחוס (עיר/כתובת)</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateFixAddressDestinationButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row">
                <i data-lucide="radar" aria-hidden="true"></i>
                <input id="fixAddressDestinationInput" type="text" placeholder="לדוגמה: Vienna, וינה, Rome" autocomplete="off" />
              </div>
              <div class="suggestions" id="fixAddressDestinationSuggestions"></div>
            </div>
            <div class="selected-place" id="selectedFixAddressDestination">
              <i data-lucide="radar" aria-hidden="true"></i>
              <span>בחר נקודה מתוך ההשלמה האוטומטית של Photon.</span>
            </div>
            <div class="field-block">
              <label for="fixAddressRadiusRange">רדיוס משיכה</label>
              <div class="range-row">
                <input id="fixAddressRadiusRange" type="range" min="1" max="300" step="1" value="50" />
                <b id="fixAddressRadiusValue">50 ק"מ</b>
              </div>
            </div>
            <div class="action-row">
              <button class="primary-action" type="button" id="loadFixAddressPlacesButton">
                <i data-lucide="download-cloud" aria-hidden="true"></i>
                <span>משיכה</span>
              </button>
              <button class="ghost-action" type="button" id="selectFixAddressAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר/בטל הכל</span>
              </button>
            </div>
            <p class="status-line" id="fixAddressStatus"></p>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">מקומות ברדיוס</p>
              <h2>בחר מקומות ורענן כתובת</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="fixAddressLoadedPill">0 מקומות</span>
              <span class="count-pill" id="fixAddressSelectedPill">0 מסומנים</span>
              <button class="primary-action" type="button" id="refreshFixAddressButton">
                <i data-lucide="refresh-cw" aria-hidden="true"></i>
                <span>רענן כתובת</span>
              </button>
            </div>
          </div>
          <div class="cards-grid compact-grid" id="fixAddressCards"></div>
        </section>
      </div>

      <div class="tool-view ${activeView === "translate" ? "is-active" : ""}" data-tool-view="translate">
        <div class="workspace-grid duplicate-layout">
          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon blue"><i data-lucide="languages" aria-hidden="true"></i></span>
              <div>
                <h2>טעינת כרטיסיות לפי יעד</h2>
                <p>בחר נקודת ייחוס ורדיוס משיכה.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="translateDestinationInput">יעד לתרגום</label>
              <div class="field-mini-toolbar">
                <button class="mini-toggle" type="button" id="translateTranslateDestinationButton">
                  <i data-lucide="languages" aria-hidden="true"></i>
                  <span>תרגם לאנגלית</span>
                </button>
              </div>
              <div class="search-input-row">
                <i data-lucide="radar" aria-hidden="true"></i>
                <input id="translateDestinationInput" type="text" placeholder="בחר יעד לתרגום כרטיסיות" autocomplete="off" />
              </div>
              <div class="suggestions" id="translateDestinationSuggestions"></div>
            </div>
            <div class="selected-place" id="selectedTranslateDestination">
              <i data-lucide="radar" aria-hidden="true"></i>
              <span>בחר נקודה מתוך ההשלמה האוטומטית.</span>
            </div>
            <div class="field-block">
              <label for="translateRadiusRange">רדיוס משיכה</label>
              <div class="range-row">
                <input id="translateRadiusRange" type="range" min="1" max="300" step="1" value="50" />
                <b id="translateRadiusValue">50 ק"מ</b>
              </div>
            </div>
            <div class="action-row">
              <button class="primary-action" type="button" id="loadTranslatePlacesButton">
                <i data-lucide="download-cloud" aria-hidden="true"></i>
                <span>טען כרטיסיות</span>
              </button>
              <button class="ghost-action" type="button" id="selectTranslateAllButton">
                <i data-lucide="check-square" aria-hidden="true"></i>
                <span>בחר את כולם</span>
              </button>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <span class="panel-icon violet"><i data-lucide="sparkles" aria-hidden="true"></i></span>
              <div>
                <h2>תרגום עם AI</h2>
                <p>בחר שפת יעד, מודל ורמת חשיבה לפני שליחה.</p>
              </div>
            </div>
            <div class="field-block">
              <label for="translateLangSelect">שפת יעד</label>
              <select id="translateLangSelect">
                <option value="en">אנגלית (EN)</option>
                <option value="fr">צרפתית (FR)</option>
              </select>
            </div>
            ${renderAiPreferenceControls("translate", "translateAiModeNote")}
            <div class="action-row">
              <button class="primary-action" type="button" id="runTranslateButton">
                <i data-lucide="sparkles" aria-hidden="true"></i>
                <span>שלח ל-AI</span>
              </button>
              <button class="ghost-action" type="button" id="copyTranslatePromptButton">
                <i data-lucide="copy" aria-hidden="true"></i>
                <span>העתק פרומפט</span>
              </button>
            </div>
            <p class="status-line" id="translateStatus"></p>
            <div class="duplicate-live-panel is-hidden" id="translateLivePanel">
              <div class="duplicate-live-heading">
                <strong id="translateLiveTitle">תשובת DeepSeek האחרונה</strong>
                <span id="translateLiveMeta"></span>
              </div>
              <div class="duplicate-live-grid">
                <div>
                  <span>חשיבה</span>
                  <pre id="translateLiveReasoning"></pre>
                </div>
                <div>
                  <span>תשובה</span>
                  <pre id="translateLiveAnswer"></pre>
                </div>
              </div>
            </div>
          </article>
        </div>

        <section class="result-section">
          <div class="section-heading compact">
            <div>
              <p class="eyebrow">כרטיסיות לתרגום</p>
              <h2>בחר כרטיסיות ותרגם</h2>
            </div>
            <div class="action-row tight">
              <span class="count-pill" id="translateLoadedPill">0 כרטיסיות</span>
              <span class="count-pill" id="translateSelectedPill">0 מסומנים</span>
            </div>
          </div>
          <div class="cards-grid compact-grid" id="translateCards"></div>
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

      <dialog class="image-dialog address-fix-dialog" id="fixAddressDialog">
        <form method="dialog" class="image-dialog-shell address-fix-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">תיקון כתובת ידני</p>
              <h2 id="fixAddressModalTitle">בחירת כתובת</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="field-block">
            <label for="fixAddressModalInput">כתובת לחיפוש</label>
            <div class="search-input-row">
              <i data-lucide="map-pin" aria-hidden="true"></i>
              <input id="fixAddressModalInput" type="text" placeholder="כתוב כתובת מדויקת ובחר מההשלמה האוטומטית" autocomplete="off" />
            </div>
            <div class="suggestions" id="fixAddressModalSuggestions"></div>
          </div>
          <div class="selected-place" id="selectedFixAddressModal">
            <i data-lucide="radar" aria-hidden="true"></i>
            <span>חובה לבחור כתובת מתוך ההשלמה האוטומטית כדי לעדכן קואורדינטות.</span>
          </div>
          <p class="status-line" id="fixAddressModalStatus"></p>
          <div class="action-row split-actions">
            <button class="ghost-action" type="button" id="searchFixAddressWebButton"><i data-lucide="globe"></i><span>חיפוש באינטרנט</span></button>
            <button class="primary-action" type="button" id="applyFixAddressModalButton"><i data-lucide="check"></i><span>עדכן ושמור</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="image-dialog edit-dialog" id="enrichConfirmDialog">
        <form method="dialog" class="image-dialog-shell edit-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow" id="enrichConfirmSource">אישור עדכון</p>
              <h2 id="enrichConfirmTitle">מקום</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="enrich-confirm-body" id="enrichConfirmBody"></div>
          <div class="action-row split-actions">
            <button class="ghost-action" value="cancel">ביטול</button>
            <button class="primary-action" type="button" id="applyEnrichConfirmButton"><i data-lucide="check"></i><span>אישור</span></button>
          </div>
        </form>
      </dialog>

      <dialog class="gh-chat-dialog" id="geminiHoursChatDialog">
        <div class="gh-chat-shell">
          <header class="gh-chat-header">
            <div class="gh-chat-peer">
              <span class="gh-chat-avatar"><i data-lucide="sparkles" aria-hidden="true"></i></span>
              <div class="gh-chat-peer-info">
                <b id="geminiHoursChatTitle">Gemini</b>
                <small id="geminiHoursChatStatus">מחובר · שעות פתיחה</small>
              </div>
            </div>
            <div class="gh-chat-source-toggle" role="group" aria-label="מקור החיפוש">
              <button class="gh-source-option is-active" type="button" data-search-mode="maps">
                <i data-lucide="map-pinned" aria-hidden="true"></i><span>גוגל מפס</span>
              </button>
              <button class="gh-source-option" type="button" data-search-mode="search">
                <i data-lucide="globe" aria-hidden="true"></i><span>חיפוש בגוגל</span>
              </button>
            </div>
            <button class="gh-chat-close" type="button" id="geminiHoursChatClose" aria-label="סגירת הצ'אט">
              <i data-lucide="x" aria-hidden="true"></i>
            </button>
          </header>
          <div class="gh-chat-messages" id="geminiHoursChatMessages"></div>
          <footer class="gh-chat-footer">
            <div class="gh-chat-quick">
              <button class="gh-quick-chip" type="button" id="geminiHoursRetryButton">
                <i data-lucide="rotate-ccw" aria-hidden="true"></i><span>נסה שוב</span>
              </button>
              <button class="gh-quick-chip gh-apply-chip" type="button" id="geminiHoursApplyButton" disabled>
                <i data-lucide="check-check" aria-hidden="true"></i><span>עדכן שעות בכרטיסייה</span>
              </button>
            </div>
            <div class="gh-chat-input-row">
              <textarea id="geminiHoursChatInput" rows="1" placeholder="כתוב לג'מיני או הדבק קישור לבדיקה..."></textarea>
              <button class="gh-chat-send" type="button" id="geminiHoursSendButton" aria-label="שליחת הודעה">
                <i data-lucide="send" aria-hidden="true"></i>
              </button>
            </div>
          </footer>
        </div>
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
  bindFixAddressTools();
  bindDuplicateTools();
  bindDeleteTools();
  bindTranslateTools();
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

// רינדור מדורג: מציג מיד את הנתח הראשון ומשלים את השאר בפריימים הבאים,
// כדי שחיפוש/סינון ברשימות גדולות לא יקפיא את הדף.
const RENDER_CHUNK_SIZE = 60;
const chunkRenderTokens = new Map();

function renderCardsInChunks(container, items, renderItem, emptyMarkup, onChunk) {
  const token = (chunkRenderTokens.get(container) || 0) + 1;
  chunkRenderTokens.set(container, token);
  if (!items.length) {
    container.innerHTML = emptyMarkup;
    refreshIcons();
    return;
  }
  container.innerHTML = items.slice(0, RENDER_CHUNK_SIZE).map(renderItem).join("");
  onChunk?.(container);
  refreshIcons();
  let index = RENDER_CHUNK_SIZE;
  const appendNext = () => {
    if (chunkRenderTokens.get(container) !== token) return;
    if (index >= items.length) return;
    const template = document.createElement("template");
    template.innerHTML = items.slice(index, index + RENDER_CHUNK_SIZE).map(renderItem).join("");
    container.appendChild(template.content);
    index += RENDER_CHUNK_SIZE;
    onChunk?.(container);
    refreshIcons();
    requestAnimationFrame(appendNext);
  };
  requestAnimationFrame(appendNext);
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
  const debouncedRenderCurrentPlaces = debounce(renderCurrentPlaces);
  $("currentPlacesSearchInput")?.addEventListener("input", (event) => {
    state.currentSearch = event.target.value;
    debouncedRenderCurrentPlaces();
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
  bindPromptNotesInput("places-import", "importPromptNotesInput");
  $("jumpToJsonButton")?.addEventListener("click", () => $("jsonPanel").scrollIntoView({ behavior: "smooth" }));
  $("copyPlacePromptButton").addEventListener("click", () => {
    updatePromptPreview();
    const prompt = combinePromptWithNotes(getPromptNotes("importPromptNotesInput"), buildPlacePrompt());
    copyText(prompt, "פרומפט המקומות הועתק.");
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
  $("applyEnrichConfirmButton")?.addEventListener("click", applyEnrichConfirm);
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
  bindPromptNotesInput("places-duplicates", "duplicatePromptNotesInput");
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

function bindTranslateTools() {
  const input = $("translateDestinationInput");
  if (input) setupDestinationSearch("translate", input, $("translateDestinationSuggestions"), $("selectedTranslateDestination"));
  $("translateTranslateDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("translateDestinationInput", event.currentTarget);
    if (translated) $("translateDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("translateRadiusRange")?.addEventListener("input", (event) => {
    state.translateRadiusKm = Number(event.target.value || 50);
    $("translateRadiusValue").textContent = `${state.translateRadiusKm} ק"מ`;
  });
  const langSelect = $("translateLangSelect");
  if (langSelect) {
    langSelect.value = state.translateLang;
    langSelect.addEventListener("change", (event) => {
      state.translateLang = event.target.value === "fr" ? "fr" : "en";
    });
  }
  $("translateAiModelSelect")?.addEventListener("change", (event) => {
    state.translateAiModel = event.target.value;
    saveAiPreference("translate", "model", state.translateAiModel);
    syncTranslateAiControls();
  });
  $("translateAiThinkingSelect")?.addEventListener("change", (event) => {
    const nextValue = event.target.value;
    state.translateThinkingEnabled = nextValue !== "off";
    if (nextValue !== "off") state.translateReasoningEffort = nextValue;
    saveAiPreference("translate", "thinkingEnabled", state.translateThinkingEnabled);
    saveAiPreference("translate", "reasoningEffort", state.translateReasoningEffort);
    syncTranslateAiControls();
  });
  $("loadTranslatePlacesButton")?.addEventListener("click", loadTranslatePlaces);
  $("selectTranslateAllButton")?.addEventListener("click", toggleAllTranslate);
  $("copyTranslatePromptButton")?.addEventListener("click", copyTranslatePrompt);
  $("runTranslateButton")?.addEventListener("click", runAiTranslate);
  syncTranslateAiControls();
}

async function loadTranslatePlaces() {
  if (!state.user) {
    setStatus("translateStatus", "צריך להתחבר לפני טעינת כרטיסיות.", true);
    return;
  }
  const dest = state.destinations.translate;
  if (!dest?.lat || !dest?.lon) {
    setStatus("translateStatus", "בחר יעד מההשלמה האוטומטית לפני טעינה.", true);
    return;
  }
  setStatus("translateStatus", "טוען כרטיסיות...");
  let places = [];
  try {
    places = await fetchPlacesByRadius(dest.lat, dest.lon, state.translateRadiusKm);
  } catch (error) {
    setStatus("translateStatus", `טעינת הכרטיסיות נכשלה: ${error.message}`, true);
    return;
  }
  state.translatePlaces = places.sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
  state.selectedTranslateIds.clear();
  renderTranslatePlaces();
  setStatus("translateStatus", `נטענו ${places.length} כרטיסיות ברדיוס ${state.translateRadiusKm} ק"מ מ-${dest.label}.`);
}

function toggleAllTranslate() {
  const places = state.translatePlaces;
  const set = state.selectedTranslateIds;
  const allSelected = places.length > 0 && places.every((place) => set.has(place.id));
  set.clear();
  if (!allSelected) places.forEach((place) => set.add(place.id));
  renderTranslatePlaces();
}

function renderTranslatePlaces() {
  if ($("translateLoadedPill")) $("translateLoadedPill").textContent = `${state.translatePlaces.length} כרטיסיות`;
  if ($("translateSelectedPill")) $("translateSelectedPill").textContent = `${state.selectedTranslateIds.size} מסומנים`;
  const container = $("translateCards");
  if (!container) return;
  container.innerHTML = state.translatePlaces.map(renderTranslateCard).join("") || emptyHtml("אין כרטיסיות. בחר יעד ולחץ טען כרטיסיות.");
  container.querySelectorAll("[data-translate-select]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? state.selectedTranslateIds.add(checkbox.dataset.translateSelect) : state.selectedTranslateIds.delete(checkbox.dataset.translateSelect);
    if ($("translateSelectedPill")) $("translateSelectedPill").textContent = `${state.selectedTranslateIds.size} מסומנים`;
  }));
  refreshIcons();
}

function translateBadgesHtml(place) {
  const badges = ['<span class="count-pill">HE</span>'];
  if (place.translations?.en) badges.push('<span class="count-pill">EN</span>');
  if (place.translations?.fr) badges.push('<span class="count-pill">FR</span>');
  return `<div class="action-row tight">${badges.join("")}</div>`;
}

function renderTranslateCard(place) {
  return `<article class="place-card">
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-translate-select="${place.id}" ${state.selectedTranslateIds.has(place.id) ? "checked" : ""} /> בחירה</label>
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <div class="place-meta">${escapeHtml(place.location || "אין כתובת")}</div>
      ${translateBadgesHtml(place)}
    </div>
  </article>`;
}

function syncTranslateAiControls() {
  const modelSelect = $("translateAiModelSelect");
  if (modelSelect) {
    modelSelect.value = state.translateAiModel;
    modelSelect.disabled = state.translateSending;
  }
  const thinkingSelect = $("translateAiThinkingSelect");
  if (thinkingSelect) {
    thinkingSelect.value = selectedReasoningValue(state.translateThinkingEnabled, state.translateReasoningEffort);
    thinkingSelect.disabled = state.translateSending;
  }
  const note = $("translateAiModeNote");
  if (note) {
    note.innerHTML = `<i data-lucide="brain-circuit" aria-hidden="true"></i><span>${aiModeSummary(state.translateAiModel, state.translateThinkingEnabled, state.translateReasoningEffort)} · JSON בלבד.</span>`;
    refreshIcons();
  }
  const runButton = $("runTranslateButton");
  if (runButton) {
    runButton.disabled = state.translateSending;
    runButton.innerHTML = state.translateSending
      ? `<i data-lucide="loader-circle" aria-hidden="true"></i><span>מתרגם…</span>`
      : `<i data-lucide="sparkles" aria-hidden="true"></i><span>שלח ל-AI</span>`;
  }
}

function selectedTranslatePlaces() {
  return state.translatePlaces.filter((place) => state.selectedTranslateIds.has(place.id));
}

function buildTranslatePrompt(places) {
  return JSON.stringify({
    task: "Translate the free-text fields of these TripInspo place cards.",
    target_language: translateLangConfig(state.translateLang).english,
    places: places.map((place) => ({
      place_id: place.id,
      name: text(place.name),
      shortDescription: text(place.shortDescription),
      description: text(place.description),
      hours: text(place.hours)
    }))
  });
}

function copyTranslatePrompt() {
  const places = selectedTranslatePlaces();
  if (!places.length) {
    setStatus("translateStatus", "בחר לפחות כרטיסיה אחת כדי להעתיק פרומפט.", true);
    return;
  }
  copyText(buildTranslatePrompt(places), "פרומפט התרגום הועתק.", "translateStatus");
}

function renderTranslateLivePanel() {
  const panel = $("translateLivePanel");
  if (!panel) return;
  const hasContent = state.translateLiveReasoning.trim() || state.translateLiveAnswer.trim();
  panel.classList.toggle("is-hidden", !hasContent);
  $("translateLiveTitle").textContent = state.translateSending ? "DeepSeek Live" : "תשובת DeepSeek האחרונה";
  $("translateLiveMeta").textContent = aiModeSummary(state.translateLiveModel || state.translateAiModel, state.translateThinkingEnabled, state.translateReasoningEffort);
  $("translateLiveReasoning").textContent = state.translateLiveReasoning.trim() || "אין תוכן חשיבה להצגה.";
  $("translateLiveAnswer").textContent = state.translateLiveAnswer.trim() || "אין תשובה להצגה.";
}

function parseTranslateResponse(response, places) {
  const byId = new Map(places.map((place) => [place.id, place]));
  const decoded = JSON.parse(extractJsonObjectText(response));
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return {};
  const result = {};
  Object.entries(decoded).forEach(([id, value]) => {
    if (!byId.has(id) || !value || typeof value !== "object") return;
    result[id] = {
      name: text(value.name),
      shortDescription: text(value.shortDescription),
      description: text(value.description),
      hours: text(value.hours)
    };
  });
  return result;
}

async function requestTranslateBatch(places, lang) {
  const idToken = await state.user.getIdToken();
  const response = await fetch(DUPLICATE_AI_ENDPOINT, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
    body: JSON.stringify({
      feature: "admin_tool",
      systemPrompt: buildTranslateSystemPrompt(lang),
      userPrompt: buildTranslatePrompt(places),
      maxTokens: 8192,
      preferredModel: state.translateAiModel,
      thinkingEnabled: state.translateThinkingEnabled,
      reasoningEffort: state.translateReasoningEffort,
      temperature: thinkingTemperature(state.translateThinkingEnabled, state.translateReasoningEffort),
      jsonObjectResponse: true,
      stream: true
    })
  });
  if (!response.ok) throw new Error(parseWorkflowErrorMessage(await response.text()));
  const payload = await readDeepSeekResponse(response, {
    getFallbackModel: () => state.translateAiModel,
    onModel: (model) => {
      state.translateLiveModel = model;
    },
    onReasoningDelta: (delta) => {
      state.translateLiveReasoning = appendLiveText(state.translateLiveReasoning, delta);
    },
    onContentDelta: (delta) => {
      state.translateLiveAnswer = appendLiveText(state.translateLiveAnswer, delta);
    },
    onText: (value) => {
      state.translateLiveAnswer = value;
    },
    render: renderTranslateLivePanel
  });
  state.translateLiveModel = payload.model || state.translateLiveModel || state.translateAiModel;
  return parseTranslateResponse(payload.text || state.translateLiveAnswer, places);
}

async function runAiTranslate() {
  if (state.translateSending) return;
  if (!state.user) {
    setStatus("translateStatus", "צריך להתחבר לפני שליחת תרגום.", true);
    return;
  }
  const places = selectedTranslatePlaces();
  if (!places.length) {
    setStatus("translateStatus", "בחר לפחות כרטיסיה אחת לתרגום.", true);
    return;
  }
  const lang = state.translateLang;
  const langConfig = translateLangConfig(lang);
  const batches = chunkArray(places, DUPLICATE_AI_BATCH_SIZE);
  try {
    state.translateSending = true;
    state.translateLiveReasoning = "";
    state.translateLiveAnswer = "";
    state.translateLiveModel = null;
    syncTranslateAiControls();
    renderTranslateLivePanel();
    await ensureFreshAdminAuthToken();
    const merged = {};
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setStatus("translateStatus", batches.length > 1
        ? `שולח מנה ${index + 1}/${batches.length} (${batch.length} כרטיסיות) ל-${aiModeSummary(state.translateAiModel, state.translateThinkingEnabled, state.translateReasoningEffort)}...`
        : `שולח תרגום ל-${langConfig.label} עם ${aiModeSummary(state.translateAiModel, state.translateThinkingEnabled, state.translateReasoningEffort)}...`);
      if (index > 0) {
        state.translateLiveReasoning = "";
        state.translateLiveAnswer = "";
        renderTranslateLivePanel();
      }
      const parsed = await requestTranslateBatch(batch, lang);
      Object.assign(merged, parsed);
    }
    const savedCount = await saveTranslations(merged, lang);
    renderTranslatePlaces();
    setStatus("translateStatus", savedCount
      ? `${langConfig.label}: נשמרו ${savedCount} תרגומים מתוך ${places.length} כרטיסיות עם ${modelDisplayName(state.translateLiveModel || state.translateAiModel)}.`
      : `${modelDisplayName(state.translateLiveModel || state.translateAiModel)} לא החזיר תרגומים תקינים.`);
    if (savedCount) showToast(`נשמרו ${savedCount} תרגומים ל${langConfig.label}.`);
  } catch (error) {
    setStatus("translateStatus", `תרגום ה-AI נכשל: ${parseWorkflowErrorMessage(error.message)}`, true);
  } finally {
    state.translateSending = false;
    syncTranslateAiControls();
    renderTranslateLivePanel();
  }
}

async function saveTranslations(translations, lang) {
  const fs = state.firebase.firestore;
  const db = state.firebase.db;
  const entries = Object.entries(translations);
  let saved = 0;
  for (const [id, fields] of entries) {
    const place = state.translatePlaces.find((item) => item.id === id);
    if (!place) continue;
    const value = {
      name: text(fields.name),
      shortDescription: text(fields.shortDescription),
      description: text(fields.description),
      hours: text(fields.hours)
    };
    await fs.setDoc(fs.doc(db, "public_places", id), { translations: { [lang]: value } }, { merge: true });
    place.translations = { ...(place.translations || {}), [lang]: value };
    saved += 1;
  }
  return saved;
}

function bindFixAddressTools() {
  const input = $("fixAddressDestinationInput");
  if (input) setupDestinationSearch("fixAddress", input, $("fixAddressDestinationSuggestions"), $("selectedFixAddressDestination"));
  $("translateFixAddressDestinationButton")?.addEventListener("click", async (event) => {
    const translated = await translateInputValueToEnglish("fixAddressDestinationInput", event.currentTarget);
    if (translated) $("fixAddressDestinationInput")?.dispatchEvent(new Event("input", { bubbles: true }));
  });
  $("fixAddressRadiusRange")?.addEventListener("input", (event) => {
    state.fixAddressRadiusKm = Number(event.target.value || 50);
    $("fixAddressRadiusValue").textContent = `${state.fixAddressRadiusKm} ק"מ`;
  });
  $("loadFixAddressPlacesButton")?.addEventListener("click", loadFixAddressPlaces);
  $("selectFixAddressAllButton")?.addEventListener("click", toggleAllFixAddress);
  $("refreshFixAddressButton")?.addEventListener("click", refreshSelectedFixAddresses);
  bindFixAddressModal();
}

async function loadFixAddressPlaces() {
  if (!state.user) {
    setStatus("fixAddressStatus", "צריך להתחבר לפני משיכת מקומות.", true);
    return;
  }
  const dest = state.destinations.fixAddress;
  if (!dest?.lat || !dest?.lon) {
    setStatus("fixAddressStatus", "בחר נקודת ייחוס מההשלמה האוטומטית לפני משיכה.", true);
    return;
  }
  setStatus("fixAddressStatus", "מושך מקומות...");
  let places = [];
  try {
    places = await fetchPlacesByRadius(dest.lat, dest.lon, state.fixAddressRadiusKm);
  } catch (error) {
    setStatus("fixAddressStatus", `המשיכה נכשלה: ${error.message}`, true);
    return;
  }
  places.forEach((place) => { place.addressFixStatus = null; });
  state.fixAddressPlaces = places.sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
  state.selectedFixAddressIds.clear();
  renderFixAddressPlaces();
  setStatus("fixAddressStatus", `נמשכו ${places.length} מקומות ברדיוס ${state.fixAddressRadiusKm} ק"מ מ-${dest.label}.`);
}

function toggleAllFixAddress() {
  const places = state.fixAddressPlaces;
  const set = state.selectedFixAddressIds;
  const allSelected = places.length > 0 && places.every((place) => set.has(place.id));
  set.clear();
  if (!allSelected) places.forEach((place) => set.add(place.id));
  renderFixAddressPlaces();
}

function renderFixAddressPlaces() {
  if ($("fixAddressLoadedPill")) $("fixAddressLoadedPill").textContent = `${state.fixAddressPlaces.length} מקומות`;
  if ($("fixAddressSelectedPill")) $("fixAddressSelectedPill").textContent = `${state.selectedFixAddressIds.size} מסומנים`;
  const container = $("fixAddressCards");
  if (!container) return;
  container.innerHTML = state.fixAddressPlaces.map(renderFixAddressCard).join("") || emptyHtml("אין מקומות. בחר נקודת ייחוס ולחץ משיכה.");
  container.querySelectorAll("[data-fix-select]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    checkbox.checked ? state.selectedFixAddressIds.add(checkbox.dataset.fixSelect) : state.selectedFixAddressIds.delete(checkbox.dataset.fixSelect);
    if ($("fixAddressSelectedPill")) $("fixAddressSelectedPill").textContent = `${state.selectedFixAddressIds.size} מסומנים`;
  }));
  container.querySelectorAll("[data-fix-open]").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest(".check-row")) return;
    openFixAddressDialog(card.dataset.fixOpen);
  }));
  syncFixAddressRefreshButton();
  refreshIcons();
}

function renderFixAddressCard(place) {
  const status = place.addressFixStatus;
  const isNotFound = status === "not_found";
  const isWorking = status === "working";
  const isOk = status === "ok";
  const coords = place.lat != null && place.lon != null ? formatCoords(place.lat, place.lon) : "אין קואורדינטות";
  const badge = isWorking
    ? `<span class="fix-address-badge working"><i data-lucide="loader-circle" aria-hidden="true"></i>מרענן…</span>`
    : isNotFound
      ? `<span class="fix-address-badge error"><i data-lucide="triangle-alert" aria-hidden="true"></i>לא נמצא — לחץ לתיקון ידני</span>`
      : isOk
        ? `<span class="fix-address-badge ok"><i data-lucide="check" aria-hidden="true"></i>עודכן</span>`
        : "";
  return `<article class="place-card fix-address-card ${isNotFound ? "is-not-found" : ""}" ${isNotFound ? `data-fix-open="${place.id}"` : ""}>
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-fix-select="${place.id}" ${state.selectedFixAddressIds.has(place.id) ? "checked" : ""} /> בחירה</label>
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <div class="place-meta">${escapeHtml(place.location || "אין כתובת")}</div>
      <small class="place-meta">${escapeHtml(coords)}</small>
      ${badge}
    </div>
  </article>`;
}

function syncFixAddressRefreshButton() {
  const button = $("refreshFixAddressButton");
  if (!button) return;
  button.disabled = state.fixAddressRefreshing;
  button.innerHTML = state.fixAddressRefreshing
    ? `<i data-lucide="loader-circle" aria-hidden="true"></i><span>מרענן כתובות…</span>`
    : `<i data-lucide="refresh-cw" aria-hidden="true"></i><span>רענן כתובת</span>`;
}

async function refreshSelectedFixAddresses() {
  if (state.fixAddressRefreshing) return;
  if (!state.user) {
    setStatus("fixAddressStatus", "צריך להתחבר לפני רענון כתובות.", true);
    return;
  }
  const selected = state.fixAddressPlaces.filter((place) => state.selectedFixAddressIds.has(place.id));
  if (!selected.length) {
    setStatus("fixAddressStatus", "בחר לפחות מקום אחד לרענון.", true);
    return;
  }
  state.fixAddressRefreshing = true;
  syncFixAddressRefreshButton();
  const total = selected.length;
  let ok = 0;
  let notFound = 0;
  let completed = 0;
  try {
    await ensureFreshAdminAuthToken();
    await mapWithConcurrency(selected, 5, async (place) => {
      place.addressFixStatus = "working";
      renderFixAddressPlaces();
      const found = await refreshSinglePlaceAddress(place);
      if (found) ok += 1; else notFound += 1;
      completed += 1;
      setStatus("fixAddressStatus", `מרענן... ${completed}/${total} (נמצאו ${ok}, לא נמצאו ${notFound}).`);
      renderFixAddressPlaces();
    });
    setStatus("fixAddressStatus", `הרענון הסתיים. ${ok} עודכנו, ${notFound} לא נמצאו וצריכים תיקון ידני.`, notFound > 0);
    showToast(notFound ? `${ok} עודכנו, ${notFound} לא נמצאו.` : `${ok} כתובות עודכנו.`, notFound ? "warning" : "success");
  } catch (error) {
    setStatus("fixAddressStatus", `הרענון נכשל: ${error?.message || "שגיאה"}`, true);
  } finally {
    state.fixAddressRefreshing = false;
    renderFixAddressPlaces();
  }
}

// מוחק את הקואורדינטות הישנות מ-Firestore ומושך מחדש מ-Photon לפי הכתובת השמורה.
async function refreshSinglePlaceAddress(place) {
  const fs = state.firebase.firestore;
  const ref = fs.doc(state.firebase.db, "public_places", place.id);
  place.lat = null;
  place.lon = null;
  const geo = await geocodePlaceByAddress(place);
  if (geo) {
    place.lat = geo.lat;
    place.lon = geo.lon;
    place.addressFixStatus = "ok";
    await fs.setDoc(ref, { lat: geo.lat, lon: geo.lon, updatedAt: fs.serverTimestamp() }, { merge: true });
    return true;
  }
  place.addressFixStatus = "not_found";
  await fs.setDoc(ref, { lat: null, lon: null, updatedAt: fs.serverTimestamp() }, { merge: true });
  return false;
}

async function geocodePlaceByAddress(place) {
  const queries = [
    place.location,
    [place.location, place.destination].filter(Boolean).join(", "),
    [place.name, place.destination, place.location].filter(Boolean).join(" "),
    [place.name, place.destination].filter(Boolean).join(" ")
  ].map(text).filter(Boolean);
  const addressQuery = text(place.location);
  for (const query of queries) {
    let results = [];
    try {
      results = await searchAddress(query);
    } catch (_) {
      results = [];
    }
    if (!results.length) continue;
    const preferred = chooseBestAddressResult(results, place) || (query === addressQuery ? results[0] : null);
    if (!preferred) continue;
    const normalized = await normalizeSelectedDestination(preferred);
    if (normalized.lat == null || normalized.lon == null) continue;
    return { lat: normalized.lat, lon: normalized.lon, address: normalized.address };
  }
  return null;
}

function bindFixAddressModal() {
  const input = $("fixAddressModalInput");
  const suggestions = $("fixAddressModalSuggestions");
  if (!input || input.dataset.bound === "true") return;
  input.dataset.bound = "true";
  input.addEventListener("input", () => {
    window.clearTimeout(state.fixAddressModalTimer);
    state.fixAddressModalSelection = null;
    state.fixAddressModalSeq += 1;
    const currentSeq = state.fixAddressModalSeq;
    const query = input.value.trim();
    if ($("selectedFixAddressModal")) {
      $("selectedFixAddressModal").innerHTML = `<i data-lucide="radar" aria-hidden="true"></i><span>בחר כתובת מתוך ההשלמה האוטומטית.</span>`;
    }
    if (query.length < 2) {
      suggestions.innerHTML = "";
      return;
    }
    suggestions.innerHTML = `<div class="suggestion-empty">מחפש כתובת...</div>`;
    state.fixAddressModalTimer = window.setTimeout(async () => {
      let results = [];
      try {
        results = await searchAddress(query);
      } catch (error) {
        setStatus("fixAddressModalStatus", `חיפוש הכתובת נכשל: ${error.message}`, true);
      }
      if (currentSeq !== state.fixAddressModalSeq) return;
      if (!results.length) {
        suggestions.innerHTML = `<div class="suggestion-empty">לא נמצאו תוצאות. נסה לכתוב שם מקום מלא יותר או עיר.</div>`;
        return;
      }
      suggestions.innerHTML = results.map((item, index) => `
        <button class="suggestion-item" type="button" data-fix-modal-index="${index}">
          <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
          <b>${escapeHtml(item.sourceLabel || "OpenStreetMap")}</b>
          <i data-lucide="chevron-left"></i>
        </button>
      `).join("");
      suggestions.querySelectorAll("[data-fix-modal-index]").forEach((button) => {
        button.addEventListener("click", async () => {
          const item = results[Number(button.dataset.fixModalIndex)];
          const normalized = await normalizeSelectedDestination(item);
          state.fixAddressModalSelection = normalized;
          input.value = normalized.address || normalized.label;
          suggestions.innerHTML = "";
          $("selectedFixAddressModal").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(normalized.address)}</span><b>${escapeHtml(formatCoords(normalized.lat, normalized.lon))}</b>`;
          setStatus("fixAddressModalStatus", "כתובת נבחרה. לחץ עדכן ושמור.");
          refreshIcons();
        });
      });
      refreshIcons();
    }, 140);
  });
  $("applyFixAddressModalButton")?.addEventListener("click", applyFixAddressModalFix);
  $("searchFixAddressWebButton")?.addEventListener("click", () => {
    const place = state.fixAddressPlaces.find((item) => item.id === state.fixAddressModalPlaceId);
    if (!place) return;
    const query = [place.name, place.location, place.destination].filter(Boolean).join(" ");
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
  });
}

function openFixAddressDialog(id) {
  const place = state.fixAddressPlaces.find((item) => item.id === id);
  if (!place) return;
  state.fixAddressModalPlaceId = id;
  state.fixAddressModalSelection = null;
  $("fixAddressModalTitle").textContent = place.name || "בחירת כתובת";
  $("fixAddressModalInput").value = [place.name, place.location, place.destination].filter(Boolean).join(" ");
  $("fixAddressModalSuggestions").innerHTML = "";
  $("selectedFixAddressModal").innerHTML = `<i data-lucide="radar" aria-hidden="true"></i><span>חובה לבחור כתובת מתוך ההשלמה האוטומטית כדי לעדכן קואורדינטות.</span>`;
  setStatus("fixAddressModalStatus", "");
  $("fixAddressDialog")?.showModal();
  window.setTimeout(() => $("fixAddressModalInput")?.dispatchEvent(new Event("input", { bubbles: true })), 0);
  refreshIcons();
}

async function applyFixAddressModalFix() {
  const place = state.fixAddressPlaces.find((item) => item.id === state.fixAddressModalPlaceId);
  if (!place) return;
  const selected = state.fixAddressModalSelection;
  if (!selected || selected.lat == null || selected.lon == null) {
    setStatus("fixAddressModalStatus", "צריך לבחור כתובת מתוך ההשלמה האוטומטית לפני עדכון.", true);
    return;
  }
  const button = $("applyFixAddressModalButton");
  if (button) button.disabled = true;
  try {
    await ensureFreshAdminAuthToken();
    const fs = state.firebase.firestore;
    const ref = fs.doc(state.firebase.db, "public_places", place.id);
    await fs.setDoc(ref, { lat: selected.lat, lon: selected.lon, location: selected.address || place.location, updatedAt: fs.serverTimestamp() }, { merge: true });
    place.lat = selected.lat;
    place.lon = selected.lon;
    place.location = selected.address || place.location;
    place.addressFixStatus = "ok";
    $("fixAddressDialog")?.close();
    renderFixAddressPlaces();
    setStatus("fixAddressStatus", `${place.name || "המקום"} עודכן עם כתובת וקואורדינטות חדשות.`);
    showToast("הכתובת עודכנה ונשמרה.", "success");
  } catch (error) {
    setStatus("fixAddressModalStatus", `שמירה נכשלה: ${error?.message || "שגיאה"}`, true);
  } finally {
    if (button) button.disabled = false;
  }
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
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
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
  if (container.dataset.delegated !== "true") {
    container.dataset.delegated = "true";
    container.addEventListener("click", (event) => {
      const card = event.target?.closest?.("[data-current-place-id]");
      if (card) openCurrentPlaceDialog(card.dataset.currentPlaceId);
    });
  }
  renderCardsInChunks(container, visible, renderCurrentPlaceCard, emptyHtml("אין מקומות להצגה."), applyPixabayResolvers);
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
  if (place.kosherFriendly) chips.push(`<span class="info-chip kosher-friendly-chip">ידידותי לכשרות ✓</span>`);
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
    ["כשר (תעודה)", place.isKosher ? "כן" : "לא"],
    ["ידידותי לכשרות", place.kosherFriendly ? "כן" : "לא"],
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

function normalizeReservationLabel(value) {
  const key = text(value);
  if (!key || key === "no") return "reservation_no";
  if (key === "yes") return "reservation_yes";
  if (key === "recommended") return "reservation_recommended";
  return key;
}

function reservationDisplayLabel(value) {
  const key = normalizeReservationLabel(value);
  if (!key || key === "reservation_no") return "";
  if (key === "reservation_yes") return "חובה";
  if (key === "reservation_recommended") return "מומלץ";
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
  bindChoiceFields($("currentPlaceEditFields"));
  bindKosherEditFields($("currentPlaceEditFields"));
  $("currentPlaceEditDialog").showModal();
  refreshIcons();
}

function renderPlaceEditFields(draft) {
  return `
      ${editInput("name", "שם המקום", draft.name)}
      ${editInput("destination", "יעד", draft.destination)}
      ${editChoiceField("type", "סוג מקום", draft.type, PLACE_TYPES)}
      ${editInput("location", "כתובת", draft.location)}
      ${editInput("lat", "Latitude", draft.lat ?? "")}
      ${editInput("lon", "Longitude", draft.lon ?? "")}
      ${editTextarea("shortDescription", "תיאור קצר", draft.shortDescription)}
      ${editTextarea("description", "תיאור ארוך", draft.description)}
      ${editInput("hours", "שעות פתיחה", draft.hours)}
      ${editInput("website", "אתר", draft.website)}
      ${editChoiceField("reservationLabel", "הזמנה מראש", draft.reservationLabel || "reservation_no", RESERVATION_OPTIONS)}
      ${editChoiceField("foodType", "סוג אוכל", draft.foodType, Object.entries(FOOD_TYPE_LABELS), { emptyOption: { value: "", label: "לא רלוונטי" } })}
      ${editInput("rating", "דירוג", draft.rating ?? "")}
      ${editInput("coverEmoji", "אימוג׳י", draft.coverEmoji)}
      ${editInput("coverBackgroundHex", "צבע רקע", draft.coverBackgroundHex)}
      ${editInput("coverImageUrl", "תמונה", draft.coverImageUrl)}
      ${editInput("coverPhotographerName", "קרדיט תמונה", draft.coverPhotographerName)}
      ${editInput("coverPhotographerUsername", "קישור קרדיט", draft.coverPhotographerUsername)}
      <input type="hidden" data-edit-field="pixabayId" value="${escapeAttr(draft.pixabayId ?? "")}" />
      <input type="hidden" data-edit-field="pixabayPageUrl" value="${escapeAttr(draft.pixabayPageUrl ?? "")}" />
      <label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="isAtmosphereImage" ${draft.isAtmosphereImage ? "checked" : ""} /><span>תמונת אווירה</span></label>
      <label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="isKosher" ${draft.isKosher ? "checked" : ""} /><span>כשר (עם תעודה)</span></label>
      <label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="kosherFriendly" ${draft.kosherFriendly ? "checked" : ""} /><span>ידידותי לאוכלי כשרות</span></label>
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
    kosher_friendly: false,
    food_type: "",
    cover_emoji: "🏛️",
    cover_background_hex: "#8B5CF6",
    rating: 4.8,
    image_search_query: "Colosseum Rome"
  };
}

function buildPlacePrompt() {
  const destination = state.destinations.import?.label || $("importDestinationInput").value.trim() || "[יעד]";
  const address = state.destinations.import?.address || "";
  return `**תפקיד ומטרה (Role & Context):**
אתה משמש כמנוע עיבוד נתונים ומדריך טיולים וירטואלי מומחה עבור אפליקציית התיירות TripEase. תפקידך הוא לקבל יעד וכמות מקומות מבוקשת, לאסוף מידע עדכני מהאינטרנט, ולהפיק רשימת מקומות עשירה, ממוינת ושיווקית במבנה JSON קפדני.
**נתוני הבקשה:**
היעד המבוקש הוא: ${destination}
${address ? `כתובת הייחוס של היעד: ${address}
` : ""}**חוקי יסוד ואמינות המידע (Core Rules):**
 1. **דיוק מוחלט:** חובה עליך להשתמש בחיפוש רשת כדי לוודא שעות פתיחה, כתובות ופרטים עדכניים. לעולם אל תמציא מידע. אם נתון אינו ניתן לאימות, השאר אותו כמחרוזת ריקה "".
 2. **כתובות לניווט:** הכתובת (address) חייבת להיות מדויקת ובשפת המקור כדי להבטיח זיהוי של 100% במערכות Apple Maps ו-Google Maps. בשדה address כתוב רק את הכתובת המלאה עצמה, בלי שם המקום, בלי שם המותג, בלי הסבר ובלי סוגריים. אל תתרגם כתובת לעברית אם הכתובת המקומית כתובה באנגלית, גרמנית, צ'כית, איטלקית, צרפתית או כל שפת מקור אחרת.
 3. **שעות פתיחה מפורטות:** ציין שעות פתיחה לכל שבעת ימי השבוע. כל הימים נשמרים בתוך מחרוזת JSON אחת ובשורה לוגית אחת, כאשר המעבר בין יום ליום מיוצג ברצף שני התווים \\n (לוכסן הפוך ואחריו האות n) — לעולם לא בלחיצת Enter אמיתית בתוך המחרוזת. הפורמט לכל יום: "ראשון- 08:00-20:00" בשעון 24 שעות. יום סגור: "שבת- סגור". דוגמה לערך תקין ושלם: "ראשון- 08:00-20:00\\nשני- 08:00-20:00\\nשלישי- 08:00-20:00\\nרביעי- 08:00-20:00\\nחמישי- 08:00-20:00\\nשישי- 08:00-14:00\\nשבת- סגור".
 3א. **מקום שפתוח 24/7 (תמיד פתוח):** חובה להחזיר את כל שבעת הימים במלואם ובסדר הנכון, כל יום "00:00-24:00". הערך המלא חייב להיות בדיוק: "ראשון- 00:00-24:00\\nשני- 00:00-24:00\\nשלישי- 00:00-24:00\\nרביעי- 00:00-24:00\\nחמישי- 00:00-24:00\\nשישי- 00:00-24:00\\nשבת- 00:00-24:00". לעולם אל תציין יום אחד בלבד כפתוח 24 שעות.
 3ב. **מקומות ציבוריים בלי שעות סגירה:** שדרה, רחוב, כיכר, שכונה, טיילת, גשר וכדומה (למשל השדרה החמישית בניו יורק — היא לא חנות ואין לה שעות סגירה) נחשבים פתוחים 24/7 — החזר עבורם את כל שבעת הימים "00:00-24:00" כאמור בסעיף 3א, ובנוסף חובה לכלול בתוך התיאור הארוך (description) משפט הסבר למשתמש, למשל: "השדרה עצמה פתוחה בכל שעות היממה, אך שעות הפתיחה של החנויות והעסקים לאורכה משתנות מחנות לחנות".
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
 * is_kosher: בוליאני. true **רק** למסעדה עם תעודת כשרות מאומתת (רבנות, בד״ץ, OU, הכשרות המהודרת וכו'). אם אין תעודה מוכחת — false.
 * kosher_friendly: בוליאני. true למסעדות שאינן כשרות רשמית אך נוחות לאוכלי כשרות — למשל: טבעונית/צמחונית ללא עירוב בשר וחלב, תפריט עם אפשרויות כשרות בלי תעודה, דגים בלבד, מסעדה עם תפריט כשר אך פתוחה בשבת, וכדומה. false אם לא רלוונטי.
   *(חשוב: is_kosher ו-kosher_friendly לא יכולים להיות שניהם true. אם יש תעודת כשרות — רק is_kosher=true).*
 * food_type: רלוונטי למסעדות בלבד. בחר אחד מהבאים:
   food_type_italian, food_type_dairy, food_type_meat, food_type_vegetarian, food_type_asian, food_type_shawarma, food_type_pizza, food_type_burger, food_type_cafe, food_type_other.
   *(הערה קריטית: אם הקטגוריה אינה מסעדה, שדה food_type חייב להיות מחרוזת ריקה "", וגם is_kosher וגם kosher_friendly חייבים להיות false).*
**סינון כשרות לפי הבקשה שלי (אם צורפו הערות בתחילת הבקשה):**
 - אם ביקשתי במפורש **מסעדות כשרות בלבד** / **רק כשר עם תעודה** — כלול **רק** מסעדות עם is_kosher=true ותעודת כשרות מאומתת. אל תכלול kosher_friendly.
 - אם ביקשתי גם **ידידותי לאוכלי כשרות** / **גם מתאים לשומרי כשרות** — מותר לכלול בנוסף מסעדות עם kosher_friendly=true (כאשר is_kosher=false).
 - אם לא ציינתי כשרות כלל — סמן את השדות לפי המציאות בלבד, בלי להעדיף או לסנן מסעדות לפי כשרות.
 * cover_emoji: אמוג'י בודד המייצג את אופי המקום.
 * cover_background_hex: קוד צבע בפורמט #RRGGBB שמתאים ומשלים את האמוג'י הנבחר.
 * rating: מספר עשרוני בין 1.0 ל-5.0 (ספרה אחת אחרי הנקודה). החזר 0 רק אם אין כל מידע על דירוג.
 * image_search_query: מחרוזת ממוקדת לחיפוש תמונה של המקום:
   * אם מדובר במסעדה, חיי לילה או בר: כתוב מילת חיפוש מדויקת באנגלית שקשורה לשם המקום והאווירה (למשל: "Hard Rock Cafe NYC interior").
   * למקומות אחרים: ציין את השם המלא של המקום באנגלית או בשפת המקור (למשל: "Colosseum Rome").
**חוקי תקינות JSON (קריטי - אי-עמידה בהם שוברת את כל הפלט):**
 א. בתוך ערכי טקסט (name, description, short_description, address, website, image_search_query) **אסור בהחלט** להשתמש בתו מרכאות כפולות " — תו זה שמור אך ורק לעטיפת המפתחות והערכים של ה-JSON. אם דרושות מרכאות בתוך טקסט, השתמש בגרש בודד ' או בגרשיים עבריים (״...״). לדוגמה נכון: "מסעדת 'הדייגים' בנמל". לעולם אל תכתוב מרכאות כפולות באמצע מחרוזת בלי לברוח אותן כ-\\".
 ב. אסור ירידות שורה אמיתיות בתוך ערך מחרוזת. כל מעבר שורה (למשל בשעות הפתיחה) מיוצג ברצף שני התווים \\n בלבד.
 ג. כל מפתח וכל ערך טקסטואלי עטופים במרכאות כפולות. מספרים (rating) ובוליאנים (is_kosher, kosher_friendly) ללא מרכאות.
 ד. אסור פסיק עודף (trailing comma) לפני } או לפני ]. כל אובייקט נפרד בפסיק, והאובייקט האחרון בלי פסיק אחריו.
 ה. לפני סיום ודא שכל סוגר { ו-[ שנפתח אכן נסגר, ושהמבנה הוא מערך תקני אחד שלם.
**פורמט פלט נדרש (Strict Output constraints):**
 1. החזר **אך ורק** מערך של אובייקטים בפורמט JSON תקני שעובר JSON.parse ללא שגיאה.
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
    // קואורדינטות תמיד נגזרות מ-Photon לפי הכתובת, לא מה-JSON של ה-AI.
    lat: null,
    lon: null,
    hours: text(item.opening_hours || item.hours),
    website: text(item.website),
    reservationLabel: text(item.reservation || item.reservationLabel) || "reservation_no",
    isKosher: Boolean(item.is_kosher || item.isKosher),
    kosherFriendly: Boolean(item.kosher_friendly || item.kosherFriendly) && !Boolean(item.is_kosher || item.isKosher),
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

function draftNeedsHoursCheck(draft) {
  return text(draft.hours).trim() === CHECK_WEBSITE_HOURS;
}

function renderDraftCard(draft) {
  const issues = missingDraftFields(draft);
  const hasMissingCoords = draft.lat == null || draft.lon == null;
  const needsHoursCheck = draftNeedsHoursCheck(draft);
  return `<article class="place-card draft-card ${issues.length ? "has-issues" : ""} ${needsHoursCheck ? "needs-hours-check" : ""}" data-draft-id="${draft.id}">
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
      ${needsHoursCheck ? `<div class="draft-hours-check">
        <span class="draft-hours-check-note"><i data-lucide="clock-alert" aria-hidden="true"></i><span>שעות פתיחה לבדיקה — משוך פרטים אמיתיים</span></span>
        <div class="draft-hours-check-actions">
          <button class="ghost-action" type="button" data-action="gplace"><i data-lucide="map-pinned"></i><span>Google Places</span></button>
          <button class="ghost-action" type="button" data-action="geminiHours"><i data-lucide="sparkles"></i><span>Gemini</span></button>
        </div>
      </div>` : ""}
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
      handleDraftAction(id, button.dataset.action, button);
    }));
    card.querySelectorAll('a').forEach((link) => link.addEventListener('click', (event) => event.stopPropagation()));
  });
}

async function handleDraftAction(id, action, button = null) {
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
  if (action === "gplace") {
    setDraftActionButtonLoading(button, true);
    try {
      await enrichDraftFromGooglePlaces(draft);
    } finally {
      setDraftActionButtonLoading(button, false);
    }
    renderDrafts();
    return;
  }
  if (action === "geminiHours") {
    openGeminiHoursChat(draft);
    return;
  }
  if (action === "save") {
    setDraftActionButtonLoading(button, true);
    try {
      await saveDraft(draft);
    } finally {
      setDraftActionButtonLoading(button, false);
    }
  }
  renderDrafts();
}

function openDraftReviewDialog(id) {
  const draft = state.drafts.find((item) => item.id === id);
  if (!draft) return;
  state.reviewingDraftId = id;
  $("draftReviewTitle").textContent = draft.name || "בדיקת כרטיסיה";
  $("draftReviewFields").innerHTML = renderPlaceEditFields(draft);
  bindChoiceFields($("draftReviewFields"));
  bindKosherEditFields($("draftReviewFields"));
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

async function postPlaceLookup(endpoint, draft) {
  const idToken = await state.user.getIdToken();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
    body: JSON.stringify({ name: draft.name, address: draft.location })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function enrichDraftFromGooglePlaces(draft) {
  if (!state.user) {
    setStatus("importStatus", "צריך להתחבר לפני משיכת פרטים.", true);
    return;
  }
  try {
    await ensureFreshAdminAuthToken();
    const data = await postPlaceLookup(GOOGLE_PLACES_ENDPOINT, draft);
    const changes = {};
    if (typeof data.rating === "number") changes.rating = data.rating;
    if (data.address) changes.location = data.address;
    if (data.opening_hours) changes.hours = data.opening_hours;
    if (Number.isFinite(data.lat) && Number.isFinite(data.lng)) {
      changes.lat = data.lat;
      changes.lon = data.lng;
    }
    const googleText = Array.isArray(data.weekdayDescriptions) && data.weekdayDescriptions.length
      ? data.weekdayDescriptions.join("\n")
      : [data.name ? `שם: ${data.name}` : "", data.address ? `כתובת: ${data.address}` : ""].filter(Boolean).join("\n");
    openEnrichConfirm({ draftId: draft.id, source: "Google Places", changes, raw: googleText });
  } catch (error) {
    const message = error?.message === "not_found" ? "המקום לא נמצא ב-Google Places." : (error?.message || "שגיאה לא ידועה");
    openEnrichConfirm({ draftId: draft.id, source: "Google Places", error: message });
  }
}

// ── צ'אט שעות פתיחה עם Gemini (מודל בסגנון וואטסאפ) ─────────────────
function openGeminiHoursChat(draft) {
  if (!state.user) {
    setStatus("importStatus", "צריך להתחבר לפני משיכת שעות.", true);
    return;
  }
  state.hoursChat = {
    draftId: draft.id,
    history: [],
    searchMode: state.hoursChat?.searchMode || "maps",
    streaming: false,
    abort: null,
    latest: null
  };
  bindGeminiHoursChat();
  $("geminiHoursChatTitle").textContent = `Gemini · ${draft.name || "מקום"}`;
  $("geminiHoursChatStatus").textContent = "מחובר · שעות פתיחה";
  $("geminiHoursChatMessages").innerHTML = "";
  $("geminiHoursChatInput").value = "";
  $("geminiHoursApplyButton").disabled = true;
  syncGeminiHoursSourceToggle();
  appendGeminiHoursBubble("info", `בודק שעות פתיחה עבור ${draft.name || "המקום"}. אפשר לבקש לנסות שוב או להדביק קישור לאתר שבו כדאי לבדוק.`);
  $("geminiHoursChatDialog")?.showModal();
  refreshIcons();
  sendGeminiHoursTurn();
}

function bindGeminiHoursChat() {
  const dialog = $("geminiHoursChatDialog");
  if (!dialog || dialog.dataset.bound === "true") return;
  dialog.dataset.bound = "true";

  $("geminiHoursChatClose")?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    state.hoursChat?.abort?.abort();
  });

  dialog.querySelectorAll("[data-search-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.hoursChat || state.hoursChat.streaming) return;
      state.hoursChat.searchMode = button.dataset.searchMode === "search" ? "search" : "maps";
      syncGeminiHoursSourceToggle();
      appendGeminiHoursBubble("info", state.hoursChat.searchMode === "search"
        ? "המקור הוחלף לחיפוש בגוגל. ההודעה הבאה תיבדק מול תוצאות חיפוש."
        : "המקור הוחלף לגוגל מפס. ההודעה הבאה תיבדק מול נתוני המפות.");
    });
  });

  const input = $("geminiHoursChatInput");
  const sendFromInput = () => {
    const value = (input.value || "").trim();
    if (!value) return;
    input.value = "";
    input.style.height = "";
    sendGeminiHoursTurn(value);
  };
  $("geminiHoursSendButton")?.addEventListener("click", sendFromInput);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendFromInput();
    }
  });
  input?.addEventListener("input", () => {
    input.style.height = "";
    input.style.height = `${Math.min(input.scrollHeight, 110)}px`;
  });

  $("geminiHoursRetryButton")?.addEventListener("click", () => {
    sendGeminiHoursTurn("התשובה לא מדויקת. נסה שוב ובדוק לעומק את שעות הפתיחה המעודכנות.");
  });
  $("geminiHoursApplyButton")?.addEventListener("click", applyGeminiHoursResult);
}

function syncGeminiHoursSourceToggle() {
  const mode = state.hoursChat?.searchMode || "maps";
  $("geminiHoursChatDialog")?.querySelectorAll("[data-search-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.searchMode === mode);
  });
}

function appendGeminiHoursBubble(kind, content, { html = false } = {}) {
  const container = $("geminiHoursChatMessages");
  if (!container) return null;
  const time = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const wrapper = document.createElement("div");
  wrapper.className = `gh-msg gh-msg-${kind}`;
  wrapper.innerHTML = `<div class="gh-bubble"><div class="gh-bubble-text"></div><span class="gh-time">${time}</span></div>`;
  const textEl = wrapper.querySelector(".gh-bubble-text");
  if (html) textEl.innerHTML = content;
  else textEl.textContent = content;
  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
  return wrapper;
}

function geminiHoursTypingHtml() {
  return `<span class="gh-typing"><i></i><i></i><i></i></span>`;
}

async function sendGeminiHoursTurn(userText = "") {
  const chat = state.hoursChat;
  if (!chat || chat.streaming) return;
  const draft = state.drafts.find((item) => item.id === chat.draftId);
  if (!draft) return;

  if (userText) {
    chat.history.push({ role: "user", text: userText });
    appendGeminiHoursBubble("user", userText);
  }

  chat.streaming = true;
  chat.abort = new AbortController();
  $("geminiHoursChatStatus").textContent = "מקליד...";
  $("geminiHoursSendButton")?.setAttribute("disabled", "true");
  $("geminiHoursRetryButton")?.setAttribute("disabled", "true");

  const thoughtBubble = appendGeminiHoursBubble("thought", "", { html: true });
  const thoughtText = thoughtBubble?.querySelector(".gh-bubble-text");
  if (thoughtText) thoughtText.innerHTML = `<span class="gh-thought-label"><i data-lucide="brain-circuit"></i> חושב...</span><span class="gh-thought-body"></span>`;
  refreshIcons();
  const thoughtBody = thoughtBubble?.querySelector(".gh-thought-body");
  let answerBubble = null;
  let answerText = null;
  let thoughtContent = "";
  const container = $("geminiHoursChatMessages");

  try {
    const idToken = await state.user.getIdToken();
    const response = await fetch(GEMINI_PLACE_HOURS_ENDPOINT, {
      method: "POST",
      headers: await withAppCheckHeaders({
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      }),
      body: JSON.stringify({
        name: draft.name,
        address: draft.location,
        searchMode: chat.searchMode,
        stream: true,
        messages: chat.history
      }),
      signal: chat.abort.signal
    });
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalEvent = null;

    const consume = (rawEvent) => {
      const data = rawEvent
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (!data || data === "[DONE]") return;
      let event;
      try { event = JSON.parse(data); } catch (_) { return; }
      if (event.error) throw new Error(event.error);
      if (event.thoughtDelta && thoughtBody) {
        thoughtContent += event.thoughtDelta;
        thoughtBody.textContent = thoughtContent;
        container.scrollTop = container.scrollHeight;
      }
      if (event.contentDelta) {
        if (!answerBubble) {
          answerBubble = appendGeminiHoursBubble("model", "", { html: true });
          answerText = answerBubble?.querySelector(".gh-bubble-text");
        }
        if (answerText) {
          answerText.textContent = (answerText.textContent || "") + event.contentDelta;
          container.scrollTop = container.scrollHeight;
        }
      }
      if (event.done) finalEvent = event;
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";
      for (const rawEvent of events) consume(rawEvent);
    }
    if (buffer.trim()) consume(buffer);

    if (!thoughtContent) thoughtBubble?.remove();
    else thoughtBubble?.classList.add("is-done");

    finishGeminiHoursTurn(chat, finalEvent, answerBubble);
  } catch (error) {
    thoughtBubble?.remove();
    if (error?.name !== "AbortError") {
      appendGeminiHoursBubble("error", `המשיכה נכשלה: ${error?.message || "שגיאה לא ידועה"}. אפשר לנסות שוב.`);
    }
  } finally {
    chat.streaming = false;
    chat.abort = null;
    $("geminiHoursChatStatus").textContent = "מחובר · שעות פתיחה";
    $("geminiHoursSendButton")?.removeAttribute("disabled");
    $("geminiHoursRetryButton")?.removeAttribute("disabled");
  }
}

function finishGeminiHoursTurn(chat, finalEvent, answerBubble) {
  if (!finalEvent) {
    if (!answerBubble) appendGeminiHoursBubble("error", "לא התקבלה תשובה מ-Gemini. אפשר לנסות שוב.");
    return;
  }
  const hours = text(finalEvent.opening_hours);
  const note = text(finalEvent.description_note);
  const raw = text(finalEvent.raw);
  chat.history.push({ role: "model", text: raw || hours });
  chat.latest = { opening_hours: hours, description_note: note };

  // מחליפים את ה-JSON הגולמי בבועה מעוצבת של שעות.
  const target = answerBubble || appendGeminiHoursBubble("model", "", { html: true });
  const textEl = target?.querySelector(".gh-bubble-text");
  if (textEl) textEl.innerHTML = formatGeminiHoursAnswerHtml(hours, note);

  const sources = Array.isArray(finalEvent.sources) ? finalEvent.sources.filter((item) => item?.uri) : [];
  if (sources.length) {
    const chips = sources.slice(0, 6).map((item) =>
      `<a class="gh-source-chip" href="${escapeAttr(item.uri)}" target="_blank" rel="noopener noreferrer"><i data-lucide="link"></i><span>${escapeHtml(item.title || shortUrlLabel(item.uri))}</span></a>`
    ).join("");
    appendGeminiHoursBubble("sources", `<div class="gh-sources">${chips}</div>`, { html: true });
  }

  const applyButton = $("geminiHoursApplyButton");
  if (applyButton) applyButton.disabled = !hours;
  const container = $("geminiHoursChatMessages");
  if (container) container.scrollTop = container.scrollHeight;
  refreshIcons();
}

function formatGeminiHoursAnswerHtml(hours, note) {
  if (!hours) return escapeHtml("לא הצלחתי למצוא שעות. אפשר לנסות שוב או לשלוח קישור לבדיקה.");
  const lines = hours.split(/\n|\\n/).map((line) => line.trim()).filter(Boolean);
  const dayLine = /^(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)\s*-/;
  const isDayList = lines.length > 1 && lines.every((line) => dayLine.test(line));
  const hoursHtml = isDayList
    ? `<div class="gh-hours-card">${lines.map((line) => {
        const [day, ...rest] = line.split("-");
        return `<div class="gh-hours-row"><b>${escapeHtml(day.trim())}</b><span>${escapeHtml(rest.join("-").trim())}</span></div>`;
      }).join("")}</div>`
    : `<p class="gh-hours-plain">${escapeHtml(hours)}</p>`;
  const noteHtml = note ? `<p class="gh-hours-note"><i data-lucide="info"></i>${escapeHtml(note)}</p>` : "";
  return `${hoursHtml}${noteHtml}`;
}

function shortUrlLabel(raw) {
  try {
    return new URL(raw).host.replace(/^www\./, "");
  } catch (_) {
    return text(raw).slice(0, 40);
  }
}

function applyGeminiHoursResult() {
  const chat = state.hoursChat;
  if (!chat?.latest?.opening_hours) return;
  const draft = state.drafts.find((item) => item.id === chat.draftId);
  if (!draft) return;
  draft.hours = chat.latest.opening_hours;
  const note = text(chat.latest.description_note);
  if (note && !text(draft.description).includes(note)) {
    draft.description = [text(draft.description), note].filter(Boolean).join("\n\n");
  }
  $("geminiHoursChatDialog")?.close();
  renderDrafts();
  showToast("שעות הפתיחה עודכנו בכרטיסייה", "success");
}

function openEnrichConfirm({ draftId, source, changes, thinking, sources, raw, error }) {
  state.pendingEnrich = error ? null : { draftId, source, changes: changes || {} };
  const draft = state.drafts.find((item) => item.id === draftId);
  $("enrichConfirmSource").textContent = error ? `המשיכה מ-${source} נכשלה` : `אישור עדכון מ-${source}`;
  $("enrichConfirmTitle").textContent = draft?.name || "מקום";
  const applyButton = $("applyEnrichConfirmButton");
  if (error) {
    $("enrichConfirmBody").innerHTML = `<div class="enrich-confirm-section"><span class="enrich-confirm-label">שגיאה</span><pre class="enrich-confirm-raw enrich-confirm-error">${escapeHtml(error)}</pre></div>`;
    if (applyButton) applyButton.disabled = true;
    $("enrichConfirmDialog")?.showModal();
    refreshIcons();
    return;
  }
  const c = changes || {};
  const rows = [];
  if (c.rating !== undefined) rows.push(enrichConfirmRow("דירוג", String(c.rating)));
  if (c.location !== undefined) rows.push(enrichConfirmRow("כתובת", c.location));
  if (c.lat !== undefined && c.lon !== undefined) rows.push(enrichConfirmRow("קואורדינטות", formatCoords(c.lat, c.lon)));
  if (c.hours !== undefined) rows.push(enrichConfirmRow("שעות פתיחה", c.hours, true));
  const sections = [];
  sections.push(`<div class="enrich-confirm-section"><span class="enrich-confirm-label">התשובה שתוחל לאחר אישור</span><div class="enrich-confirm-rows">${rows.length ? rows.join("") : `<p class="enrich-confirm-empty">לא הוחזרו נתונים לעדכון.</p>`}</div></div>`);
  if (text(thinking)) {
    sections.push(`<div class="enrich-confirm-section"><span class="enrich-confirm-label">החשיבה של המודל</span><pre class="enrich-confirm-raw">${escapeHtml(thinking)}</pre></div>`);
  }
  if (text(raw)) {
    sections.push(`<div class="enrich-confirm-section"><span class="enrich-confirm-label">מה ${escapeHtml(source)} החזיר</span><pre class="enrich-confirm-raw">${escapeHtml(raw)}</pre></div>`);
  }
  if (Array.isArray(sources) && sources.length) {
    const items = sources.map((item) => item.uri
      ? `<li><a href="${escapeAttr(item.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.title || item.uri)}</a></li>`
      : `<li>${escapeHtml(item.title || "")}</li>`).join("");
    sections.push(`<div class="enrich-confirm-section"><span class="enrich-confirm-label">מקורות (Google Maps)</span><ul class="enrich-confirm-sources">${items}</ul></div>`);
  }
  $("enrichConfirmBody").innerHTML = sections.join("");
  if (applyButton) applyButton.disabled = rows.length === 0;
  $("enrichConfirmDialog")?.showModal();
  refreshIcons();
}

function enrichConfirmRow(label, value, isBlock = false) {
  return `<div class="enrich-confirm-row"><span>${escapeHtml(label)}</span>${isBlock ? `<pre>${escapeHtml(value)}</pre>` : `<b>${escapeHtml(value)}</b>`}</div>`;
}

function applyEnrichConfirm() {
  const pending = state.pendingEnrich;
  if (!pending) return;
  const draft = state.drafts.find((item) => item.id === pending.draftId);
  if (!draft) {
    $("enrichConfirmDialog")?.close();
    return;
  }
  const c = pending.changes || {};
  if (c.rating !== undefined) draft.rating = c.rating;
  if (c.location !== undefined) draft.location = c.location;
  if (c.hours !== undefined) draft.hours = c.hours;
  if (c.lat !== undefined) draft.lat = c.lat;
  if (c.lon !== undefined) draft.lon = c.lon;
  draft.validationIssues = missingDraftFields(draft);
  state.pendingEnrich = null;
  $("enrichConfirmDialog")?.close();
  renderDrafts();
  setStatus("importStatus", `${draft.name || "המקום"} עודכן מ-${pending.source}.`);
  showToast(`${draft.name || "המקום"} עודכן מ-${pending.source}.`, "success");
}

async function checkDraftDuplicate(draft) {
  const places = await fetchPublicPlacesByExactName(draft.name);
  const match = places.find((place) => isLikelyDuplicate(draft, place));
  setStatus("importStatus", match ? `נמצאה כפילות אפשרית: ${match.name}` : `לא נמצאה כפילות ברורה עבור ${draft.name}.`, Boolean(match));
}

async function saveAllDrafts() {
  if (!state.drafts.length) return;
  setSaveAllButtonsLoading(true);
  const draftsToSave = [...state.drafts];
  const total = draftsToSave.length;
  const concurrency = Math.min(IMPORT_SAVE_CONCURRENCY, total);
  state.importProgress = { active: true, total, completed: 0, label: "שומר את המקומות במקביל", note: `מעלה עד ${concurrency} כרטיסיות בו זמנית ל-TripInspo.`, done: false };
  syncImportProgressDialog();
  $("importProgressDialog")?.showModal();
  let saved = 0;
  let completed = 0;
  const failedIds = new Set();
  const failureMessages = [];
  try {
    await ensureFreshAdminAuthToken();
    await mapWithConcurrency(draftsToSave, concurrency, async (draft) => {
      state.importProgress = { active: true, total, completed, label: "שומר את המקומות במקביל", note: `עובד על ${concurrency} כרטיסיות במקביל. עכשיו שומר: ${draft.name || "מקום"}.`, done: false };
      syncImportProgressDialog();
      const ok = await saveDraft(draft, { quiet: true, keepInDrafts: true, authAlreadyFresh: true });
      if (ok) saved += 1;
      else {
        failedIds.add(draft.id);
        if (draft.lastSaveError) failureMessages.push(`${draft.name || "מקום"}: ${draft.lastSaveError}`);
      }
      completed += 1;
      state.importProgress = { active: true, total, completed, label: "שומר את המקומות במקביל", note: `הסתיימו ${completed} מתוך ${total}. נשמרו ${saved}, נשארו ${failedIds.size} לטיפול.`, done: false };
      syncImportProgressDialog();
    });
    state.drafts = draftsToSave.filter((draft) => failedIds.has(draft.id));
    renderDrafts();
    const failureNote = failureMessages.length ? ` ${failureMessages.slice(0, 2).join(" | ")}${failureMessages.length > 2 ? ` ועוד ${failureMessages.length - 2}` : ""}` : "";
    state.importProgress = {
      active: true,
      total,
      completed: total,
      label: failedIds.size ? "השמירה הסתיימה חלקית" : "סיימנו לשמור",
      note: failedIds.size ? `נשמרו ${saved} מקומות, ו-${failedIds.size} נשארו לטיפול ידני.${failureNote}` : `נשמרו ${saved} מקומות ל-TripInspo.`,
      done: true
    };
    syncImportProgressDialog();
    await sleep(900);
    $("importProgressDialog")?.close();
    if (!failedIds.size && $("jsonInput")) $("jsonInput").value = "";
    setStatus(
      "importStatus",
      failedIds.size
        ? `נשמרו ${saved} מקומות. ${failedIds.size} כרטיסיות לא נשמרו ונשארו ברשימה.${failureNote}`
        : `נשמרו ${saved} מקומות ל-TripInspo. הם יופיעו גם בלשונית אישור מקומות.`,
      failedIds.size > 0
    );
    showToast(failedIds.size ? `השמירה הסתיימה. ${saved} נשמרו ו-${failedIds.size} נשארו להשלמה.` : `השמירה הושלמה. נשמרו ${saved} מקומות.`, failedIds.size ? "warning" : "success");
  } catch (error) {
    const message = firebaseErrorMessage(error);
    setStatus("importStatus", `שמירת המקומות נעצרה: ${message}`, true);
    showToast("שמירת המקומות נעצרה. פרטים מוצגים מתחת ל-JSON.", "error");
  } finally {
    $("importProgressDialog")?.close();
    setSaveAllButtonsLoading(false);
  }
}

async function enrichDrafts() {
  if (!state.drafts.length) return;
  const draftsToEnrich = [...state.drafts];
  const total = draftsToEnrich.length;
  const concurrency = Math.min(IMPORT_ENRICH_CONCURRENCY, total);
  let completed = 0;
  state.importProgress = { active: true, total, completed: 0, label: "משלים מקומות במקביל", note: `משלים כתובות, קואורדינטות ותמונות עבור עד ${concurrency} כרטיסיות בו זמנית.`, done: false };
  syncImportProgressDialog();
  $("importProgressDialog")?.showModal();
  await mapWithConcurrency(draftsToEnrich, concurrency, async (draft) => {
    state.importProgress = { active: true, total, completed, label: "משלים מקומות במקביל", note: `בודק כתובת ותמונה עבור ${draft.name || "מקום"}.`, done: false };
    syncImportProgressDialog();
    await enrichSingleDraft(draft);
    completed += 1;
    state.importProgress = { active: true, total, completed, label: "משלים מקומות במקביל", note: `הסתיימו ${completed} מתוך ${total}.`, done: false };
    syncImportProgressDialog();
  });
  const unresolved = state.drafts.filter((draft) => missingDraftFields(draft).length).length;
  state.importProgress = {
    active: true,
    total,
    completed: total,
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
  const tasks = [];
  if (!draft.location || draft.lat == null || draft.lon == null) {
    tasks.push(autoCompleteDraftAddress(draft));
  }
  if (!draft.coverImageUrl) {
    tasks.push(autoPickDraftImage(draft));
  }
  await Promise.allSettled(tasks);
  draft.validationIssues = missingDraftFields(draft);
}

async function autoCompleteDraftAddress(draft) {
  if (draft.location && draft.lat != null && draft.lon != null) return;
  // מקור האמת לקואורדינטות הוא הכתובת מה-JSON: מחפשים אותה ב-Photon קודם,
  // ורק אם לא נמצאה נופלים לשילובי שם+יעד.
  const queries = [
    draft.location,
    [draft.location, draft.destination].filter(Boolean).join(", "),
    [draft.name, draft.destination, draft.location].filter(Boolean).join(" "),
    [draft.name, draft.destination].filter(Boolean).join(" "),
    [draft.name, draft.location].filter(Boolean).join(" ")
  ].map(text).filter(Boolean);
  const addressQuery = text(draft.location);
  for (const query of queries) {
    const results = await searchAddress(query);
    if (!results.length) continue;
    // כשמחפשים בדיוק את הכתובת מה-JSON, מקבלים את התוצאה המובילה של Photon
    // גם אם ניקוד ההיוריסטיקה נמוך (הכתובת היא מקור האמת).
    const preferred = chooseBestAddressResult(results, draft) || (query === addressQuery ? results[0] : null);
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
  delete draft.lastSaveError;
  if (!state.user) {
    draft.lastSaveError = "צריך להתחבר לפני שמירה ל-TripInspo.";
    if (!options.quiet) setStatus("importStatus", draft.lastSaveError, true);
    return false;
  }
  const quiet = options.quiet === true;
  try {
    let duplicate = null;
    try {
      duplicate = (await fetchPublicPlacesByExactName(draft.name)).find((place) => isLikelyDuplicate(draft, place));
    } catch (error) {
      console.warn("[places] duplicate check failed", error);
      if (!quiet) setStatus("importStatus", `בדיקת כפילות נכשלה, ממשיך לשמירה: ${firebaseErrorMessage(error)}`, true);
    }
    if (duplicate) {
      if (quiet) {
        draft.lastSaveError = `נמצאה כפילות אפשרית: ${duplicate.name}. שמור את הכרטיסיה ידנית כדי לאשר שמירה בכל זאת.`;
        return false;
      }
      const confirmed = await confirmAction({
        title: "נמצאה כפילות אפשרית",
        message: `נמצאה כפילות אפשרית: ${duplicate.name}. לשמור בכל זאת?`,
        confirmText: "שמור בכל זאת",
        tone: "warning",
        icon: "copy"
      });
      if (!confirmed) {
        draft.lastSaveError = "השמירה בוטלה בגלל כפילות אפשרית.";
        return false;
      }
    }

    const originalImageUrl = draft.coverImageUrl;
    let imageWarning = "";
    if (!quiet) setStatus("importStatus", `מוריד ומעלה תמונה ל-R2 עבור ${draft.name || "המקום"}...`);
    if (!options.authAlreadyFresh) await ensureFreshAdminAuthToken();
    try {
      await ensurePlaceImageOnR2(draft);
    } catch (error) {
      draft.coverImageUrl = originalImageUrl;
      imageWarning = ` התמונה לא עלתה ל-R2 ונשמרה כקישור חיצוני: ${friendlyImageUploadError(error)}`;
      console.warn("[places] image upload failed; saving place with external image", error);
    }

    const data = publicPlaceData(draft);
    await state.firebase.firestore.addDoc(state.firebase.firestore.collection(state.firebase.db, "public_places"), data);
    if (!quiet) {
      setStatus("importStatus", `${draft.name || "המקום"} נשמר ל-TripInspo.${imageWarning} הוא יופיע גם בלשונית אישור מקומות.`, Boolean(imageWarning));
      showToast(`${draft.name || "המקום"} נשמר ל-TripInspo.`, imageWarning ? "warning" : "success");
    }
    if (!options.keepInDrafts) {
      state.drafts = state.drafts.filter((item) => item.id !== draft.id);
    }
    return true;
  } catch (error) {
    console.error("[places] save draft failed", error);
    draft.lastSaveError = firebaseErrorMessage(error);
    if (!quiet) {
      setStatus("importStatus", `שמירת ${draft.name || "המקום"} נכשלה: ${draft.lastSaveError}`, true);
      showToast("השמירה נכשלה. פרטים מוצגים מתחת ל-JSON.", "error");
    }
    return false;
  }
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
    kosherFriendly: Boolean(draft.kosherFriendly) && !Boolean(draft.isKosher),
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
    state.duplicatesCheckActive = false;
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

function duplicatePlaceMap() {
  return new Map(state.duplicatePlaces.map((place) => [place.id, place]));
}

function duplicateVisiblePlaceIds() {
  if (!state.duplicateGroups.length) return state.duplicatePlaces.map((place) => place.id);
  const ids = new Set();
  state.duplicateGroups.forEach((group) => group.card_ids.forEach((id) => ids.add(id)));
  return [...ids];
}

function renderDuplicatePlaceCard(place, selectedSet, mode, { isRecommendedKeep = false } = {}) {
  return `<article class="place-card duplicate-place-card${isRecommendedKeep ? " is-recommended-keep" : ""}">
    ${imageHtml(place)}
    <div class="place-body">
      <label class="check-row"><input type="checkbox" data-select-place="${place.id}" data-mode="${mode}" ${selectedSet.has(place.id) ? "checked" : ""} /> בחירה</label>
      ${isRecommendedKeep ? `<span class="duplicate-keep-badge"><i data-lucide="shield-check"></i>מומלץ להשאיר</span>` : ""}
      <h3>${escapeHtml(place.name || "ללא שם")}</h3>
      <div class="place-meta">${escapeHtml(place.location || "אין כתובת")}<br>${escapeHtml(place.website || "אין אתר")}</div>
      <small class="place-meta">${escapeHtml(place.sharedByUsername || "")} · ${escapeHtml(place.sharedByUid || "")}</small>
    </div>
  </article>`;
}

function bindDuplicateSelectionCheckboxes() {
  $$(`[data-mode="duplicates"]`).forEach((checkbox) => {
    checkbox.onchange = () => {
      checkbox.checked ? state.selectedDuplicateIds.add(checkbox.dataset.selectPlace) : state.selectedDuplicateIds.delete(checkbox.dataset.selectPlace);
      renderDuplicatePlaces();
    };
  });
}

function renderDuplicatePlaces() {
  const hasGroups = state.duplicateGroups.length > 0;
  const visibleIds = new Set(duplicateVisiblePlaceIds());
  const duplicateCount = visibleIds.size;
  const groupsContainer = $("duplicateGroups");
  const cardsContainer = $("duplicateCards");
  const resultsSection = groupsContainer?.closest(".result-section");

  $("duplicateLoadedPill").textContent = hasGroups
    ? `${state.duplicateGroups.length} קבוצות · ${duplicateCount} כפילויות`
    : state.duplicatesCheckActive
      ? "0 כפילויות"
      : `${state.duplicatePlaces.length} מקומות`;
  $("duplicateSelectedPill").textContent = `${state.selectedDuplicateIds.size} מסומנים`;
  resultsSection?.classList.toggle("duplicate-results--grouped", hasGroups);

  if (state.duplicatesCheckActive && !hasGroups) {
    groupsContainer.innerHTML = emptyHtml(state.isCheckingDuplicates ? "בודק כפילויות..." : "לא נמצאו כפילויות ביעד הזה.");
    if (cardsContainer) cardsContainer.innerHTML = "";
    bindDuplicateSelectionCheckboxes();
    refreshIcons();
    return;
  }

  if (hasGroups) {
    const byId = duplicatePlaceMap();
    groupsContainer.innerHTML = state.duplicateGroups.map((group) => {
      const places = group.card_ids.map((id) => byId.get(id)).filter(Boolean);
      const keepPlace = byId.get(group.recommended_keep_card_id);
      const keepLabel = keepPlace?.name || group.recommended_keep_card_id || "לא הוגדר";
      const cardsHtml = places.map((place) => renderDuplicatePlaceCard(
        place,
        state.selectedDuplicateIds,
        "duplicates",
        { isRecommendedKeep: place.id === group.recommended_keep_card_id }
      )).join("");
      return `<section class="duplicate-group-section">
        <header class="duplicate-group-heading">
          <h3>${escapeHtml(group.title)}</h3>
          <p class="duplicate-group-meta">${places.length} מקומות כפולים · מומלץ להשאיר: <b>${escapeHtml(keepLabel)}</b></p>
          ${group.reason ? `<p class="duplicate-group-reason">${escapeHtml(group.reason)}</p>` : ""}
        </header>
        <div class="duplicate-group-cards">${cardsHtml}</div>
      </section>`;
    }).join("");
    if (cardsContainer) cardsContainer.innerHTML = "";
  } else {
    groupsContainer.innerHTML = "";
    renderPlaceSelectionGrid("duplicateCards", state.duplicatePlaces, state.selectedDuplicateIds, "duplicates");
    return;
  }

  bindDuplicateSelectionCheckboxes();
  refreshIcons();
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
  if (mode === "delete") {
    const allSelected = state.deletePlaces.length > 0 && state.deletePlaces.every((place) => state.selectedDeleteIds.has(place.id));
    state.selectedDeleteIds.clear();
    if (!allSelected) state.deletePlaces.forEach((place) => state.selectedDeleteIds.add(place.id));
    renderDeletePlaces();
    return;
  }
  const visibleIds = duplicateVisiblePlaceIds();
  const visiblePlaces = state.duplicatePlaces.filter((place) => visibleIds.includes(place.id));
  const allSelected = visiblePlaces.length > 0 && visiblePlaces.every((place) => state.selectedDuplicateIds.has(place.id));
  state.selectedDuplicateIds.clear();
  if (!allSelected) visiblePlaces.forEach((place) => state.selectedDuplicateIds.add(place.id));
  renderDuplicatePlaces();
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
  const prompt = combinePromptWithNotes(
    getPromptNotes("duplicatePromptNotesInput"),
    buildDuplicatePrompt(duplicateDestinationQuery(), state.duplicatePlaces)
  );
  await copyText(prompt, "פרומפט כפילויות הועתק.", "duplicateStatus");
}

function truncateDuplicateField(value, maxLength) {
  const output = text(value);
  return output.length <= maxLength ? output : `${output.slice(0, maxLength - 1)}…`;
}

function normalizeDuplicateName(value) {
  return text(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function normalizeDuplicateNameLoose(value) {
  return text(value).toLowerCase().replace(/[\s,./\\\-:;|'"()]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeDuplicateHours(value) {
  return text(value).toLowerCase().replace(/[\s\u00a0]+/g, " ").replace(/[;:·•|]+/g, "|").trim();
}

function editDistance(a, b) {
  const left = text(a);
  const right = text(b);
  if (!left) return right.length;
  if (!right) return left.length;
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

function duplicateNamesSimilar(nameA, nameB) {
  const strictA = normalizeDuplicateName(nameA);
  const strictB = normalizeDuplicateName(nameB);
  if (!strictA || !strictB) return false;
  if (strictA === strictB) return true;
  if (editDistance(strictA, strictB) <= DUPLICATE_NAME_MAX_EDITS) return true;
  const looseA = normalizeDuplicateNameLoose(nameA);
  const looseB = normalizeDuplicateNameLoose(nameB);
  if (!looseA || !looseB) return false;
  if (looseA === looseB) return true;
  return editDistance(looseA, looseB) <= DUPLICATE_NAME_MAX_EDITS;
}

function duplicateHoursSimilar(hoursA, hoursB) {
  const left = normalizeDuplicateHours(hoursA);
  const right = normalizeDuplicateHours(hoursB);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.length >= 12) {
    return editDistance(left, right) <= Math.min(12, Math.max(4, Math.floor(Math.min(left.length, right.length) * 0.18)));
  }
  return false;
}

function duplicatePlacesShareWebsite(a, b) {
  const left = normalizeWebsite(a.website);
  const right = normalizeWebsite(b.website);
  return Boolean(left && right && left === right);
}

function duplicatePlacesShareAddress(a, b) {
  const left = normalize(a.location);
  const right = normalize(b.location);
  return Boolean(left && right && left === right);
}

function duplicatePlacesAreClose(a, b, maxKm = 0.12) {
  if (a.lat == null || a.lon == null || b.lat == null || b.lon == null) return false;
  return distanceKm(a.lat, a.lon, b.lat, b.lon) <= maxKm;
}

function describeLocalDuplicateMatch(a, b) {
  const parts = [];
  if (duplicateNamesSimilar(a.name, b.name)) parts.push("שם דומה");
  if (duplicateHoursSimilar(a.hours, b.hours)) parts.push("שעות פתיחה דומות");
  if (duplicatePlacesShareAddress(a, b)) parts.push("כתובת זהה");
  if (duplicatePlacesShareWebsite(a, b)) parts.push("אתר זהה");
  if (duplicatePlacesAreClose(a, b)) parts.push("מיקום קרוב");
  return parts.join(" + ") || "התאמה מקומית";
}

function localPlacesAreDuplicates(a, b) {
  if (!a || !b || a.id === b.id) return false;
  const nameSimilar = duplicateNamesSimilar(a.name, b.name);
  const hoursSimilar = duplicateHoursSimilar(a.hours, b.hours);
  const websiteMatch = duplicatePlacesShareWebsite(a, b);
  const addressMatch = duplicatePlacesShareAddress(a, b);
  const coordsClose = duplicatePlacesAreClose(a, b);

  if (addressMatch && !nameSimilar && !hoursSimilar && !websiteMatch) return false;
  if (nameSimilar && hoursSimilar) return true;
  if (nameSimilar && (addressMatch || websiteMatch || coordsClose)) return true;
  if (hoursSimilar && (addressMatch || websiteMatch || coordsClose)) return true;
  if (websiteMatch && nameSimilar) return true;
  return false;
}

function duplicatePlaceQualityScore(place) {
  let score = 0;
  if (text(place.description)) score += 2;
  if (text(place.shortDescription)) score += 1;
  if (text(place.hours)) score += 1;
  if (text(place.website)) score += 1;
  if (text(place.coverImageUrl)) score += 1;
  if (place.adminApproved === true) score += 2;
  if (text(place.location)) score += 1;
  return score;
}

function pickRecommendedDuplicateKeep(places) {
  return [...places].sort((a, b) => duplicatePlaceQualityScore(b) - duplicatePlaceQualityScore(a))[0];
}

function buildLocalDuplicateGroups(places) {
  const parent = new Map(places.map((place) => [place.id, place.id]));
  const findRoot = (id) => {
    let current = id;
    while (parent.get(current) !== current) {
      parent.set(current, parent.get(parent.get(current)));
      current = parent.get(current);
    }
    return current;
  };
  const unionPlaces = (leftId, rightId) => {
    const leftRoot = findRoot(leftId);
    const rightRoot = findRoot(rightId);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      if (localPlacesAreDuplicates(places[i], places[j])) unionPlaces(places[i].id, places[j].id);
    }
  }

  const clusters = new Map();
  places.forEach((place) => {
    const root = findRoot(place.id);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push(place);
  });

  return [...clusters.values()]
    .filter((items) => items.length >= 2)
    .map((items) => {
      const keep = pickRecommendedDuplicateKeep(items);
      const reason = describeLocalDuplicateMatch(items[0], items.find((item) => item.id !== items[0].id) || items[1]);
      return {
        title: keep?.name || items[0].name || "קבוצת כפילות",
        reason: `התאמה מקומית: ${reason}`,
        card_ids: items.map((item) => item.id),
        recommended_keep_card_id: keep?.id || items[0].id
      };
    })
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase(), "he"));
}

function mergeDuplicateGroups(groupLists, candidates) {
  const groups = groupLists.flat();
  if (!groups.length) return [];
  const parent = new Map();
  const metaById = new Map();

  const findRoot = (id) => {
    if (!parent.has(id)) parent.set(id, id);
    let current = id;
    while (parent.get(current) !== current) {
      parent.set(current, parent.get(parent.get(current)));
      current = parent.get(current);
    }
    return current;
  };
  const unionIds = (leftId, rightId) => {
    const leftRoot = findRoot(leftId);
    const rightRoot = findRoot(rightId);
    if (leftRoot !== rightRoot) parent.set(rightRoot, leftRoot);
  };

  groups.forEach((group) => {
    group.card_ids.forEach((id) => {
      if (!metaById.has(id)) metaById.set(id, group);
      group.card_ids.forEach((otherId) => unionIds(id, otherId));
    });
  });

  const byId = new Map(candidates.map((place) => [place.id, place]));
  const clusters = new Map();
  [...parent.keys()].forEach((id) => {
    const root = findRoot(id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root).add(id);
  });

  return [...clusters.values()]
    .map((ids) => [...ids])
    .filter((ids) => ids.length >= 2)
    .map((ids) => {
      const places = ids.map((id) => byId.get(id)).filter(Boolean);
      const keep = pickRecommendedDuplicateKeep(places);
      const meta = metaById.get(keep?.id || ids[0]) || groups.find((group) => group.card_ids.some((id) => ids.includes(id)));
      return {
        title: meta?.title || keep?.name || places[0]?.name || "קבוצת כפילות",
        reason: meta?.reason || "כפילות שזוהתה בבדיקת AI",
        card_ids: ids,
        recommended_keep_card_id: meta?.recommended_keep_card_id && ids.includes(meta.recommended_keep_card_id)
          ? meta.recommended_keep_card_id
          : (keep?.id || ids[0])
      };
    })
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase(), "he"));
}

function runLocalDuplicateCheck() {
  const groups = buildLocalDuplicateGroups(state.duplicatePlaces);
  state.duplicateGroups = groups;
  state.duplicatesCheckActive = true;
  state.selectedDuplicateIds.clear();
  groups.forEach((group) => group.card_ids.filter((id) => id !== group.recommended_keep_card_id).forEach((id) => state.selectedDuplicateIds.add(id)));
  renderDuplicatePlaces();
  setStatus("duplicateStatus", groups.length ? `נמצאו ${groups.length} קבוצות כפילות.` : "לא נמצאו כפילויות מקומיות.");
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

function parseWorkflowErrorMessage(raw) {
  const value = text(raw);
  if (!value) return "שגיאה לא ידועה";
  try {
    const decoded = JSON.parse(value);
    return text(decoded.error || decoded.detail || decoded.message) || value;
  } catch (_) {
    return value;
  }
}

async function requestDuplicateAiBatch(candidates, destinationQuery, batchIndex, batchCount) {
  const idToken = await state.user.getIdToken();
  const response = await fetch(DUPLICATE_AI_ENDPOINT, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
    body: JSON.stringify({
      feature: "admin_tool",
      systemPrompt: DUPLICATE_SYSTEM_PROMPT,
      userPrompt: buildDuplicatePrompt(destinationQuery, candidates, { batchIndex, batchCount }),
      maxTokens: 8192,
      preferredModel: state.duplicateAiModel,
      thinkingEnabled: state.duplicateThinkingEnabled,
      reasoningEffort: state.duplicateReasoningEffort,
      temperature: thinkingTemperature(state.duplicateThinkingEnabled, state.duplicateReasoningEffort),
      jsonObjectResponse: true,
      stream: true
    })
  });
  if (!response.ok) throw new Error(parseWorkflowErrorMessage(await response.text()));
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
  return parseDuplicateResponse(payload.text || state.duplicateLiveAnswer, candidates);
}

async function runAiDuplicateCheck() {
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
  const destinationQuery = duplicateDestinationQuery();
  const batches = chunkArray(candidates, DUPLICATE_AI_BATCH_SIZE);
  try {
    state.isCheckingDuplicates = true;
    state.duplicatesCheckActive = true;
    state.duplicateGroups = [];
    state.duplicateLiveReasoning = "";
    state.duplicateLiveAnswer = "";
    state.duplicateLiveModel = null;
    renderDuplicatePlaces();
    renderDuplicateLivePanel();
    syncDuplicateAiControls();
    const batchGroups = [];
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      setStatus("duplicateStatus", batches.length > 1
        ? `שולח מנה ${index + 1}/${batches.length} (${batch.length} מקומות) ל-${aiModeSummary(state.duplicateAiModel, state.duplicateThinkingEnabled, state.duplicateReasoningEffort)}...`
        : `שולח בדיקת כפילויות ל-${aiModeSummary(state.duplicateAiModel, state.duplicateThinkingEnabled, state.duplicateReasoningEffort)}...`);
      if (index > 0) {
        state.duplicateLiveReasoning = "";
        state.duplicateLiveAnswer = "";
        renderDuplicateLivePanel();
      }
      const parsed = await requestDuplicateAiBatch(batch, destinationQuery, index + 1, batches.length);
      batchGroups.push(parsed);
    }
    state.duplicateGroups = mergeDuplicateGroups(batchGroups, candidates);
    state.duplicatesCheckActive = true;
    state.selectedDuplicateIds.clear();
    state.duplicateGroups.forEach((group) => group.card_ids.filter((id) => id !== group.recommended_keep_card_id).forEach((id) => state.selectedDuplicateIds.add(id)));
    renderDuplicatePlaces();
    renderDuplicateLivePanel();
    setStatus("duplicateStatus", state.duplicateGroups.length
      ? `נמצאו ${state.duplicateGroups.length} קבוצות כפולים מתוך ${candidates.length} מקומות${batches.length > 1 ? ` (${batches.length} מנות)` : ""} עם ${modelDisplayName(state.duplicateLiveModel || state.duplicateAiModel)}.`
      : `${modelDisplayName(state.duplicateLiveModel || state.duplicateAiModel)} החזיר JSON מפורש של no_duplicates עבור ${candidates.length} מקומות מ-TripInspo.`);
  } catch (error) {
    setStatus("duplicateStatus", `בדיקת AI נכשלה: ${parseWorkflowErrorMessage(error.message)}`, true);
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

function buildDuplicatePrompt(destinationQuery, places, { batchIndex = 1, batchCount = 1 } = {}) {
  return JSON.stringify({
    destination_query: truncateDuplicateField(destinationQuery, 80),
    search_radius_km: DUPLICATE_SEARCH_RADIUS_KM,
    batch_index: batchIndex,
    batch_count: batchCount,
    destination_coordinates: {
      lat: state.destinations.duplicates?.lat ?? null,
      lon: state.destinations.duplicates?.lon ?? null
    },
    task: "Find TripInspo place cards that refer to the same real-world place.",
    places: places.map((place) => ({
      card_id: place.id,
      name: truncateDuplicateField(place.name, 90),
      address: truncateDuplicateField(place.location, 110),
      website: truncateDuplicateField(normalizeWebsite(place.website), 70),
      hours: truncateDuplicateField(place.hours, 80),
      type: truncateDuplicateField(place.type, 32)
    }))
  });
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
  $("imageResults").innerHTML = images.map((image, index) => `<button class="image-option" type="button" data-image-index="${index}"><img src="${escapeAttr(normalizeImageUrl(image.thumb || image.url) || image.thumb || image.url)}" alt="" decoding="async" referrerpolicy="no-referrer" onerror="this.hidden=true;"><span>${escapeHtml(image.credit || image.source)}</span></button>`).join("") || emptyHtml("לא נמצאו תמונות במקור הזה. נסה מקור אחר או שאילתה אחרת.");
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
    reservationLabel: normalizeReservationLabel(place.reservationLabel) || "reservation_no",
    isKosher: Boolean(place.isKosher),
    kosherFriendly: Boolean(place.kosherFriendly) && !Boolean(place.isKosher),
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
  syncAllChoiceFields(container);
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

function choiceFieldPresetValue(value, options) {
  const key = text(value);
  const optionKeys = new Set(options.map(([optionKey]) => optionKey));
  return optionKeys.has(key) ? key : "";
}

function editChoiceField(field, label, value, options, { emptyOption = null } = {}) {
  const preset = choiceFieldPresetValue(value, options);
  const rawValue = text(value);
  const isOther = Boolean(rawValue) && !preset;
  const selectedValue = isOther ? CHOICE_OTHER_VALUE : (preset || emptyOption?.value || options[0]?.[0] || "");
  const optionHtml = [
    emptyOption ? `<option value="${escapeAttr(emptyOption.value)}" ${selectedValue === emptyOption.value ? "selected" : ""}>${escapeHtml(emptyOption.label)}</option>` : "",
    ...options.map(([key, optionLabel]) => `<option value="${escapeAttr(key)}" ${selectedValue === key ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`),
    `<option value="${CHOICE_OTHER_VALUE}" ${isOther ? "selected" : ""}>אחר...</option>`
  ].join("");
  return `
    <label class="edit-field edit-choice-field" data-choice-wrap="${escapeAttr(field)}">
      <span>${escapeHtml(label)}</span>
      <select data-choice-select="${escapeAttr(field)}">${optionHtml}</select>
      <input
        class="edit-choice-other ${isOther ? "" : "is-hidden"}"
        type="text"
        data-choice-other="${escapeAttr(field)}"
        value="${escapeAttr(isOther ? rawValue : "")}"
        placeholder="פרט..."
      />
      <input type="hidden" data-edit-field="${escapeAttr(field)}" value="${escapeAttr(value ?? "")}" />
    </label>
  `;
}

function syncChoiceField(container, field) {
  if (!container || !field) return;
  const select = container.querySelector(`[data-choice-select="${field}"]`);
  const other = container.querySelector(`[data-choice-other="${field}"]`);
  const hidden = container.querySelector(`[data-edit-field="${field}"]`);
  if (!select || !hidden) return;
  hidden.value = select.value === CHOICE_OTHER_VALUE ? text(other?.value) : select.value;
}

function syncAllChoiceFields(container) {
  container?.querySelectorAll("[data-choice-select]").forEach((select) => syncChoiceField(container, select.dataset.choiceSelect));
}

function bindKosherEditFields(container) {
  if (!container) return;
  const isKosher = container.querySelector('[data-edit-field="isKosher"]');
  const kosherFriendly = container.querySelector('[data-edit-field="kosherFriendly"]');
  if (!isKosher || !kosherFriendly) return;
  const syncExclusive = (source) => {
    if (source === isKosher && isKosher.checked) kosherFriendly.checked = false;
    if (source === kosherFriendly && kosherFriendly.checked) isKosher.checked = false;
  };
  isKosher.addEventListener("change", () => syncExclusive(isKosher));
  kosherFriendly.addEventListener("change", () => syncExclusive(kosherFriendly));
}

function bindChoiceFields(container) {
  if (!container) return;
  container.querySelectorAll("[data-choice-select]").forEach((select) => {
    const field = select.dataset.choiceSelect;
    const other = container.querySelector(`[data-choice-other="${field}"]`);
    const update = () => {
      if (select.value === CHOICE_OTHER_VALUE) {
        other?.classList.remove("is-hidden");
        if (document.activeElement === select) other?.focus();
      } else {
        other?.classList.add("is-hidden");
      }
      syncChoiceField(container, field);
    };
    select.addEventListener("change", update);
    other?.addEventListener("input", () => syncChoiceField(container, field));
    update();
  });
}

function renderPlaceTags(place) {
  const tags = [];
  tags.push(`<span class="info-chip ${place.adminApproved === true ? "approval-chip" : "pending-chip"}">${place.adminApproved === true ? "אושר מנהל" : "ממתין לאישור"}</span>`);
  if (place.isKosher) tags.push(`<span class="info-chip kosher-chip">כשר ✓</span>`);
  if (place.kosherFriendly) tags.push(`<span class="info-chip kosher-friendly-chip">ידידותי לכשרות ✓</span>`);
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
    const label = name ? `${name} · Wiki` : "Wikimedia";
    return `<span class="image-credit-badge image-credit-wikimedia" title="${escapeAttr(name ? `Wikimedia Commons · ${name}` : "Wikimedia Commons")}">${escapeHtml(label)}</span>`;
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
  const idToken = await state.user.getIdToken();
  const mintResponse = await fetch(`${WORKFLOW_URL}/r2-upload-url`, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
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
  const idToken = await state.user.getIdToken();
  try {
    const response = await fetch(`${WORKFLOW_URL}/r2-copy-url`, {
      method: "POST",
      headers: await withAppCheckHeaders({
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`
      }),
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

function setDraftActionButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
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
