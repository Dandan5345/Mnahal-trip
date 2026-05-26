import {
    createAdminShell,
    attachSharedUi,
    resolveAdminView,
    ensureAdminImageUrlOnR2,
    uploadAdminImageFileToR2,
    adminPixabaySearch,
    adminPixabayLookupById,
    adminUnsplashSearch
} from "./shared.js";

const HOTEL_R2_FOLDER = "hotel_img";

const state = {
    firebase: null,
    user: null,
    view: "compose",
    destination: null,
    destinationSuggestions: [],
    drafts: [],
    allDrafts: [],
    allTemplates: [],
    loadedTemplate: null,
    manageSearch: "",
    editingDraftId: null,
    detailDraftId: null,
    imageDraftId: null,
    imageSource: "pixabay"
};

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const HOTEL_VIEW_CONFIG = {
    compose: {
        title: "הוספת מלון",
        subtitle: "prompt, JSON ושמירה.",
        actions: ""
    },
    manage: {
        title: "מלונות מצב נוכחי",
        subtitle: "חיפוש, עריכה ושמירה.",
        actions: ""
    }
};

renderPage();

function renderPage() {
    state.view = normalizeHotelView(resolveAdminView("compose"));
    const viewConfig = HOTEL_VIEW_CONFIG[state.view];
    document.getElementById("app").innerHTML = createAdminShell({
        activeKey: "hotels",
        activeSubKey: state.view,
        title: viewConfig.title,
        subtitle: viewConfig.subtitle,
        actions: viewConfig.actions,
        content: `${state.view === "compose" ? renderComposeView() : renderManageView()}${renderHotelEditDialog()}${renderHotelDetailDialog()}${renderHotelImageDialog()}`
    });

    attachSharedUi({
        activeKey: "hotels",
        requireAuth: true,
        onAuthed: (user, firebase) => {
            state.user = user;
            state.firebase = firebase;
            init();
        }
    });
}

function renderHotelEditDialog() {
    return `
            <dialog class="image-dialog edit-dialog" id="hotelEditDialog">
                <form method="dialog" class="image-dialog-shell edit-dialog-shell">
                    <div class="dialog-header">
                        <div>
                            <p class="eyebrow">עריכת מלון</p>
                            <h2 id="hotelEditDialogTitle">מלון</h2>
                        </div>
                        <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                    </div>
                    <div class="edit-form-grid" id="hotelEditFields"></div>
                    <div class="action-row split-actions">
                        <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור וסגור</span></button>
                        <button class="ghost-action" type="button" id="hotelEditPickImageButton"><i data-lucide="image"></i><span>בחר תמונה</span></button>
                        <button class="ghost-action danger-lite" type="button" id="deleteHotelFromDialogButton"><i data-lucide="trash-2"></i><span>מחק</span></button>
                    </div>
                </form>
            </dialog>
        `;
}

function renderHotelDetailDialog() {
    return `
            <dialog class="image-dialog recommendation-detail-dialog" id="hotelDetailDialog">
                <form method="dialog" class="image-dialog-shell recommendation-detail-shell">
                    <div class="dialog-header">
                        <div>
                            <p class="eyebrow">פרטי מלון</p>
                            <h2 id="hotelDetailTitle">מלון</h2>
                        </div>
                        <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                    </div>
                    <div class="recommendation-detail-body" id="hotelDetailBody"></div>
                    <div class="action-row split-actions">
                        <button class="primary-action" type="button" id="hotelDetailEditButton"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                        <button class="ghost-action" type="button" id="hotelDetailImageButton"><i data-lucide="image"></i><span>תמונה</span></button>
                        <button class="ghost-action danger-lite" type="button" id="hotelDetailDeleteButton"><i data-lucide="trash-2"></i><span>מחק</span></button>
                    </div>
                </form>
            </dialog>
        `;
}

function renderHotelImageDialog() {
    return `
            <dialog class="image-dialog" id="hotelImageDialog">
                <form method="dialog" class="image-dialog-shell">
                    <div class="dialog-header">
                        <div>
                            <p class="eyebrow">חיפוש תמונות</p>
                            <h2 id="hotelImageDialogTitle">בחירת תמונה</h2>
                        </div>
                        <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                    </div>
                    <div class="action-row image-source-row">
                        <button class="ghost-action small-action" type="button" data-hotel-image-source="gallery">גלריה</button>
                        <button class="ghost-action small-action" type="button" data-hotel-image-source="pixabay">Pixabay</button>
                        <button class="ghost-action small-action" type="button" data-hotel-image-source="wikimedia">Wikipedia</button>
                        <button class="ghost-action small-action" type="button" data-hotel-image-source="unsplash">Unsplash</button>
                    </div>
                    <div class="image-search-row" id="hotelImageSearchRow">
                        <input id="hotelImageSearchInput" class="plain-input" type="text" placeholder="חיפוש תמונה" />
                        <button class="primary-action" type="button" id="runHotelImageSearchButton"><i data-lucide="search"></i><span>חפש</span></button>
                    </div>
                    <div class="image-search-row" id="hotelImageGalleryRow" hidden>
                        <input id="hotelImageGalleryFile" type="file" accept="image/*" class="plain-input" />
                        <input id="hotelImageGalleryUrl" class="plain-input" type="url" placeholder="או הדבק קישור תמונה" />
                        <button class="primary-action" type="button" id="useHotelGalleryImageButton"><i data-lucide="check"></i><span>השתמש בתמונה</span></button>
                    </div>
                    <div class="image-results" id="hotelImageResults"></div>
                </form>
            </dialog>
        `;
}

function normalizeHotelView(view) {
    return Object.prototype.hasOwnProperty.call(HOTEL_VIEW_CONFIG, view) ? view : "compose";
}

