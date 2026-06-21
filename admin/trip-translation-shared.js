import { withAppCheckHeaders } from "./shared.js";

export const WORKFLOW_URL = "https://trip-planner-ai-workflow.nakachedoron37.workers.dev";
export const TRIP_TRANSLATION_AI_ENDPOINT = `${WORKFLOW_URL}/deepseek`;
export const AI_PREFERENCE_STORAGE_PREFIX = "triptap-admin-ai";

export const DEEPSEEK_MODEL_OPTIONS = [
  { value: "deepseek-v4-flash", label: "DeepSeek Flash" },
  { value: "deepseek-v4-pro", label: "DeepSeek Pro" }
];

export const DEEPSEEK_REASONING_OPTIONS = [
  { value: "off", label: "ללא חשיבה" },
  { value: "low", label: "מהירה" },
  { value: "medium", label: "ממוקדת" },
  { value: "high", label: "מעמיקה" },
  { value: "max", label: "מקסימלית" }
];

export const TRIP_TRANSLATION_LANG_OPTIONS = [
  { value: "en", label: "אנגלית", english: "English" },
  { value: "fr", label: "צרפתית", english: "French" }
];

export function tripTranslationLangConfig(lang) {
  return TRIP_TRANSLATION_LANG_OPTIONS.find((option) => option.value === lang) || TRIP_TRANSLATION_LANG_OPTIONS[0];
}

function tripTranslationLocaleHints(lang) {
  const config = tripTranslationLangConfig(lang);
  if (config.value === "fr") {
    return {
      targetLang: "fr",
      languageName: config.english,
      writeNatural: "Write natural French for tourists. Keep place names recognizable; add French in parentheses only when it helps.",
      perPerson: "par personne",
      notFound: "Non trouvé",
      closed: "Fermé",
      dayNamesRule: "For hours translate the Hebrew day names (ראשון->dimanche, שני->lundi, שלישי->mardi, רביעי->mercredi, חמישי->jeudi, שישי->vendredi, שבת->samedi) and סגור->Fermé; keep the time ranges unchanged."
    };
  }
  return {
    targetLang: "en",
    languageName: config.english,
    writeNatural: "Write natural English for tourists. Keep place names recognizable; add English in parentheses only when it helps.",
    perPerson: "per person",
    notFound: "Not found",
    closed: "Closed",
    dayNamesRule: "For hours translate the Hebrew day names (ראשון->Sunday, שני->Monday, שלישי->Tuesday, רביעי->Wednesday, חמישי->Thursday, שישי->Friday, שבת->Saturday) and סגור->Closed; keep the time ranges unchanged."
  };
}

export function buildTripScheduleOnlyTranslationSystemPrompt(lang = "en") {
  const locale = tripTranslationLocaleHints(lang);
  return `
You translate the itinerary part of TripTap trip templates from Hebrew to ${locale.languageName} for a travel app.
You receive the ENTIRE schedule of one trip in a single request and must return it fully translated in a single JSON response.
Return valid JSON only. No markdown, no commentary, no code fences, no extra keys.

Completion contract:
- Translate the whole schedule in this one response: every day, and every item inside every day.
- Never stop early, never summarize, never return only the first day or the first item.
- The output schedule array must have exactly the same number of days, in the same order, as the input.
- Inside each day, the items array must have exactly the same number of items, in the same order, as the input.
- Before returning, verify the JSON is complete, parseable, and closed with all braces/brackets.
- If wording becomes long, shorten the translation rather than dropping any day, item, or field.

Rules:
- Translate ONLY user-facing free-text fields: the day title, dayTips, and each item's title, summary, description, address, notes, routeFrom, routeTo.
- Keep ids, dayNumber, order, numbers, urls, coordinates, booleans, enums, and machine keys exactly as in the input.
- ${locale.writeNatural}
- In address fields keep the local street name as-is and translate only the Hebrew parts (e.g. בודפשט -> Budapest, הונגריה -> Hungary).
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.
- If a field is empty or missing in the input, return it empty.

The ONLY allowed output shape:
{
  "target_lang": "${locale.targetLang}",
  "translation": {
    "schedule": [...]
  }
}
`.trim();
}

