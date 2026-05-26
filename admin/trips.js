import {
    createAdminShell,
    attachSharedUi,
    resolveAdminStep,
    resolveAdminView,
    setupUnsavedChangesWarning,
    ensureAdminImageUrlOnR2,
    uploadAdminImageFileToR2,
    adminPixabaySearch,
    adminPixabayLookupById,
    adminUnsplashSearch
} from "./shared.js";

const SEARCH_RADIUS_KM = 50;
const TRIP_TEMPLATE_R2_FOLDER = "tav_img";
const TRIP_HOTEL_R2_FOLDER = "hotel_img";
const TRIP_BOOKING_R2_FOLDER = "link_img";
const CATEGORIES = [
    ["family", "משפחתי"],
    ["romantic", "רומנטי"],
    ["adventure", "הרפתקני"],
    ["urban", "עירוני"],
    ["shopping", "שופינג"],
    ["beach", "חוף וים"],
    ["nature", "טבע"],
    ["cultural", "תרבות"],
    ["foodie", "קולינרי"]
];

const state = {
    firebase: null,
    user: null,
    view: "compose",
    composeSection: "builder",
    destination: null,
    promptPlaces: [],
    parsedTemplate: null,
    hotelRecommendations: [],
    bookingRecommendations: [],
    templates: [],
    templateSearch: "",
    editingRecommendation: null,
    editingTemplate: null,
    detailRecommendation: null,
    imageTarget: null,
    imageSource: "pixabay",
    imageCityFallback: "",
    searchRadiusKm: SEARCH_RADIUS_KM,
    saving: false,
    lastSavedSignature: null,
    lastSavedId: null
};

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES);

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

renderPage();

function renderPage() {
    state.view = normalizeView(resolveAdminView("compose"));
    state.composeSection = normalizeComposeSection(resolveAdminStep("builder"));
    document.getElementById("app").innerHTML = createAdminShell({
        activeKey: "trips",
        activeSubKey: state.view,
        title: state.view === "compose" ? "יצירת טיול" : "טיולים מצב נוכחי",
        subtitle: state.view === "compose" ? "מקומות, prompt, JSON ושמירה." : "חיפוש, טעינה, עריכה ומחיקה.",
        content: `${state.view === "compose" ? renderComposeView() : renderManageView()}${renderTemplateEditDialog()}${renderHotelEditDialog()}${renderBookingEditDialog()}${renderRecommendationDetailDialog()}${renderRecommendationImageDialog()}${renderLoadingOverlay()}${renderToastContainer()}`
    });

    attachSharedUi({
        activeKey: "trips",
        requireAuth: true,
        onAuthed: (user, firebase) => {
            state.user = user;
            state.firebase = firebase;
            init();
        }
    });
}

function normalizeView(view) {
    return ["compose", "manage"].includes(view) ? view : "compose";
}

function normalizeComposeSection(section) {
    return ["builder", "hotels", "bookings", "preview"].includes(section) ? section : "builder";
}

function renderComposeView() {
    return `
            <div class="tool-tabs trip-compose-tabs" id="tripComposeTabs" aria-label="שלבי יצירת טיול">
                <button class="ghost-action tool-tab" type="button" data-compose-section="builder">
                    <b>1</b>
                    <span>יצירת מסלול</span>
                </button>
                <button class="ghost-action tool-tab" type="button" id="tripComposeHotelsTab" data-compose-section="hotels">
                    <b>2</b>
                    <span>המלצות מלונות</span>
                </button>
                <button class="ghost-action tool-tab" type="button" id="tripComposeBookingsTab" data-compose-section="bookings">
                    <b>3</b>
                    <span>המלצות קישורי הזמנה</span>
                </button>
                <button class="ghost-action tool-tab is-hidden" type="button" id="tripComposePreviewTab" data-compose-section="preview">
                    <b>4</b>
                    <span>תצוגה מקדימה</span>
                </button>
            </div>

            <section class="tool-view" id="tripComposeBuilderView">
            <div class="workspace-grid trip-template-workspace">
                <article class="panel">
                    <div class="panel-heading">
                        <span class="panel-icon blue"><i data-lucide="route" aria-hidden="true"></i></span>
                        <div>
                            <h2>יעד ומקומות ל-prompt</h2>
                            <p>אותו prompt של מצב מתכנת.</p>
                        </div>
                    </div>
                    <div class="micro-note">בחר יעד, טען מקומות בטווח שתבחר והעתק prompt.</div>
                    <div class="field-block">
                        <label for="tripDestinationInput">יעד</label>
                        <div class="search-input-row">
                            <i data-lucide="map-pin" aria-hidden="true"></i>
                            <input id="tripDestinationInput" type="text" placeholder="Vienna, Rome, Paris" autocomplete="off" />
                        </div>
                        <div class="suggestions" id="tripDestinationSuggestions"></div>
                    </div>
                    <div class="selected-place" id="selectedTripDestination">
                        <i data-lucide="map"></i><span>בחר יעד מהרשימה.</span>
                    </div>
                    <div class="action-row">
                        <button class="primary-action" type="button" id="loadTripPlacesButton"><i data-lucide="download-cloud"></i><span>טען מקומות ובנה prompt</span></button>
                        <button class="ghost-action" type="button" id="tripPlaceFiltersButton"><i data-lucide="sliders-horizontal"></i><span>סינונים</span></button>
                        <button class="ghost-action" type="button" id="copyTripPromptButton"><i data-lucide="copy"></i><span>העתק prompt</span></button>
                    </div>
                    <div class="trip-place-filter-panel is-hidden" id="tripPlaceFilterPanel">
                        <div class="field-block">
                            <label for="tripPlacesRadiusRange">מרחק למשיכת מקומות מהיעד</label>
                            <div class="range-row">
                                <input id="tripPlacesRadiusRange" type="range" min="1" max="150" step="1" value="${state.searchRadiusKm}" />
                                <b id="tripPlacesRadiusValue">${state.searchRadiusKm} ק״מ</b>
                            </div>
                        </div>
                    </div>
                    <textarea id="tripPromptPreview" class="prompt-preview trip-prompt-preview" readonly spellcheck="false"></textarea>
                </article>

                <article class="panel">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="braces" aria-hidden="true"></i></span>
                        <div>
                            <h2>JSON מה-AI</h2>
                            <p>tripTitle, tripCategories, days.</p>
                        </div>
                    </div>
                    <textarea id="tripJsonInput" class="json-input" spellcheck="false" placeholder='JSON סופי מה-AI'></textarea>
                    <div class="action-row split-actions">
                        <button class="ghost-action" type="button" id="pasteTripJsonButton"><i data-lucide="clipboard-paste"></i><span>הדבק JSON</span></button>
                        <button class="primary-action" type="button" id="parseTripJsonButton"><i data-lucide="braces"></i><span>פענח</span></button>
                    </div>
                    <p class="status-line" id="tripStatus"></p>
                </article>
            </div>
            </section>

            <section class="result-section tool-view" id="tripComposePreviewView">
                <div class="section-heading compact">
                    <div><p class="eyebrow">תצוגה מקדימה</p><h2>ימים, לו״ז ופרסום</h2></div>
                    <div class="action-row tight">
                        <span class="count-pill" id="tripDayCountPill">0 ימים</span>
                        <button class="primary-action" type="button" id="saveTripTemplateButton"><i data-lucide="cloud-upload"></i><span>שמור תבנית ל-TripTap</span></button>
                    </div>
                </div>
                <div id="tripPreviewCards" class="trip-preview-days"></div>
            </section>

            <section class="result-section trip-recommendations-page tool-view" id="tripComposeHotelsView">
                <div class="section-heading compact">
                    <div><p class="eyebrow">דף המלצות</p><h2>המלצות מלונות</h2></div>
                    <div class="action-row tight">
                        <span class="count-pill" id="tripHotelCountPill">0 מלונות</span>
                    </div>
                </div>
                <article class="panel recommendation-panel">
                    <div class="panel-heading">
                        <span class="panel-icon amber"><i data-lucide="hotel"></i></span>
                        <div><h2>המלצות מלון</h2><p>prompt, JSON ותצוגה כמו במצב מתכנת.</p></div>
                    </div>
                    <div class="action-row">
                        <button class="primary-action" type="button" id="copyTripHotelsPromptButton"><i data-lucide="copy"></i><span>העתק פרומפט מלונות</span></button>
                        <button class="ghost-action" type="button" id="pasteTripHotelsJsonButton"><i data-lucide="clipboard-paste"></i><span>הדבק JSON מלונות</span></button>
                    </div>
                    <textarea id="tripHotelsJsonInput" class="json-input recommendation-json" spellcheck="false" placeholder='{"hotels": [...]}'></textarea>
                    <div class="recommendation-cards" id="tripHotelRecommendationCards"></div>
                </article>
            </section>

            <section class="result-section trip-recommendations-page tool-view" id="tripComposeBookingsView">
                <div class="section-heading compact">
                    <div><p class="eyebrow">דף המלצות</p><h2>קישורי הזמנה</h2></div>
                    <div class="action-row tight">
                        <span class="count-pill" id="tripBookingCountPill">0 קישורים</span>
                    </div>
                </div>
                <article class="panel recommendation-panel">
                    <div class="panel-heading">
                        <span class="panel-icon coral"><i data-lucide="ticket"></i></span>
                        <div><h2>קישורי הזמנה</h2><p>מבוסס על המקומות שמופיעים בלו״ז.</p></div>
                    </div>
                    <div class="action-row">
                        <button class="primary-action" type="button" id="copyTripBookingsPromptButton"><i data-lucide="copy"></i><span>העתק פרומפט קישורים</span></button>
                        <button class="ghost-action" type="button" id="pasteTripBookingsJsonButton"><i data-lucide="clipboard-paste"></i><span>הדבק JSON קישורים</span></button>
                    </div>
                    <textarea id="tripBookingsJsonInput" class="json-input recommendation-json" spellcheck="false" placeholder='{"bookingLinks": [...]}'></textarea>
                    <div class="recommendation-cards" id="tripBookingRecommendationCards"></div>
                </article>
            </section>
        `;
}

function renderManageView() {
    return `
            <div class="workspace-grid trip-manager-grid single-search-grid">
                <article class="panel wide-panel">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="search" aria-hidden="true"></i></span>
                        <div><h2>חיפוש תבניות</h2><p>שם, יעד או מילת מפתח.</p></div>
                    </div>
                    <div class="field-block">
                        <label for="tripTemplateSearchInput">חיפוש</label>
                        <div class="search-input-row">
                            <i data-lucide="search" aria-hidden="true"></i>
                            <input id="tripTemplateSearchInput" type="text" placeholder="לדוגמה: Vienna, משפחתי, foodie" />
                        </div>
                    </div>
                    <p class="status-line" id="tripStatus"></p>
                </article>
            </div>
            <section class="result-section">
                <div class="section-heading compact">
                    <div><p class="eyebrow">תבניות TripTap</p><h2>עריכה ומחיקה</h2></div>
                    <span class="count-pill" id="tripTemplateCountPill">0 תבניות</span>
                </div>
                <div id="tripTemplateCards" class="cards-grid"></div>
            </section>
        `;
}

function renderTemplateEditDialog() {
    return `
            <dialog class="image-dialog edit-dialog" id="templateEditDialog">
                <form method="dialog" class="image-dialog-shell edit-dialog-shell">
                    <div class="dialog-header">
                        <div><p class="eyebrow">עריכת תבנית</p><h2 id="templateEditTitle">תבנית טיול</h2></div>
                        <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                    </div>
                    <div class="edit-form-grid" id="templateEditFields"></div>
                    <div class="action-row split-actions">
                        <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור וסגור</span></button>
                        <button class="ghost-action danger-lite" type="button" id="deleteTemplateButton"><i data-lucide="trash-2"></i><span>מחק תבנית</span></button>
                    </div>
                </form>
            </dialog>
        `;
}

function renderHotelEditDialog() {
    return `
        <dialog class="image-dialog edit-dialog" id="hotelEditDialog">
            <form method="dialog" class="image-dialog-shell edit-dialog-shell">
                <div class="dialog-header">
                    <div><p class="eyebrow">עריכת מלון</p><h2 id="hotelEditDialogTitle">מלון</h2></div>
                    <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                </div>
                <div class="edit-form-grid" id="hotelEditFields"></div>
                <div class="action-row split-actions">
                    <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור שינויים</span></button>
                    <button class="ghost-action" type="button" id="hotelEditPickImageButton"><i data-lucide="image"></i><span>בחר תמונה</span></button>
                </div>
            </form>
        </dialog>
    `;
}

function renderBookingEditDialog() {
    return `
        <dialog class="image-dialog edit-dialog" id="bookingEditDialog">
            <form method="dialog" class="image-dialog-shell edit-dialog-shell">
                <div class="dialog-header">
                    <div><p class="eyebrow">עריכת קישור הזמנה</p><h2 id="bookingEditDialogTitle">קישור הזמנה</h2></div>
                    <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                </div>
                <div class="edit-form-grid" id="bookingEditFields"></div>
                <div class="action-row split-actions">
                    <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור שינויים</span></button>
                    <button class="ghost-action" type="button" id="bookingEditPickImageButton"><i data-lucide="image"></i><span>בחר תמונה</span></button>
                </div>
            </form>
        </dialog>
    `;
}

function renderRecommendationDetailDialog() {
    return `
        <dialog class="image-dialog recommendation-detail-dialog" id="recommendationDetailDialog">
            <form method="dialog" class="image-dialog-shell recommendation-detail-shell">
                <div class="dialog-header">
                    <div><p class="eyebrow" id="recommendationDetailEyebrow">פרטי המלצה</p><h2 id="recommendationDetailTitle">המלצה</h2></div>
                    <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                </div>
                <div class="recommendation-detail-body" id="recommendationDetailBody"></div>
                <div class="action-row split-actions">
                    <button class="primary-action" type="button" id="recommendationDetailEditButton"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                    <button class="ghost-action" type="button" id="recommendationDetailImageButton"><i data-lucide="image"></i><span>תמונה</span></button>
                    <button class="ghost-action danger-lite" type="button" id="recommendationDetailDeleteButton"><i data-lucide="trash-2"></i><span>מחק</span></button>
                </div>
            </form>
        </dialog>
    `;
}