function renderComposeView() {
    return `
            <div class="workspace-grid hotel-workspace">
                <article class="panel hotel-panel-main">
                    <div class="panel-heading">
                        <span class="panel-icon amber"><i data-lucide="hotel" aria-hidden="true"></i></span>
                        <div>
                            <h2>קלט AI למלונות</h2>
                            <p>אותו prompt של מצב מתכנת.</p>
                        </div>
                    </div>

                    <div class="micro-note">בחר יעד, העתק prompt, הדבק JSON.</div>

                    <div class="field-block">
                        <label for="hotelDestinationInput">יעד</label>
                        <div class="search-input-row">
                              <i data-lucide="building-2" aria-hidden="true"></i>
                            <input id="hotelDestinationInput" type="text" placeholder="בחר יעד למלונות" />
                        </div>
                        <div class="suggestions" id="hotelDestinationSuggestions"></div>
                    </div>

                    <div class="selected-place" id="selectedHotelDestination">
                        <i data-lucide="map" aria-hidden="true"></i>
                        <span>בחר יעד מהרשימה.</span>
                    </div>

                    <div class="action-row">
                        <button class="primary-action" type="button" id="copyHotelPromptButton">
                            <i data-lucide="copy" aria-hidden="true"></i>
                            <span>העתק פרומפט</span>
                        </button>
                        <button class="ghost-action" type="button" id="pasteHotelJsonButton">
                            <i data-lucide="clipboard-paste" aria-hidden="true"></i>
                            <span>הדבק JSON</span>
                        </button>
                    </div>
                </article>

                <article class="panel hotel-panel-json">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="braces" aria-hidden="true"></i></span>
                        <div>
                            <h2>JSON סופי</h2>
                            <p>מחפש hotels.</p>
                        </div>
                    </div>

                    <div class="schema-strip" aria-label="שדות JSON">
                        <span>name</span>
                        <span>address</span>
                        <span>summary</span>
                        <span>stars</span>
                        <span>bookingRating</span>
                        <span>bookingUrl</span>
                        <span>imageUrl</span>
                    </div>

                    <textarea id="hotelJsonInput" class="json-input" spellcheck="false" placeholder='JSON סופי מה-AI עם hotels'></textarea>
                    <div class="action-row split-actions booking-json-actions">
                        <button class="primary-action" type="button" id="parseHotelJsonButton">
                            <i data-lucide="braces" aria-hidden="true"></i>
                            <span>פענח</span>
                        </button>
                    </div>
                    <p class="status-line" id="hotelStatus"></p>
                </article>
            </div>

            <section class="result-section">
                <div class="section-heading compact">
                    <div>
                        <p class="eyebrow">טיוטות</p>
                        <h2>עריכה ושמירה</h2>
                    </div>
                    <div class="action-row tight">
                        <span class="count-pill" id="hotelDraftCountPill">0 מלונות</span>
                        <button class="primary-action" type="button" id="saveHotelDraftsButton">
                            <i data-lucide="save" aria-hidden="true"></i>
                            <span>שמור מלונות</span>
                        </button>
                    </div>
                </div>
                <div class="hotel-drafts recommendation-cards" id="hotelDraftCards"></div>
            </section>
        `;
}

function renderManageView() {
    return `
            <div class="workspace-grid hotel-manager-grid single-search-grid">
                <article class="panel wide-panel">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="search" aria-hidden="true"></i></span>
                        <div>
                            <h2>חיפוש מלונות</h2>
                            <p>שם, כתובת או יעד.</p>
                        </div>
                    </div>

                    <div class="micro-note">בחירת יעד מההשלמה תציג מלונות בטווח 50 ק״מ.</div>

                    <div class="field-block">
                        <label for="hotelManagerSearchInput">חיפוש</label>
                        <div class="search-input-row">
                            <i data-lucide="search" aria-hidden="true"></i>
                            <input id="hotelManagerSearchInput" type="text" placeholder="כתוב שם מלון, כתובת, יעד או Vienna" autocomplete="off" />
                        </div>
                        <div class="suggestions" id="hotelManagerSuggestions"></div>
                    </div>

                    <div class="selected-place" id="selectedHotelDestination">
                        <i data-lucide="map" aria-hidden="true"></i>
                        <span>כל המלונות נטענים אוטומטית. בחירת יעד מפעילה סינון רדיוס.</span>
                    </div>

                    <p class="status-line" id="hotelStatus"></p>
                </article>
            </div>

            <section class="result-section">
                <div class="section-heading compact">
                    <div>
                        <p class="eyebrow">מלונות שמורים</p>
                        <h2>עריכה, מחיקה ושמירה</h2>
                    </div>
                    <div class="action-row tight">
                        <span class="count-pill" id="hotelDraftCountPill">0 מלונות</span>
                        <button class="primary-action" type="button" id="saveHotelDraftsButton">
                            <i data-lucide="save" aria-hidden="true"></i>
                            <span>שמור עדכונים</span>
                        </button>
                    </div>
                </div>
                <div class="hotel-drafts recommendation-cards" id="hotelDraftCards"></div>
            </section>
        `;
}

function init() {
    bindDestinationSearch();
    bindActions();
    if (state.view === "manage") loadAllSavedHotels();
    renderDrafts();
    refreshIcons();
}

function bindActions() {
    $("copyHotelPromptButton")?.addEventListener("click", copyHotelPrompt);
    $("pasteHotelJsonButton")?.addEventListener("click", pasteHotelJson);
    $("parseHotelJsonButton")?.addEventListener("click", parseHotelJson);
    $("saveHotelDraftsButton")?.addEventListener("click", saveHotelDrafts);
    $("loadSavedHotelsButton")?.addEventListener("click", loadSavedHotels);
    $("hotelManagerSearchInput")?.addEventListener("input", (event) => {
        state.manageSearch = event.target.value;
        state.destination = null;
        updateManageSearchSuggestions(event.target.value);
        renderDrafts();
    });
    $("hotelEditDialog")?.querySelector("form")?.addEventListener("submit", () => {
        state.editingDraftId = null;
        renderDrafts();
    });
    $("deleteHotelFromDialogButton")?.addEventListener("click", () => {
        if (!state.editingDraftId) return;
        state.drafts = state.drafts.filter((item) => item.id !== state.editingDraftId);
        state.allDrafts = state.allDrafts.filter((item) => item.id !== state.editingDraftId);
        $("hotelEditDialog").close();
        state.editingDraftId = null;
        renderDrafts();
    });
    $("hotelEditPickImageButton")?.addEventListener("click", () => {
        if (state.editingDraftId) openHotelImageDialog(state.editingDraftId);
    });
    $("hotelDetailEditButton")?.addEventListener("click", openHotelEditFromDetail);
    $("hotelDetailImageButton")?.addEventListener("click", openHotelImageFromDetail);
    $("hotelDetailDeleteButton")?.addEventListener("click", deleteHotelFromDetail);
    $("runHotelImageSearchButton")?.addEventListener("click", () => searchHotelImages($("hotelImageSearchInput").value.trim()));
    $("hotelImageSearchInput")?.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        searchHotelImages($("hotelImageSearchInput").value.trim());
    });
    $("useHotelGalleryImageButton")?.addEventListener("click", applyHotelGalleryImage);
    $$('[data-hotel-image-source]').forEach((button) => button.addEventListener("click", () => switchHotelImageSource(button.dataset.hotelImageSource)));
}