export function buildTripDetailsTranslationSystemPrompt(lang = "en") {
  const locale = tripTranslationLocaleHints(lang);
  return `
You translate TripTap trip templates from Hebrew to ${locale.languageName} for a travel app.
You receive everything about one trip EXCEPT the day-by-day schedule: its name and description, the places list, the hotels, and the booking links. You receive all of it in a single request and must return it fully translated in a single JSON response.
Return valid JSON only. No markdown, no commentary, no code fences, no extra keys.

Completion contract:
- Translate the whole payload in this one response.
- Never stop early, never summarize, never return only the first item.
- Every output array (places, hotels, bookingLinks) must have exactly the same length and order as the matching input array.
- Before returning, verify the JSON is complete, parseable, and closed with all braces/brackets.
- If wording becomes long, shorten the translation rather than dropping any item or field.

Rules:
- Translate ONLY user-facing free-text fields:
  - Trip: name, description, mainDestination, country, city.
  - Place: name, destination, shortDescription, description, location, hours, foodType.
  - Hotel: hotelName, destination, address, summary, breakfast, kosher/shabbat reasons, notes, locationRating, bookingRatingText, googleRatingText.
  - Booking: placeTitle, title, summary, priceRange, destination.
- Keep ids, placeId, provider, urls, coordinates, image fields, starRating, booleans, numbers, and machine keys exactly as in the input.
- ${locale.writeNatural}
- In address/location fields keep the local street name as-is and translate only the Hebrew parts (e.g. בודפשט -> Budapest, הונגריה -> Hungary).
- ${locale.dayNamesRule}
- For priceRange keep currency symbols and numbers; translate words like "לאדם" to "${locale.perPerson}".
- For rating text like "לא נמצא" translate to "${locale.notFound}".
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.
- If a field is empty or missing in the input, return it empty.

The ONLY allowed output shape:
{
  "target_lang": "${locale.targetLang}",
  "translation": {
    "name": "...",
    "description": "...",
    "mainDestination": "...",
    "country": "...",
    "city": "...",
    "places": [...],
    "hotels": [...],
    "bookingLinks": [...]
  }
}

Include only sections present in the input payload.
`.trim();
}

export const TRIP_TRANSLATION_SYSTEM_PROMPT = `
You translate TripTap trip templates from Hebrew to English for a travel app.
Return valid JSON only. No markdown, no commentary, no extra keys.

Completion contract:
- You must translate the entire input payload in one complete response.
- Do not stop early, do not summarize, and do not return only the first item.
- Every array in the output must have the same length and order as the matching input array.
- Before returning, verify that the JSON is complete, parseable, and closed with all braces/brackets.
- If wording becomes long, make the translation shorter rather than omitting fields or items.

Rules:
- Translate ONLY user-facing free-text fields. Keep ids, numbers, urls, coords, booleans, enums, provider names, star ratings unchanged.
- Preserve the exact structure and array lengths from the input.
- Every nested object must keep the same id / dayNumber / order as the input.
- Write natural English for tourists. Keep place names recognizable; add English in parentheses when helpful.
- Do NOT translate URLs, booking links, image urls, coordinates, category keys, reservation enums, or provider brand names.
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.
- If a field is empty or missing in Hebrew, return it empty.
- For priceRange keep currency symbols and numbers; translate words like "לאדם" to "per person".
- For rating text like "לא נמצא" translate to "Not found".

The ONLY allowed output shape:
{
  "target_lang": "en",
  "translation": {
    "name": "...",
    "description": "...",
    "mainDestination": "...",
    "country": "...",
    "city": "...",
    "schedule": [...],
    "places": [...],
    "hotels": [...],
    "bookingLinks": [...]
  }
}

Include only sections present in the input payload.
`.trim();

export const TRIP_SCHEDULE_TRANSLATION_SYSTEM_PROMPT = `
You translate the itinerary part of TripTap trip templates from Hebrew to English for a travel app.
Return valid JSON only. No markdown, no commentary, no extra keys.

Completion contract:
- You must translate the entire input payload in one complete response.
- Do not stop early, do not summarize, and do not return only the first day or first item.
- schedule and places must keep the exact same array lengths and order as the input.
- Before returning, verify that the JSON is complete, parseable, and closed with all braces/brackets.
- If wording becomes long, make the translation shorter rather than omitting fields or items.

Rules:
- Translate ONLY user-facing free-text fields. Keep ids, numbers, urls, coords, booleans, enums, category keys, reservation enums, and provider names unchanged.
- Preserve the exact structure and array lengths from the input.
- Every nested object must keep the same id / dayNumber / order as the input.
- Write natural English for tourists. Keep place names recognizable; add English in parentheses when helpful.
- Do NOT translate URLs, image urls, coordinates, or machine keys.
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.
- If a field is empty or missing in Hebrew, return it empty.

The ONLY allowed output shape:
{
  "target_lang": "en",
  "translation": {
    "name": "...",
    "description": "...",
    "mainDestination": "...",
    "country": "...",
    "city": "...",
    "schedule": [...],
    "places": [...]
  }
}

Include only sections present in the input payload.
`.trim();

export const TRIP_SCHEDULE_ONLY_TRANSLATION_SYSTEM_PROMPT = buildTripScheduleOnlyTranslationSystemPrompt("en");

export const TRIP_DETAILS_TRANSLATION_SYSTEM_PROMPT = buildTripDetailsTranslationSystemPrompt("en");