function renderRecommendationImageDialog() {
    return `
        <dialog class="image-dialog" id="recommendationImageDialog">
            <form method="dialog" class="image-dialog-shell">
                <div class="dialog-header">
                    <div><p class="eyebrow">חיפוש תמונות</p><h2 id="recommendationImageDialogTitle">בחירת תמונה</h2></div>
                    <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                </div>
                <div class="action-row image-source-row">
                    <button class="ghost-action small-action" type="button" data-rec-image-source="gallery">גלריה</button>
                    <button class="ghost-action small-action" type="button" data-rec-image-source="pixabay">Pixabay</button>
                    <button class="ghost-action small-action" type="button" data-rec-image-source="wikimedia">Wikipedia</button>
                    <button class="ghost-action small-action" type="button" data-rec-image-source="unsplash">Unsplash</button>
                </div>
                <div class="image-search-row" id="recommendationImageSearchRow">
                    <input id="recommendationImageSearchInput" class="plain-input" type="text" placeholder="חיפוש תמונה" />
                    <button class="primary-action" type="button" id="runRecommendationImageSearchButton"><i data-lucide="search"></i><span>חפש</span></button>
                </div>
                <div class="image-search-row" id="recommendationImageGalleryRow" hidden>
                    <input id="recommendationImageGalleryFile" type="file" accept="image/*" class="plain-input" />
                    <input id="recommendationImageGalleryUrl" class="plain-input" type="url" placeholder="או הדבק קישור תמונה" />
                    <button class="primary-action" type="button" id="useRecommendationImageGalleryButton"><i data-lucide="check"></i><span>השתמש בתמונה</span></button>
                </div>
                <div class="image-results" id="recommendationImageResults"></div>
            </form>
        </dialog>
    `;
}

function renderLoadingOverlay() {
    return `
        <div class="trip-loading-overlay" id="tripLoadingOverlay" hidden>
            <div class="trip-loading-card">
                <span class="trip-loading-spinner"></span>
                <p id="tripLoadingMessage">מעבד...</p>
            </div>
        </div>
    `;
}

function renderToastContainer() {
    return `<div class="trip-toast-stack" id="tripToastStack"></div>`;
}

function showLoadingOverlay(message) {
    const overlay = $("tripLoadingOverlay");
    if (!overlay) return;
    overlay.hidden = false;
    $("tripLoadingMessage").textContent = message || "מעבד...";
}

function setLoadingMessage(message) {
    if ($("tripLoadingMessage")) $("tripLoadingMessage").textContent = message;
}

function hideLoadingOverlay() {
    const overlay = $("tripLoadingOverlay");
    if (overlay) overlay.hidden = true;
}

function showToast(message, kind = "success") {
    const stack = $("tripToastStack");
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

function init() {
    bindActions();
    setupUnsavedChangesWarning({
        hasUnsavedChanges: hasUnsavedTripWork,
        message: "יש לך טיול או עריכה שלא נשמרו. לצאת מהעמוד בלי לשמור?"
    });
    if (state.view === "manage") loadTemplates();
    renderTripPreview();
    renderRecommendations();
    syncComposeSections();
    refreshIcons();
}

function bindActions() {
    $$('[data-compose-section]').forEach((button) => button.addEventListener("click", () => switchComposeSection(button.dataset.composeSection)));
    $$('[data-sub-key]').forEach((link) => link.addEventListener("click", (event) => handleComposeSubnavClick(event, link.dataset.subKey)));
    bindDestinationSearch();
    $("loadTripPlacesButton")?.addEventListener("click", loadDestinationPlacesAndBuildPrompt);
    $("tripPlaceFiltersButton")?.addEventListener("click", toggleTripPlaceFilters);
    $("tripPlacesRadiusRange")?.addEventListener("input", updateTripPlacesRadius);
    $("copyTripPromptButton")?.addEventListener("click", copyTripPrompt);
    $("pasteTripJsonButton")?.addEventListener("click", pasteTripJson);
    $("parseTripJsonButton")?.addEventListener("click", parseTripJson);
    $("saveTripTemplateButton")?.addEventListener("click", saveTripTemplate);
    $("copyTripHotelsPromptButton")?.addEventListener("click", copyHotelRecommendationsPrompt);
    $("pasteTripHotelsJsonButton")?.addEventListener("click", pasteHotelRecommendationsJson);
    $("copyTripBookingsPromptButton")?.addEventListener("click", copyBookingLinksPrompt);
    $("pasteTripBookingsJsonButton")?.addEventListener("click", pasteBookingRecommendationsJson);
    $("tripTemplateSearchInput")?.addEventListener("input", (event) => {
        state.templateSearch = event.target.value;
        renderTemplates();
    });
    $("templateEditDialog")?.querySelector("form")?.addEventListener("submit", saveEditedTemplateFromDialog);
    $("hotelEditDialog")?.querySelector("form")?.addEventListener("submit", saveHotelFromDialog);
    $("bookingEditDialog")?.querySelector("form")?.addEventListener("submit", saveBookingFromDialog);
    $("hotelEditPickImageButton")?.addEventListener("click", () => openImagePickerForEditingHotel());
    $("bookingEditPickImageButton")?.addEventListener("click", () => openImagePickerForEditingBooking());
    $("recommendationDetailEditButton")?.addEventListener("click", openEditFromDetailDialog);
    $("recommendationDetailDeleteButton")?.addEventListener("click", deleteFromDetailDialog);
    $("recommendationDetailImageButton")?.addEventListener("click", openImagePickerFromDetailDialog);
    $("deleteTemplateButton")?.addEventListener("click", deleteEditingTemplate);
    bindRecommendationImageDialog();
}

function bindRecommendationImageDialog() {
    $$('[data-rec-image-source]').forEach((button) => button.addEventListener("click", () => switchRecommendationImageSource(button.dataset.recImageSource)));
    $("runRecommendationImageSearchButton")?.addEventListener("click", () => searchRecommendationImages($("recommendationImageSearchInput").value.trim()));
    $("recommendationImageSearchInput")?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        searchRecommendationImages($("recommendationImageSearchInput").value.trim());
    });
    $("useRecommendationImageGalleryButton")?.addEventListener("click", applyGalleryImageFromDialog);
}

function bindDestinationSearch() {
    const input = $("tripDestinationInput");
    if (!input) return;
    const suggestions = $("tripDestinationSuggestions");
    let timer = null;
    input.addEventListener("input", () => {
        window.clearTimeout(timer);
        state.destination = null;
        timer = window.setTimeout(async () => {
            const query = input.value.trim();
            if (query.length < 2) {
                suggestions.innerHTML = "";
                return;
            }
            const results = await searchAddress(query);
            suggestions.innerHTML = results.map((item, index) => `
                            <button class="suggestion-item" type="button" data-index="${index}">
                                <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
                                <b>OpenStreetMap</b><i data-lucide="chevron-left"></i>
                            </button>
                        `).join("");
            suggestions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
                state.destination = normalizeDestination(results[Number(button.dataset.index)]);
                input.value = state.destination.label;
                $("selectedTripDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
                suggestions.innerHTML = "";
                refreshIcons();
            }));
            refreshIcons();
        }, 240);
    });
}

async function loadDestinationPlacesAndBuildPrompt() {
    await ensureDestinationSelected();
    if (!state.destination?.lat || !state.destination?.lon) {
        setStatus("tripStatus", "בחר יעד מהרשימה לפני טעינת מקומות.", true);
        return;
    }
    const radiusKm = selectedTripSearchRadiusKm();
    setStatus("tripStatus", `טוען מקומות מ-TripInspo בטווח ${radiusKm} ק״מ...`);
    try {
        const places = await fetchPublicPlacesByRadius(state.destination.lat, state.destination.lon, radiusKm);
        state.promptPlaces = dedupePlaces(places.map((place) => publicPlaceToPromptPlace(place)));
        $("tripPromptPreview").value = buildAiPrompt(state.destination.label, state.promptPlaces);
        setStatus("tripStatus", `נבנה prompt עם ${state.promptPlaces.length} מקומות בטווח ${radiusKm} ק״מ.`);
    } catch (error) {
        setStatus("tripStatus", `טעינת המקומות נכשלה: ${error.message}`, true);
    }
}

function toggleTripPlaceFilters() {
    const panel = $("tripPlaceFilterPanel");
    if (!panel) return;
    panel.classList.toggle("is-hidden");
}

function updateTripPlacesRadius(event) {
    state.searchRadiusKm = Number(event.target.value || SEARCH_RADIUS_KM);
    if ($("tripPlacesRadiusValue")) $("tripPlacesRadiusValue").textContent = `${state.searchRadiusKm} ק״מ`;
    if (state.destination?.label && state.promptPlaces.length) {
        $("tripPromptPreview").value = buildAiPrompt(state.destination.label, state.promptPlaces);
    }
}

function selectedTripSearchRadiusKm() {
    const value = Number($("tripPlacesRadiusRange")?.value || state.searchRadiusKm || SEARCH_RADIUS_KM);
    return Number.isFinite(value) && value > 0 ? value : SEARCH_RADIUS_KM;
}

async function copyTripPrompt() {
    const prompt = $("tripPromptPreview")?.value || buildAiPrompt(state.destination?.label || $("tripDestinationInput")?.value || "[יעד]", state.promptPlaces);
    await navigator.clipboard.writeText(prompt);
    setStatus("tripStatus", "prompt הטיול הועתק.");
}

async function pasteTripJson() {
    const raw = await navigator.clipboard.readText();
    if (!raw.trim()) return;
    $("tripJsonInput").value = raw;
    parseTripJson();
}

function parseTripJson() {
    try {
        state.parsedTemplate = parsePlannerTemplateJson($("tripJsonInput").value);
        state.lastSavedSignature = null;
        state.lastSavedId = null;
        state.composeSection = "preview";
        renderTripPreview();
        renderRecommendations();
        syncComposeSections();
        updateComposeUrl();
        setStatus("tripStatus", `נוצרה תצוגה מקדימה עם ${state.parsedTemplate.days.length} ימים.`);
    } catch (error) {
        setStatus("tripStatus", `שגיאה בפענוח JSON: ${error.message}`, true);
    }
}

function switchComposeSection(section) {
    if (state.view !== "compose") return;
    state.composeSection = canOpenComposeSection(section) ? section : "builder";
    syncComposeSections();
    updateComposeUrl();
}

function handleComposeSubnavClick(event, section) {
    if (state.view !== "compose") return;
    if (!["builder", "hotels", "bookings", "preview"].includes(section)) return;
    if (!canOpenComposeSection(section)) {
        event.preventDefault();
        return;
    }
    event.preventDefault();
    state.composeSection = section;
    syncComposeSections();
    updateComposeUrl();
}

function canOpenComposeSection(section) {
    if (section === "builder") return true;
    return Boolean(state.parsedTemplate);
}

function updateComposeUrl() {
    if (state.view !== "compose") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "compose");
    url.searchParams.set("step", state.composeSection);
    window.history.replaceState({}, "", url);
}

function syncComposeSections() {
    if (state.view !== "compose") return;
    const hasRoute = Boolean(state.parsedTemplate);
    const previewTab = $("tripComposePreviewTab");
    const hotelsTab = $("tripComposeHotelsTab");
    const bookingsTab = $("tripComposeBookingsTab");
    if (previewTab) previewTab.classList.toggle("is-hidden", !hasRoute);
    if (hotelsTab) {
        hotelsTab.disabled = !hasRoute;
        hotelsTab.title = hasRoute ? "" : "אפשר לפתוח אחרי שפיענחת מסלול";
    }
    if (bookingsTab) {
        bookingsTab.disabled = !hasRoute;
        bookingsTab.title = hasRoute ? "" : "אפשר לפתוח אחרי שפיענחת מסלול";
    }
    if (!canOpenComposeSection(state.composeSection) || (state.composeSection === "preview" && !hasRoute)) {
        state.composeSection = "builder";
    }

    $$('[data-sub-key]').forEach((link) => {
        const section = link.dataset.subKey;
        if (!["builder", "hotels", "bookings", "preview", "manage"].includes(section)) return;
        const isPreview = section === "preview";
        const isManage = section === "manage";
        const canOpen = isManage || canOpenComposeSection(section);
        link.classList.toggle("is-hidden", isPreview && !hasRoute);
        link.classList.toggle("is-disabled", !isManage && !canOpen);
        link.setAttribute("aria-disabled", !isManage && !canOpen ? "true" : "false");
        link.tabIndex = !isManage && !canOpen ? -1 : 0;
        link.classList.toggle("is-active", section === state.composeSection);
    });

    const activeSection = state.composeSection;
    const viewMap = {
        builder: "tripComposeBuilderView",
        preview: "tripComposePreviewView",
        hotels: "tripComposeHotelsView",
        bookings: "tripComposeBookingsView"
    };

    Object.entries(viewMap).forEach(([section, id]) => {
        $(id)?.classList.toggle("is-active", section === activeSection);
    });

    $$('[data-compose-section]').forEach((button) => {
        button.classList.toggle("is-active", button.dataset.composeSection === activeSection);
        button.setAttribute("aria-pressed", button.dataset.composeSection === activeSection ? "true" : "false");
    });
}