function bindDestinationSearch() {
    const input = $("hotelDestinationInput");
    if (!input) return;
    const suggestions = $("hotelDestinationSuggestions");
    const selected = $("selectedHotelDestination");
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
            state.destinationSuggestions = results;
            suggestions.innerHTML = results.map((item, index) => `
                            <button class="suggestion-item" type="button" data-index="${index}">
                                <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
                                <b>OpenStreetMap</b>
                                <i data-lucide="chevron-left"></i>
                            </button>
                        `).join("");
            suggestions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
                const choice = results[Number(button.dataset.index)];
                state.destination = normalizeDestination(choice);
                input.value = state.destination.label;
                selected.innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
                suggestions.innerHTML = "";
                refreshIcons();
            }));
            refreshIcons();
        }, 220);
    });
}

let manageSearchTimer = null;

function updateManageSearchSuggestions(queryText) {
    const suggestions = $("hotelManagerSuggestions");
    if (!suggestions || state.view !== "manage") return;
    window.clearTimeout(manageSearchTimer);
    const query = queryText.trim();
    if (query.length < 2) {
        suggestions.innerHTML = "";
        return;
    }
    manageSearchTimer = window.setTimeout(async () => {
        const results = await searchAddress(query);
        suggestions.innerHTML = results.map((item, index) => `
                    <button class="suggestion-item" type="button" data-index="${index}">
                        <span>${escapeHtml(shortPlaceLabel(item))}<br><small>${escapeHtml(item.display_name || "")}</small></span>
                        <b>יעד</b>
                        <i data-lucide="chevron-left"></i>
                    </button>
                `).join("");
        suggestions.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => {
            const selected = results[Number(button.dataset.index)];
            state.destination = normalizeDestination(selected);
            state.manageSearch = state.destination.label;
            $("hotelManagerSearchInput").value = state.destination.label;
            $("selectedHotelDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
            suggestions.innerHTML = "";
            renderDrafts();
        }));
        refreshIcons();
    }, 240);
}

async function copyHotelPrompt() {
    await ensureDestinationSelectedFromInput();
    const destination = (state.destination?.label || $("hotelDestinationInput").value.trim()).trim();
    if (!destination) {
        setStatus("hotelStatus", "בחר יעד לפני העתקת הפרומפט.", true);
        return;
    }
    await navigator.clipboard.writeText(buildHotelPrompt(destination));
    setStatus("hotelStatus", "פרומפט המלונות הועתק.");
}

function buildHotelPrompt(destination) {
    const coords = state.destination?.lat != null && state.destination?.lon != null
        ? `\nקואורדינטות מרכז היעד: ${state.destination.lat}, ${state.destination.lon}`
        : "";
    return `
אתה עוזר לי להכין המלצות מלונות לעמוד המלונות של TripTap.

יעד המלונות: ${destination}
${coords}

תנהל איתי שיחה קצרה לפני התשובה הסופית: כמה מלונות צריך, רמות כוכבים, אזורים מועדפים, מחיר, התאמה לשומרי כשרות, שבת, משפחות/זוגות וכל פרט שחסר.

בכל מלון חשוב לי פירוט עשיר ולא גנרי: איך המלון מרגיש, חדרים, מתקנים, מיקום, למי הוא מתאים, יתרון אמיתי וחיסרון אם יש.

בסוף החזר אך ורק JSON תקין בלי markdown:
{
    "hotels": [
        {
            "name": "שם המלון",
            "address": "כתובת מדויקת",
            "summary": "תיאור עשיר של 3-5 משפטים",
            "stars": "3/4/5",
            "bookingRating": "8.9 או לא נמצא",
            "googleRating": "4.6 או לא נמצא",
            "locationRating": "תיאור איכות המיקום",
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
}`.trim();
}

async function pasteHotelJson() {
    const raw = await navigator.clipboard.readText();
    if (!raw.trim()) return;
    $("hotelJsonInput").value = raw;
    await parseHotelJson();
}

async function parseHotelJson() {
    try {
        const decoded = JSON.parse(cleanJson($("hotelJsonInput").value));
        const rawHotels = Array.isArray(decoded) ? decoded : decoded?.hotels;
        if (!Array.isArray(rawHotels) || !rawHotels.length) throw new Error("חסר מערך hotels.");
        state.loadedTemplate = null;
        state.drafts = rawHotels
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
                id: text(item.id) || crypto.randomUUID(),
                name: text(item.name || item.hotelName),
                address: text(item.address),
                summary: text(item.summary || item.description),
                stars: clampStars(number(item.stars || item.starRating) || 3),
                bookingRating: text(item.bookingRating || item.bookingScore),
                googleRating: text(item.googleRating || item.googleScore),
                locationRating: text(item.locationRating),
                kosherFriendly: boolValue(item.kosherFriendly),
                kosherFriendlyReason: text(item.kosherFriendlyReason),
                shabbatFriendly: boolValue(item.shabbatFriendly),
                shabbatFriendlyReason: text(item.shabbatFriendlyReason),
                shabbatKosherNotes: text(item.shabbatKosherNotes || item.kosherNotes || item.shabbatNotes),
                breakfast: text(item.breakfast),
                bookingUrl: text(item.bookingUrl || item.url),
                imageUrl: nullable(text(item.imageUrl || item.photoUrl)),
                imagePixabayId: hotelsPixabayIdValue(item.imagePixabayId ?? item.pixabayId),
                imagePixabayPageUrl: nullable(text(item.imagePixabayPageUrl || item.pixabayPageUrl)),
                lat: number(item.lat || item.latitude),
                lon: number(item.lon || item.lng || item.longitude)
            }))
            .filter((hotel) => hotel.name);
        renderDrafts();
        setStatus("hotelStatus", `נוצרו ${state.drafts.length} מלונות. משלים תמונות וקואורדינטות...`);
        await ensureDestinationSelectedFromInput();
        await autofillHotelImagesFromDestination();
        await autofillHotelCoordinates();
        renderDrafts();
        setStatus("hotelStatus", `נוצרו ${state.drafts.length} מלונות עם תמונות/כתובות אוטומטיות כשאפשר.`);
    } catch (error) {
        setStatus("hotelStatus", `שגיאה בפענוח מלונות: ${error.message}`, true);
    }
}

async function loadSavedHotels() {
    const destination = await resolveDestinationLabel();
    if (!destination) {
        setStatus("hotelStatus", "בחר יעד לפני פתיחת מנהל המלונות.", true);
        return;
    }
    setStatus("hotelStatus", `טוען מלונות שמורים עבור ${destination}...`);
    try {
        const template = await fetchAssetLibraryForDestination(destination);
        if (!template || !Array.isArray(template.hotels) || !template.hotels.length) {
            setStatus("hotelStatus", `לא נמצאו מלונות שמורים עבור ${destination}.`, true);
            return;
        }
        state.loadedTemplate = template;
        state.drafts = template.hotels.map(hotelDraftFromTemplateHotel);
        renderDrafts();
        setStatus("hotelStatus", `נטענו ${state.drafts.length} מלונות שמורים עבור ${destination}.`);
    } catch (error) {
        setStatus("hotelStatus", `פתיחת מנהל המלונות נכשלה: ${error.message}`, true);
    }
}