export const TRIP_COMMERCE_TRANSLATION_SYSTEM_PROMPT = `
You translate TripTap hotel recommendations and attraction booking links from Hebrew to English.
Return valid JSON only. No markdown, no commentary, no extra keys.

Completion contract:
- You must translate the entire input payload in one complete response.
- Do not stop early, do not summarize, and do not return only the first hotel or first booking link.
- hotels and bookingLinks must keep the exact same array lengths and order as the input.
- Before returning, verify that the JSON is complete, parseable, and closed with all braces/brackets.
- If wording becomes long, make the translation shorter rather than omitting fields or items.

Rules:
- Keep ids, placeId, provider, urls, coords, image fields, starRating, booleans, and numeric ratings unchanged.
- Translate hotelName, destination, address, summary, breakfast, kosher/shabbat reasons, notes, locationRating, bookingRatingText, googleRatingText.
- Translate booking placeTitle, title, summary, priceRange, destination.
- Preserve array length and ids exactly.
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.
- For priceRange keep currency symbols and numbers; translate words like "לאדם" to "per person".
- For rating text like "לא נמצא" translate to "Not found".

The ONLY allowed output shape:
{
  "target_lang": "en",
  "translation": {
    "hotels": [...],
    "bookingLinks": [...]
  }
}

Include only sections present in the input payload. Use name and mainDestination only as context; do not include them in the output.
`.trim();

export const HOTELS_TRANSLATION_SYSTEM_PROMPT = `
You translate TripTap hotel recommendations from Hebrew to English.
Return valid JSON only. No markdown.

Completion contract:
- Translate every hotel in the input. Do not stop early and do not return a partial hotels array.
- hotels must keep the exact same array length and order as the input.
- Before returning, verify that the JSON is complete, parseable, and closed with all braces/brackets.

Rules:
- Keep ids, starRating, urls, coords, booleans, numeric ratings unchanged.
- Translate hotelName, destination, address, summary, breakfast, kosher/shabbat reasons, notes, locationRating, bookingRatingText, googleRatingText.
- Preserve array length and ids exactly.
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.

Output shape:
{
  "target_lang": "en",
  "translation": {
    "name": "...",
    "mainDestination": "...",
    "hotels": [...]
  }
}
`.trim();

export const BOOKINGS_TRANSLATION_SYSTEM_PROMPT = `
You translate TripTap attraction booking links from Hebrew to English.
Return valid JSON only. No markdown.

Completion contract:
- Translate every booking link in the input. Do not stop early and do not return a partial bookingLinks array.
- bookingLinks must keep the exact same array length and order as the input.
- Before returning, verify that the JSON is complete, parseable, and closed with all braces/brackets.

Rules:
- Keep ids, placeId, provider, urls, coords, image fields unchanged.
- Translate placeTitle, title, summary, priceRange, destination.
- Preserve array length and ids exactly.
- Do NOT put literal line breaks inside JSON string values. Use \\n only if a line break is necessary.

Output shape:
{
  "target_lang": "en",
  "translation": {
    "name": "...",
    "mainDestination": "...",
    "bookingLinks": [...]
  }
}
`.trim();

export function storedAiPreference(feature, key, fallback) {
  try {
    return localStorage.getItem(`${AI_PREFERENCE_STORAGE_PREFIX}:${feature}:${key}`) || fallback;
  } catch (_) {
    return fallback;
  }
}

export function saveAiPreference(feature, key, value) {
  try {
    localStorage.setItem(`${AI_PREFERENCE_STORAGE_PREFIX}:${feature}:${key}`, String(value));
  } catch (_) {
    // Ignore storage failures.
  }
}

export function selectedReasoningValue(thinkingEnabled, reasoningEffort) {
  return thinkingEnabled ? reasoningEffort : "off";
}

export function modelDisplayName(model) {
  return DEEPSEEK_MODEL_OPTIONS.find((option) => option.value === model)?.label || model;
}

export function reasoningDisplayName(effort) {
  return DEEPSEEK_REASONING_OPTIONS.find((option) => option.value === effort)?.label || effort;
}

export function thinkingTemperature(thinkingEnabled, reasoningEffort) {
  if (!thinkingEnabled) return 0.7;
  return {
    low: 0.7,
    medium: 0.5,
    high: 0.2,
    max: 0.1
  }[reasoningEffort] ?? 0.2;
}

export function aiModeSummary(model, thinkingEnabled, reasoningEffort) {
  return `${modelDisplayName(model)} · ${thinkingEnabled ? `חשיבה ${reasoningDisplayName(reasoningEffort)}` : "ללא חשיבה"} · טמפ׳ ${thinkingTemperature(thinkingEnabled, reasoningEffort)}`;
}

export function text(value) {
  return value == null ? "" : String(value).trim();
}

export function escapeAttr(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function emptyHtml(message) {
  return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
}

export function extractJsonObjectText(response) {
  let output = text(response);
  if (output.startsWith("```")) {
    const firstNewline = output.indexOf("\n");
    if (firstNewline !== -1) output = output.slice(firstNewline + 1);
    if (output.endsWith("```")) output = output.slice(0, -3);
  }
  const balanced = extractFirstBalancedJsonObject(output);
  if (balanced) return balanced;
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start !== -1 && end > start) return output.slice(start, end + 1);
  return output;
}

function extractFirstBalancedJsonObject(source) {
  const start = source.indexOf("{");
  if (start === -1) return "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const ch = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") inString = false;
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