function parsePlannerTemplateJson(rawJson) {
    const decoded = JSON.parse(cleanJson(rawJson));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("ה-JSON חייב להיות אובייקט.");
    const tripTitle = text(decoded.tripTitle);
    if (!tripTitle) throw new Error("חסר tripTitle.");
    const tripCategories = Array.isArray(decoded.tripCategories) ? decoded.tripCategories.map(text).filter(Boolean) : [];
    if (!tripCategories.length) throw new Error("חסר tripCategories תקין.");
    const rawHebrew = decoded.tripCategorieshebrew ?? decoded.tripCategoriesHebrew;
    const tripCategoriesHebrew = Array.isArray(rawHebrew) ? rawHebrew.map(text).filter(Boolean) : [];
    const categoryKeys = tripCategories.map((item) => normalizeCategoryKey(item)).filter(Boolean);
    const compatibleCategories = uniqueStrings(categoryKeys.length ? categoryKeys : ["urban"]);
    const days = Array.isArray(decoded.days) ? decoded.days : [];
    if (!days.length) throw new Error("חסר days.");
    return {
        tripTitle,
        categories: compatibleCategories,
        tripCategories,
        tripCategoriesHebrew: buildHebrewCategoryLabels(tripCategories, tripCategoriesHebrew),
        days: days.map((day, index) => parseTemplateDay(day, index + 1))
    };
}

function parseTemplateDay(rawDay, fallbackNumber) {
    if (!rawDay || typeof rawDay !== "object" || Array.isArray(rawDay)) throw new Error("כל יום חייב להיות אובייקט.");
    const dayNumber = number(rawDay.dayNumber) || fallbackNumber;
    const dayTitle = text(rawDay.dayTitle);
    if (!dayTitle) throw new Error(`חסר dayTitle ביום ${dayNumber}.`);
    const dayTips = Array.isArray(rawDay.dayTips) ? rawDay.dayTips.map(text).filter(Boolean) : [];
    if (!dayTips.length) throw new Error(`dayTips חייב להיות מערך ביום ${dayNumber}.`);
    const items = Array.isArray(rawDay.items) ? rawDay.items.map((item, index) => parseTemplateItem(item, dayNumber, index)) : [];
    if (!items.length) throw new Error(`items חסר ביום ${dayNumber}.`);
    return { dayNumber, dayTitle, dayTips, items };
}

function parseTemplateItem(rawItem, dayNumber, index) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) throw new Error(`פריט לא תקין ביום ${dayNumber}.`);
    const title = text(rawItem.title);
    const summary = text(rawItem.summary);
    const description = text(rawItem.description);
    const address = text(rawItem.address);
    if (!title || !summary || !description || !address) throw new Error(`חסרים שדות בפריט ${index + 1} ביום ${dayNumber}.`);
    return {
        id: `planner_day_${dayNumber}_item_${index + 1}`,
        title,
        summary,
        description,
        address,
        startTime: text(rawItem.startTime),
        endTime: text(rawItem.endTime),
        sourcePlaceId: rawItem.placeId == null ? null : text(rawItem.placeId),
        order: index,
        siteUrl: null,
        lat: null,
        lon: null
    };
}

function renderTripPreview() {
    const parsed = state.parsedTemplate;
    if ($("tripDayCountPill")) $("tripDayCountPill").textContent = `${parsed?.days.length || 0} ימים`;
    const container = $("tripPreviewCards");
    if (!container) return;
    if (!parsed) {
        container.innerHTML = emptyHtml("אין עדיין תצוגה מקדימה. הדבק JSON ופענח.");
        refreshIcons();
        return;
    }
    const categoryStrip = parsed.tripCategories?.length ? `<div class="trip-category-strip">${parsed.tripCategories.map((category, index) => `<span>${escapeHtml(category)}${parsed.tripCategoriesHebrew?.[index] ? ` · ${escapeHtml(parsed.tripCategoriesHebrew[index])}` : ""}</span>`).join("")}</div>` : "";
    const daysHtml = parsed.days.map((day) => `
            <article class="panel trip-day-card">
                <div class="section-heading compact"><div><p class="eyebrow">יום ${day.dayNumber}</p><h2>${escapeHtml(day.dayTitle)}</h2></div><span class="count-pill">${day.items.length} פריטים</span></div>
                <div class="trip-schedule-list">
                    ${day.items.map((item) => `<div class="trip-schedule-row"><b>${escapeHtml([item.startTime, item.endTime].filter(Boolean).join("-"))}</b><span>${escapeHtml(item.title)}<small>${escapeHtml(item.address)}</small></span></div>`).join("")}
                </div>
                <div class="schema-strip">${day.dayTips.map((tip) => `<span>${escapeHtml(tip)}</span>`).join("")}</div>
            </article>
        `).join("");
    const hotelsHtml = renderPreviewHotelsSection();
    const bookingsHtml = renderPreviewBookingsSection();
    container.innerHTML = categoryStrip + daysHtml + hotelsHtml + bookingsHtml;
    refreshIcons();
}

function renderPreviewHotelsSection() {
    const hotels = state.hotelRecommendations;
    if (!hotels.length) return "";
    const cards = hotels.map((hotel) => {
        const stars = parseStarsValue(hotel.stars);
        return `<article class="preview-rec-card">
            <div class="preview-rec-image">${hotel.imageUrl ? `<img src="${escapeAttr(hotel.imageUrl)}" alt="" loading="lazy">` : `<span class="emoji-cover">🏨</span>`}</div>
            <div class="preview-rec-body">
                <h3>${escapeHtml(hotel.name)}</h3>
                ${stars ? `<span class="rec-stars">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}</span>` : ""}
                ${hotel.address ? `<p class="preview-rec-sub"><i data-lucide="map-pin"></i>${escapeHtml(hotel.address)}</p>` : ""}
                ${hotel.summary ? `<p class="preview-rec-summary">${escapeHtml(truncate(hotel.summary, 140))}</p>` : ""}
                <div class="preview-rec-chips">
                    ${hotel.bookingRating ? `<span class="rec-chip">Booking ${escapeHtml(hotel.bookingRating)}</span>` : ""}
                    ${hotel.googleRating ? `<span class="rec-chip">Google ${escapeHtml(hotel.googleRating)}</span>` : ""}
                    ${hotel.kosherFriendly ? `<span class="rec-chip rec-chip-positive">כשרות ✓</span>` : ""}
                    ${hotel.shabbatFriendly ? `<span class="rec-chip rec-chip-positive">שבת ✓</span>` : ""}
                </div>
            </div>
        </article>`;
    }).join("");
    return `<article class="panel trip-day-card preview-rec-section">
        <div class="section-heading compact"><div><p class="eyebrow">המלצות מלון</p><h2>${hotels.length} מלונות</h2></div></div>
        <div class="preview-rec-grid">${cards}</div>
    </article>`;
}

function renderPreviewBookingsSection() {
    const bookings = state.bookingRecommendations;
    if (!bookings.length) return "";
    const cards = bookings.map((booking) => `
        <article class="preview-rec-card">
            <div class="preview-rec-image">${booking.imageUrl ? `<img src="${escapeAttr(booking.imageUrl)}" alt="" loading="lazy">` : `<span class="emoji-cover">🎟️</span>`}</div>
            <div class="preview-rec-body">
                <h3>${escapeHtml(booking.placeTitle || booking.title || "אטרקציה")}</h3>
                ${booking.title && booking.placeTitle && booking.title !== booking.placeTitle ? `<p class="preview-rec-sub">${escapeHtml(booking.title)}</p>` : ""}
                ${booking.summary ? `<p class="preview-rec-summary">${escapeHtml(truncate(booking.summary, 140))}</p>` : ""}
                <div class="preview-rec-chips">
                    ${booking.provider ? `<span class="rec-chip">${escapeHtml(booking.provider)}</span>` : ""}
                    ${booking.priceRange ? `<span class="rec-chip">${escapeHtml(booking.priceRange)}</span>` : ""}
                    ${booking._matchedPlaceName ? `<span class="rec-chip rec-chip-positive">↔ ${escapeHtml(truncate(booking._matchedPlaceName, 30))}</span>` : `<span class="rec-chip rec-chip-muted">לא משויך</span>`}
                </div>
            </div>
        </article>`).join("");
    return `<article class="panel trip-day-card preview-rec-section">
        <div class="section-heading compact"><div><p class="eyebrow">קישורי הזמנה</p><h2>${bookings.length} קישורים</h2></div></div>
        <div class="preview-rec-grid">${cards}</div>
    </article>`;
}

async function saveTripTemplate() {
    if (state.saving) return;
    if (!state.parsedTemplate) {
        setStatus("tripStatus", "אין תבנית מוכנה לשמירה.", true);
        showToast("אין תבנית מוכנה לשמירה.", "error");
        return;
    }
    state.saving = true;
    const button = $("saveTripTemplateButton");
    if (button) {
        button.disabled = true;
        button.classList.add("is-loading");
    }
    const template = buildTripTemplatePayload(state.parsedTemplate);
    try {
        const signature = computeTemplateSignature(template);
        if (signature && signature === state.lastSavedSignature && state.lastSavedId) {
            showToast("התבנית הזאת כבר נשמרה — לא נשמרה שוב.", "warning");
            setStatus("tripStatus", `כבר נשמרה (${state.lastSavedId}).`);
            return;
        }
        showLoadingOverlay("שומר תמונות ב-R2...");
        setStatus("tripStatus", "שומר תמונות ב-R2...");
        await prepareTripTemplateImagesForR2(template);
        showLoadingOverlay("שומר תבנית ל-TripTap...");
        setStatus("tripStatus", "שומר תבנית ל-TripTap...");
        const fs = state.firebase.firestore;
        const ref = state.lastSavedId
            ? fs.doc(state.firebase.db, "trip_templates", state.lastSavedId)
            : fs.doc(fs.collection(state.firebase.db, "trip_templates"));
        await fs.setDoc(ref, { ...template, id: ref.id });
        state.lastSavedSignature = signature;
        state.lastSavedId = ref.id;
        setStatus("tripStatus", `התבנית נשמרה ב-TripTap (${ref.id}).`);
        showToast("התבנית נשמרה בהצלחה ב-TripTap! ✓");
    } catch (error) {
        setStatus("tripStatus", `שמירת התבנית נכשלה: ${error.message}`, true);
        showToast(`השמירה נכשלה: ${error.message}`, "error");
    } finally {
        state.saving = false;
        if (button) {
            button.disabled = false;
            button.classList.remove("is-loading");
        }
        hideLoadingOverlay();
    }
}

function computeTemplateSignature(template) {
    try {
        const minimal = {
            name: template.name,
            mainDestination: template.mainDestination,
            days: template.days,
            schedule: (template.schedule || []).map((day) => ({
                title: day.title,
                items: (day.items || []).map((item) => ({ title: item.title, address: item.address, startTime: item.startTime }))
            })),
            hotels: (template.hotels || []).map((hotel) => ({ name: hotel.hotelName, address: hotel.address })),
            bookingLinks: (template.bookingLinks || []).map((link) => ({ title: link.title, bookingUrl: link.bookingUrl }))
        };
        return JSON.stringify(minimal);
    } catch (_) {
        return null;
    }
}

function buildTripTemplatePayload(parsed, existing = {}) {
    const destination = state.destination?.label || text(existing.mainDestination) || text($("tripDestinationInput")?.value) || "TripTap";
    const places = scheduledTemplatePlaces(parsed);
    return {
        assetLibrary: false,
        name: parsed.tripTitle,
        days: parsed.days.length,
        mainDestination: destination,
        country: existing.country || null,
        city: existing.city || destination,
        keywords: buildTemplateKeywords(parsed.tripTitle, [...parsed.categories, ...(parsed.tripCategories || []), ...(parsed.tripCategoriesHebrew || [])], places, destination),
        category: parsed.categories[0] || "urban",
        categories: parsed.categories,
        tripCategories: parsed.tripCategories || parsed.categories,
        tripCategorieshebrew: parsed.tripCategoriesHebrew || parsed.categories.map((item) => CATEGORY_LABELS[item] || item),
        tripCategoriesHebrew: parsed.tripCategoriesHebrew || parsed.categories.map((item) => CATEGORY_LABELS[item] || item),
        heroImageUrl: existing.heroImageUrl || bestHeroImage(places),
        heroPhotographerName: existing.heroPhotographerName || null,
        heroPhotographerUsername: existing.heroPhotographerUsername || null,
        description: existing.description || buildTemplateDescription(parsed, destination),
        schedule: parsed.days.map((day, dayIndex) => ({
            dayNumber: dayIndex + 1,
            title: day.dayTitle,
            dayTips: day.dayTips,
            items: day.items.map((item, itemIndex) => ({ ...item, order: itemIndex }))
        })),
        places,
        hotels: state.hotelRecommendations.map(tripTemplateHotelFromRecommendation),
        bookingLinks: state.bookingRecommendations.map(tripTemplateBookingLinkFromRecommendation)
    };
}

async function prepareTripTemplateImagesForR2(template) {
    template.heroImageUrl = await ensureTripTapImageOnR2(
        template.heroImageUrl,
        TRIP_TEMPLATE_R2_FOLDER,
        template.name || template.mainDestination || "trip-template"
    );
    template.heroPixabayId = null;
    template.heroPixabayPageUrl = null;
    for (const hotel of template.hotels || []) {
        hotel.imageUrl = await ensureTripTapImageOnR2(
            hotel.imageUrl,
            TRIP_HOTEL_R2_FOLDER,
            hotel.hotelName || template.mainDestination || "hotel"
        );
        hotel.imagePixabayId = null;
        hotel.imagePixabayPageUrl = null;
    }
    for (const booking of template.bookingLinks || []) {
        booking.imageUrl = await ensureTripTapImageOnR2(
            booking.imageUrl,
            TRIP_BOOKING_R2_FOLDER,
            booking.placeTitle || booking.title || template.mainDestination || "booking-link"
        );
        booking.imagePixabayId = null;
        booking.imagePixabayPageUrl = null;
    }
}

async function ensureTripTapImageOnR2(imageUrl, folder, baseName) {
    const normalized = text(imageUrl);
    if (!normalized) return null;
    return await ensureAdminImageUrlOnR2(state.user, normalized, { folder, baseName });
}