async function loadAllSavedHotels() {
    if (!state.firebase) return;
    setStatus("hotelStatus", "טוען את כל המלונות...");
    try {
        const fs = state.firebase.firestore;
        const snap = await fs.getDocs(fs.collection(state.firebase.db, "trip_templates"));
        const templates = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        state.allTemplates = templates;
        state.allDrafts = templates.flatMap((template) => (template.hotels || []).map((hotel) => ({
            ...hotelDraftFromTemplateHotel(hotel),
            templateId: template.id,
            templateDestination: text(template.mainDestination || template.city || hotel.destination),
            templateName: text(template.name)
        })));
        state.drafts = [...state.allDrafts];
        renderDrafts();
        setStatus("hotelStatus", `נטענו ${state.drafts.length} מלונות מכל האפליקציה.`);
    } catch (error) {
        setStatus("hotelStatus", `טעינת כל המלונות נכשלה: ${error.message}`, true);
    }
}

function renderDrafts() {
    const visibleDrafts = filteredHotelDrafts();
    $("hotelDraftCountPill").textContent = state.view === "manage"
        ? `${visibleDrafts.length}/${state.drafts.length} מלונות`
        : `${state.drafts.length} מלונות`;
    $("hotelDraftCards").innerHTML = visibleDrafts.map(renderHotelCard).join("") || emptyHtml(state.view === "manage"
        ? "אין מלונות להצגה עבור החיפוש הנוכחי."
        : "אין עדיין טיוטות. הדבק JSON והתחל לעבוד.");
    $$('[data-hotel-draft-id]').forEach((card) => {
        const id = card.dataset.hotelDraftId;
        card.addEventListener("click", (event) => {
            if (event.target.closest("[data-action]")) return;
            openHotelDetailDialog(id);
        });
        card.querySelectorAll('[data-field]').forEach((field) => field.addEventListener('input', () => updateDraftField(id, field.dataset.field, field.type === 'checkbox' ? field.checked : field.value)));
        card.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleDraftAction(id, button.dataset.action)));
    });
    hotelsApplyPixabayResolvers($("hotelDraftCards"));
    refreshIcons();
}

function filteredHotelDrafts() {
    const query = normalize(state.manageSearch);
    if (!query || state.view !== "manage") return state.drafts;
    if (state.destination?.lat != null && state.destination?.lon != null) {
        return state.drafts.filter((draft) => draft.lat != null && draft.lon != null && distanceKm(state.destination.lat, state.destination.lon, draft.lat, draft.lon) <= 50);
    }
    return state.drafts.filter((draft) => [draft.name, draft.address, draft.templateDestination, draft.destination, draft.summary, draft.bookingUrl]
        .map(normalize)
        .some((value) => value.includes(query)));
}

function renderHotelCard(hotel) {
    const stars = clampStars(number(hotel.stars) || 3);
    const starRow = `<span class="rec-stars" title="${escapeAttr(`${stars} כוכבים`)}">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}</span>`;
    const chips = [
        hotel.bookingRating ? `<span class="rec-chip"><i data-lucide="star" aria-hidden="true"></i>Booking ${escapeHtml(hotel.bookingRating)}</span>` : "",
        hotel.googleRating ? `<span class="rec-chip"><i data-lucide="map-pin" aria-hidden="true"></i>Google ${escapeHtml(hotel.googleRating)}</span>` : "",
        hotel.kosherFriendly ? `<span class="rec-chip rec-chip-positive">כשרות ✓</span>` : "",
        hotel.shabbatFriendly ? `<span class="rec-chip rec-chip-positive">שבת ✓</span>` : ""
    ].filter(Boolean).join("");
    return `<article class="rec-card hotel-rec-card" data-hotel-draft-id="${escapeAttr(hotel.id)}">
            <div class="rec-card-image">
                ${hotelImageMarkup(hotel)}
                <div class="rec-card-image-overlay">${starRow}</div>
            </div>
            <div class="rec-card-body">
                <div class="rec-card-heading">
                    <h3>${escapeHtml(hotel.name || "מלון")}</h3>
                    ${hotel.address ? `<p class="rec-card-sub"><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHtml(hotel.address)}</p>` : ""}
                </div>
                ${hotel.summary ? `<p class="rec-card-summary">${escapeHtml(truncate(hotel.summary, 160))}</p>` : ""}
                ${chips ? `<div class="rec-card-chips">${chips}</div>` : ""}
                <div class="rec-card-actions">
                    <button class="ghost-action small-action" type="button" data-action="image"><i data-lucide="image"></i><span>תמונה</span></button>
                    <button class="ghost-action small-action" type="button" data-action="edit"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                    <button class="ghost-action small-action danger-lite" type="button" data-action="remove"><i data-lucide="trash-2"></i><span>מחק</span></button>
                </div>
            </div>
        </article>`;
}

function updateDraftField(id, field, value) {
    const hotel = state.drafts.find((item) => item.id === id);
    if (!hotel) return;
    if (field === "stars") {
        hotel[field] = clampStars(number(value) || 3);
        return;
    }
    if (["lat", "lon"].includes(field)) {
        hotel[field] = number(value);
        return;
    }
    hotel[field] = value;
}

function handleDraftAction(id, action) {
    if (action === "edit") {
        const hotel = state.drafts.find((item) => item.id === id);
        if (hotel) openHotelEditDialog(hotel);
        return;
    }
    if (action === "image") {
        openHotelImageDialog(id);
        return;
    }
    if (action !== "remove") return;
    state.drafts = state.drafts.filter((item) => item.id !== id);
    renderDrafts();
}