function escapeUnescapedControlCharsInJsonStrings(source) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (const ch of source) {
    if (inString) {
      if (escaped) {
        result += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        result += ch;
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        result += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") {
        result += "\\n";
        continue;
      }
      if (ch === "\r") {
        result += "\\r";
        continue;
      }
      if (ch === "\t") {
        result += "\\t";
        continue;
      }
      if (ch === "\b") {
        result += "\\b";
        continue;
      }
      if (ch === "\f") {
        result += "\\f";
        continue;
      }
      result += ch;
      continue;
    }
    result += ch;
    if (ch === "\"") inString = true;
  }
  return result;
}

function parseAiJsonObject(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    const repaired = escapeUnescapedControlCharsInJsonStrings(jsonText);
    if (repaired === jsonText) throw error;
    try {
      return JSON.parse(repaired);
    } catch (_) {
      throw error;
    }
  }
}

export function appendLiveText(current, delta) {
  const base = current == null ? "" : String(current);
  if (delta == null) return base;
  const next = String(delta);
  if (!next) return base;
  return `${base}${next}`;
}

export async function readDeepSeekResponse(response, handlers = {}) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    const payload = await response.json();
    if (payload.error) {
      const err = new Error(payload.detail || payload.error);
      err.aiError = payload.error;
      throw err;
    }
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
  let streamDone = false;
  let model = handlers.getFallbackModel?.() || "deepseek-v4-pro";

  const handleEvent = (event) => {
    if (event.error) {
      const err = new Error(event.detail || event.error);
      err.aiError = event.error;
      throw err;
    }
    if (event.model) {
      model = event.model;
      handlers.onModel?.(model);
    }
    // The worker streams reasoning/content as reasoningDelta/contentDelta and
    // sends the finished answer once as `text`. Accumulate the deltas (so a
    // missing final `text` event still yields the full answer) and accept the
    // legacy delta/reasoning keys for older worker builds.
    const reasoningDelta = event.reasoningDelta ?? event.reasoning;
    if (reasoningDelta) {
      fullReasoning = appendLiveText(fullReasoning, reasoningDelta);
      handlers.onReasoningDelta?.(reasoningDelta);
    }
    const contentDelta = event.contentDelta ?? event.delta;
    if (contentDelta) {
      fullText = appendLiveText(fullText, contentDelta);
      handlers.onContentDelta?.(contentDelta);
    }
    if (event.text) {
      const nextText = text(event.text);
      if (nextText.length >= fullText.length) fullText = nextText;
      handlers.onText?.(fullText);
    }
    if (event.done) streamDone = true;
    handlers.render?.();
  };

  const processPart = (part) => {
    const lines = part.split("\n").filter(Boolean);
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let event;
      try {
        event = JSON.parse(raw);
      } catch (_) {
        continue;
      }
      handleEvent(event);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) processPart(part);
  }
  // Flush the trailing buffer — the final `text` event can land in the last
  // chunk without a closing blank line, and dropping it truncates the answer.
  if (buffer.trim()) processPart(buffer);

  return { model, text: fullText, reasoning: fullReasoning, done: streamDone || Boolean(fullText.trim()) };
}