function scheduledTemplatePlaces(parsed) {
    const byId = new Map(state.promptPlaces.map((place) => [text(place.id), place]));
    const output = new Map();
    parsed.days.forEach((day) => day.items.forEach((item) => {
        const linked = byId.get(text(item.sourcePlaceId));
        const place = linked || {
            id: text(item.sourcePlaceId) || item.id,
            name: item.title,
            destination: state.destination?.label || "",
            type: "place_type_attraction",
            shortDescription: item.summary,
            description: item.description,
            location: item.address,
            lat: item.lat,
            lon: item.lon,
            website: item.siteUrl
        };
        output.set(place.id || `${item.title}|${item.address}`, templatePlacePayload(place));
    }));
    return Array.from(output.values()).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
}

async function loadTemplates() {
    setStatus("tripStatus", "טוען תבניות TripTap...");
    try {
        const fs = state.firebase.firestore;
        const snap = await fs.getDocs(fs.collection(state.firebase.db, "trip_templates"));
        state.templates = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((template) => template.assetLibrary !== true);
        renderTemplates();
        setStatus("tripStatus", `נטענו ${state.templates.length} תבניות.`);
    } catch (error) {
        setStatus("tripStatus", `טעינת התבניות נכשלה: ${error.message}`, true);
    }
}

function renderTemplates() {
    const query = normalize(state.templateSearch);
    const visible = !query ? state.templates : state.templates.filter((template) => [template.name, template.mainDestination, template.city, template.country, ...(template.keywords || [])].map(normalize).some((value) => value.includes(query)));
    if ($("tripTemplateCountPill")) $("tripTemplateCountPill").textContent = `${visible.length}/${state.templates.length} תבניות`;
    const container = $("tripTemplateCards");
    if (!container) return;
    container.innerHTML = visible.map(renderTemplateCard).join("") || emptyHtml("אין תבניות להצגה.");
    $$('[data-template-id]').forEach((card) => card.querySelectorAll('[data-action]').forEach((button) => button.addEventListener("click", () => handleTemplateAction(card.dataset.templateId, button.dataset.action))));
    refreshIcons();
}

function renderTemplateCard(template) {
    return `<article class="place-card compact-template-card" data-template-id="${escapeAttr(template.id)}">
            <div class="place-image compact-card-image">${template.heroImageUrl ? `<img src="${escapeAttr(template.heroImageUrl)}" alt="">` : `<span class="emoji-cover">🧭</span>`}</div>
            <div class="place-body compact-card-body">
                <h3>${escapeHtml(template.name || "תבנית טיול")}</h3>
                <p class="compact-card-summary">${escapeHtml(template.description || template.mainDestination || "")}</p>
                <div class="compact-card-meta"><span>${escapeHtml(template.mainDestination || "")}</span><span>${Number(template.days || 0)} ימים</span></div>
                <div class="card-actions">
                    <button class="ghost-action" type="button" data-action="edit"><i data-lucide="square-pen"></i><span>ערוך</span></button>
                    <button class="ghost-action danger-lite" type="button" data-action="delete"><i data-lucide="trash-2"></i><span>מחק</span></button>
                </div>
            </div>
        </article>`;
}

function handleTemplateAction(templateId, action) {
    const template = state.templates.find((item) => item.id === templateId);
    if (!template) return;
    if (action === "delete") {
        state.editingTemplate = template;
        deleteEditingTemplate();
        return;
    }
    openTemplateEditDialog(template);
}

function openTemplateEditDialog(template) {
    state.editingTemplate = template;
    $("templateEditTitle").textContent = template.name || "תבנית טיול";
    $("templateEditFields").innerHTML = `
            ${editInput("name", "שם הטיול", template.name)}
            ${editInput("mainDestination", "יעד", template.mainDestination)}
            ${editInput("days", "מספר ימים", template.days)}
            ${editInput("categories", "קטגוריות", (template.categories || [template.category || "urban"]).join(", "))}
            ${editInput("heroImageUrl", "תמונת Hero", template.heroImageUrl || "")}
            ${editTextarea("description", "תיאור", template.description || "")}
            ${editTextarea("json", "JSON מלא", JSON.stringify(template, null, 2))}
        `;
    $("templateEditDialog").showModal();
}

async function saveEditedTemplateFromDialog() {
    const template = state.editingTemplate;
    if (!template) return;
    const fields = Object.fromEntries($$("#templateEditFields [data-edit-field]").map((field) => [field.dataset.editField, field.value]));
    let payload;
    try {
        payload = JSON.parse(fields.json || "{}");
    } catch (_) {
        payload = { ...template };
    }
    const categories = splitCsv(fields.categories).filter((item) => CATEGORIES.some(([key]) => key === item));
    payload = {
        ...payload,
        id: template.id,
        name: text(fields.name) || payload.name,
        mainDestination: text(fields.mainDestination) || payload.mainDestination,
        days: number(fields.days) || payload.days || 1,
        categories: categories.length ? categories : payload.categories || [payload.category || "urban"],
        category: categories[0] || payload.category || "urban",
        heroImageUrl: nullable(fields.heroImageUrl),
        description: nullable(fields.description)
    };
    payload.heroImageUrl = await ensureTripTapImageOnR2(
        payload.heroImageUrl,
        TRIP_TEMPLATE_R2_FOLDER,
        payload.name || template.name || "trip-template"
    );
    payload.heroPixabayId = null;
    payload.heroPixabayPageUrl = null;
    const fs = state.firebase.firestore;
    await fs.setDoc(fs.doc(state.firebase.db, "trip_templates", template.id), payload, { merge: true });
    state.editingTemplate = null;
    await loadTemplates();
}

async function deleteEditingTemplate() {
    const template = state.editingTemplate;
    if (!template) return;
    if (!window.confirm(`למחוק את התבנית "${template.name}"?`)) return;
    const fs = state.firebase.firestore;
    await fs.deleteDoc(fs.doc(state.firebase.db, "trip_templates", template.id));
    state.editingTemplate = null;
    $("templateEditDialog")?.close();
    await loadTemplates();
}

async function copyHotelRecommendationsPrompt() {
    await navigator.clipboard.writeText(buildHotelRecommendationsPrompt());
    setStatus("tripStatus", "פרומפט המלונות הועתק.");
}

async function pasteHotelRecommendationsJson() {
    const raw = await navigator.clipboard.readText();
    if (!raw.trim()) return;
    $("tripHotelsJsonInput").value = raw;
    let parsed;
    try {
        parsed = parseHotelRecommendations(raw);
    } catch (error) {
        setStatus("tripStatus", `לא הצלחתי לפענח המלצות מלון: ${error.message}`, true);
        showToast(`שגיאה בפענוח: ${error.message}`, "error");
        return;
    }
    state.hotelRecommendations = parsed;
    renderRecommendations();
    renderTripPreview();
    showLoadingOverlay(`מעבד ${parsed.length} המלצות מלון...`);
    try {
        const city = destinationLabel();
        if (city) {
            setLoadingMessage(`מושך תמונות מ-Pixabay של ${city}...`);
            await autofillHotelImagesFromDestination();
        }
        setLoadingMessage("מאתר קואורדינטות לכל מלון...");
        await autofillHotelCoordinates();
        renderRecommendations();
        renderTripPreview();
        setStatus("tripStatus", `נוספו ${parsed.length} המלצות מלון.`);
        showToast(`נוספו ${parsed.length} המלצות מלון עם תמונות וקואורדינטות.`);
    } finally {
        hideLoadingOverlay();
    }
}

async function autofillHotelCoordinates() {
    const city = destinationLabel();
    for (const hotel of state.hotelRecommendations) {
        if (hotel.lat != null && hotel.lon != null) continue;
        const queryParts = [hotel.name, hotel.address, city].map(text).filter(Boolean);
        if (!queryParts.length) continue;
        try {
            const results = await searchAddress(queryParts.join(", "));
            const first = results.find((item) => number(item.lat) != null && number(item.lon) != null);
            if (first) {
                hotel.lat = number(first.lat);
                hotel.lon = number(first.lon);
                if (!hotel.address) hotel.address = text(first.display_name);
            }
        } catch (_) {
            /* ignore single failures */
        }
    }
}

async function copyBookingLinksPrompt() {
    const candidates = scheduleAttractionCandidates();
    if (!candidates.length) {
        setStatus("tripStatus", "צריך לפענח תבנית טיול לפני יצירת פרומפט קישורי הזמנה.", true);
        return;
    }
    await navigator.clipboard.writeText(buildBookingLinksPrompt(candidates));
    setStatus("tripStatus", "פרומפט קישורי ההזמנה הועתק.");
}

async function pasteBookingRecommendationsJson() {
    const raw = await navigator.clipboard.readText();
    if (!raw.trim()) return;
    $("tripBookingsJsonInput").value = raw;
    let parsed;
    try {
        parsed = parseBookingRecommendations(raw);
    } catch (error) {
        setStatus("tripStatus", `לא הצלחתי לפענח קישורי הזמנה: ${error.message}`, true);
        showToast(`שגיאה בפענוח: ${error.message}`, "error");
        return;
    }
    state.bookingRecommendations = parsed;
    showLoadingOverlay(`משדך ${parsed.length} קישורי הזמנה למקומות שמורים...`);
    try {
        await ensurePublicPlacesLoaded();
        const matched = matchBookingsToPublicPlaces(parsed);
        state.bookingRecommendations = matched;
        renderRecommendations();
        renderTripPreview();
        const matchedCount = matched.filter((item) => item._matchedPlaceId).length;
        setStatus("tripStatus", `נוספו ${matched.length} קישורי הזמנה (${matchedCount} משויכים למקום שמור).`);
        showToast(`נוספו ${matched.length} קישורי הזמנה. שויכו ${matchedCount}/${matched.length} למקום שמור.`);
    } finally {
        hideLoadingOverlay();
    }
}

async function ensurePublicPlacesLoaded() {
    if (state.promptPlaces && state.promptPlaces.length) return;
    if (!state.destination?.lat || !state.destination?.lon) return;
    try {
        setLoadingMessage("טוען מקומות שמורים מ-TripInspo...");
        const places = await fetchPublicPlacesByRadius(state.destination.lat, state.destination.lon, selectedTripSearchRadiusKm());
        state.promptPlaces = dedupePlaces(places.map((place) => publicPlaceToPromptPlace(place)));
    } catch (_) {
        /* keep existing list */
    }
}

function matchBookingsToPublicPlaces(bookings) {
    const places = state.promptPlaces || [];
    if (!places.length) return bookings;
    return bookings.map((booking) => {
        const match = findBestPlaceMatch(booking, places);
        if (!match) return booking;
        const placeImage = text(match.coverImageUrl);
        const placeAddress = text(match.location);
        return {
            ...booking,
            placeId: match.id,
            placeTitle: text(match.name) || booking.placeTitle,
            destination: text(match.destination) || booking.destination,
            lat: number(match.lat) ?? booking.lat,
            lon: number(match.lon) ?? booking.lon,
            imageUrl: placeImage || booking.imageUrl,
            imageCredit: text(match.coverPhotographerName) || booking.imageCredit,
            imageCreditUrl: text(match.coverPhotographerUsername) || booking.imageCreditUrl || null,
            address: placeAddress || booking.address,
            _matchedPlaceId: match.id,
            _matchedPlaceName: text(match.name)
        };
    });
}

function findBestPlaceMatch(booking, places) {
    if (booking.placeId) {
        const direct = places.find((place) => text(place.id) === text(booking.placeId));
        if (direct) return direct;
    }
    const targetName = normalize(booking.placeTitle || booking.title);
    let best = null;
    let bestScore = 0;
    for (const place of places) {
        const placeName = normalize(place.name);
        if (!placeName || !targetName) continue;
        let score = 0;
        if (placeName === targetName) score += 100;
        else if (placeName.includes(targetName) || targetName.includes(placeName)) score += 60;
        else {
            const overlap = nameTokenOverlap(placeName, targetName);
            if (overlap >= 0.5) score += Math.round(overlap * 50);
        }
        if (booking.lat != null && booking.lon != null && place.lat != null && place.lon != null) {
            const dist = distanceKm(booking.lat, booking.lon, place.lat, place.lon);
            if (dist < 0.5) score += 30;
            else if (dist < 2) score += 15;
            else if (dist > 25) score -= 20;
        }
        if (score > bestScore) {
            best = place;
            bestScore = score;
        }
    }
    return bestScore >= 40 ? best : null;
}

function nameTokenOverlap(a, b) {
    const tokensA = new Set(a.split(" ").filter((token) => token.length > 1));
    const tokensB = new Set(b.split(" ").filter((token) => token.length > 1));
    if (!tokensA.size || !tokensB.size) return 0;
    let common = 0;
    tokensA.forEach((token) => { if (tokensB.has(token)) common += 1; });
    return common / Math.min(tokensA.size, tokensB.size);
}