function openHotelEditDialog(hotel) {
    state.editingDraftId = hotel.id;
    $("hotelEditDialogTitle").textContent = hotel.name || "מלון";
    $("hotelEditFields").innerHTML = `
        ${editInput("name", "שם המלון", hotel.name)}
        ${editInput("stars", "כוכבים", hotel.stars)}
        ${editInput("address", "כתובת", hotel.address)}
        ${editTextarea("summary", "תיאור", hotel.summary)}
        ${editInput("bookingRating", "Booking rating", hotel.bookingRating)}
        ${editInput("googleRating", "Google rating", hotel.googleRating)}
        ${editInput("locationRating", "דירוג מיקום", hotel.locationRating)}
        ${editInput("breakfast", "ארוחת בוקר", hotel.breakfast)}
        ${editInput("bookingUrl", "קישור הזמנה", hotel.bookingUrl)}
        ${editInput("imageUrl", "תמונה", hotel.imageUrl || "")}
        ${editInput("lat", "Latitude", hotel.lat ?? "")}
        ${editInput("lon", "Longitude", hotel.lon ?? "")}
        ${editCheckbox("kosherFriendly", "מתאים לכשרות", hotel.kosherFriendly)}
        ${editInput("kosherFriendlyReason", "סיבת התאמה לכשרות", hotel.kosherFriendlyReason)}
        ${editCheckbox("shabbatFriendly", "מתאים לשבת", hotel.shabbatFriendly)}
        ${editInput("shabbatFriendlyReason", "סיבת התאמה לשבת", hotel.shabbatFriendlyReason)}
        ${editTextarea("shabbatKosherNotes", "הערות שבת / כשרות", hotel.shabbatKosherNotes)}
    `;
    $("hotelEditFields").querySelectorAll("[data-edit-field]").forEach((field) => {
        field.addEventListener("input", () => updateDraftField(hotel.id, field.dataset.editField, field.type === "checkbox" ? field.checked : field.value));
    });
    $("hotelEditDialog").showModal();
}

async function saveHotelDrafts() {
    if (!state.drafts.length) return;
    if (state.view === "manage") {
        await saveManagedHotelDrafts();
        return;
    }
    const destination = await resolveDestinationLabel();
    if (!destination) {
        setStatus("hotelStatus", "חסר יעד לשמירת המלונות.", true);
        return;
    }
    setStatus("hotelStatus", "שומר תמונות מלונות ב-R2...");
    try {
        await ensureHotelDraftImagesOnR2(state.drafts);
        setStatus("hotelStatus", "שומר מלונות ל-TripTap...");
        const template = await fetchAssetLibraryForDestination(destination);
        const hotels = state.drafts.map((hotel) => hotelToTemplateHotel(hotel, destination));
        const hotelsToSave = state.loadedTemplate && text(state.loadedTemplate.id) === assetLibraryIdForDestination(destination)
            ? hotels
            : mergeHotels([...(template?.hotels || []), ...hotels]);
        const payload = buildAssetLibraryTemplate({
            destination,
            existing: template,
            hotels: hotelsToSave
        });
        const fs = state.firebase.firestore;
        await fs.setDoc(fs.doc(state.firebase.db, "trip_templates", assetLibraryIdForDestination(destination)), payload, { merge: true });
        state.loadedTemplate = null;
        state.drafts = [];
        $("hotelJsonInput")?.value && ($("hotelJsonInput").value = "");
        renderDrafts();
        setStatus("hotelStatus", `נשמרו ${hotelsToSave.length} מלונות לעמוד המלונות של TripTap.`);
    } catch (error) {
        setStatus("hotelStatus", `שמירת המלונות נכשלה: ${error.message}`, true);
    }
}

async function saveManagedHotelDrafts() {
    const fs = state.firebase.firestore;
    setStatus("hotelStatus", "שומר תמונות מלונות ב-R2...");
    try {
        await ensureHotelDraftImagesOnR2(state.drafts);
        setStatus("hotelStatus", "שומר עדכוני מלונות...");
        const draftsByTemplate = new Map();
        state.drafts.forEach((draft) => {
            const templateId = text(draft.templateId);
            if (!templateId) return;
            if (!draftsByTemplate.has(templateId)) draftsByTemplate.set(templateId, []);
            draftsByTemplate.get(templateId).push(draft);
        });
        for (const template of state.allTemplates) {
            if (!draftsByTemplate.has(template.id) && !Array.isArray(template.hotels)) continue;
            const hotels = (draftsByTemplate.get(template.id) || []).map((hotel) => hotelToTemplateHotel(hotel, text(hotel.templateDestination || template.mainDestination)));
            await fs.setDoc(fs.doc(state.firebase.db, "trip_templates", template.id), { hotels }, { merge: true });
        }
        state.allDrafts = [...state.drafts];
        renderDrafts();
        setStatus("hotelStatus", "המלונות עודכנו.");
    } catch (error) {
        setStatus("hotelStatus", `שמירת העדכונים נכשלה: ${error.message}`, true);
    }
}

function hotelDraftFromTemplateHotel(hotel) {
    return {
        id: text(hotel.id) || crypto.randomUUID(),
        name: text(hotel.hotelName || hotel.name),
        address: text(hotel.address),
        summary: text(hotel.summary || hotel.notes),
        stars: clampStars(number(hotel.starRating) || 3),
        destination: text(hotel.destination),
        lat: number(hotel.lat),
        lon: number(hotel.lon),
        bookingRating: text(hotel.bookingRatingText || hotel.bookingRating),
        googleRating: text(hotel.googleRatingText || hotel.googleRating),
        locationRating: text(hotel.locationRating),
        kosherFriendly: Boolean(hotel.kosherFriendly),
        kosherFriendlyReason: text(hotel.kosherFriendlyReason),
        shabbatFriendly: Boolean(hotel.shabbatFriendly),
        shabbatFriendlyReason: text(hotel.shabbatFriendlyReason),
        shabbatKosherNotes: text(hotel.shabbatKosherNotes || hotel.notes),
        breakfast: text(hotel.breakfast),
        bookingUrl: text(hotel.bookingLink || hotel.bookingUrl),
        imageUrl: nullable(text(hotel.imageUrl)),
        imagePixabayId: hotelsPixabayIdValue(hotel.imagePixabayId),
        imagePixabayPageUrl: nullable(text(hotel.imagePixabayPageUrl))
    };
}

async function ensureHotelDraftImagesOnR2(drafts) {
    for (const hotel of drafts || []) {
        const imageUrl = text(hotel.imageUrl);
        if (!imageUrl) continue;
        hotel.imageUrl = await ensureAdminImageUrlOnR2(state.user, imageUrl, {
            folder: HOTEL_R2_FOLDER,
            baseName: hotel.name || hotel.hotelName || hotel.templateDestination || "hotel"
        });
        hotel.imagePixabayId = null;
        hotel.imagePixabayPageUrl = null;
    }
}