export function renderTranslationAiControls(prefix, model, thinkingEnabled, reasoningEffort) {
  return `
    <div class="duplicate-ai-controls" aria-label="הגדרות DeepSeek">
      <div class="ai-controls-grid">
        <label class="edit-field ai-control-field">
          <span>מודל</span>
          <select id="${prefix}AiModelSelect">
            ${DEEPSEEK_MODEL_OPTIONS.map((option) => `<option value="${option.value}" ${model === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
        <label class="edit-field ai-control-field">
          <span>רמת חשיבה</span>
          <select id="${prefix}AiThinkingSelect">
            ${DEEPSEEK_REASONING_OPTIONS.map((option) => `<option value="${option.value}" ${selectedReasoningValue(thinkingEnabled, reasoningEffort) === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
          </select>
        </label>
      </div>
      <div class="ai-mode-note" id="${prefix}AiModeNote"></div>
    </div>
  `;
}

export function renderTranslationLivePanel(prefix) {
  return `
    <div class="duplicate-live-panel is-hidden" id="${prefix}LivePanel">
      <div class="duplicate-live-heading">
        <strong>DeepSeek Live</strong>
        <span id="${prefix}LiveMeta"></span>
      </div>
      <div class="duplicate-live-grid">
        <div>
          <span>חשיבה</span>
          <pre id="${prefix}LiveReasoning"></pre>
        </div>
        <div>
          <span>תשובה</span>
          <pre id="${prefix}LiveAnswer"></pre>
        </div>
      </div>
    </div>
  `;
}

export function renderTranslationProgressDock(prefix) {
  return `
    <div class="translation-progress-dock is-hidden" id="${prefix}ProgressDock" aria-live="polite" aria-atomic="true">
      <div class="translation-progress-inner">
        <span class="translation-progress-spinner" aria-hidden="true"></span>
        <div class="translation-progress-copy">
          <strong id="${prefix}ProgressTitle">עובד...</strong>
          <p class="translation-progress-message" id="${prefix}ProgressMessage"></p>
        </div>
      </div>
    </div>
  `;
}

export function isTranslationBusy(state) {
  return Boolean(state?.translating || state?.saving || state?.loading);
}

export function syncTranslationProgress(prefix, state) {
  const dock = document.getElementById(`${prefix}ProgressDock`);
  const messageEl = document.getElementById(`${prefix}ProgressMessage`);
  const titleEl = document.getElementById(`${prefix}ProgressTitle`);
  const busy = isTranslationBusy(state);
  dock?.classList.toggle("is-hidden", !busy);
  if (titleEl) {
    if (state.saving && !state.translating) titleEl.textContent = "שומר תרגומים...";
    else if (state.translating) titleEl.textContent = "מתרגם עם AI...";
    else if (state.loading) titleEl.textContent = "טוען תבניות...";
    else titleEl.textContent = "עובד...";
  }
  if (messageEl) {
    messageEl.textContent = text(state.progressMessage);
    messageEl.classList.toggle("is-error", Boolean(state.progressError));
  }
}

export function setTranslationProgressState(state, message, isError = false) {
  state.progressMessage = message || "";
  state.progressError = isError;
}

export function syncTranslationActionButtons(prefix, state, { saveLabel = "שמור תרגומים מוכנים", pendingCount = 0 } = {}) {
  const busy = isTranslationBusy(state);
  const translateButton = document.getElementById(`${prefix}TranslateButton`);
  if (translateButton) {
    translateButton.disabled = busy;
    translateButton.classList.toggle("is-loading", state.translating);
  }
  const saveButton = document.getElementById(`${prefix}SaveButton`);
  if (saveButton) {
    saveButton.disabled = busy || pendingCount === 0;
    saveButton.classList.toggle("is-loading", state.saving && !state.translating);
    if (state.saving && !state.translating) {
      saveButton.innerHTML = `<span class="translation-progress-spinner is-inline" aria-hidden="true"></span><span>שומר...</span>`;
    } else {
      saveButton.innerHTML = `<i data-lucide="save" aria-hidden="true"></i><span>${escapeHtml(saveLabel)}${pendingCount ? ` (${pendingCount})` : ""}</span>`;
    }
  }
}

export function syncTranslationAiControls(prefix, state, busy = false) {
  const modelSelect = document.getElementById(`${prefix}AiModelSelect`);
  if (modelSelect) {
    modelSelect.value = state.aiModel;
    modelSelect.disabled = busy;
  }
  const thinkingSelect = document.getElementById(`${prefix}AiThinkingSelect`);
  if (thinkingSelect) {
    thinkingSelect.value = selectedReasoningValue(state.thinkingEnabled, state.reasoningEffort);
    thinkingSelect.disabled = busy;
  }
  const note = document.getElementById(`${prefix}AiModeNote`);
  if (note) {
    note.innerHTML = `<i data-lucide="brain-circuit" aria-hidden="true"></i><span>${aiModeSummary(state.aiModel, state.thinkingEnabled, state.reasoningEffort)} · JSON בלבד.</span>`;
  }
}

export function bindTranslationAiControls(prefix, state, onChange) {
  document.getElementById(`${prefix}AiModelSelect`)?.addEventListener("change", (event) => {
    state.aiModel = event.target.value;
    saveAiPreference(prefix, "model", state.aiModel);
    onChange?.();
  });
  document.getElementById(`${prefix}AiThinkingSelect`)?.addEventListener("change", (event) => {
    const value = event.target.value;
    state.thinkingEnabled = value !== "off";
    state.reasoningEffort = state.thinkingEnabled ? value : "high";
    saveAiPreference(prefix, "thinkingEnabled", state.thinkingEnabled);
    saveAiPreference(prefix, "reasoningEffort", state.reasoningEffort);
    onChange?.();
  });
}

export function renderTranslationLive(state, prefix) {
  const panel = document.getElementById(`${prefix}LivePanel`);
  if (!panel) return;
  const hasContent = text(state.liveReasoning) || text(state.liveAnswer);
  const showLive = hasContent || state.translating;
  panel.classList.toggle("is-hidden", !showLive);
  const meta = document.getElementById(`${prefix}LiveMeta`);
  if (meta) meta.textContent = aiModeSummary(state.liveModel || state.aiModel, state.thinkingEnabled, state.reasoningEffort);
  const reasoning = document.getElementById(`${prefix}LiveReasoning`);
  if (reasoning) reasoning.textContent = text(state.liveReasoning) || "אין תוכן חשיבה להצגה.";
  const answer = document.getElementById(`${prefix}LiveAnswer`);
  if (answer) answer.textContent = state.liveAnswer || "אין תשובה להצגה.";
}

function scheduleItemPayload(item) {
  return {
    id: text(item?.id),
    title: text(item?.title),
    summary: text(item?.summary),
    description: text(item?.description),
    address: text(item?.address),
    notes: text(item?.notes),
    routeFrom: text(item?.routeFrom),
    routeTo: text(item?.routeTo)
  };
}

function placePayload(place) {
  return {
    id: text(place?.id),
    name: text(place?.name),
    destination: text(place?.destination),
    shortDescription: text(place?.shortDescription),
    description: text(place?.description),
    location: text(place?.location),
    hours: text(place?.hours),
    foodType: text(place?.foodType)
  };
}

function hotelPayload(hotel) {
  return {
    id: text(hotel?.id),
    hotelName: text(hotel?.hotelName || hotel?.name),
    destination: text(hotel?.destination),
    address: text(hotel?.address),
    summary: text(hotel?.summary),
    breakfast: text(hotel?.breakfast),
    kosherFriendlyReason: text(hotel?.kosherFriendlyReason),
    shabbatFriendlyReason: text(hotel?.shabbatFriendlyReason),
    shabbatKosherNotes: text(hotel?.shabbatKosherNotes),
    notes: text(hotel?.notes),
    locationRating: text(hotel?.locationRating),
    bookingRatingText: text(hotel?.bookingRatingText),
    googleRatingText: text(hotel?.googleRatingText)
  };
}

function bookingPayload(booking) {
  return {
    id: text(booking?.id),
    placeId: text(booking?.placeId),
    placeTitle: text(booking?.placeTitle),
    destination: text(booking?.destination),
    title: text(booking?.title),
    summary: text(booking?.summary),
    priceRange: text(booking?.priceRange)
  };
}

export function buildTripTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    description: text(template?.description),
    mainDestination: text(template?.mainDestination),
    country: text(template?.country),
    city: text(template?.city),
    schedule: (template?.schedule || []).map((day) => ({
      dayNumber: Number(day?.dayNumber || 0),
      title: text(day?.title),
      dayTips: Array.isArray(day?.dayTips) ? day.dayTips.map((tip) => text(tip)).filter(Boolean) : [],
      items: (day?.items || []).map(scheduleItemPayload)
    })),
    places: (template?.places || []).map(placePayload),
    hotels: (template?.hotels || []).map(hotelPayload),
    bookingLinks: (template?.bookingLinks || []).map(bookingPayload)
  };
}

export function buildTripScheduleTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    description: text(template?.description),
    mainDestination: text(template?.mainDestination),
    country: text(template?.country),
    city: text(template?.city),
    schedule: (template?.schedule || []).map((day) => ({
      dayNumber: Number(day?.dayNumber || 0),
      title: text(day?.title),
      dayTips: Array.isArray(day?.dayTips) ? day.dayTips.map((tip) => text(tip)).filter(Boolean) : [],
      items: (day?.items || []).map(scheduleItemPayload)
    })),
    places: (template?.places || []).map(placePayload)
  };
}

export function buildTripScheduleOnlyTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    schedule: (template?.schedule || []).map((day) => ({
      dayNumber: Number(day?.dayNumber || 0),
      title: text(day?.title),
      dayTips: Array.isArray(day?.dayTips) ? day.dayTips.map((tip) => text(tip)).filter(Boolean) : [],
      items: (day?.items || []).map(scheduleItemPayload)
    }))
  };
}

export function buildTripDetailsTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    description: text(template?.description),
    mainDestination: text(template?.mainDestination),
    country: text(template?.country),
    city: text(template?.city),
    places: (template?.places || []).map(placePayload),
    hotels: (template?.hotels || []).map(hotelPayload),
    bookingLinks: (template?.bookingLinks || []).map(bookingPayload)
  };
}

export function buildTripCommerceTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    mainDestination: text(template?.mainDestination),
    hotels: (template?.hotels || []).map(hotelPayload),
    bookingLinks: (template?.bookingLinks || []).map(bookingPayload)
  };
}

export function buildHotelsTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    mainDestination: text(template?.mainDestination),
    hotels: (template?.hotels || []).map(hotelPayload)
  };
}

export function buildBookingsTranslationPayload(template, langCode = "en") {
  return {
    template_id: text(template?.id),
    target_lang: langCode,
    name: text(template?.name),
    mainDestination: text(template?.mainDestination),
    bookingLinks: (template?.bookingLinks || []).map(bookingPayload)
  };
}

export function hasLangTranslation(item, langCode) {
  const t = item?.translations?.[langCode];
  if (!t || typeof t !== "object") return false;
  return Object.values(t).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return text(value).length > 0;
  });
}

export function hasEnglishTranslation(template) {
  return hasLangTranslation(template, "en");
}

export function translationLangLabel(langCode) {
  return tripTranslationLangConfig(langCode).label;
}

export function translationLangBadge(langCode) {
  return tripTranslationLangConfig(langCode).value.toUpperCase();
}

export function translationTargetKey(langCode = "en") {
  return `translations.${langCode}`;
}

export function applyTranslationFilter(items, filter, langCode = "en") {
  const normalizedFilter = text(filter) || "all";
  if (normalizedFilter === "missing") {
    return items.filter((item) => !hasLangTranslation(item, langCode));
  }
  if (normalizedFilter === "has") {
    return items.filter((item) => hasLangTranslation(item, langCode));
  }
  return items;
}

export function renderTranslationLangControls(prefix, langCode = "en") {
  return `
    <label class="edit-field">
      <span>שפת יעד</span>
      <select id="${prefix}LangSelect">
        ${TRIP_TRANSLATION_LANG_OPTIONS.map((option) => `<option value="${option.value}" ${langCode === option.value ? "selected" : ""}>${option.label} (${option.value.toUpperCase()})</option>`).join("")}
      </select>
    </label>
  `;
}