function renderRecommendations() {
    if ($("tripHotelCountPill")) $("tripHotelCountPill").textContent = `${state.hotelRecommendations.length} מלונות`;
    if ($("tripBookingCountPill")) $("tripBookingCountPill").textContent = `${state.bookingRecommendations.length} קישורים`;
    if (state.parsedTemplate) renderTripPreview();
    const hotelContainer = $("tripHotelRecommendationCards");
    if (hotelContainer) {
        hotelContainer.innerHTML = state.hotelRecommendations.map(renderHotelRecommendationCard).join("") || emptyHtml("אין עדיין המלצות מלון. העתק prompt והדבק JSON.");
        tripsApplyPixabayResolvers(hotelContainer);
    }
    const bookingContainer = $("tripBookingRecommendationCards");
    if (bookingContainer) {
        bookingContainer.innerHTML = state.bookingRecommendations.map(renderBookingRecommendationCard).join("") || emptyHtml("אין עדיין קישורי הזמנה. העתק prompt והדבק JSON.");
        tripsApplyPixabayResolvers(bookingContainer);
    }
    $$('[data-recommendation-id]').forEach((card) => {
        card.addEventListener("click", (event) => {
            if (event.target.closest("[data-action]")) return;
            openRecommendationDetailDialog(card.dataset.recommendationKind, card.dataset.recommendationId);
        });
        card.querySelectorAll('[data-action="edit-recommendation"]').forEach((button) => button.addEventListener("click", (event) => {
            event.stopPropagation();
            openRecommendationEditDialog(card.dataset.recommendationKind, card.dataset.recommendationId);
        }));
        card.querySelectorAll('[data-action="remove-recommendation"]').forEach((button) => button.addEventListener("click", (event) => {
            event.stopPropagation();
            removeRecommendation(card.dataset.recommendationKind, card.dataset.recommendationId);
        }));
        card.querySelectorAll('[data-action="image-recommendation"]').forEach((button) => button.addEventListener("click", (event) => {
            event.stopPropagation();
            openImagePickerForRecommendation(card.dataset.recommendationKind, card.dataset.recommendationId);
        }));
    });
    refreshIcons();
}

function renderHotelRecommendationCard(hotel) {
    const stars = parseStarsValue(hotel.stars);
    const starRow = stars ? `<span class="rec-stars" title="${escapeAttr(`${stars} כוכבים`)}">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}</span>` : "";
    const chips = [
        hotel.bookingRating ? `<span class="rec-chip"><i data-lucide="star" aria-hidden="true"></i>Booking ${escapeHtml(hotel.bookingRating)}</span>` : "",
        hotel.googleRating ? `<span class="rec-chip"><i data-lucide="map-pin" aria-hidden="true"></i>Google ${escapeHtml(hotel.googleRating)}</span>` : "",
        hotel.kosherFriendly ? `<span class="rec-chip rec-chip-positive">כשרות ✓</span>` : "",
        hotel.shabbatFriendly ? `<span class="rec-chip rec-chip-positive">שבת ✓</span>` : ""
    ].filter(Boolean).join("");
    return `<article class="rec-card hotel-rec-card" data-recommendation-kind="hotel" data-recommendation-id="${escapeAttr(hotel.id)}">
        <div class="rec-card-image">
            ${hotel.imageUrl ? `<img src="${escapeAttr(tripsGetCachedPixabayUrl(hotel.imagePixabayId) || hotel.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"${hotel.imagePixabayId ? ` data-pixabay-id="${escapeAttr(hotel.imagePixabayId)}"` : ""} onerror="window.tripTapTripsImageFallback?.(this)"><span class="emoji-cover" hidden>🏨</span>` : `<span class="emoji-cover">🏨</span>`}
            ${starRow ? `<div class="rec-card-image-overlay">${starRow}</div>` : ""}
        </div>
        <div class="rec-card-body">
            <div class="rec-card-heading">
                <h3>${escapeHtml(hotel.name)}</h3>
                ${hotel.address ? `<p class="rec-card-sub"><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHtml(hotel.address)}</p>` : ""}
            </div>
            ${hotel.summary ? `<p class="rec-card-summary">${escapeHtml(truncate(hotel.summary, 160))}</p>` : ""}
            ${chips ? `<div class="rec-card-chips">${chips}</div>` : ""}
            <div class="rec-card-actions">
                <button class="ghost-action small-action" type="button" data-action="image-recommendation"><i data-lucide="image"></i><span>תמונה</span></button>
                <button class="ghost-action small-action" type="button" data-action="edit-recommendation"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                <button class="ghost-action small-action danger-lite" type="button" data-action="remove-recommendation"><i data-lucide="trash-2"></i><span>מחק</span></button>
            </div>
        </div>
    </article>`;
}

function renderBookingRecommendationCard(booking) {
    const chips = [
        booking.priceRange ? `<span class="rec-chip"><i data-lucide="tag" aria-hidden="true"></i>${escapeHtml(booking.priceRange)}</span>` : "",
        booking.provider ? `<span class="rec-chip"><i data-lucide="briefcase" aria-hidden="true"></i>${escapeHtml(booking.provider)}</span>` : "",
        booking.placeId ? `<span class="rec-chip rec-chip-muted">ID ${escapeHtml(shortId(booking.placeId))}</span>` : ""
    ].filter(Boolean).join("");
    return `<article class="rec-card booking-rec-card" data-recommendation-kind="booking" data-recommendation-id="${escapeAttr(booking.id)}">
        <div class="rec-card-image">
            ${booking.imageUrl ? `<img src="${escapeAttr(tripsGetCachedPixabayUrl(booking.imagePixabayId) || booking.imageUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer"${booking.imagePixabayId ? ` data-pixabay-id="${escapeAttr(booking.imagePixabayId)}"` : ""} onerror="window.tripTapTripsImageFallback?.(this)"><span class="emoji-cover" hidden>🎟️</span>` : `<span class="emoji-cover">🎟️</span>`}
        </div>
        <div class="rec-card-body">
            <div class="rec-card-heading">
                <h3>${escapeHtml(booking.placeTitle || booking.title || "אטרקציה")}</h3>
                ${booking.title && booking.placeTitle && booking.title !== booking.placeTitle ? `<p class="rec-card-sub">${escapeHtml(booking.title)}</p>` : ""}
            </div>
            ${booking.summary ? `<p class="rec-card-summary">${escapeHtml(truncate(booking.summary, 160))}</p>` : ""}
            ${chips ? `<div class="rec-card-chips">${chips}</div>` : ""}
            <div class="rec-card-actions">
                <button class="ghost-action small-action" type="button" data-action="image-recommendation"><i data-lucide="image"></i><span>תמונה</span></button>
                <button class="ghost-action small-action" type="button" data-action="edit-recommendation"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                <button class="ghost-action small-action danger-lite" type="button" data-action="remove-recommendation"><i data-lucide="trash-2"></i><span>מחק</span></button>
            </div>
        </div>
    </article>`;
}

function findRecommendation(kind, id) {
    const collection = kind === "hotel" ? state.hotelRecommendations : state.bookingRecommendations;
    return collection.find((entry) => entry.id === id) || null;
}

function openRecommendationDetailDialog(kind, id) {
    const item = findRecommendation(kind, id);
    if (!item) return;
    state.detailRecommendation = { kind, id };
    $("recommendationDetailEyebrow").textContent = kind === "hotel" ? "פרטי מלון" : "פרטי קישור הזמנה";
    $("recommendationDetailTitle").textContent = kind === "hotel" ? item.name : item.placeTitle || item.title || "קישור הזמנה";
    $("recommendationDetailBody").innerHTML = kind === "hotel" ? renderHotelDetailBody(item) : renderBookingDetailBody(item);
    $("recommendationDetailDialog").showModal();
    refreshIcons();
}

function renderHotelDetailBody(hotel) {
    const stars = parseStarsValue(hotel.stars);
    const starRow = stars ? `<span class="rec-stars">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}</span>` : "";
    const detailRows = [
        hotel.address && detailRow("map-pin", "כתובת", hotel.address),
        hotel.bookingRating && detailRow("star", "Booking", hotel.bookingRating),
        hotel.googleRating && detailRow("star", "Google", hotel.googleRating),
        hotel.locationRating && detailRow("compass", "מיקום", hotel.locationRating),
        hotel.breakfast && detailRow("coffee", "ארוחת בוקר", hotel.breakfast),
        detailRow("utensils", "ידידותי לכשרות", hotel.kosherFriendly ? "כן" : "לא"),
        hotel.kosherFriendlyReason && detailRow("info", "סיבה לכשרות", hotel.kosherFriendlyReason),
        detailRow("calendar", "ידידותי לשבת", hotel.shabbatFriendly ? "כן" : "לא"),
        hotel.shabbatFriendlyReason && detailRow("info", "סיבה לשבת", hotel.shabbatFriendlyReason),
        hotel.shabbatKosherNotes && detailRow("notebook", "הערות שבת/כשרות", hotel.shabbatKosherNotes),
        hotel.bookingUrl && detailRow("external-link", "קישור הזמנה", hotel.bookingUrl, true),
        (hotel.lat != null && hotel.lon != null) && detailRow("map", "קואורדינטות", `${hotel.lat}, ${hotel.lon}`)
    ].filter(Boolean).join("");
    return `
        <div class="rec-detail-hero">
            ${hotel.imageUrl ? `<img src="${escapeAttr(hotel.imageUrl)}" alt="">` : `<div class="rec-detail-placeholder">🏨</div>`}
            ${starRow ? `<div class="rec-detail-stars">${starRow}</div>` : ""}
        </div>
        ${hotel.summary ? `<p class="rec-detail-summary">${escapeHtml(hotel.summary)}</p>` : ""}
        <dl class="rec-detail-grid">${detailRows}</dl>
    `;
}

function renderBookingDetailBody(booking) {
    const detailRows = [
        booking.title && detailRow("ticket", "שם ההצעה", booking.title),
        booking.provider && detailRow("briefcase", "ספק", booking.provider),
        booking.priceRange && detailRow("tag", "טווח מחיר", booking.priceRange),
        booking.address && detailRow("map-pin", "כתובת", booking.address),
        booking.destination && detailRow("map", "יעד", booking.destination),
        booking._matchedPlaceName && detailRow("link", "משויך למקום", booking._matchedPlaceName),
        booking.placeId && detailRow("hash", "מזהה מקום", booking.placeId),
        booking.bookingUrl && detailRow("external-link", "קישור הזמנה", booking.bookingUrl, true),
        booking.imageCredit && detailRow("info", "קרדיט תמונה", booking.imageCredit),
        (booking.lat != null && booking.lon != null) && detailRow("map", "קואורדינטות", `${booking.lat}, ${booking.lon}`)
    ].filter(Boolean).join("");
    return `
        <div class="rec-detail-hero">
            ${booking.imageUrl ? `<img src="${escapeAttr(booking.imageUrl)}" alt="">` : `<div class="rec-detail-placeholder">🎟️</div>`}
        </div>
        ${booking.summary ? `<p class="rec-detail-summary">${escapeHtml(booking.summary)}</p>` : ""}
        <dl class="rec-detail-grid">${detailRows}</dl>
    `;
}

function detailRow(icon, label, value, isLink = false) {
    const v = isLink
        ? `<a href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
        : escapeHtml(String(value));
    return `<div class="rec-detail-row"><dt><i data-lucide="${icon}" aria-hidden="true"></i>${escapeHtml(label)}</dt><dd>${v}</dd></div>`;
}

function openEditFromDetailDialog() {
    const ref = state.detailRecommendation;
    if (!ref) return;
    $("recommendationDetailDialog").close();
    openRecommendationEditDialog(ref.kind, ref.id);
}

function deleteFromDetailDialog() {
    const ref = state.detailRecommendation;
    if (!ref) return;
    if (!confirm("למחוק את ההמלצה?")) return;
    removeRecommendation(ref.kind, ref.id);
    state.detailRecommendation = null;
    $("recommendationDetailDialog").close();
}

function openImagePickerFromDetailDialog() {
    const ref = state.detailRecommendation;
    if (!ref) return;
    $("recommendationDetailDialog").close();
    openImagePickerForRecommendation(ref.kind, ref.id);
}

function openRecommendationEditDialog(kind, id) {
    const item = findRecommendation(kind, id);
    if (!item) return;
    state.editingRecommendation = { kind, id };
    if (kind === "hotel") {
        $("hotelEditDialogTitle").textContent = item.name || "מלון";
        $("hotelEditFields").innerHTML = renderHotelEditFields(item);
        $("hotelEditDialog").showModal();
    } else {
        $("bookingEditDialogTitle").textContent = item.placeTitle || item.title || "קישור הזמנה";
        $("bookingEditFields").innerHTML = renderBookingEditFields(item);
        $("bookingEditDialog").showModal();
    }
    refreshIcons();
}

function renderHotelEditFields(hotel) {
    return `
        ${editInput("name", "שם המלון", hotel.name)}
        ${editInput("address", "כתובת", hotel.address)}
        ${editTextarea("summary", "תיאור", hotel.summary, 5)}
        ${editInput("stars", "כוכבים", hotel.stars)}
        ${editInput("bookingRating", "Booking", hotel.bookingRating)}
        ${editInput("googleRating", "Google", hotel.googleRating)}
        ${editInput("locationRating", "מיקום", hotel.locationRating)}
        ${editInput("breakfast", "ארוחת בוקר", hotel.breakfast)}
        ${editToggle("kosherFriendly", "ידידותי לשומרי כשרות", hotel.kosherFriendly)}
        ${editInput("kosherFriendlyReason", "סיבה לכשרות", hotel.kosherFriendlyReason)}
        ${editToggle("shabbatFriendly", "ידידותי לשומרי שבת", hotel.shabbatFriendly)}
        ${editInput("shabbatFriendlyReason", "סיבה לשבת", hotel.shabbatFriendlyReason)}
        ${editTextarea("shabbatKosherNotes", "הערות שבת / כשרות", hotel.shabbatKosherNotes, 3)}
        ${editInput("bookingUrl", "קישור הזמנה", hotel.bookingUrl)}
        ${editInput("imageUrl", "קישור תמונה", hotel.imageUrl || "")}
        ${editInput("lat", "Latitude", hotel.lat ?? "")}
        ${editInput("lon", "Longitude", hotel.lon ?? "")}
    `;
}

function renderBookingEditFields(booking) {
    return `
        ${editInput("placeTitle", "שם המקום", booking.placeTitle)}
        ${editInput("title", "שם ההצעה", booking.title)}
        ${editInput("provider", "ספק", booking.provider)}
        ${editTextarea("summary", "תקציר", booking.summary, 5)}
        ${editInput("priceRange", "טווח מחיר", booking.priceRange)}
        ${editInput("address", "כתובת", booking.address || "")}
        ${editInput("destination", "יעד", booking.destination)}
        ${editInput("bookingUrl", "קישור הזמנה", booking.bookingUrl)}
        ${editInput("placeId", "מזהה מקום (placeId)", booking.placeId)}
        ${editInput("imageUrl", "קישור תמונה", booking.imageUrl || "")}
        ${editInput("imageCredit", "קרדיט תמונה", booking.imageCredit || "")}
        ${editInput("imageCreditUrl", "קישור קרדיט", booking.imageCreditUrl || "")}
        ${editInput("lat", "Latitude", booking.lat ?? "")}
        ${editInput("lon", "Longitude", booking.lon ?? "")}
    `;
}

function readEditFields(containerId) {
    const result = {};
    $$(`#${containerId} [data-edit-field]`).forEach((field) => {
        const key = field.dataset.editField;
        if (field.type === "checkbox") {
            result[key] = field.checked;
        } else {
            result[key] = field.value;
        }
    });
    return result;
}