function hotelToTemplateHotel(hotel, destination) {
    return {
        id: hotel.id,
        hotelName: text(hotel.name),
        starRating: clampStars(number(hotel.stars) || 3),
        destination,
        address: nullable(hotel.address),
        lat: number(hotel.lat) ?? state.destination?.lat ?? null,
        lon: number(hotel.lon) ?? state.destination?.lon ?? null,
        imageUrl: nullable(hotel.imageUrl),
        imagePixabayId: hotelsPixabayIdValue(hotel.imagePixabayId),
        imagePixabayPageUrl: nullable(hotel.imagePixabayPageUrl),
        bookingLink: nullable(hotel.bookingUrl),
        bookingRating: number(hotel.bookingRating),
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

async function resolveDestinationLabel() {
    await ensureDestinationSelectedFromInput();
    return (state.destination?.label || $("hotelDestinationInput").value.trim()).trim();
}

async function ensureDestinationSelectedFromInput() {
    if (state.destination) return;
    const query = $("hotelDestinationInput").value.trim();
    if (!query) return;
    const results = await searchAddress(query);
    if (!results.length) return;
    state.destination = normalizeDestination(results[0]);
    $("selectedHotelDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
    refreshIcons();
}

function hotelImageMarkup(hotel) {
    const cached = hotelsGetCachedPixabayUrl(hotel.imagePixabayId);
    const src = cached || hotel.imageUrl;
    return src
        ? `<img src="${escapeAttr(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"${hotel.imagePixabayId ? ` data-pixabay-id="${escapeAttr(hotel.imagePixabayId)}"` : ""} onerror="window.tripTapHotelsImageFallback?.(this)"><span class="emoji-cover" hidden>🏨</span>`
        : `<span class="emoji-cover">🏨</span>`;
}

function openHotelDetailDialog(id) {
    const hotel = state.drafts.find((item) => item.id === id);
    if (!hotel) return;
    state.detailDraftId = id;
    $("hotelDetailTitle").textContent = hotel.name || "מלון";
    $("hotelDetailBody").innerHTML = renderHotelDetailBody(hotel);
    $("hotelDetailDialog").showModal();
    hotelsApplyPixabayResolvers($("hotelDetailBody"));
    refreshIcons();
}

function renderHotelDetailBody(hotel) {
    const stars = clampStars(number(hotel.stars) || 3);
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
            ${hotel.imageUrl ? `<img src="${escapeAttr(hotelsGetCachedPixabayUrl(hotel.imagePixabayId) || hotel.imageUrl)}" alt="" referrerpolicy="no-referrer"${hotel.imagePixabayId ? ` data-pixabay-id="${escapeAttr(hotel.imagePixabayId)}"` : ""} onerror="window.tripTapHotelsImageFallback?.(this)"><div class="rec-detail-placeholder" hidden>🏨</div>` : `<div class="rec-detail-placeholder">🏨</div>`}
            <div class="rec-detail-stars"><span class="rec-stars">${"★".repeat(stars)}${"☆".repeat(Math.max(0, 5 - stars))}</span></div>
        </div>
        ${hotel.summary ? `<p class="rec-detail-summary">${escapeHtml(hotel.summary)}</p>` : ""}
        <dl class="rec-detail-grid">${detailRows}</dl>
    `;
}

function detailRow(icon, label, value, isLink = false) {
    const output = isLink
        ? `<a href="${escapeAttr(value)}" target="_blank" rel="noopener noreferrer">${escapeHtml(value)}</a>`
        : escapeHtml(String(value));
    return `<div class="rec-detail-row"><dt><i data-lucide="${icon}" aria-hidden="true"></i>${escapeHtml(label)}</dt><dd>${output}</dd></div>`;
}

function openHotelEditFromDetail() {
    const hotel = state.drafts.find((item) => item.id === state.detailDraftId);
    if (!hotel) return;
    $("hotelDetailDialog").close();
    openHotelEditDialog(hotel);
}

function openHotelImageFromDetail() {
    if (!state.detailDraftId) return;
    $("hotelDetailDialog").close();
    openHotelImageDialog(state.detailDraftId);
}

function deleteHotelFromDetail() {
    if (!state.detailDraftId) return;
    if (!window.confirm("למחוק את המלון?")) return;
    state.drafts = state.drafts.filter((item) => item.id !== state.detailDraftId);
    state.allDrafts = state.allDrafts.filter((item) => item.id !== state.detailDraftId);
    state.detailDraftId = null;
    $("hotelDetailDialog").close();
    renderDrafts();
}

function openHotelImageDialog(id) {
    const hotel = state.drafts.find((item) => item.id === id);
    if (!hotel) return;
    state.imageDraftId = id;
    state.imageSource = "pixabay";
    $("hotelImageDialogTitle").textContent = `בחירת תמונה ל-${hotel.name || "מלון"}`;
    $("hotelImageSearchInput").value = [hotel.name, hotel.address, hotel.destination, hotel.templateDestination, destinationLabel()].filter(Boolean).join(" ");
    $("hotelImageGalleryUrl").value = "";
    $("hotelImageGalleryFile").value = "";
    syncHotelImageSourceButtons();
    toggleHotelImageGallery(false);
    $("hotelImageResults").innerHTML = "";
    $("hotelImageDialog").showModal();
    if ($("hotelImageSearchInput").value.trim()) searchHotelImages($("hotelImageSearchInput").value.trim());
}

function syncHotelImageSourceButtons() {
    $$('[data-hotel-image-source]').forEach((button) => button.classList.toggle("is-active", button.dataset.hotelImageSource === state.imageSource));
}

function switchHotelImageSource(source) {
    state.imageSource = source;
    syncHotelImageSourceButtons();
    if (source === "gallery") {
        toggleHotelImageGallery(true);
        $("hotelImageResults").innerHTML = "";
        return;
    }
    toggleHotelImageGallery(false);
    const query = $("hotelImageSearchInput").value.trim();
    if (query) searchHotelImages(query);
}

function toggleHotelImageGallery(showGallery) {
    $("hotelImageGalleryRow").hidden = !showGallery;
    $("hotelImageSearchRow").hidden = showGallery;
}

async function searchHotelImages(query) {
    if (!query) return;
    $("hotelImageResults").innerHTML = emptyHtml("מחפש תמונות...");
    let images = [];
    try {
        if (state.imageSource === "pixabay") images = await fetchPixabayImages(query);
        else if (state.imageSource === "wikimedia") images = await fetchWikimediaImages(query);
        else if (state.imageSource === "unsplash") images = await fetchUnsplashImages(query);
    } catch (error) {
        $("hotelImageResults").innerHTML = emptyHtml(`חיפוש התמונות נכשל: ${error.message}`);
        refreshIcons();
        return;
    }
    $("hotelImageResults").innerHTML = images.map((image, index) => `
        <button class="image-option" type="button" data-image-index="${index}">
            <img src="${escapeAttr(image.thumb || image.url)}" alt="" onerror="this.hidden=true">
            <span>${escapeHtml(image.credit || image.source)}</span>
        </button>
    `).join("") || emptyHtml("לא נמצאו תמונות במקור הזה.");
    $("hotelImageResults").querySelectorAll("button").forEach((button) => button.addEventListener("click", () => applySelectedHotelImage(images[Number(button.dataset.imageIndex)])));
    refreshIcons();
}

async function applyHotelGalleryImage() {
    const url = text($("hotelImageGalleryUrl").value);
    const file = $("hotelImageGalleryFile").files?.[0];
    if (file) {
        const button = $("useHotelGalleryImageButton");
        if (button) button.disabled = true;
        setStatus("hotelStatus", "שומר תמונה ב-R2...");
        try {
            const hotel = state.drafts.find((item) => item.id === state.imageDraftId);
            const uploadedUrl = await uploadAdminImageFileToR2(state.user, file, {
                folder: HOTEL_R2_FOLDER,
                baseName: hotel?.name || hotel?.templateDestination || "hotel"
            });
            await applySelectedHotelImage({ url: uploadedUrl, source: "R2" });
            setStatus("hotelStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה. לחץ שמור כדי לעדכן את Firestore.");
            $("hotelImageGalleryFile").value = "";
        } catch (error) {
            setStatus("hotelStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        } finally {
            if (button) button.disabled = false;
        }
        return;
    }
    if (url) {
        await applySelectedHotelImage({ url, source: "URL" });
        return;
    }
    setStatus("hotelStatus", "בחר תמונה מהמכשיר או הדבק קישור.", true);
}

async function applySelectedHotelImage(image) {
    if (!image) return;
    const hotel = state.drafts.find((item) => item.id === state.imageDraftId);
    if (!hotel) return;
    setStatus("hotelStatus", "שומר תמונה ב-R2...");
    let imageUrl;
    try {
        imageUrl = await ensureAdminImageUrlOnR2(state.user, image.url, {
            folder: HOTEL_R2_FOLDER,
            baseName: hotel.name || hotel.templateDestination || "hotel"
        });
    } catch (error) {
        setStatus("hotelStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        return;
    }
    hotel.imageUrl = imageUrl;
    hotel.imagePixabayId = null;
    hotel.imagePixabayPageUrl = null;
    if (state.editingDraftId === hotel.id) {
        setEditFieldValue("hotelEditFields", "imageUrl", imageUrl);
    }
    state.imageDraftId = null;
    $("hotelImageDialog").close();
    renderDrafts();
    setStatus("hotelStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה.");
}

function setEditFieldValue(containerId, field, value) {
    const element = document.querySelector(`#${containerId} [data-edit-field="${CSS.escape(field)}"]`);
    if (!element) return;
    if (element.type === "checkbox") element.checked = Boolean(value);
    else element.value = value ?? "";
}

async function autofillHotelImagesFromDestination() {
    const city = destinationLabel();
    if (!city) return;
    const missing = state.drafts.filter((hotel) => !text(hotel.imageUrl));
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
        if (!image?.url) return;
        hotel.imageUrl = image.url;
        hotel.imagePixabayId = hotelsPixabayIdValue(image.pixabayId);
        hotel.imagePixabayPageUrl = image.pageUrl || null;
    });
}

async function autofillHotelCoordinates() {
    const city = destinationLabel();
    for (const hotel of state.drafts) {
        if (hotel.lat != null && hotel.lon != null) continue;
        const queryParts = [hotel.name, hotel.address, city].map(text).filter(Boolean);
        if (!queryParts.length) continue;
        try {
            const results = await searchAddress(queryParts.join(", "));
            const first = results.find((item) => number(item.lat) != null && number(item.lon) != null);
            if (!first) continue;
            hotel.lat = number(first.lat);
            hotel.lon = number(first.lon);
            if (!hotel.address) hotel.address = text(first.display_name);
        } catch (_) { }
    }
}

function destinationLabel() {
    return state.destination?.label || text($("hotelDestinationInput")?.value) || state.drafts.map((hotel) => text(hotel.destination || hotel.templateDestination)).find(Boolean) || "";
}

async function fetchAssetLibraryForDestination(destination) {
    const fs = state.firebase.firestore;
    const snap = await fs.getDoc(fs.doc(state.firebase.db, "trip_templates", assetLibraryIdForDestination(destination)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

function buildAssetLibraryTemplate({ destination, existing, hotels }) {
    const mainDestination = text(destination);
    return {
        assetLibrary: true,
        name: `ספריית TripTap - ${mainDestination}`,
        days: 0,
        mainDestination,
        country: existing?.country || null,
        city: existing?.city || mainDestination,
        keywords: assetLibraryKeywords({ destination: mainDestination, existing: existing?.keywords || [], hotels }),
        category: existing?.category || "urban",
        categories: Array.isArray(existing?.categories) && existing.categories.length ? existing.categories : [existing?.category || "urban"],
        heroImageUrl: existing?.heroImageUrl || null,
        heroPhotographerName: existing?.heroPhotographerName || null,
        heroPhotographerUsername: existing?.heroPhotographerUsername || null,
        description: existing?.description || `ספריית מלונות וקישורי הזמנה עצמאית עבור ${mainDestination}.`,
        schedule: existing?.schedule || [],
        hotels,
        places: existing?.places || [],
        bookingLinks: existing?.bookingLinks || []
    };
}

function mergeHotels(hotels) {
    const byKey = new Map();
    hotels.forEach((hotel) => {
        if (!text(hotel.hotelName || hotel.name)) return;
        const id = text(hotel.id);
        const key = id || [text(hotel.hotelName || hotel.name).toLowerCase(), text(hotel.bookingLink || hotel.bookingUrl).toLowerCase(), text(hotel.address).toLowerCase()].join("|");
        byKey.set(key, hotel);
    });
    return Array.from(byKey.values()).sort((a, b) => text(a.hotelName || a.name).localeCompare(text(b.hotelName || b.name), "he"));
}

function assetLibraryKeywords({ destination, existing, hotels }) {
    const values = new Set([...(existing || []).map((item) => text(item).toLowerCase()), text(destination).toLowerCase(), "triptap", "asset_library", "מלונות"]);
    hotels.forEach((hotel) => {
        [hotel.hotelName || hotel.name, hotel.address, destination].forEach((raw) => {
            const normalized = text(raw).toLowerCase();
            if (!normalized) return;
            values.add(normalized);
            normalized.split(/[\s,.\-/]+/).forEach((token) => {
                if (token.length > 1) values.add(token);
            });
        });
    });
    return Array.from(values).filter(Boolean).sort().slice(0, 80);
}

function assetLibraryIdForDestination(destination) {
    const normalized = text(destination).toLowerCase();
    if (!normalized) return "triptap_assets_general";
    const encoded = btoa(unescape(encodeURIComponent(normalized))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `triptap_assets_${encoded}`;
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
    return {
        label: shortPlaceLabel(item),
        address: text(item.display_name),
        lat: number(item.lat),
        lon: number(item.lon),
        sourceLabel: "OpenStreetMap"
    };
}

function shortPlaceLabel(item) {
    const address = item.address || {};
    return address.city || address.town || address.village || address.state || text(item.display_name).split(",")[0].trim();
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

const HOTELS_PIXABAY_URL_CACHE_KEY = "tripTapHotelsPixabayUrlCache_v1";
const HOTELS_PIXABAY_URL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const hotelsPixabayUrlMemoryCache = new Map();
const hotelsPixabayUrlInflight = new Map();

function hotelsPixabayIdValue(raw) {
    if (raw == null || raw === "") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hotelsReadPixabayCache() {
    try {
        const raw = localStorage.getItem(HOTELS_PIXABAY_URL_CACHE_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { return {}; }
}

function hotelsWritePixabayCache(obj) {
    try { localStorage.setItem(HOTELS_PIXABAY_URL_CACHE_KEY, JSON.stringify(obj)); } catch (_) { }
}

function hotelsGetCachedPixabayUrl(id) {
    const numericId = hotelsPixabayIdValue(id);
    if (!numericId) return "";
    if (hotelsPixabayUrlMemoryCache.has(numericId)) return hotelsPixabayUrlMemoryCache.get(numericId);
    const cache = hotelsReadPixabayCache();
    const entry = cache[String(numericId)];
    if (entry && entry.url && Date.now() - (entry.savedAt || 0) < HOTELS_PIXABAY_URL_CACHE_TTL_MS) {
        hotelsPixabayUrlMemoryCache.set(numericId, entry.url);
        return entry.url;
    }
    return "";
}

function hotelsSetCachedPixabayUrl(id, url) {
    const numericId = hotelsPixabayIdValue(id);
    if (!numericId || !url) return;
    hotelsPixabayUrlMemoryCache.set(numericId, url);
    const cache = hotelsReadPixabayCache();
    cache[String(numericId)] = { url, savedAt: Date.now() };
    hotelsWritePixabayCache(cache);
}

function hotelsClearCachedPixabayUrl(id) {
    const numericId = hotelsPixabayIdValue(id);
    if (!numericId) return;
    hotelsPixabayUrlMemoryCache.delete(numericId);
    const cache = hotelsReadPixabayCache();
    delete cache[String(numericId)];
    hotelsWritePixabayCache(cache);
}

async function hotelsResolvePixabayImageById(id, { force = false } = {}) {
    const numericId = hotelsPixabayIdValue(id);
    if (!numericId) return "";
    if (!force) {
        const cached = hotelsGetCachedPixabayUrl(numericId);
        if (cached) return cached;
    }
    if (hotelsPixabayUrlInflight.has(numericId)) return hotelsPixabayUrlInflight.get(numericId);
    const promise = (async () => {
        try {
            const data = await adminPixabayLookupById(state.user, numericId);
            const hit = data?.hits?.[0];
            const fresh = hit?.largeImageURL || hit?.webformatURL || "";
            if (fresh) hotelsSetCachedPixabayUrl(numericId, fresh);
            return fresh;
        } catch (_) { return ""; }
        finally { hotelsPixabayUrlInflight.delete(numericId); }
    })();
    hotelsPixabayUrlInflight.set(numericId, promise);
    return promise;
}

window.tripTapHotelsImageFallback = async (image) => {
    const pixabayId = hotelsPixabayIdValue(image.dataset.pixabayId);
    if (pixabayId && image.dataset.pixabayRefreshed !== "done") {
        image.dataset.pixabayRefreshed = "done";
        hotelsClearCachedPixabayUrl(pixabayId);
        const fresh = await hotelsResolvePixabayImageById(pixabayId, { force: true });
        if (fresh && fresh !== image.src) {
            image.src = fresh;
            return;
        }
    }
    image.hidden = true;
    image.nextElementSibling?.removeAttribute("hidden");
};

function hotelsApplyPixabayResolvers(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-pixabay-id]').forEach((image) => {
        const id = hotelsPixabayIdValue(image.dataset.pixabayId);
        if (!id || image.dataset.pixabayResolved === "done") return;
        image.dataset.pixabayResolved = "done";
        const cached = hotelsGetCachedPixabayUrl(id);
        if (cached && cached !== image.src) {
            image.src = cached;
            return;
        }
        if (cached) return;
        hotelsResolvePixabayImageById(id).then((fresh) => {
            if (fresh && fresh !== image.src) image.src = fresh;
        }).catch(() => { });
    });
}

function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
}

function setStatus(id, message, isError = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "var(--red)" : "var(--muted)";
}

function cleanJson(raw) {
    return raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function clampStars(value) {
    if (value >= 5) return 5;
    if (value <= 3) return 3;
    return 4;
}

function boolValue(value) {
    if (typeof value === "boolean") return value;
    const normalized = text(value).toLowerCase();
    return normalized === "true" || normalized === "כן" || normalized === "yes";
}

function text(value) {
    return value == null ? "" : String(value).trim();
}

function number(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function nullable(value) {
    const normalized = text(value);
    return normalized || null;
}

function normalize(value) {
    return text(value).toLowerCase().replace(/\s+/g, " ");
}

function truncate(value, max) {
    const normalized = text(value);
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1)}…`;
}

function stripHtml(value) {
    const div = document.createElement("div");
    div.innerHTML = value || "";
    return div.textContent || "";
}

function escapeHtml(value) {
    return text(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
    return escapeHtml(value);
}

function editInput(field, label, value) {
    return `<label class="edit-field"><span>${escapeHtml(label)}</span><input data-edit-field="${escapeAttr(field)}" value="${escapeAttr(value)}" /></label>`;
}

function editTextarea(field, label, value) {
    return `<label class="edit-field full"><span>${escapeHtml(label)}</span><textarea data-edit-field="${escapeAttr(field)}" rows="4">${escapeHtml(value)}</textarea></label>`;
}

function editCheckbox(field, label, checked) {
    return `<label class="edit-field checkbox-field"><input type="checkbox" data-edit-field="${escapeAttr(field)}" ${checked ? "checked" : ""} /><span>${escapeHtml(label)}</span></label>`;
}

function emptyHtml(message) {
    return `<div class="empty-inline">${escapeHtml(message)}</div>`;
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (value) => value * Math.PI / 180;
    const earthKm = 6371;
    const dLat = toRad(Number(lat2) - Number(lat1));
    const dLon = toRad(Number(lon2) - Number(lon1));
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(Number(lat1))) * Math.cos(toRad(Number(lat2))) * Math.sin(dLon / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