export function syncTranslationLangControls(prefix, state, busy = false) {
  const select = document.getElementById(`${prefix}LangSelect`);
  if (!select) return;
  select.value = state.lang || "en";
  select.disabled = busy;
}

export function bindTranslationLangControls(prefix, state, onChange) {
  document.getElementById(`${prefix}LangSelect`)?.addEventListener("change", (event) => {
    state.lang = event.target.value === "fr" ? "fr" : "en";
    saveAiPreference(prefix, "lang", state.lang);
    if (state.pendingTranslations) state.pendingTranslations = {};
    syncTranslationFilterSelectOptions(prefix, state.lang, state.filter || "all");
    syncTranslationWorkspaceLabels(prefix, state);
    onChange?.();
  });
}

export function syncTranslationWorkspaceLabels(prefix, state) {
  const langLabel = translationLangLabel(state.lang || "en");
  const langKey = translationTargetKey(state.lang || "en");
  const pendingSave = Boolean(document.getElementById(`${prefix}SaveButton`));
  const translateLabel = document.getElementById(`${prefix}TranslateButtonLabel`);
  if (translateLabel) translateLabel.textContent = `תרגם נבחרים ל${langLabel}`;
  syncTranslationFilterSelectOptions(prefix, state.lang || "en", state.filter || "all");
  const workspaceDesc = document.getElementById(`${prefix}WorkspaceDesc`);
  if (workspaceDesc) {
    workspaceDesc.textContent = pendingSave
      ? `כל הפריטים נשלחים ל-AI וממתינים לאישור לפני שמירה ב-${langKey}.`
      : `כל הפריטים נשלחים כ-JSON מלא. התוצאה נשמרת ב-${langKey}.`;
  }
  const listDesc = document.getElementById(`${prefix}ListDesc`);
  if (listDesc) listDesc.textContent = `טען תבניות, בחר פריטים, שלח JSON ל-AI ושמור תחת ${langKey}.`;
}

export function renderTranslationFilterControls(prefix, langCode = "en") {
  const langLabel = translationLangLabel(langCode);
  return `
    <label class="edit-field">
      <span>סינון תרגום</span>
      <select id="${prefix}FilterSelect">
        <option value="all">הכל</option>
        <option value="missing">ללא תרגום ${langLabel}</option>
        <option value="has">עם תרגום ${langLabel}</option>
      </select>
    </label>
  `;
}

export function syncTranslationFilterSelectOptions(prefix, langCode = "en", selectedFilter = "all") {
  const select = document.getElementById(`${prefix}FilterSelect`);
  if (!select) return;
  const langLabel = translationLangLabel(langCode);
  select.innerHTML = `
    <option value="all">הכל</option>
    <option value="missing">ללא תרגום ${langLabel}</option>
    <option value="has">עם תרגום ${langLabel}</option>
  `;
  select.value = selectedFilter || "all";
}

export function bindTranslationFilterControls(prefix, state, onChange) {
  const select = document.getElementById(`${prefix}FilterSelect`);
  if (!select) return;
  syncTranslationFilterSelectOptions(prefix, state.lang || "en", state.filter || "all");
  select.addEventListener("change", () => {
    state.filter = select.value || "all";
    onChange?.();
  });
}

export function translationBadge(template, langCode = "en") {
  const badge = translationLangBadge(langCode);
  return hasLangTranslation(template, langCode)
    ? `<span class="count-pill success-pill">${badge} ✓</span>`
    : `<span class="count-pill">ללא ${badge}</span>`;
}