function saveHotelFromDialog(event) {
    event.preventDefault();
    const editing = state.editingRecommendation;
    if (!editing || editing.kind !== "hotel") return;
    const target = state.hotelRecommendations.find((entry) => entry.id === editing.id);
    if (!target) return;
    const fields = readEditFields("hotelEditFields");
    target.name = text(fields.name);
    target.address = text(fields.address);
    target.summary = text(fields.summary);
    target.stars = text(fields.stars) || "3";
    target.bookingRating = text(fields.bookingRating);
    target.googleRating = text(fields.googleRating);
    target.locationRating = text(fields.locationRating);
    target.breakfast = text(fields.breakfast);
    target.kosherFriendly = Boolean(fields.kosherFriendly);
    target.kosherFriendlyReason = text(fields.kosherFriendlyReason);
    target.shabbatFriendly = Boolean(fields.shabbatFriendly);
    target.shabbatFriendlyReason = text(fields.shabbatFriendlyReason);
    target.shabbatKosherNotes = text(fields.shabbatKosherNotes);
    target.bookingUrl = text(fields.bookingUrl);
    target.imageUrl = nullable(fields.imageUrl);
    target.lat = number(fields.lat);
    target.lon = number(fields.lon);
    $("hotelEditDialog").close();
    state.editingRecommendation = null;
    renderRecommendations();
}

function saveBookingFromDialog(event) {
    event.preventDefault();
    const editing = state.editingRecommendation;
    if (!editing || editing.kind !== "booking") return;
    const target = state.bookingRecommendations.find((entry) => entry.id === editing.id);
    if (!target) return;
    const fields = readEditFields("bookingEditFields");
    target.placeTitle = text(fields.placeTitle);
    target.title = text(fields.title);
    target.provider = text(fields.provider);
    target.summary = text(fields.summary);
    target.priceRange = text(fields.priceRange);
    target.address = text(fields.address);
    target.destination = text(fields.destination);
    target.bookingUrl = text(fields.bookingUrl);
    target.placeId = text(fields.placeId);
    target.imageUrl = nullable(fields.imageUrl);
    target.imageCredit = nullable(fields.imageCredit);
    target.imageCreditUrl = nullable(fields.imageCreditUrl);
    target.lat = number(fields.lat);
    target.lon = number(fields.lon);
    $("bookingEditDialog").close();
    state.editingRecommendation = null;
    renderRecommendations();
}

function removeRecommendation(kind, id) {
    if (kind === "hotel") state.hotelRecommendations = state.hotelRecommendations.filter((item) => item.id !== id);
    if (kind === "booking") state.bookingRecommendations = state.bookingRecommendations.filter((item) => item.id !== id);
    renderRecommendations();
}

function openImagePickerForEditingHotel() {
    const editing = state.editingRecommendation;
    if (!editing || editing.kind !== "hotel") return;
    state.imageTarget = { kind: "hotel-edit", id: editing.id };
    openRecommendationImageDialog(text(readEditFields("hotelEditFields").name) || destinationLabel());
}

function openImagePickerForEditingBooking() {
    const editing = state.editingRecommendation;
    if (!editing || editing.kind !== "booking") return;
    state.imageTarget = { kind: "booking-edit", id: editing.id };
    const fields = readEditFields("bookingEditFields");
    openRecommendationImageDialog(text(fields.placeTitle) || text(fields.title) || destinationLabel());
}

function openImagePickerForRecommendation(kind, id) {
    const item = findRecommendation(kind, id);
    if (!item) return;
    state.imageTarget = { kind: kind === "hotel" ? "hotel-card" : "booking-card", id };
    const query = kind === "hotel"
        ? (item.name || destinationLabel())
        : (item.placeTitle || item.title || destinationLabel());
    openRecommendationImageDialog(query);
}

function openRecommendationImageDialog(query) {
    state.imageSource = "pixabay";
    state.imageCityFallback = destinationLabel();
    $("recommendationImageDialogTitle").textContent = "בחירת תמונה";
    $("recommendationImageSearchInput").value = query || destinationLabel();
    $("recommendationImageGalleryUrl").value = "";
    $("recommendationImageGalleryFile").value = "";
    syncRecommendationImageSourceButtons();
    toggleImageGallery(false);
    $("recommendationImageResults").innerHTML = "";
    $("recommendationImageDialog").showModal();
    if ($("recommendationImageSearchInput").value.trim()) {
        searchRecommendationImages($("recommendationImageSearchInput").value.trim());
    }
}

function syncRecommendationImageSourceButtons() {
    $$('[data-rec-image-source]').forEach((button) => button.classList.toggle("is-active", button.dataset.recImageSource === state.imageSource));
}

function switchRecommendationImageSource(source) {
    state.imageSource = source;
    syncRecommendationImageSourceButtons();
    if (source === "gallery") {
        toggleImageGallery(true);
        $("recommendationImageResults").innerHTML = "";
        return;
    }
    toggleImageGallery(false);
    const query = $("recommendationImageSearchInput").value.trim();
    if (query) searchRecommendationImages(query);
}

function toggleImageGallery(showGallery) {
    $("recommendationImageGalleryRow").hidden = !showGallery;
    $("recommendationImageSearchRow").hidden = showGallery;
}

async function searchRecommendationImages(query) {
    if (!query) return;
    $("recommendationImageResults").innerHTML = emptyHtml("מחפש תמונות...");
    let images = [];
    try {
        if (state.imageSource === "pixabay") images = await fetchPixabayImages(query);
        else if (state.imageSource === "wikimedia") images = await fetchWikimediaImages(query);
        else if (state.imageSource === "unsplash") images = await fetchUnsplashImages(query);
    } catch (error) {
        $("recommendationImageResults").innerHTML = emptyHtml(`חיפוש התמונות נכשל: ${error.message}`);
        refreshIcons();
        return;
    }
    if (!images.length) {
        $("recommendationImageResults").innerHTML = emptyHtml("לא נמצאו תמונות במקור הזה. נסה מקור אחר או שאילתה אחרת.");
        refreshIcons();
        return;
    }
    $("recommendationImageResults").innerHTML = images.map((image, index) => `
        <button class="image-option" type="button" data-image-index="${index}">
            <img src="${escapeAttr(image.thumb || image.url)}" alt="" onerror="this.hidden=true">
            <span>${escapeHtml(image.credit || image.source)}</span>
        </button>
    `).join("");
    $("recommendationImageResults").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
        applySelectedRecommendationImage(images[Number(button.dataset.imageIndex)]);
    }));
    refreshIcons();
}

async function applyGalleryImageFromDialog() {
    const url = text($("recommendationImageGalleryUrl").value);
    const file = $("recommendationImageGalleryFile").files?.[0];
    if (file) {
        const button = $("useRecommendationImageGalleryButton");
        if (button) button.disabled = true;
        setStatus("tripStatus", "שומר תמונה ב-R2...");
        try {
            const targetInfo = recommendationImageR2TargetInfo();
            const uploadedUrl = await uploadAdminImageFileToR2(state.user, file, targetInfo);
            await applySelectedRecommendationImage({ url: uploadedUrl, credit: "תמונה שהועלתה מהגלריה", source: "R2" });
            setStatus("tripStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה. לחץ שמור כדי לעדכן את Firestore.");
            $("recommendationImageGalleryFile").value = "";
        } catch (error) {
            setStatus("tripStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        } finally {
            if (button) button.disabled = false;
        }
        return;
    }
    if (url) {
        await applySelectedRecommendationImage({ url, credit: "מהמשתמש", source: "URL" });
        return;
    }
    setStatus("tripStatus", "בחר תמונה מהמכשיר או הדבק קישור.", true);
}

function recommendationImageR2TargetInfo() {
    const target = state.imageTarget;
    const kind = target?.kind || "";
    const isHotel = kind.startsWith("hotel");
    const item = target?.id ? findRecommendation(isHotel ? "hotel" : "booking", target.id) : null;
    const baseName = isHotel
        ? (item?.name || destinationLabel() || "hotel")
        : (item?.placeTitle || item?.title || destinationLabel() || "booking-link");
    return {
        folder: isHotel ? TRIP_HOTEL_R2_FOLDER : TRIP_BOOKING_R2_FOLDER,
        baseName
    };
}

async function applySelectedRecommendationImage(image) {
    if (!image) return;
    const target = state.imageTarget;
    if (!target) return;
    const targetInfo = recommendationImageR2TargetInfo();
    setStatus("tripStatus", "שומר תמונה ב-R2...");
    let imageUrl;
    try {
        imageUrl = await ensureAdminImageUrlOnR2(state.user, image.url, targetInfo);
    } catch (error) {
        setStatus("tripStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        return;
    }
    const credit = image.credit || image.source || "";
    const creditUrl = image.pageUrl || "";
    const pixabayId = null;
    const pixabayPageUrl = null;
    if (target.kind === "hotel-edit") {
        const hotel = state.hotelRecommendations.find((entry) => entry.id === target.id);
        if (hotel) {
            hotel.imageUrl = imageUrl;
            hotel.imagePixabayId = null;
            hotel.imagePixabayPageUrl = null;
        }
        setEditFieldValue("hotelEditFields", "imageUrl", imageUrl);
        setEditFieldValue("hotelEditFields", "imagePixabayId", pixabayId ?? "");
        setEditFieldValue("hotelEditFields", "imagePixabayPageUrl", pixabayPageUrl || "");
    } else if (target.kind === "booking-edit") {
        const booking = state.bookingRecommendations.find((entry) => entry.id === target.id);
        if (booking) {
            booking.imageUrl = imageUrl;
            booking.imageCredit = credit;
            booking.imageCreditUrl = creditUrl || null;
            booking.imagePixabayId = null;
            booking.imagePixabayPageUrl = null;
        }
        setEditFieldValue("bookingEditFields", "imageUrl", imageUrl);
        setEditFieldValue("bookingEditFields", "imageCredit", credit);
        setEditFieldValue("bookingEditFields", "imageCreditUrl", creditUrl);
        setEditFieldValue("bookingEditFields", "imagePixabayId", pixabayId ?? "");
        setEditFieldValue("bookingEditFields", "imagePixabayPageUrl", pixabayPageUrl || "");
    } else if (target.kind === "hotel-card") {
        const hotel = state.hotelRecommendations.find((entry) => entry.id === target.id);
        if (hotel) {
            hotel.imageUrl = imageUrl;
            hotel.imagePixabayId = null;
            hotel.imagePixabayPageUrl = null;
        }
        renderRecommendations();
    } else if (target.kind === "booking-card") {
        const booking = state.bookingRecommendations.find((entry) => entry.id === target.id);
        if (booking) {
            booking.imageUrl = imageUrl;
            booking.imageCredit = credit;
            booking.imageCreditUrl = creditUrl || null;
            booking.imagePixabayId = null;
            booking.imagePixabayPageUrl = null;
        }
        renderRecommendations();
    }
    setStatus("tripStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה.");
    state.imageTarget = null;
    $("recommendationImageDialog").close();
}

function setEditFieldValue(containerId, field, value) {
    const el = document.querySelector(`#${containerId} [data-edit-field="${CSS.escape(field)}"]`);
    if (!el) return;
    if (el.type === "checkbox") el.checked = Boolean(value);
    else el.value = value ?? "";
}

async function fetchPixabayImages(query) {
    if (!query) return [];
    const data = await adminPixabaySearch(state.user, { q: query, perPage: 12 });
    return (data?.hits || []).map((item) => ({
        url: item.largeImageURL || item.webformatURL,
        thumb: item.webformatURL || item.previewURL,
        credit: item.user ? `Pixabay · ${item.user}` : "Pixabay",
        pageUrl: item.pageURL,
        pixabayId: item.id,
        source: "Pixabay"
    })).filter((item) => item.url);
}

const TRIPS_PIXABAY_URL_CACHE_KEY = "tripTapTripsPixabayUrlCache_v1";
const TRIPS_PIXABAY_URL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const tripsPixabayUrlMemoryCache = new Map();
const tripsPixabayUrlInflight = new Map();

function tripsReadPixabayCache() {
    try {
        const raw = localStorage.getItem(TRIPS_PIXABAY_URL_CACHE_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { return {}; }
}
function tripsWritePixabayCache(obj) {
    try { localStorage.setItem(TRIPS_PIXABAY_URL_CACHE_KEY, JSON.stringify(obj)); } catch (_) { }
}
function tripsPixabayIdValue(raw) {
    if (raw == null || raw === "") return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
}
function tripsGetCachedPixabayUrl(id) {
    if (!id) return "";
    if (tripsPixabayUrlMemoryCache.has(id)) return tripsPixabayUrlMemoryCache.get(id);
    const cache = tripsReadPixabayCache();
    const entry = cache[String(id)];
    if (entry && entry.url && Date.now() - (entry.savedAt || 0) < TRIPS_PIXABAY_URL_CACHE_TTL_MS) {
        tripsPixabayUrlMemoryCache.set(id, entry.url);
        return entry.url;
    }
    return "";
}
function tripsSetCachedPixabayUrl(id, url) {
    if (!id || !url) return;
    tripsPixabayUrlMemoryCache.set(id, url);
    const cache = tripsReadPixabayCache();
    cache[String(id)] = { url, savedAt: Date.now() };
    tripsWritePixabayCache(cache);
}
function tripsClearCachedPixabayUrl(id) {
    if (!id) return;
    tripsPixabayUrlMemoryCache.delete(id);
    const cache = tripsReadPixabayCache();
    delete cache[String(id)];
    tripsWritePixabayCache(cache);
}
async function tripsResolvePixabayImageById(id, { force = false } = {}) {
    const numericId = tripsPixabayIdValue(id);
    if (!numericId) return "";
    if (!force) {
        const cached = tripsGetCachedPixabayUrl(numericId);
        if (cached) return cached;
    }
    if (tripsPixabayUrlInflight.has(numericId)) return tripsPixabayUrlInflight.get(numericId);
    const promise = (async () => {
        try {
            const data = await adminPixabayLookupById(state.user, numericId);
            const hit = data?.hits?.[0];
            const fresh = hit?.largeImageURL || hit?.webformatURL || "";
            if (fresh) tripsSetCachedPixabayUrl(numericId, fresh);
            return fresh;
        } catch (_) { return ""; }
        finally { tripsPixabayUrlInflight.delete(numericId); }
    })();
    tripsPixabayUrlInflight.set(numericId, promise);
    return promise;
}
window.tripTapTripsImageFallback = async (image) => {
    const pixabayId = tripsPixabayIdValue(image.dataset.pixabayId);
    if (pixabayId && image.dataset.pixabayRefreshed !== "done") {
        image.dataset.pixabayRefreshed = "done";
        tripsClearCachedPixabayUrl(pixabayId);
        const fresh = await tripsResolvePixabayImageById(pixabayId, { force: true });
        if (fresh && fresh !== image.src) {
            image.src = fresh;
            return;
        }
    }
    image.hidden = true;
    image.nextElementSibling?.removeAttribute("hidden");
};
function tripsApplyPixabayResolvers(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-pixabay-id]').forEach((image) => {
        const id = tripsPixabayIdValue(image.dataset.pixabayId);
        if (!id) return;
        if (image.dataset.pixabayResolved === "done") return;
        image.dataset.pixabayResolved = "done";
        const cached = tripsGetCachedPixabayUrl(id);
        if (cached && cached !== image.src) {
            image.src = cached;
            return;
        }
        if (cached) return;
        tripsResolvePixabayImageById(id).then((fresh) => {
            if (fresh && fresh !== image.src) image.src = fresh;
        }).catch(() => { });
    });
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
    return Object.values(data.query?.pages || {}).map((page) => page.imageinfo?.[0]).filter(Boolean).map((info) => ({
        url: info.url,
        thumb: info.thumburl || info.url,
        credit: ["Wikimedia Commons", stripHtml(info.extmetadata?.Artist?.value || "")].filter(Boolean).join(" · "),
        pageUrl: info.descriptionurl,
        source: "Wikimedia"
    }));
}

async function fetchUnsplashImages(query) {
    if (!query) return [];
    const data = await adminUnsplashSearch(state.user, { query, perPage: 12 });
    return (data?.results || []).map((item) => ({
        url: item.urls?.regular || item.urls?.full,
        thumb: item.urls?.small || item.urls?.thumb || item.urls?.regular,
        credit: item.user?.name ? `${item.user.name} / Unsplash` : "Unsplash",
        pageUrl: item.user?.links?.html || item.links?.html,
        source: "Unsplash"
    })).filter((item) => item.url);
}

async function autofillHotelImagesFromDestination() {
    const city = destinationLabel();
    if (!city) return;
    const missing = state.hotelRecommendations.filter((hotel) => !text(hotel.imageUrl));
    if (!missing.length) return;
    let images = [];
    try {
        images = await fetchPixabayImages(city);
    } catch (_) {
        return;
    }
    if (!images.length) return;
    missing.forEach((hotel, index) => {
        const image = images[index % images.length];
        if (image?.url) hotel.imageUrl = image.url;
    });
}

function destinationLabel() {
    return state.destination?.label || text($("tripDestinationInput")?.value) || "";
}

function parseStarsValue(value) {
    const num = number(String(value ?? "").replace(/[^0-9.]/g, ""));
    if (num == null) return 0;
    return Math.max(0, Math.min(5, Math.round(num)));
}

function truncate(value, max) {
    const v = text(value);
    if (v.length <= max) return v;
    return `${v.slice(0, max - 1)}…`;
}

function shortId(value) {
    const v = text(value);
    return v.length <= 10 ? v : `${v.slice(0, 6)}…${v.slice(-3)}`;
}

function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = value || "";
    return div.textContent || "";
}

function parseHotelRecommendations(raw) {
    const decoded = JSON.parse(cleanJson(raw));
    const list = Array.isArray(decoded) ? decoded : decoded.hotels;
    if (!Array.isArray(list) || !list.length) throw new Error("חסר מערך hotels.");
    return list.filter((item) => item && typeof item === "object").map((item) => ({
        id: text(item.id) || crypto.randomUUID(),
        name: jsonString(item, ["name", "hotelName"]),
        address: jsonString(item, ["address"]),
        summary: jsonString(item, ["summary", "description", "notes"]),
        stars: jsonString(item, ["stars", "starRating"]) || "3",
        bookingRating: jsonString(item, ["bookingRating", "bookingRatingText"]),
        googleRating: jsonString(item, ["googleRating", "googleRatingText"]),
        locationRating: jsonString(item, ["locationRating"]),
        kosherFriendly: boolValue(item.kosherFriendly),
        kosherFriendlyReason: jsonString(item, ["kosherFriendlyReason"]),
        shabbatFriendly: boolValue(item.shabbatFriendly),
        shabbatFriendlyReason: jsonString(item, ["shabbatFriendlyReason"]),
        shabbatKosherNotes: jsonString(item, ["shabbatKosherNotes", "notes"]),
        breakfast: jsonString(item, ["breakfast"]),
        bookingUrl: jsonString(item, ["bookingUrl", "bookingLink", "url"]),
        imageUrl: nullable(jsonString(item, ["imageUrl", "photoUrl"])),
        imagePixabayId: tripsPixabayIdValue(item.imagePixabayId ?? item.pixabayId),
        imagePixabayPageUrl: nullable(jsonString(item, ["imagePixabayPageUrl", "pixabayPageUrl"])),
        lat: jsonDouble(item, ["lat", "latitude"]),
        lon: jsonDouble(item, ["lon", "lng", "longitude"])
    })).filter((hotel) => hotel.name);
}

function parseBookingRecommendations(raw) {
    const decoded = JSON.parse(cleanJson(raw));
    const list = Array.isArray(decoded) ? decoded : decoded.bookingLinks ?? decoded.attractions ?? decoded.items;
    if (!Array.isArray(list) || !list.length) throw new Error("חסר מערך bookingLinks.");
    return list.filter((item) => item && typeof item === "object").map((item) => ({
        id: text(item.id) || crypto.randomUUID(),
        placeId: jsonString(item, ["placeId"]),
        placeTitle: jsonString(item, ["placeTitle", "name"]),
        provider: jsonString(item, ["provider"]),
        title: jsonString(item, ["title", "offerTitle"]),
        summary: jsonString(item, ["summary", "description", "whyBookHere"]),
        priceRange: jsonString(item, ["priceRange", "price"]),
        bookingUrl: jsonString(item, ["bookingUrl", "url"]),
        destination: jsonString(item, ["destination", "city"]),
        lat: jsonDouble(item, ["lat", "latitude"]),
        lon: jsonDouble(item, ["lon", "lng", "longitude"]),
        imageUrl: nullable(jsonString(item, ["imageUrl"])),
        imageCredit: nullable(jsonString(item, ["imageCredit"])),
        imageCreditUrl: nullable(jsonString(item, ["imageCreditUrl"])),
        imagePixabayId: tripsPixabayIdValue(item.imagePixabayId ?? item.pixabayId),
        imagePixabayPageUrl: nullable(jsonString(item, ["imagePixabayPageUrl", "pixabayPageUrl"])),
        address: jsonString(item, ["address", "location"])
    })).filter((booking) => (booking.placeTitle || booking.title) && booking.bookingUrl);
}

function tripTemplateHotelFromRecommendation(hotel) {
    return {
        id: hotel.id,
        hotelName: hotel.name,
        starRating: Math.max(1, Math.min(5, number(String(hotel.stars).replace(/[^0-9.]/g, "")) || 3)),
        destination: state.destination?.label || text($("tripDestinationInput")?.value),
        address: nullable(hotel.address),
        lat: number(hotel.lat),
        lon: number(hotel.lon),
        imageUrl: nullable(hotel.imageUrl),
        imagePixabayId: tripsPixabayIdValue(hotel.imagePixabayId),
        imagePixabayPageUrl: nullable(hotel.imagePixabayPageUrl),
        bookingLink: nullable(hotel.bookingUrl),
        bookingRating: number(String(hotel.bookingRating).replace(/[^0-9.]/g, "")),
        bookingRatingText: nullable(hotel.bookingRating),
        googleRatingText: nullable(hotel.googleRating),
        locationRating: nullable(hotel.locationRating),
        summary: nullable(hotel.summary),
        breakfast: nullable(hotel.breakfast),
        kosherFriendly: Boolean(hotel.kosherFriendly),
        kosherFriendlyReason: nullable(hotel.kosherFriendlyReason),
        shabbatFriendly: Boolean(hotel.shabbatFriendly),
        shabbatFriendlyReason: nullable(hotel.shabbatFriendlyReason),
        shabbatKosherNotes: nullable(hotel.shabbatKosherNotes),
        notes: nullable(hotel.shabbatKosherNotes)
    };
}

function tripTemplateBookingLinkFromRecommendation(booking) {
    return {
        id: booking.id,
        placeId: booking.placeId,
        placeTitle: booking.placeTitle,
        destination: nullable(booking.destination),
        lat: number(booking.lat),
        lon: number(booking.lon),
        imageUrl: nullable(booking.imageUrl),
        imageCredit: nullable(booking.imageCredit),
        imageCreditUrl: nullable(booking.imageCreditUrl),
        imagePixabayId: tripsPixabayIdValue(booking.imagePixabayId),
        imagePixabayPageUrl: nullable(booking.imagePixabayPageUrl),
        provider: booking.provider,
        title: booking.title,
        summary: booking.summary,
        priceRange: booking.priceRange,
        bookingUrl: booking.bookingUrl
    };
}

function scheduleAttractionCandidates() {
    const parsed = state.parsedTemplate;
    if (!parsed) return [];
    return parsed.days.flatMap((day) => day.items.map((item) => ({
        id: text(item.sourcePlaceId) || item.id,
        dayTitle: day.dayTitle,
        title: item.title,
        summary: item.summary,
        address: item.address,
        placeId: item.sourcePlaceId
    })));
}

function buildHotelRecommendationsPrompt() {
    const destination = state.destination?.label || text($("tripDestinationInput")?.value) || "היעד שנבחר";
    return `אתה עוזר לי להכין המלצות מלונות ל-TripTap.

יעד הטיול: ${destination}

תנהל איתי שיחה קצרה לפני שאתה מחזיר תשובה סופית: כמה מלונות אני רוצה, רמת מחיר, אזור מועדף, רמת כוכבים, קרבה לבית חב״ד/בתי כנסת/אוכל כשר, העדפות שבת, ארוחת בוקר, סוג מטיילים וכל שאלה שחסרה.

בכל מלון אני צריך summary עשיר של 3-5 משפטים על המלון עצמו: הווייב, החדרים, מתקנים בולטים, למי הוא מתאים, יתרון אמיתי וחיסרון אם יש.

בסוף החזר אך ורק JSON תקין בלי markdown:
{
  "hotels": [
    {
      "name": "שם המלון",
      "address": "כתובת מדויקת",
      "summary": "תיאור עשיר של 3-5 משפטים",
      "stars": "4",
      "bookingRating": "8.9 או לא נמצא",
      "googleRating": "4.6 או לא נמצא",
      "locationRating": "איכות המיקום במילים",
      "kosherFriendly": "כן או לא",
      "kosherFriendlyReason": "סיבה או ריק",
      "shabbatFriendly": "כן או לא",
      "shabbatFriendlyReason": "סיבה או ריק",
      "shabbatKosherNotes": "הערות שבת/כשרות",
      "breakfast": "מה ידוע על ארוחת בוקר",
      "bookingUrl": "https://...",
      "imageUrl": "https://... או null"
    }
  ]
}`;
}

function buildBookingLinksPrompt(candidates) {
    const destination = state.destination?.label || text($("tripDestinationInput")?.value) || "היעד שנבחר";
    const list = candidates.map((candidate, index) => `${index + 1}. ${candidate.title}\n   placeId: ${candidate.id}\n   יום: ${candidate.dayTitle}\n   כתובת: ${candidate.address}\n   תקציר: ${candidate.summary || ""}`).join("\n\n");
    return `אתה עוזר לי להכין קישורי הזמנה לאטרקציות שמופיעות בתבנית טיול של TripTap.

יעד הטיול: ${destination}

המקומות בלו״ז:
${list}

תנהל איתי שיחה קצרה אם חסרים קישורים או העדפות ספק. לכל מקום שניתן להזמין אליו כרטיס או סיור, מצא קישור הזמנה איכותי וברור.

בסוף החזר אך ורק JSON תקין בלי markdown:
{
  "bookingLinks": [
    {
      "placeId": "אותו placeId מהרשימה",
      "placeTitle": "שם המקום",
      "provider": "GetYourGuide / Tiqets / Official / אחר",
      "title": "שם ההצעה להזמנה",
      "summary": "מה ההזמנה נותנת ולמה שווה להזמין מראש",
      "priceRange": "טווח מחירים",
      "bookingUrl": "https://..."
    }
  ]
}`;
}