export async function requestTripTranslation({
  user,
  systemPrompt,
  payload,
  aiModel,
  thinkingEnabled,
  reasoningEffort,
  handlers = {}
}) {
  const idToken = await user.getIdToken();
  const response = await fetch(TRIP_TRANSLATION_AI_ENDPOINT, {
    method: "POST",
    headers: await withAppCheckHeaders({
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`
    }),
    body: JSON.stringify({
      feature: "admin_tool",
      systemPrompt,
      userPrompt: JSON.stringify(payload, null, 2),
      preferredModel: aiModel,
      thinkingEnabled,
      reasoningEffort,
      temperature: thinkingTemperature(thinkingEnabled, reasoningEffort),
      jsonObjectResponse: true,
      stream: true
    })
  });
  if (!response.ok) throw new Error(await response.text());
  return readDeepSeekResponse(response, handlers);
}

export function parseTranslationResponse(rawText) {
  const jsonText = extractJsonObjectText(rawText);
  if (!jsonText.trim()) {
    throw new Error("ה-AI החזיר תשובה ריקה. נסה שוב, הקטן את מספר הפריטים, או הורד את רמת החשיבה.");
  }
  const decoded = parseAiJsonObject(jsonText);
  const translation = decoded?.translation;
  if (!translation || typeof translation !== "object") {
    throw new Error("AI response missing translation object");
  }
  return translation;
}

export async function saveTemplateTranslation(firebase, templateId, langCode, translation) {
  const fs = firebase.firestore;
  const existingDoc = await fs.getDoc(fs.doc(firebase.db, "trip_templates", templateId));
  const existing = existingDoc.exists() ? existingDoc.data() : {};
  const translations = { ...(existing.translations || {}) };
  translations[langCode] = {
    ...(translations[langCode] || {}),
    ...translation
  };
  await fs.setDoc(
    fs.doc(firebase.db, "trip_templates", templateId),
    { translations },
    { merge: true }
  );
}

export function translationFilterEmptyMessage(filter, langCode = "en", fallback = "אין פריטים לתרגום.") {
  const langLabel = translationLangLabel(langCode);
  if (filter === "missing") return `אין פריטים ללא תרגום ${langLabel}.`;
  if (filter === "has") return `אין פריטים עם תרגום ${langLabel}.`;
  return fallback;
}

export function createTranslationState(featureKey) {
  return {
    templates: [],
    selectedIds: new Set(),
    loaded: false,
    loading: false,
    translating: false,
    saving: false,
    progressMessage: "",
    progressError: false,
    search: "",
    filter: "all",
    lang: storedAiPreference(featureKey, "lang", "en"),
    aiModel: storedAiPreference(featureKey, "model", "deepseek-v4-pro"),
    thinkingEnabled: storedAiPreference(featureKey, "thinkingEnabled", "true") !== "false",
    reasoningEffort: storedAiPreference(featureKey, "reasoningEffort", "high"),
    liveReasoning: "",
    liveAnswer: "",
    liveModel: null
  };
}

export function renderTranslationWorkspace({
  prefix,
  entityLabel,
  loadLabel,
  translateLabel,
  saveLabel = "",
  lang = "en",
  aiModel,
  thinkingEnabled,
  reasoningEffort
}) {
  const langKey = translationTargetKey(lang);
  const pendingSaveNote = saveLabel
    ? `כל ${escapeHtml(entityLabel)} נשלח ל-AI וממתין לאישור לפני שמירה ב-${langKey}.`
    : `כל ${escapeHtml(entityLabel)} נשלח כ-JSON מלא. התוצאה נשמרת ב-${langKey}.`;
  return `
    <div class="workspace-grid duplicate-layout">
      <article class="panel">
        <div class="panel-heading">
          <span class="panel-icon blue"><i data-lucide="languages" aria-hidden="true"></i></span>
          <div>
            <h2>תרגום ${escapeHtml(entityLabel)}</h2>
            <p id="${prefix}ListDesc">טען תבניות, בחר פריטים, שלח JSON ל-AI ושמור תחת ${langKey}.</p>
          </div>
        </div>
        <div class="current-summary-row">
          <span class="count-pill" id="${prefix}LoadedPill">0 פריטים</span>
          <span class="count-pill" id="${prefix}FilteredPill">0 מוצגים</span>
          <span class="count-pill" id="${prefix}SelectedPill">0 מסומנים</span>
          <button class="ghost-action small-action" type="button" id="${prefix}SelectAllButton">
            <i data-lucide="check-square" aria-hidden="true"></i>
            <span>בחר הכל</span>
          </button>
        </div>
        ${renderTranslationLangControls(prefix, lang)}
        <label class="edit-field">
          <span>חיפוש</span>
          <input type="search" id="${prefix}SearchInput" placeholder="שם, יעד..." />
        </label>
        ${renderTranslationFilterControls(prefix, lang)}
        <div class="action-row">
          <button class="primary-action" type="button" id="${prefix}LoadButton">
            <i data-lucide="download-cloud" aria-hidden="true"></i>
            <span>${escapeHtml(loadLabel)}</span>
          </button>
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading">
          <span class="panel-icon violet"><i data-lucide="sparkles" aria-hidden="true"></i></span>
          <div>
            <h2>תרגום עם AI</h2>
            <p id="${prefix}WorkspaceDesc">${pendingSaveNote}</p>
          </div>
        </div>
        ${renderTranslationAiControls(prefix, aiModel, thinkingEnabled, reasoningEffort)}
        <button class="primary-action wide" type="button" id="${prefix}TranslateButton">
          <i data-lucide="languages" aria-hidden="true"></i>
          <span id="${prefix}TranslateButtonLabel">${escapeHtml(translateLabel)}</span>
        </button>
        ${saveLabel ? `
          <button class="ghost-action wide" type="button" id="${prefix}SaveButton" disabled>
            <i data-lucide="save" aria-hidden="true"></i>
            <span>${escapeHtml(saveLabel)}</span>
          </button>
        ` : ""}
        ${renderTranslationLivePanel(prefix)}
      </article>
    </div>

    ${renderTranslationProgressDock(prefix)}

    <section class="result-section">
      <div class="section-heading compact">
        <div>
          <p class="eyebrow">רשימת פריטים</p>
          <h2>בחר מה לתרגם</h2>
        </div>
      </div>
      <div class="current-places-grid" id="${prefix}Cards"></div>
    </section>
  `;
}