function buildAiPrompt(destination, places) {
    const placesText = buildPlacesPromptText(places);
    const selectedAddress = state.destination?.address || "";
    const radiusKm = selectedTripSearchRadiusKm();
    return `
אתה עוזר לי לבנות תבנית טיול ל-TripTap.

מטרה:
נהל איתי שיחה קצרה כדי להבין כמה ימים הטיול, קצב, סגנון, הרכב מטיילים, כשרות/אוכל, ושעות התחלה/סיום רצויות. אל תחזיר לו״ז סופי לפני ששאלת את השאלות החסרות וקיבלת ממני אישור לבנות.

מטרת העל:
אנחנו בונים טיולים ממש שווים שאנשים ירצו להשתמש בהם, לשמור אותם ולשתף אותם. כל יום צריך להרגיש חזק, מדויק, מסודר, ועם רצף מעולה של מקומות שבאמת שווה להגיע אליהם.

יעד עבודה: ${destination}
${selectedAddress ? `כתובת/אזור היעד: ${selectedAddress}` : ""}
טווח המקומות שנמשכו מ-TripInspo: ${radiusKm} ק״מ מהיעד.

רשימת המקומות הזמינים מתוך TripInspo:
${placesText}

כללי שימוש במקומות:
1. השתמש במקומות מהרשימה כעמוד השדרה של הלו״ז.
2. אם אתה משתמש במקום מהרשימה, חובה להחזיר בשדה placeId את ה-id המדויק שמופיע ליד המקום. אסור לשנות, לקצר, לתרגם או להמציא ID.
3. אם אין מספיק מקומות, מותר להציע מקום אמיתי נוסף רק אם הוא אמיתי ובאותו אזור, ובמקרה כזה placeId חייב להיות null.
4. אל תחזיר פריטים גנריים כמו זמן חופשי, מנוחה, הפסקה או placeholder. כל פריט חייב להיות מקום, פעילות או אירוע לוגיסטי אמיתי.
5. אין צורך להחזיר לוגיסטיקה כרגע. אל תוסיף טיסות, מלונות, רכבות, צ'ק-אין, צ'ק-אאוט או כל פריט לוגיסטי אחר.
6. אם מקום הוא מסעדה כשרה מהרשימה, תתייחס לזה במפורש ותשמר את זה בהיגיון של היום.

בסוף התהליך, ורק אחרי שאישרתי לך לבנות את הלו״ז הסופי, החזר אך ורק JSON תקין. בלי markdown, בלי \`\`\`json, בלי הקדמה ובלי הסברים.

מבנה ה-JSON החדש שחובה להחזיר:
{
    "tripTitle": "כותרת קצרה וטובה לטיול כולו",
    "tripCategories": ["family", "Hidden gems"],
    "tripCategorieshebrew": ["משפחתי", "פנינים נסתרות"],
    "days": [
        {
            "dayNumber": 1,
            "dayTitle": "כותרת היום",
            "dayTips": ["טיפ או דגש ראשון ליום", "טיפ או דגש שני ליום"],
            "items": [
                {
                    "startTime": "HH:mm",
                    "endTime": "HH:mm",
                    "title": "שם המקום / הפעילות",
                    "summary": "הסבר קצר על הפריט הזה בלו״ז",
                    "description": "פירוט ברור למה הפריט הזה שווה, מה חשוב לדעת, וכל דבר קריטי כדי שהלו״ז יהיה מושלם",
                    "address": "כתובת מלאה או אזור ניווט ברור",
                    "placeId": "ID מדויק מהרשימה או null"
                }
            ]
        }
    ]
}

כללי JSON קריטיים:
- האות הראשון בתשובה הסופית חייב להיות { והאות האחרון חייב להיות }.
- כל השדות חייבים להופיע בדיוק בשמות: tripTitle, tripCategories, tripCategorieshebrew, dayNumber, dayTitle, dayTips, items, startTime, endTime, title, summary, description, address, placeId.
- tripCategories יכול להיות מערך של קטגוריות חופשיות באנגלית או בעברית. מותר להשתמש בערכים מוכרים כמו family, romantic, adventure, urban, shopping, beach, nature, cultural, foodie, אבל מותר גם להמציא קטגוריות שמתאימות לטיול.
- tripCategorieshebrew חייב להיות מערך באותו אורך ובאותו סדר כמו tripCategories, עם תרגום או ניסוח עברי ברור לכל קטגוריה. אם tripCategories כבר בעברית, עדיין החזר tripCategorieshebrew עם ניסוח עברי מתאים.
- placeId הוא מחרוזת או null בלבד.
- dayNumber הוא מספר שלם עולה.
- dayTips חייב להיות מערך של טיפים ודגשים ליום.
- אם מקום הגיע מהרשימה, placeId חייב להיות ה-id המדויק שלו.
- אין צורך ב-date ואין צורך ב-destination בתוך כל יום.
`.trim();
}

function buildPlacesPromptText(places) {
    if (!places.length) return "לא נמצאו כרגע מקומות שמורים מתוך TripInspo ליעד הזה.";
    return places.map((place, index) => `${index + 1}. ${place.name}\n   ID: ${place.id}\n   סוג: ${placePromptTypeLabel(place)}\n   פירוט קצר: ${place.shortDescription || place.description || "אין פירוט קצר"}\n   כתובת: ${place.location || "אין כתובת זמינה"}\n   שעות פתיחה: ${place.hours || "אין שעות פתיחה זמינות"}`).join("\n\n");
}

function placePromptTypeLabel(place) {
    const rawType = text(place.type);
    const restaurant = rawType.includes("restaurant") || rawType.includes("bar") || rawType.includes("מסעדה");
    if (restaurant) return place.isKosher ? "מסעדה כשרה" : "מסעדה";
    return rawType || "מקום";
}

async function ensureDestinationSelected() {
    if (state.destination) return;
    const query = $("tripDestinationInput")?.value.trim();
    if (!query) return;
    const results = await searchAddress(query);
    if (results.length) state.destination = normalizeDestination(results[0]);
}

async function fetchPublicPlacesByRadius(lat, lon, radiusKm) {
    const fs = state.firebase.firestore;
    const latDelta = radiusKm / 111;
    const snap = await fs.getDocs(fs.query(
        fs.collection(state.firebase.db, "public_places"),
        fs.where("lat", ">=", lat - latDelta),
        fs.where("lat", "<=", lat + latDelta)
    ));
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((place) => place.lat != null && place.lon != null && distanceKm(lat, lon, place.lat, place.lon) <= radiusKm);
}

function publicPlaceToPromptPlace(place) {
    return {
        id: place.id,
        name: text(place.name),
        destination: state.destination?.label || "",
        type: text(place.type || "place_type_attraction"),
        shortDescription: text(place.shortDescription),
        description: text(place.description),
        location: text(place.location),
        lat: number(place.lat),
        lon: number(place.lon),
        hours: text(place.hours),
        website: text(place.website),
        reservation: reservationFromString(place.reservationLabel),
        isKosher: Boolean(place.isKosher),
        foodType: text(place.foodType),
        rating: number(place.rating),
        coverImageUrl: text(place.coverImageUrl || (Array.isArray(place.imageUrls) ? place.imageUrls[0] : "")),
        coverPhotographerName: text(place.coverPhotographerName),
        coverPhotographerUsername: text(place.coverPhotographerUsername),
        coverEmoji: text(place.coverEmoji),
        coverBackgroundHex: text(place.coverBackgroundHex)
    };
}

function templatePlacePayload(place) {
    return {
        id: text(place.id),
        name: text(place.name),
        destination: text(place.destination || state.destination?.label),
        type: text(place.type || "place_type_attraction"),
        shortDescription: nullable(place.shortDescription),
        description: nullable(place.description),
        location: nullable(place.location),
        lat: number(place.lat),
        lon: number(place.lon),
        hours: nullable(place.hours),
        website: nullable(place.website),
        reservation: place.reservation || "no",
        isKosher: Boolean(place.isKosher),
        foodType: nullable(place.foodType),
        rating: number(place.rating),
        coverImageUrl: nullable(place.coverImageUrl),
        coverPhotographerName: nullable(place.coverPhotographerName),
        coverPhotographerUsername: nullable(place.coverPhotographerUsername),
        coverEmoji: nullable(place.coverEmoji),
        coverBackgroundHex: nullable(place.coverBackgroundHex)
    };
}

function dedupePlaces(places) {
    const byKey = new Map();
    places.forEach((place) => byKey.set(place.id || `${place.name}|${place.location}`, place));
    return Array.from(byKey.values()).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
}

function buildTemplateDescription(parsed, destination) {
    const firstStops = parsed.days[0]?.items.slice(0, 2).map((item) => item.title).filter(Boolean) || [];
    return `${parsed.tripTitle} הוא טיול של ${parsed.days.length} ימים ב${destination}${firstStops.length ? ` עם דגשים כמו ${firstStops.join(" ו-")}` : ""}.`;
}

function buildTemplateKeywords(title, categories, places, destination) {
    const values = new Set([text(title).toLowerCase(), text(destination).toLowerCase(), ...categories]);
    places.slice(0, 12).forEach((place) => values.add(text(place.name).toLowerCase()));
    text(title).split(/\s+/).forEach((part) => { if (part.length > 1) values.add(part.toLowerCase()); });
    return Array.from(values).filter(Boolean).sort();
}

function normalizeCategoryKey(value) {
    const raw = text(value).toLowerCase();
    if (CATEGORY_LABELS[raw]) return raw;
    const match = CATEGORIES.find(([key, label]) => raw === key || raw === text(label).toLowerCase());
    return match?.[0] || null;
}

function buildHebrewCategoryLabels(categories, hebrewLabels) {
    return categories.map((category, index) => text(hebrewLabels[index]) || CATEGORY_LABELS[normalizeCategoryKey(category)] || category);
}

function uniqueStrings(values) {
    return Array.from(new Set(values.map(text).filter(Boolean)));
}

function jsonString(source, keys) {
    for (const key of keys) {
        const value = source?.[key];
        if (value != null && text(value)) return text(value);
    }
    return "";
}

function jsonDouble(source, keys) {
    for (const key of keys) {
        const parsed = number(source?.[key]);
        if (parsed != null) return parsed;
    }
    return null;
}

function boolValue(value) {
    const normalized = text(value).toLowerCase();
    return ["true", "1", "yes", "כן", "y", "friendly"].includes(normalized);
}

function bestHeroImage(places) {
    return places.map((place) => text(place.coverImageUrl)).find(Boolean) || null;
}

function hasUnsavedTripWork() {
    if (state.saving) return false;
    if (["templateEditDialog", "hotelEditDialog", "bookingEditDialog"].some((id) => $(id)?.open === true)) return true;
    if (state.view !== "compose") return false;

    if (state.parsedTemplate) {
        const signature = computeTemplateSignature(buildTripTemplatePayload(state.parsedTemplate));
        return !state.lastSavedId || signature !== state.lastSavedSignature;
    }

    return Boolean(
        state.promptPlaces.length
        || state.hotelRecommendations.length
        || state.bookingRecommendations.length
        || text($("tripDestinationInput")?.value)
        || text($("tripPromptPreview")?.value)
        || text($("tripJsonInput")?.value)
        || text($("tripHotelsJsonInput")?.value)
        || text($("tripBookingsJsonInput")?.value)
    );
}

async function searchAddress(query) {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "5");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "en,he");
    const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!response.ok) return [];
    return await response.json();
}

function normalizeDestination(item) {
    return { label: shortPlaceLabel(item), address: text(item.display_name), lat: number(item.lat), lon: number(item.lon) };
}

function shortPlaceLabel(item) {
    const address = item.address || {};
    return address.city || address.town || address.village || address.state || text(item.display_name).split(",")[0].trim();
}

function reservationFromString(value) {
    const normalized = text(value).toLowerCase();
    if (["reservation_yes", "yes"].includes(normalized)) return "yes";
    if (["reservation_recommended", "recommended"].includes(normalized)) return "recommended";
    return "no";
}

function editInput(field, label, value) { return `<label class="edit-field"><span>${escapeHtml(label)}</span><input data-edit-field="${escapeAttr(field)}" value="${escapeAttr(value ?? "")}" /></label>`; }
function editTextarea(field, label, value, rows = 7) { return `<label class="edit-field full"><span>${escapeHtml(label)}</span><textarea data-edit-field="${escapeAttr(field)}" rows="${Number(rows) || 4}">${escapeHtml(value ?? "")}</textarea></label>`; }
function editToggle(field, label, value) { return `<label class="edit-field edit-toggle"><span>${escapeHtml(label)}</span><input type="checkbox" data-edit-field="${escapeAttr(field)}" ${value ? "checked" : ""} /></label>`; }
function splitCsv(value) { return text(value).split(",").map(text).filter(Boolean); }
function cleanJson(raw) { return String(raw || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(); }
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function setStatus(id, message, isError = false) { const el = $(id); if (!el) return; el.textContent = message || ""; el.style.color = isError ? "var(--red)" : "var(--muted)"; }
function text(value) { return value == null ? "" : String(value).trim(); }
function number(value) { const raw = String(value ?? "").trim(); if (!raw) return null; const parsed = Number(raw.replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; }
function nullable(value) { const normalized = text(value); return normalized || null; }
function normalize(value) { return text(value).toLowerCase().replace(/[\s,./\\-]+/g, " ").trim(); }
function escapeHtml(value) { return text(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#039;"); }
function emptyHtml(message) { return `<div class="empty-screen"><i data-lucide="inbox"></i><p>${escapeHtml(message)}</p></div>`; }
function distanceKm(lat1, lon1, lat2, lon2) { const toRad = (value) => value * Math.PI / 180; const earthKm = 6371; const dLat = toRad(Number(lat2) - Number(lat1)); const dLon = toRad(Number(lon2) - Number(lon1)); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) * Math.sin(dLon / 2) ** 2; return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
