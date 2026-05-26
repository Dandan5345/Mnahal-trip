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

const DUPLICATE_SEARCH_RADIUS_KM = 50;
const BOOKING_LINK_R2_FOLDER = "link_img";

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
    imageDraftId: null,
    imageSource: "pixabay",
    linkDraftId: null,
    linkCandidates: [],
    linkQuery: ""
};

const $ = (id) => document.getElementById(id);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const BOOKINGS_VIEW_CONFIG = {
    compose: {
        title: "הוספת קישור אטרקציה",
        subtitle: "prompt, JSON ושמירה.",
        actions: ""
    },
    manage: {
        title: "קישורי אטרקציות מצב נוכחי",
        subtitle: "חיפוש, עריכה ושמירה.",
        actions: ""
    }
};

function normalizeBookingsView(view) {
    return Object.prototype.hasOwnProperty.call(BOOKINGS_VIEW_CONFIG, view) ? view : "compose";
}

renderPage();

function renderPage() {
    state.view = normalizeBookingsView(resolveAdminView("compose"));
    const viewConfig = BOOKINGS_VIEW_CONFIG[state.view];
    document.getElementById("app").innerHTML = createAdminShell({
        activeKey: "bookings",
        activeSubKey: state.view,
        title: viewConfig.title,
        subtitle: viewConfig.subtitle,
        actions: viewConfig.actions,
        content: `
            ${state.view === "compose" ? renderBookingComposeView() : renderBookingManageView()}

      <dialog class="image-dialog" id="bookingImageDialog">
        <form method="dialog" class="image-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">חיפוש תמונות</p>
              <h2 id="bookingImageDialogTitle">בחירת תמונה</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="action-row image-source-row">
                        <button class="ghost-action small-action" type="button" data-image-source="gallery">גלריה</button>
            <button class="ghost-action small-action" type="button" data-image-source="pixabay">Pixabay</button>
                        <button class="ghost-action small-action" type="button" data-image-source="wikimedia">Wikipedia</button>
                        <button class="ghost-action small-action" type="button" data-image-source="unsplash">Unsplash</button>
          </div>
                    <div class="image-search-row" id="bookingImageSearchRow">
            <input id="bookingImageSearchInput" class="plain-input" type="text" placeholder="חיפוש תמונה" />
            <button class="primary-action" type="button" id="runBookingImageSearchButton"><i data-lucide="search"></i><span>חפש</span></button>
          </div>
                    <div class="image-search-row" id="bookingImageGalleryRow" hidden>
                        <input id="bookingImageGalleryFile" type="file" accept="image/*" class="plain-input" />
                        <input id="bookingImageGalleryUrl" class="plain-input" type="url" placeholder="או הדבק קישור תמונה" />
                        <button class="primary-action" type="button" id="useBookingImageGalleryButton"><i data-lucide="check"></i><span>השתמש בתמונה</span></button>
                    </div>
          <div class="image-results" id="bookingImageResults"></div>
        </form>
      </dialog>

      <dialog class="image-dialog" id="linkPlaceDialog">
        <form method="dialog" class="image-dialog-shell">
          <div class="dialog-header">
            <div>
              <p class="eyebrow">קישור למקום שמור</p>
              <h2>בחר מקום מתוך TripInspo</h2>
            </div>
            <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
          </div>
          <div class="image-search-row">
            <input id="linkPlaceSearchInput" class="plain-input" type="text" placeholder="סנן לפי שם מקום" />
          </div>
          <div class="link-place-results" id="linkPlaceResults"></div>
        </form>
      </dialog>

            <dialog class="image-dialog edit-dialog" id="bookingEditDialog">
                <form method="dialog" class="image-dialog-shell edit-dialog-shell">
                    <div class="dialog-header">
                        <div>
                            <p class="eyebrow">עריכת קישור</p>
                            <h2 id="bookingEditDialogTitle">קישור הזמנה</h2>
                        </div>
                        <button class="icon-button" value="cancel" aria-label="סגור"><i data-lucide="x"></i></button>
                    </div>
                    <div class="edit-form-grid" id="bookingEditFields"></div>
                    <div class="action-row split-actions">
                        <button class="primary-action" value="save" type="submit"><i data-lucide="save"></i><span>שמור וסגור</span></button>
                        <button class="ghost-action" type="button" id="bookingEditPickImageButton"><i data-lucide="image"></i><span>בחר תמונה</span></button>
                        <button class="ghost-action danger-lite" type="button" id="deleteBookingFromDialogButton"><i data-lucide="trash-2"></i><span>מחק</span></button>
                    </div>
                </form>
            </dialog>
    `
    });

    attachSharedUi({
        activeKey: "bookings",
        requireAuth: true,
        onAuthed: (user, firebase) => {
            state.user = user;
            state.firebase = firebase;
            init();
        }
    });
}

function renderBookingComposeView() {
    return `
            <div class="workspace-grid booking-workspace">
                <article class="panel booking-panel-main">
                    <div class="panel-heading">
                        <span class="panel-icon coral"><i data-lucide="ticket" aria-hidden="true"></i></span>
                        <div>
                            <h2>קלט AI לקישורי הזמנה</h2>
                            <p>אותו prompt של מצב מתכנת.</p>
                        </div>
                    </div>

                    <div class="micro-note">הדבק קישורים, העתק prompt, פענח JSON.</div>

                    <div class="field-block">
                        <label for="bookingLinksInput">קישורי אטרקציות</label>
                        <textarea id="bookingLinksInput" class="json-input booking-links-input" spellcheck="false" placeholder="הדבק כאן קישורי אטרקציות, כל קישור בשורה נפרדת"></textarea>
                    </div>

                    <div class="action-row">
                        <button class="primary-action" type="button" id="copyBookingPromptButton">
                            <i data-lucide="copy" aria-hidden="true"></i>
                            <span>העתק פרומפט AI לקישורים</span>
                        </button>
                    </div>

                    <div class="field-block">
                        <label for="bookingDestinationInput">יעד</label>
                        <div class="search-input-row">
                              <i data-lucide="building-2" aria-hidden="true"></i>
                            <input id="bookingDestinationInput" type="text" placeholder="יעד לשמירה אם ה-AI לא זיהה לבד" />
                        </div>
                        <div class="suggestions" id="bookingDestinationSuggestions"></div>
                    </div>

                    <div class="selected-place" id="selectedBookingDestination">
                        <i data-lucide="map" aria-hidden="true"></i>
                        <span>בחר יעד מהרשימה.</span>
                    </div>
                </article>

                <article class="panel booking-panel-json">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="braces" aria-hidden="true"></i></span>
                        <div>
                            <h2>JSON סופי</h2>
                            <p>מחפש bookingLinks, attractions או items.</p>
                        </div>
                    </div>

                    <div class="schema-strip" aria-label="שדות JSON">
                        <span>placeTitle</span>
                        <span>provider</span>
                        <span>title</span>
                        <span>summary</span>
                        <span>priceRange</span>
                        <span>bookingUrl</span>
                        <span>destination</span>
                    </div>

                    <div class="action-row split-actions booking-json-actions">
                        <button class="ghost-action" type="button" id="pasteBookingJsonButton">
                            <i data-lucide="clipboard-paste" aria-hidden="true"></i>
                            <span>הדבק JSON</span>
                        </button>
                        <button class="primary-action" type="button" id="parseBookingJsonButton">
                            <i data-lucide="braces" aria-hidden="true"></i>
                            <span>פענח</span>
                        </button>
                    </div>

                    <textarea id="bookingJsonInput" class="json-input" spellcheck="false" placeholder='JSON סופי מה-AI עם bookingLinks'></textarea>
                    <p class="status-line" id="bookingStatus"></p>
                </article>
            </div>

            <section class="result-section">
                <div class="section-heading compact">
                    <div>
                        <p class="eyebrow">טיוטות</p>
                        <h2>עריכה ושמירה</h2>
                    </div>
                    <div class="action-row tight">
                        <span class="count-pill" id="bookingDraftCountPill">0 קישורים</span>
                        <button class="primary-action" type="button" id="saveBookingDraftsButton">
                            <i data-lucide="save" aria-hidden="true"></i>
                            <span>שמור קישורי הזמנה</span>
                        </button>
                    </div>
                </div>
                <div class="booking-drafts recommendation-cards" id="bookingDraftCards"></div>
            </section>
        `;
}

function renderBookingManageView() {
    return `
            <div class="workspace-grid booking-manager-grid single-search-grid">
                <article class="panel wide-panel">
                    <div class="panel-heading">
                        <span class="panel-icon violet"><i data-lucide="search" aria-hidden="true"></i></span>
                        <div>
                            <h2>חיפוש קישורי הזמנה</h2>
                            <p>שם, יעד, כתובת או ספק.</p>
                        </div>
                    </div>

                    <div class="micro-note">בחירת יעד מההשלמה תציג קישורים בטווח 50 ק״מ.</div>

                    <div class="field-block">
                        <label for="bookingManagerSearchInput">חיפוש</label>
                        <div class="search-input-row">
                            <i data-lucide="search" aria-hidden="true"></i>
                            <input id="bookingManagerSearchInput" type="text" placeholder="כתוב שם כרטיסיה, יעד, כתובת או Vienna" autocomplete="off" />
                        </div>
                        <div class="suggestions" id="bookingManagerSuggestions"></div>
                    </div>

                    <div class="selected-place" id="selectedBookingDestination">
                        <i data-lucide="map" aria-hidden="true"></i>
                        <span>כל הקישורים נטענים אוטומטית. בחירת יעד מפעילה סינון רדיוס.</span>
                    </div>

                    <p class="status-line" id="bookingStatus"></p>
                </article>
            </div>

            <section class="result-section">
                <div class="section-heading compact">
                    <div>
                        <p class="eyebrow">קישורים שמורים</p>
                        <h2>עריכה, מחיקה ושמירה</h2>
                    </div>
                    <div class="action-row tight">
                        <span class="count-pill" id="bookingDraftCountPill">0 קישורים</span>
                        <button class="primary-action" type="button" id="saveBookingDraftsButton">
                            <i data-lucide="save" aria-hidden="true"></i>
                            <span>שמור עדכונים</span>
                        </button>
                    </div>
                </div>
                <div class="booking-drafts recommendation-cards" id="bookingDraftCards"></div>
            </section>
        `;
}

function init() {
    bindDestinationSearch();
    bindActions();
    if (state.view === "manage") loadAllSavedBookings();
    renderDrafts();
    refreshIcons();
}

function bindActions() {
    $("copyBookingPromptButton")?.addEventListener("click", copyBookingPrompt);
    $("pasteBookingJsonButton")?.addEventListener("click", pasteBookingJson);
    $("parseBookingJsonButton")?.addEventListener("click", parseBookingJson);
    $("saveBookingDraftsButton")?.addEventListener("click", saveBookingDrafts);
    $("loadSavedBookingsButton")?.addEventListener("click", loadSavedBookings);
    $("bookingManagerSearchInput")?.addEventListener("input", (event) => {
        state.manageSearch = event.target.value;
        state.destination = null;
        updateManageSearchSuggestions(event.target.value);
        renderDrafts();
    });
    $("bookingEditDialog")?.querySelector("form")?.addEventListener("submit", () => {
        state.editingDraftId = null;
        renderDrafts();
    });
    $("deleteBookingFromDialogButton")?.addEventListener("click", () => {
        if (!state.editingDraftId) return;
        state.drafts = state.drafts.filter((item) => item.id !== state.editingDraftId);
        state.allDrafts = state.allDrafts.filter((item) => item.id !== state.editingDraftId);
        $("bookingEditDialog").close();
        state.editingDraftId = null;
        renderDrafts();
    });
    $("bookingEditPickImageButton")?.addEventListener("click", () => {
        if (state.editingDraftId) openImageDialog(state.editingDraftId, "pixabay");
    });
    $("runBookingImageSearchButton").addEventListener("click", () => searchRemoteImages($("bookingImageSearchInput").value.trim()));
    $("bookingImageSearchInput").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            searchRemoteImages($("bookingImageSearchInput").value.trim());
        }
    });
    $$('[data-image-source]').forEach((button) => button.addEventListener("click", () => {
        state.imageSource = button.dataset.imageSource;
        syncBookingImageSourceButtons();
        if (state.imageSource === "gallery") {
            toggleBookingImageGallery(true);
            $("bookingImageResults").innerHTML = "";
            return;
        }
        toggleBookingImageGallery(false);
        searchRemoteImages($("bookingImageSearchInput").value.trim());
    }));
    $("useBookingImageGalleryButton")?.addEventListener("click", applyBookingGalleryImage);
    $("linkPlaceSearchInput").addEventListener("input", (event) => {
        state.linkQuery = event.target.value;
        renderLinkCandidates();
    });
}

function bindDestinationSearch() {
    const input = $("bookingDestinationInput");
    if (!input) return;
    const suggestions = $("bookingDestinationSuggestions");
    const selected = $("selectedBookingDestination");
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
    const suggestions = $("bookingManagerSuggestions");
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
            $("bookingManagerSearchInput").value = state.destination.label;
            $("selectedBookingDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
            suggestions.innerHTML = "";
            renderDrafts();
        }));
        refreshIcons();
    }, 240);
}

async function copyBookingPrompt() {
    const links = splitLinks($("bookingLinksInput").value);
    if (!links.length) {
        setStatus("bookingStatus", "הדבק קודם קישורים לאטרקציות.", true);
        return;
    }
    await navigator.clipboard.writeText(buildStandaloneBookingPrompt(links));
    setStatus("bookingStatus", "פרומפט קישורי ההזמנה הועתק ללוח.");
}

function buildStandaloneBookingPrompt(links) {
    const formattedLinks = links.map((link) => `- ${link}`).join("\n");
    return `
אתה עוזר לי להכין כרטיסיות אטרקציות להזמנה לעמוד האטרקציות של TripTap.

אני אשלח לך קישורים לאטרקציות. תיכנס לקישורים, תבין מה האטרקציה, ואז תבנה JSON מסודר. חשוב: החזר תמיד את אותו קישור שקיבלת, כי אלה קישורי שותפים שלי.

הקישורים:
${formattedLinks}

לכל קישור החזר:
1. שם האטרקציה באנגלית, ובעברית בסוגריים אם מתאים.
2. פירוט משכנע וברור על ההזמנה: מה זה נותן, למה שווה להזמין מראש ומה החוויה כוללת.
3. טווח מחירים.
4. אותו קישור בדיוק שקיבלת ממני.
5. יעד וקואורדינטות של מרכז היעד/העיר של האטרקציה, למשל מרכז וינה.

אם חסר מידע, שאל אותי לפני התשובה הסופית. בסוף החזר אך ורק JSON תקין בלי markdown:
{
  "bookingLinks": [
    {
      "placeTitle": "Prater Park (פארק פראטר)",
      "provider": "GetYourGuide / Tiqets / Official / אחר",
      "title": "שם ההצעה להזמנה",
      "summary": "פירוט משכנע וברור למה להזמין ומה זה נותן",
      "priceRange": "טווח מחירים",
      "bookingUrl": "אותו קישור ששלחתי",
      "destination": "Vienna",
      "lat": 48.2082,
      "lon": 16.3738
    }
  ]
}`.trim();
}

async function pasteBookingJson() {
    const raw = await navigator.clipboard.readText();
    if (!raw.trim()) return;
    $("bookingJsonInput").value = raw;
    await parseBookingJson();
}

async function parseBookingJson() {
    try {
        const decoded = JSON.parse(cleanJson($("bookingJsonInput").value));
        const rawLinks = Array.isArray(decoded)
            ? decoded
            : decoded?.bookingLinks ?? decoded?.attractions ?? decoded?.items;
        if (!Array.isArray(rawLinks) || !rawLinks.length) {
            throw new Error("חסר מערך bookingLinks.");
        }
        const drafts = rawLinks
            .filter((item) => item && typeof item === "object")
            .map((item) => {
                const title = jsonString(item, ["title", "offerTitle"]);
                const placeTitle = jsonString(item, ["placeTitle", "name"]);
                return {
                    id: item.id || crypto.randomUUID(),
                    placeTitle: placeTitle || title,
                    provider: jsonString(item, ["provider"]),
                    title: title || placeTitle,
                    summary: jsonString(item, ["summary", "description", "whyBookHere"]),
                    priceRange: jsonString(item, ["priceRange", "price"]),
                    bookingUrl: jsonString(item, ["bookingUrl", "url"]),
                    destination: jsonString(item, ["destination", "city"]),
                    lat: jsonDouble(item, ["lat", "latitude"]),
                    lon: jsonDouble(item, ["lon", "lng", "longitude"]),
                    imageUrl: jsonString(item, ["imageUrl"]),
                    imageCredit: jsonString(item, ["imageCredit"]),
                    imageCreditUrl: jsonString(item, ["imageCreditUrl"]),
                    imagePixabayId: bookingsPixabayIdValue(item.imagePixabayId ?? item.pixabayId),
                    imagePixabayPageUrl: jsonString(item, ["imagePixabayPageUrl", "pixabayPageUrl"]),
                    address: jsonString(item, ["address", "location"]),
                    linkedPublicPlace: null,
                    linkedTemplatePlace: null,
                    savedPlaceId: jsonString(item, ["placeId"])
                };
            })
            .filter((draft) => draft.placeTitle.trim() && draft.bookingUrl.trim());
        if (!drafts.length) throw new Error("לא נמצאו קישורים תקינים.");
        state.loadedTemplate = null;
        state.drafts = drafts;
        await autoSelectDestinationFromDrafts();
        await hydrateDraftsFromSavedPlaces();
        renderDrafts();
        const linkedCount = state.drafts.filter((draft) => draft.linkedPublicPlace || draft.linkedTemplatePlace).length;
        const imageCount = state.drafts.filter((draft) => text(draft.imageUrl)).length;
        setStatus("bookingStatus", `נוצרו ${drafts.length} כרטיסיות. שויכו ${linkedCount} למקום שמור ול-${imageCount} כבר יש תמונה.`);
    } catch (error) {
        setStatus("bookingStatus", `שגיאה בפענוח קישורי הזמנה: ${error.message}`, true);
    }
}

async function autoSelectDestinationFromDrafts() {
    if (state.destination || !state.drafts.length) return;
    const destination = state.drafts.map((draft) => draft.destination.trim()).find(Boolean) || "";
    if (destination) {
        $("bookingDestinationInput").value = destination;
        const results = await searchAddress(destination);
        if (results.length) {
            state.destination = normalizeDestination(results[0]);
            $("selectedBookingDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
            refreshIcons();
            return;
        }
    }
    const coordsDraft = state.drafts.find((draft) => draft.lat != null && draft.lon != null);
    if (coordsDraft) {
        state.destination = {
            label: destination || coordsDraft.placeTitle,
            address: destination || coordsDraft.placeTitle,
            lat: coordsDraft.lat,
            lon: coordsDraft.lon,
            sourceLabel: "OpenStreetMap"
        };
        $("bookingDestinationInput").value = state.destination.label;
        $("selectedBookingDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
        refreshIcons();
    }
}

async function loadSavedBookings() {
    const destination = (state.destination?.label || $("bookingDestinationInput").value.trim()).trim();
    if (!destination) {
        setStatus("bookingStatus", "בחר יעד לפני פתיחת מנהל האטרקציות.", true);
        return;
    }
    setStatus("bookingStatus", `טוען אטרקציות שמורות עבור ${destination}...`);
    try {
        const template = await fetchAssetLibraryForDestination(destination);
        if (!template || !Array.isArray(template.bookingLinks) || !template.bookingLinks.length) {
            setStatus("bookingStatus", `לא נמצאו אטרקציות שמורות עבור ${destination}.`, true);
            return;
        }
        const placesById = new Map((template.places || []).map((place) => [text(place.id), place]));
        state.loadedTemplate = template;
        state.drafts = template.bookingLinks.map((booking) => standaloneBookingDraftFromTemplateLink(booking, placesById.get(text(booking.placeId))));
        renderDrafts();
        setStatus("bookingStatus", `נטענו ${state.drafts.length} אטרקציות שמורות עבור ${destination}.`);
    } catch (error) {
        setStatus("bookingStatus", `פתיחת מנהל האטרקציות נכשלה: ${error.message}`, true);
    }
}

async function hydrateDraftsFromSavedPlaces() {
    if (!state.drafts.length || !state.firebase) return;
    await ensureDestinationSelectedFromInput();
    await autoSelectDestinationFromDrafts();

    const templateDestination = (state.destination?.label
        || $("bookingDestinationInput").value.trim()
        || state.drafts.map((draft) => draft.destination.trim()).find(Boolean)
        || "").trim();

    const [template, publicPlaces] = await Promise.all([
        templateDestination ? fetchAssetLibraryForDestination(templateDestination).catch(() => null) : Promise.resolve(null),
        loadNearbyPublicPlacesForDraftMatching().catch(() => [])
    ]);

    const candidates = [
        ...(Array.isArray(template?.places) ? template.places.map(normalizeTemplatePlaceCandidate) : []),
        ...publicPlaces.map(normalizePublicPlaceCandidate)
    ];

    if (!candidates.length) return;

    state.drafts = state.drafts.map((draft) => {
        const matched = findBestSavedPlaceForDraft(draft, candidates);
        if (!matched) return draft;

        const nextDraft = {
            ...draft,
            savedPlaceId: text(draft.savedPlaceId) || text(matched.id)
        };

        if (matched.source === "public") nextDraft.linkedPublicPlace = matched.raw;
        if (matched.source === "template") nextDraft.linkedTemplatePlace = matched.raw;
        if (!text(nextDraft.imageUrl)) nextDraft.imageUrl = text(matched.coverImageUrl);
        if (!text(nextDraft.imageCredit)) nextDraft.imageCredit = text(matched.coverPhotographerName);
        if (!text(nextDraft.imageCreditUrl)) nextDraft.imageCreditUrl = text(matched.coverPhotographerUsername) || null;
        if (!text(nextDraft.placeTitle)) nextDraft.placeTitle = text(matched.name) || nextDraft.title;
        if (!text(nextDraft.destination)) nextDraft.destination = text(matched.destination);
        if (!text(nextDraft.address)) nextDraft.address = text(matched.location);
        if (nextDraft.lat == null) nextDraft.lat = number(matched.lat);
        if (nextDraft.lon == null) nextDraft.lon = number(matched.lon);
        return nextDraft;
    });
}

async function loadAllSavedBookings() {
    if (!state.firebase) return;
    setStatus("bookingStatus", "טוען את כל קישורי ההזמנה...");
    try {
        const fs = state.firebase.firestore;
        const snap = await fs.getDocs(fs.collection(state.firebase.db, "trip_templates"));
        const templates = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        state.allTemplates = templates;
        state.allDrafts = templates.flatMap((template) => {
            const placesById = new Map((template.places || []).map((place) => [text(place.id), place]));
            return (template.bookingLinks || []).map((booking) => ({
                ...standaloneBookingDraftFromTemplateLink(booking, placesById.get(text(booking.placeId))),
                templateId: template.id,
                templateDestination: text(template.mainDestination || template.city || booking.destination),
                templateName: text(template.name)
            }));
        });
        state.drafts = [...state.allDrafts];
        renderDrafts();
        setStatus("bookingStatus", `נטענו ${state.drafts.length} קישורי הזמנה מכל האפליקציה.`);
    } catch (error) {
        setStatus("bookingStatus", `טעינת כל הקישורים נכשלה: ${error.message}`, true);
    }
}

function renderDrafts() {
    const visibleDrafts = filteredBookingDrafts();
    $("bookingDraftCountPill").textContent = state.view === "manage"
        ? `${visibleDrafts.length}/${state.drafts.length} קישורים`
        : `${state.drafts.length} קישורים`;
    $("bookingDraftCards").innerHTML = visibleDrafts.map(renderDraftCard).join("") || emptyHtml(state.view === "manage"
        ? "אין קישורים להצגה עבור החיפוש הנוכחי."
        : "אין עדיין טיוטות. הדבק קישורים והתחל לעבוד.");
    $$('[data-booking-draft-id]').forEach((card) => {
        const id = card.dataset.bookingDraftId;
        card.querySelectorAll('[data-field]').forEach((field) => field.addEventListener('input', () => updateDraftField(id, field.dataset.field, field.value)));
        card.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => handleDraftAction(id, button.dataset.action)));
    });
    bookingsApplyPixabayResolvers($("bookingDraftCards"));
    refreshIcons();
}

function filteredBookingDrafts() {
    const query = normalize(state.manageSearch);
    if (!query || state.view !== "manage") return state.drafts;
    if (state.destination?.lat != null && state.destination?.lon != null) {
        return state.drafts.filter((draft) => draft.lat != null && draft.lon != null && distanceKm(state.destination.lat, state.destination.lon, draft.lat, draft.lon) <= DUPLICATE_SEARCH_RADIUS_KM);
    }
    return state.drafts.filter((draft) => [draft.placeTitle, draft.title, draft.destination, draft.address, draft.provider]
        .map(normalize)
        .some((value) => value.includes(query)));
}

function bookingImageMarkup(draft) {
    const cached = bookingsGetCachedPixabayUrl(draft.imagePixabayId);
    const src = cached || draft.imageUrl;
    return src
        ? `<img src="${escapeAttr(src)}" alt="" loading="lazy" referrerpolicy="no-referrer"${draft.imagePixabayId ? ` data-pixabay-id="${escapeAttr(draft.imagePixabayId)}"` : ""} onerror="window.tripTapBookingsImageFallback?.(this)"><span class="emoji-cover" hidden>🎟️</span>`
        : `<span class="emoji-cover">🎟️</span>`;
}

function renderDraftCard(draft) {
    const chips = [
        draft.priceRange ? `<span class="rec-chip"><i data-lucide="tag" aria-hidden="true"></i>${escapeHtml(draft.priceRange)}</span>` : "",
        draft.provider ? `<span class="rec-chip"><i data-lucide="briefcase" aria-hidden="true"></i>${escapeHtml(draft.provider)}</span>` : "",
        (draft.linkedPublicPlace || draft.savedPlaceId) ? `<span class="rec-chip rec-chip-positive"><i data-lucide="link" aria-hidden="true"></i>${escapeHtml(draft.linkedPublicPlace?.name || shortId(draft.savedPlaceId) || "מקושר")}</span>` : ""
    ].filter(Boolean).join("");
    return `<article class="rec-card booking-rec-card" data-booking-draft-id="${escapeAttr(draft.id)}">
                        <div class="rec-card-image">
                                ${bookingImageMarkup(draft)}
                        </div>
                        <div class="rec-card-body">
                                <div class="rec-card-heading">
                                        <h3>${escapeHtml(draft.placeTitle || draft.title || "קישור הזמנה")}</h3>
                                        ${draft.title && draft.placeTitle && draft.title !== draft.placeTitle ? `<p class="rec-card-sub">${escapeHtml(draft.title)}</p>` : ""}
                                        ${(draft.address || draft.destination || draft.templateDestination) ? `<p class="rec-card-sub"><i data-lucide="map-pin" aria-hidden="true"></i>${escapeHtml(draft.address || draft.destination || draft.templateDestination)}</p>` : ""}
                                </div>
                                ${draft.summary ? `<p class="rec-card-summary">${escapeHtml(truncate(draft.summary, 160))}</p>` : ""}
                                ${chips ? `<div class="rec-card-chips">${chips}</div>` : ""}
                                <div class="rec-card-actions">
                                        <button class="ghost-action small-action" type="button" data-action="image"><i data-lucide="image"></i><span>תמונה</span></button>
                                        <button class="ghost-action small-action" type="button" data-action="edit"><i data-lucide="square-pen"></i><span>עריכה</span></button>
                                        <button class="ghost-action small-action" type="button" data-action="link-place"><i data-lucide="link"></i><span>קשר למקום</span></button>
                                        <button class="ghost-action small-action danger-lite" type="button" data-action="remove"><i data-lucide="trash-2"></i><span>מחק</span></button>
                                </div>
                        </div>
        </article>`;
}

function updateDraftField(id, field, value) {
    const draft = state.drafts.find((item) => item.id === id);
    if (!draft) return;
    draft[field] = ["lat", "lon"].includes(field) ? number(value) : value;
}

function setEditFieldValue(containerId, field, value) {
    const element = document.querySelector(`#${containerId} [data-edit-field="${CSS.escape(field)}"]`);
    if (!element) return;
    element.value = value ?? "";
}

async function handleDraftAction(id, action) {
    const draft = state.drafts.find((item) => item.id === id);
    if (!draft) return;
    if (action === "edit") {
        openBookingEditDialog(draft);
        return;
    }
    if (action === "remove") {
        state.drafts = state.drafts.filter((item) => item.id !== id);
        renderDrafts();
        return;
    }
    if (action === "image") {
        openImageDialog(id, "pixabay");
        return;
    }
    if (action === "pixabay" || action === "wikimedia") {
        openImageDialog(id, action === "pixabay" ? "pixabay" : "wikimedia");
        return;
    }
    if (action === "link-place") {
        await openLinkPlaceDialog(draft);
    }
}

function openBookingEditDialog(draft) {
    state.editingDraftId = draft.id;
    $("bookingEditDialogTitle").textContent = draft.placeTitle || draft.title || "קישור הזמנה";
    $("bookingEditFields").innerHTML = `
      ${editInput("placeTitle", "שם כרטיסיה", draft.placeTitle)}
      ${editInput("provider", "ספק", draft.provider)}
      ${editInput("title", "שם ההצעה", draft.title)}
      ${editTextarea("summary", "פירוט", draft.summary)}
      ${editInput("priceRange", "טווח מחירים", draft.priceRange)}
      ${editInput("destination", "יעד", draft.destination)}
    ${editInput("address", "כתובת", draft.address || "")}
      ${editInput("bookingUrl", "קישור הזמנה", draft.bookingUrl)}
      ${editInput("lat", "Latitude", draft.lat ?? "")}
      ${editInput("lon", "Longitude", draft.lon ?? "")}
      ${editInput("imageUrl", "תמונה", draft.imageUrl)}
      ${editInput("imageCredit", "קרדיט תמונה", draft.imageCredit)}
      ${editInput("imageCreditUrl", "קישור קרדיט", draft.imageCreditUrl)}
    `;
    $("bookingEditFields").querySelectorAll("[data-edit-field]").forEach((field) => {
        field.addEventListener("input", () => updateDraftField(draft.id, field.dataset.editField, field.value));
    });
    $("bookingEditDialog").showModal();
}

function openImageDialog(draftId, source) {
    state.imageDraftId = draftId;
    state.imageSource = source;
    const draft = state.drafts.find((item) => item.id === draftId);
    $("bookingImageDialogTitle").textContent = `בחירת תמונה ל-${draft?.placeTitle || "אטרקציה"}`;
    $("bookingImageSearchInput").value = [draft?.placeTitle, draft?.title, draft?.address, draft?.destination, state.destination?.label].filter(Boolean).join(" ");
    $("bookingImageGalleryUrl").value = "";
    $("bookingImageGalleryFile").value = "";
    syncBookingImageSourceButtons();
    toggleBookingImageGallery(false);
    $("bookingImageResults").innerHTML = "";
    $("bookingImageDialog").showModal();
    searchRemoteImages($("bookingImageSearchInput").value.trim());
}

function syncBookingImageSourceButtons() {
    $$('[data-image-source]').forEach((item) => item.classList.toggle("is-active", item.dataset.imageSource === state.imageSource));
}

function toggleBookingImageGallery(showGallery) {
    $("bookingImageGalleryRow").hidden = !showGallery;
    $("bookingImageSearchRow").hidden = showGallery;
}

async function searchRemoteImages(query) {
    if (!query) return;
    $("bookingImageResults").innerHTML = emptyHtml("מחפש תמונות...");
    const results = state.imageSource === "pixabay"
        ? await fetchPixabayImages(query)
        : state.imageSource === "wikimedia"
            ? await fetchWikimediaImages(query)
            : state.imageSource === "unsplash"
                ? await fetchUnsplashImages(query)
                : [];
    $("bookingImageResults").innerHTML = results.map((image, index) => `
      <button class="image-option" type="button" data-image-index="${index}">
        <img src="${escapeAttr(image.thumb || image.url)}" alt="">
        <span>${escapeHtml(image.credit || image.source)}</span>
      </button>
    `).join("") || emptyHtml("לא נמצאו תמונות.");
    $("bookingImageResults").querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
        await applySelectedBookingImage(results[Number(button.dataset.imageIndex)]);
    }));
}

async function persistSingleBookingDraft(draft) {
    if (!state.firebase || !draft?.templateId) return;
    const fs = state.firebase.firestore;
    setStatus("bookingStatus", `שומר תמונה ל-${draft.placeTitle || "האטרקציה"} ב-R2...`);
    try {
        await ensureBookingDraftImagesOnR2([draft]);
        setStatus("bookingStatus", `שומר תמונה ל-${draft.placeTitle || "האטרקציה"}...`);
        const templateRef = fs.doc(state.firebase.db, "trip_templates", draft.templateId);
        const snap = await fs.getDoc(templateRef);
        if (!snap.exists()) throw new Error("לא נמצאה התבנית המקורית.");
        const data = snap.data() || {};
        const existingLinks = Array.isArray(data.bookingLinks) ? data.bookingLinks : [];
        const existingPlaces = Array.isArray(data.places) ? data.places : [];
        const fallbackDestination = text(draft.destination) || text(data.mainDestination) || text(data.city) || "";
        const matchingPlace = existingPlaces.find((place) => text(place.id) === text(draft.savedPlaceId)) || null;
        const matchingLinkIndex = existingLinks.findIndex((link) => text(link.id) === text(draft.id));
        const placeId = text(draft.savedPlaceId)
            || text(matchingLinkIndex >= 0 ? existingLinks[matchingLinkIndex].placeId : "")
            || matchingPlace?.id
            || `booking_place_${draft.id}`;
        const updatedLink = bookingDraftToTemplateBookingLink(draft, fallbackDestination, placeId);
        const nextLinks = [...existingLinks];
        if (matchingLinkIndex >= 0) nextLinks[matchingLinkIndex] = { ...nextLinks[matchingLinkIndex], ...updatedLink };
        else nextLinks.push(updatedLink);
        const payload = { bookingLinks: nextLinks };
        if (matchingPlace) {
            const updatedPlace = {
                ...matchingPlace,
                coverImageUrl: text(draft.imageUrl) || matchingPlace.coverImageUrl || null,
                coverPhotographerName: text(draft.imageCredit) || matchingPlace.coverPhotographerName || null,
                coverPhotographerUsername: text(draft.imageCreditUrl) || matchingPlace.coverPhotographerUsername || null,
                pixabayId: bookingsPixabayIdValue(draft.imagePixabayId) ?? matchingPlace.pixabayId ?? null,
                pixabayPageUrl: text(draft.imagePixabayPageUrl) || matchingPlace.pixabayPageUrl || null
            };
            payload.places = existingPlaces.map((place) => text(place.id) === text(matchingPlace.id) ? updatedPlace : place);
        }
        await fs.setDoc(templateRef, payload, { merge: true });
        const allDraftIndex = state.allDrafts.findIndex((item) => item.id === draft.id);
        if (allDraftIndex >= 0) Object.assign(state.allDrafts[allDraftIndex], draft);
        setStatus("bookingStatus", `התמונה ל-${draft.placeTitle || "האטרקציה"} נשמרה.`);
    } catch (error) {
        setStatus("bookingStatus", `שמירת התמונה נכשלה: ${error.message}`, true);
    }
}

async function applyBookingGalleryImage() {
    const url = text($("bookingImageGalleryUrl").value);
    const file = $("bookingImageGalleryFile").files?.[0];
    if (file) {
        const button = $("useBookingImageGalleryButton");
        if (button) button.disabled = true;
        setStatus("bookingStatus", "שומר תמונה ב-R2...");
        try {
            const draft = state.drafts.find((item) => item.id === state.imageDraftId);
            const uploadedUrl = await uploadAdminImageFileToR2(state.user, file, {
                folder: BOOKING_LINK_R2_FOLDER,
                baseName: draft?.placeTitle || draft?.title || draft?.destination || "booking-link"
            });
            await applySelectedBookingImage({ url: uploadedUrl, credit: "תמונה שהועלתה מהגלריה", source: "R2" });
            setStatus("bookingStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה. לחץ שמור כדי לעדכן את Firestore.");
            $("bookingImageGalleryFile").value = "";
        } catch (error) {
            setStatus("bookingStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        } finally {
            if (button) button.disabled = false;
        }
        return;
    }
    if (url) {
        await applySelectedBookingImage({ url, credit: "מהמשתמש", source: "URL" });
        return;
    }
    setStatus("bookingStatus", "בחר תמונה מהמכשיר או הדבק קישור.", true);
}

async function applySelectedBookingImage(image) {
    const draft = state.drafts.find((item) => item.id === state.imageDraftId);
    if (!draft || !image?.url) return;
    setStatus("bookingStatus", "שומר תמונה ב-R2...");
    let imageUrl;
    try {
        imageUrl = await ensureAdminImageUrlOnR2(state.user, image.url, {
            folder: BOOKING_LINK_R2_FOLDER,
            baseName: draft.placeTitle || draft.title || draft.destination || "booking-link"
        });
    } catch (error) {
        setStatus("bookingStatus", `שמירת התמונה ב-R2 נכשלה: ${error.message}`, true);
        return;
    }
    draft.imageUrl = imageUrl;
    draft.imageCredit = image.credit || image.source || "";
    draft.imageCreditUrl = image.pageUrl || null;
    draft.imagePixabayId = null;
    draft.imagePixabayPageUrl = null;
    if (state.editingDraftId === draft.id) {
        setEditFieldValue("bookingEditFields", "imageUrl", draft.imageUrl);
        setEditFieldValue("bookingEditFields", "imageCredit", draft.imageCredit);
        setEditFieldValue("bookingEditFields", "imageCreditUrl", draft.imageCreditUrl || "");
    }
    $("bookingImageDialog").close();
    renderDrafts();
    if (state.view === "manage" && draft.templateId) {
        await persistSingleBookingDraft(draft);
    }
    setStatus("bookingStatus", "התמונה נשמרה ב-R2 ונשמרה בטיוטה.");
}

async function openLinkPlaceDialog(draft) {
    await ensureDestinationSelectedFromInput();
    let lat = state.destination?.lat ?? draft.lat ?? draft.linkedPublicPlace?.lat ?? null;
    let lon = state.destination?.lon ?? draft.lon ?? draft.linkedPublicPlace?.lon ?? null;
    let destination = (state.destination?.label || $("bookingDestinationInput")?.value.trim() || draft.destination || "").trim();

    if ((lat == null || lon == null) && destination) {
        try {
            setStatus("bookingStatus", `מאתר את ${destination}...`);
            const results = await searchAddress(destination);
            if (results.length) {
                const normalized = normalizeDestination(results[0]);
                lat = normalized.lat;
                lon = normalized.lon;
                if (!destination) destination = normalized.label;
                state.destination = normalized;
            }
        } catch (_) { /* ignore */ }
    }

    if (lat == null || lon == null) {
        const promptValue = window.prompt("הקלד שם יעד (עיר/אזור) כדי לחפש מקומות בטווח 50 ק\"מ:", destination);
        const trimmed = (promptValue || "").trim();
        if (!trimmed) {
            setStatus("bookingStatus", "צריך יעד כדי לחפש מקומות לקישור.", true);
            return;
        }
        try {
            setStatus("bookingStatus", `מאתר את ${trimmed}...`);
            const results = await searchAddress(trimmed);
            if (!results.length) throw new Error("לא נמצא יעד תואם.");
            const normalized = normalizeDestination(results[0]);
            lat = normalized.lat;
            lon = normalized.lon;
            destination = normalized.label;
            state.destination = normalized;
        } catch (error) {
            setStatus("bookingStatus", `איתור היעד נכשל: ${error.message}`, true);
            return;
        }
    }

    state.linkDraftId = draft.id;
    state.linkQuery = draft.placeTitle;
    $("linkPlaceSearchInput").value = draft.placeTitle;
    $("linkPlaceResults").innerHTML = emptyHtml("טוען מקומות...");
    $("linkPlaceDialog").showModal();
    setStatus("bookingStatus", "");
    const places = await fetchPlacesByRadius(lat, lon, DUPLICATE_SEARCH_RADIUS_KM);
    state.linkCandidates = places;
    renderLinkCandidates(destination);
}

async function loadNearbyPublicPlacesForDraftMatching() {
    const firstWithCoords = state.drafts.find((draft) => draft.lat != null && draft.lon != null);
    const lat = state.destination?.lat ?? firstWithCoords?.lat ?? null;
    const lon = state.destination?.lon ?? firstWithCoords?.lon ?? null;
    if (lat == null || lon == null) return [];
    return await fetchPlacesByRadius(lat, lon, DUPLICATE_SEARCH_RADIUS_KM);
}

function findBestSavedPlaceForDraft(draft, candidates) {
    const explicitId = text(draft.savedPlaceId);
    if (explicitId) {
        const direct = candidates.find((candidate) => text(candidate.id) === explicitId);
        if (direct) return direct;
    }

    const targetName = normalize(draft.placeTitle || draft.title);
    const targetDestination = normalize(draft.destination);
    let best = null;
    let bestScore = 0;

    candidates.forEach((candidate) => {
        const candidateName = normalize(candidate.name);
        if (!candidateName || !targetName) return;

        let score = 0;
        if (candidateName === targetName) score += 100;
        else if (candidateName.includes(targetName) || targetName.includes(candidateName)) score += 65;
        else {
            const targetTokens = targetName.split(" ").filter(Boolean);
            const candidateTokens = candidateName.split(" ").filter(Boolean);
            const overlap = targetTokens.filter((token) => candidateTokens.includes(token)).length;
            score += overlap * 12;
        }

        if (targetDestination) {
            const candidateDestination = normalize(candidate.destination);
            const candidateLocation = normalize(candidate.location);
            if (candidateDestination && (targetDestination.includes(candidateDestination) || candidateDestination.includes(targetDestination))) score += 10;
            if (candidateLocation && (targetDestination.includes(candidateLocation) || candidateLocation.includes(targetDestination))) score += 8;
        }

        if (draft.lat != null && draft.lon != null && candidate.lat != null && candidate.lon != null) {
            const km = distanceKm(draft.lat, draft.lon, candidate.lat, candidate.lon);
            if (km <= 0.5) score += 20;
            else if (km <= 2) score += 12;
            else if (km <= 5) score += 6;
        }

        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    });

    return bestScore >= 60 ? best : null;
}

function normalizePublicPlaceCandidate(place) {
    return {
        source: "public",
        raw: place,
        id: text(place.id),
        name: text(place.name),
        destination: text(place.destination),
        location: text(place.location),
        lat: number(place.lat),
        lon: number(place.lon),
        coverImageUrl: text(place.coverImageUrl || (Array.isArray(place.imageUrls) ? place.imageUrls[0] : "")),
        coverPhotographerName: text(place.coverPhotographerName),
        coverPhotographerUsername: text(place.coverPhotographerUsername)
    };
}

function normalizeTemplatePlaceCandidate(place) {
    return {
        source: "template",
        raw: place,
        id: text(place.id),
        name: text(place.name),
        destination: text(place.destination),
        location: text(place.location),
        lat: number(place.lat),
        lon: number(place.lon),
        coverImageUrl: text(place.coverImageUrl),
        coverPhotographerName: text(place.coverPhotographerName),
        coverPhotographerUsername: text(place.coverPhotographerUsername)
    };
}

function renderLinkCandidates(destination = "") {
    const query = normalize(state.linkQuery);
    const filtered = state.linkCandidates.filter((place) => {
        if (!query) return true;
        return [place.name, place.location, place.website, destination]
            .map(normalize)
            .some((value) => value.includes(query));
    });
    $("linkPlaceResults").innerHTML = filtered.map((place) => `
      <button class="suggestion-item booking-place-option" type="button" data-place-id="${place.id}">
        <span>${escapeHtml(place.name || "ללא שם")}<br><small>${escapeHtml(place.location || destination || "")}</small></span>
        <b>${escapeHtml(place.type || "place")}</b>
        <i data-lucide="chevron-left"></i>
      </button>
    `).join("") || emptyHtml("לא נמצאו מקומות מתאימים.");
    $("linkPlaceResults").querySelectorAll("button").forEach((button) => button.addEventListener("click", async () => {
        const selected = state.linkCandidates.find((place) => place.id === button.dataset.placeId);
        const draft = state.drafts.find((item) => item.id === state.linkDraftId);
        if (!selected || !draft) return;
        draft.linkedPublicPlace = selected;
        draft.savedPlaceId = selected.id;
        if (!draft.address) draft.address = selected.location || "";
        if (!draft.imageUrl) {
            draft.imageUrl = selected.coverImageUrl || (Array.isArray(selected.imageUrls) ? selected.imageUrls[0] : "");
        }
        if (selected.pixabayId) {
            draft.imagePixabayId = bookingsPixabayIdValue(selected.pixabayId);
            draft.imagePixabayPageUrl = text(selected.pixabayPageUrl);
        }
        $("linkPlaceDialog").close();
        renderDrafts();
        if (state.view === "manage" && draft.templateId) {
            await persistSingleBookingDraft(draft);
        }
    }));
    refreshIcons();
}

async function saveBookingDrafts() {
    if (!state.drafts.length) return;
    if (state.view === "manage") {
        await saveManagedBookingDrafts();
        return;
    }
    await ensureDestinationSelectedFromInput();
    await autoSelectDestinationFromDrafts();
    const controllerDestination = $("bookingDestinationInput").value.trim();
    const draftDestination = state.drafts.map((draft) => draft.destination.trim()).find(Boolean) || "";
    const destination = (state.destination?.label || controllerDestination || draftDestination).trim();
    if (!destination) {
        setStatus("bookingStatus", "חסר יעד. בחר יעד לפני שמירת קישורי ההזמנה.", true);
        return;
    }
    setStatus("bookingStatus", "שומר תמונות קישורי הזמנה ב-R2...");
    try {
        await ensureBookingDraftImagesOnR2(state.drafts);
        setStatus("bookingStatus", "שומר קישורי הזמנה ל-TripTap...");
        const template = await fetchAssetLibraryForDestination(destination);
        const newPlaces = [];
        const newLinks = [];
        state.drafts.forEach((draft) => {
            const place = bookingDraftToTemplatePlace(draft, destination);
            newPlaces.push(place);
            newLinks.push(bookingDraftToTemplateBookingLink(draft, destination, place.id));
        });

        let placesToSave;
        let linksToSave;

        if (state.loadedTemplate && text(state.loadedTemplate.id) === assetLibraryIdForDestination(destination)) {
            const linkedPlaceIds = new Set((template?.bookingLinks || []).map((item) => text(item.placeId)).filter(Boolean));
            const preservedPlaces = (template?.places || []).filter((place) => !linkedPlaceIds.has(text(place.id)));
            placesToSave = [...preservedPlaces, ...newPlaces];
            linksToSave = newLinks;
        } else {
            placesToSave = mergeTemplatePlaces([...(template?.places || []), ...newPlaces]);
            linksToSave = mergeBookingLinks([...(template?.bookingLinks || []), ...newLinks]);
        }

        const docId = assetLibraryIdForDestination(destination);
        const payload = buildAssetLibraryTemplate({
            destination,
            existing: template,
            places: placesToSave,
            bookingLinks: linksToSave
        });

        const fs = state.firebase.firestore;
        await fs.setDoc(fs.doc(state.firebase.db, "trip_templates", docId), payload, { merge: true });
        state.drafts = [];
        state.loadedTemplate = null;
        $("bookingJsonInput").value = "";
        renderDrafts();
        setStatus("bookingStatus", `נשמרו ${linksToSave.length} קישורי הזמנה לעמוד האטרקציות של TripTap.`);
    } catch (error) {
        setStatus("bookingStatus", `שמירת קישורי ההזמנה נכשלה: ${error.message}`, true);
    }
}

async function saveManagedBookingDrafts() {
    const fs = state.firebase.firestore;
    setStatus("bookingStatus", "שומר תמונות קישורי הזמנה ב-R2...");
    try {
        await ensureBookingDraftImagesOnR2(state.drafts);
        setStatus("bookingStatus", "שומר עדכוני קישורי הזמנה...");
        const draftsByTemplate = new Map();
        state.drafts.forEach((draft) => {
            const templateId = text(draft.templateId);
            if (!templateId) return;
            if (!draftsByTemplate.has(templateId)) draftsByTemplate.set(templateId, []);
            draftsByTemplate.get(templateId).push(draft);
        });
        for (const template of state.allTemplates) {
            if (!draftsByTemplate.has(template.id) && !Array.isArray(template.bookingLinks)) continue;
            const links = (draftsByTemplate.get(template.id) || []).map((draft) => bookingDraftToTemplateBookingLink(
                draft,
                text(draft.destination || template.mainDestination),
                text(draft.savedPlaceId || draft.placeId || `booking_place_${draft.id}`)
            ));
            await fs.setDoc(fs.doc(state.firebase.db, "trip_templates", template.id), { bookingLinks: links }, { merge: true });
        }
        state.allDrafts = [...state.drafts];
        renderDrafts();
        setStatus("bookingStatus", "קישורי ההזמנה עודכנו.");
    } catch (error) {
        setStatus("bookingStatus", `שמירת העדכונים נכשלה: ${error.message}`, true);
    }
}

async function fetchAssetLibraryForDestination(destination) {
    const fs = state.firebase.firestore;
    const snap = await fs.getDoc(fs.doc(state.firebase.db, "trip_templates", assetLibraryIdForDestination(destination)));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function ensureDestinationSelectedFromInput() {
    if (state.destination) return;
    const query = $("bookingDestinationInput").value.trim();
    if (!query) return;
    const results = await searchAddress(query);
    if (results.length) {
        state.destination = normalizeDestination(results[0]);
        $("selectedBookingDestination").innerHTML = `<i data-lucide="map"></i><span>${escapeHtml(state.destination.address)}</span><b>${escapeHtml(state.destination.label)}</b>`;
        refreshIcons();
    }
}

async function ensureBookingDraftImagesOnR2(drafts) {
    for (const draft of drafts || []) {
        const imageUrl = text(draft.imageUrl);
        if (!imageUrl) continue;
        draft.imageUrl = await ensureAdminImageUrlOnR2(state.user, imageUrl, {
            folder: BOOKING_LINK_R2_FOLDER,
            baseName: draft.placeTitle || draft.title || draft.destination || "booking-link"
        });
        draft.imagePixabayId = null;
        draft.imagePixabayPageUrl = null;
    }
}

function standaloneBookingDraftFromTemplateLink(booking, linkedPlace) {
    return {
        id: text(booking.id) || crypto.randomUUID(),
        placeTitle: text(booking.placeTitle),
        provider: text(booking.provider),
        title: text(booking.title),
        summary: text(booking.summary),
        priceRange: text(booking.priceRange),
        bookingUrl: text(booking.bookingUrl),
        destination: text(booking.destination),
        lat: number(booking.lat),
        lon: number(booking.lon),
        imageUrl: text(booking.imageUrl),
        imageCredit: text(booking.imageCredit),
        imageCreditUrl: text(booking.imageCreditUrl),
        imagePixabayId: bookingsPixabayIdValue(booking.imagePixabayId),
        imagePixabayPageUrl: text(booking.imagePixabayPageUrl),
        address: text(booking.address),
        savedPlaceId: text(booking.placeId),
        linkedTemplatePlace: linkedPlace || null,
        linkedPublicPlace: null
    };
}

function bookingDraftToTemplatePlace(draft, fallbackDestination) {
    const resolvedDestination = text(draft.destination) || fallbackDestination;
    if (draft.linkedPublicPlace) {
        const linked = draft.linkedPublicPlace;
        return {
            id: linked.id,
            name: linked.name,
            destination: resolvedDestination,
            type: linked.type,
            shortDescription: linked.shortDescription || null,
            description: linked.description || null,
            location: linked.location || null,
            lat: linked.lat ?? null,
            lon: linked.lon ?? null,
            hours: linked.hours || null,
            website: linked.website || null,
            reservation: reservationFromString(linked.reservationLabel),
            isKosher: Boolean(linked.isKosher),
            foodType: linked.foodType || null,
            rating: linked.rating ?? null,
            coverImageUrl: linked.coverImageUrl || (Array.isArray(linked.imageUrls) && linked.imageUrls.length ? linked.imageUrls[0] : draft.imageUrl || null),
            coverPhotographerName: linked.coverPhotographerName || null,
            coverPhotographerUsername: linked.coverPhotographerUsername || null,
            pixabayId: bookingsPixabayIdValue(linked.pixabayId ?? draft.imagePixabayId),
            pixabayPageUrl: text(linked.pixabayPageUrl) || text(draft.imagePixabayPageUrl) || null,
            coverEmoji: linked.coverEmoji || null,
            coverBackgroundHex: linked.coverBackgroundHex || null
        };
    }
    if (draft.linkedTemplatePlace) {
        const linked = draft.linkedTemplatePlace;
        return {
            id: text(draft.savedPlaceId) || linked.id,
            name: text(draft.placeTitle) || text(draft.title),
            destination: resolvedDestination,
            type: linked.type,
            shortDescription: text(draft.title) || linked.shortDescription || null,
            description: text(draft.summary) || linked.description || null,
            location: text(draft.address) || linked.location || null,
            lat: draft.lat ?? linked.lat ?? null,
            lon: draft.lon ?? linked.lon ?? null,
            hours: linked.hours || null,
            website: text(draft.bookingUrl) || linked.website || null,
            reservation: linked.reservation || "reservation_no",
            isKosher: Boolean(linked.isKosher),
            foodType: linked.foodType || null,
            rating: linked.rating ?? null,
            coverImageUrl: text(draft.imageUrl) || linked.coverImageUrl || null,
            coverPhotographerName: text(draft.imageCredit) || linked.coverPhotographerName || null,
            coverPhotographerUsername: text(draft.imageCreditUrl) || linked.coverPhotographerUsername || null,
            pixabayId: bookingsPixabayIdValue(draft.imagePixabayId ?? linked.pixabayId),
            pixabayPageUrl: text(draft.imagePixabayPageUrl) || text(linked.pixabayPageUrl) || null,
            coverEmoji: linked.coverEmoji || null,
            coverBackgroundHex: linked.coverBackgroundHex || null
        };
    }
    return {
        id: text(draft.savedPlaceId) || `booking_place_${draft.id}`,
        name: text(draft.placeTitle) || text(draft.title),
        destination: resolvedDestination,
        type: "place_type_attraction",
        shortDescription: text(draft.title) || null,
        description: text(draft.summary) || null,
        location: text(draft.address) || resolvedDestination || null,
        lat: draft.lat ?? null,
        lon: draft.lon ?? null,
        hours: null,
        website: text(draft.bookingUrl) || null,
        reservation: "yes",
        isKosher: false,
        foodType: null,
        rating: null,
        coverImageUrl: text(draft.imageUrl) || null,
        coverPhotographerName: text(draft.imageCredit) || null,
        coverPhotographerUsername: text(draft.imageCreditUrl) || null,
        pixabayId: bookingsPixabayIdValue(draft.imagePixabayId),
        pixabayPageUrl: text(draft.imagePixabayPageUrl) || null,
        coverEmoji: null,
        coverBackgroundHex: null
    };
}

function bookingDraftToTemplateBookingLink(draft, fallbackDestination, placeId) {
    const resolvedDestination = text(draft.destination) || fallbackDestination;
    return {
        id: draft.id,
        placeId,
        placeTitle: text(draft.placeTitle) || text(draft.title),
        destination: resolvedDestination,
        lat: draft.lat ?? null,
        lon: draft.lon ?? null,
        imageUrl: text(draft.imageUrl) || null,
        imageCredit: text(draft.imageCredit) || null,
        imageCreditUrl: text(draft.imageCreditUrl) || null,
        imagePixabayId: bookingsPixabayIdValue(draft.imagePixabayId),
        imagePixabayPageUrl: text(draft.imagePixabayPageUrl) || null,
        address: text(draft.address) || null,
        provider: text(draft.provider),
        title: text(draft.title),
        summary: text(draft.summary),
        priceRange: text(draft.priceRange),
        bookingUrl: text(draft.bookingUrl)
    };
}

function buildAssetLibraryTemplate({ destination, existing, places, bookingLinks }) {
    const mainDestination = text(destination);
    return {
        assetLibrary: true,
        name: `ספריית TripTap - ${mainDestination}`,
        days: 0,
        mainDestination,
        country: existing?.country || null,
        city: existing?.city || mainDestination,
        keywords: assetLibraryKeywords({
            destination: mainDestination,
            existing: existing?.keywords || [],
            places,
            bookingLinks
        }),
        category: existing?.category || "urban",
        categories: Array.isArray(existing?.categories) && existing.categories.length ? existing.categories : [existing?.category || "urban"],
        heroImageUrl: existing?.heroImageUrl || null,
        heroPhotographerName: existing?.heroPhotographerName || null,
        heroPhotographerUsername: existing?.heroPhotographerUsername || null,
        description: existing?.description || `ספריית מלונות וקישורי הזמנה עצמאית עבור ${mainDestination}.`,
        schedule: existing?.schedule || [],
        hotels: existing?.hotels || [],
        places,
        bookingLinks
    };
}

function mergeBookingLinks(links) {
    const byKey = new Map();
    links.forEach((link) => {
        if (!text(link.bookingUrl)) return;
        const id = text(link.id);
        const key = id || [text(link.bookingUrl).toLowerCase(), text(link.placeTitle).toLowerCase(), text(link.title).toLowerCase()].join("|");
        byKey.set(key, link);
    });
    return Array.from(byKey.values()).sort((a, b) => text(a.placeTitle).localeCompare(text(b.placeTitle), "he"));
}

function mergeTemplatePlaces(places) {
    const byKey = new Map();
    places.forEach((place) => {
        if (!text(place.name)) return;
        const id = text(place.id);
        const key = id || [text(place.name).toLowerCase(), text(place.location).toLowerCase()].join("|");
        byKey.set(key, place);
    });
    return Array.from(byKey.values()).sort((a, b) => text(a.name).localeCompare(text(b.name), "he"));
}

function assetLibraryKeywords({ destination, existing, places, bookingLinks }) {
    const values = new Set([...(existing || []).map((item) => text(item).toLowerCase()), text(destination).toLowerCase(), "triptap", "asset_library", "אטרקציות"]);
    const addText = (raw) => {
        const normalized = text(raw).toLowerCase();
        if (!normalized) return;
        values.add(normalized);
        normalized.split(/[\s,.\-/]+/).forEach((token) => {
            if (token.length > 1) values.add(token);
        });
    };
    bookingLinks.forEach((link) => {
        addText(link.placeTitle);
        addText(link.title);
        addText(link.destination);
    });
    places.forEach((place) => {
        addText(place.name);
        addText(place.location);
    });
    return Array.from(values).filter(Boolean).sort().slice(0, 80);
}

function assetLibraryIdForDestination(destination) {
    const normalized = text(destination).toLowerCase();
    if (!normalized) return "triptap_assets_general";
    const encoded = btoa(unescape(encodeURIComponent(normalized))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    return `triptap_assets_${encoded}`;
}

async function fetchPlacesByRadius(lat, lon, radiusKm) {
    const fs = state.firebase.firestore;
    const latDelta = radiusKm / 111;
    const snap = await fs.getDocs(fs.query(
        fs.collection(state.firebase.db, "public_places"),
        fs.where("lat", ">=", lat - latDelta),
        fs.where("lat", "<=", lat + latDelta)
    ));
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((place) => place.lat != null && place.lon != null && distanceKm(lat, lon, place.lat, place.lon) <= radiusKm);
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
    let data;
    try {
        data = await adminPixabaySearch(state.user, { q: query, perPage: 12 });
    } catch (_) { return []; }
    return (data?.hits || []).map((item) => ({
        url: item.largeImageURL || item.webformatURL,
        thumb: item.webformatURL || item.previewURL,
        credit: item.user ? `Pixabay · ${item.user}` : "Pixabay",
        pageUrl: item.pageURL,
        pixabayId: item.id,
        source: "Pixabay"
    })).filter((item) => item.url);
}

const BOOKINGS_PIXABAY_URL_CACHE_KEY = "tripTapBookingsPixabayUrlCache_v1";
const BOOKINGS_PIXABAY_URL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const bookingsPixabayUrlMemoryCache = new Map();
const bookingsPixabayUrlInflight = new Map();

function bookingsPixabayIdValue(raw) {
    if (raw == null || raw === "") return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : null;
}
function bookingsReadPixabayCache() {
    try {
        const raw = localStorage.getItem(BOOKINGS_PIXABAY_URL_CACHE_KEY);
        return raw ? (JSON.parse(raw) || {}) : {};
    } catch (_) { return {}; }
}
function bookingsWritePixabayCache(obj) {
    try { localStorage.setItem(BOOKINGS_PIXABAY_URL_CACHE_KEY, JSON.stringify(obj)); } catch (_) { }
}
function bookingsGetCachedPixabayUrl(id) {
    if (!id) return "";
    if (bookingsPixabayUrlMemoryCache.has(id)) return bookingsPixabayUrlMemoryCache.get(id);
    const cache = bookingsReadPixabayCache();
    const entry = cache[String(id)];
    if (entry && entry.url && Date.now() - (entry.savedAt || 0) < BOOKINGS_PIXABAY_URL_CACHE_TTL_MS) {
        bookingsPixabayUrlMemoryCache.set(id, entry.url);
        return entry.url;
    }
    return "";
}
function bookingsSetCachedPixabayUrl(id, url) {
    if (!id || !url) return;
    bookingsPixabayUrlMemoryCache.set(id, url);
    const cache = bookingsReadPixabayCache();
    cache[String(id)] = { url, savedAt: Date.now() };
    bookingsWritePixabayCache(cache);
}
function bookingsClearCachedPixabayUrl(id) {
    if (!id) return;
    bookingsPixabayUrlMemoryCache.delete(id);
    const cache = bookingsReadPixabayCache();
    delete cache[String(id)];
    bookingsWritePixabayCache(cache);
}
async function bookingsResolvePixabayImageById(id, { force = false } = {}) {
    const numericId = bookingsPixabayIdValue(id);
    if (!numericId) return "";
    if (!force) {
        const cached = bookingsGetCachedPixabayUrl(numericId);
        if (cached) return cached;
    }
    if (bookingsPixabayUrlInflight.has(numericId)) return bookingsPixabayUrlInflight.get(numericId);
    const promise = (async () => {
        try {
            const data = await adminPixabayLookupById(state.user, numericId);
            const hit = data?.hits?.[0];
            const fresh = hit?.largeImageURL || hit?.webformatURL || "";
            if (fresh) bookingsSetCachedPixabayUrl(numericId, fresh);
            return fresh;
        } catch (_) { return ""; }
        finally { bookingsPixabayUrlInflight.delete(numericId); }
    })();
    bookingsPixabayUrlInflight.set(numericId, promise);
    return promise;
}
window.tripTapBookingsImageFallback = async (image) => {
    const pixabayId = bookingsPixabayIdValue(image.dataset.pixabayId);
    if (pixabayId && image.dataset.pixabayRefreshed !== "done") {
        image.dataset.pixabayRefreshed = "done";
        bookingsClearCachedPixabayUrl(pixabayId);
        const fresh = await bookingsResolvePixabayImageById(pixabayId, { force: true });
        if (fresh && fresh !== image.src) {
            image.src = fresh;
            return;
        }
    }
    image.hidden = true;
    image.nextElementSibling?.removeAttribute("hidden");
};
function bookingsApplyPixabayResolvers(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-pixabay-id]').forEach((image) => {
        const id = bookingsPixabayIdValue(image.dataset.pixabayId);
        if (!id) return;
        if (image.dataset.pixabayResolved === "done") return;
        image.dataset.pixabayResolved = "done";
        const cached = bookingsGetCachedPixabayUrl(id);
        if (cached && cached !== image.src) {
            image.src = cached;
            return;
        }
        if (cached) return;
        bookingsResolvePixabayImageById(id).then((fresh) => {
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
    if (!response.ok) return [];
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
    let data;
    try {
        data = await adminUnsplashSearch(state.user, { query, perPage: 12 });
    } catch (_) { return []; }
    return (data?.results || []).map((item) => ({
        url: item.urls?.regular || item.urls?.full,
        thumb: item.urls?.small || item.urls?.thumb || item.urls?.regular,
        credit: item.user?.name ? `${item.user.name} / Unsplash` : "Unsplash",
        pageUrl: item.user?.links?.html || item.links?.html,
        source: "Unsplash"
    })).filter((item) => item.url);
}

function jsonString(map, keys) {
    for (const key of keys) {
        const value = map[key];
        if (value == null) continue;
        const output = String(value).trim();
        if (output && output !== "null") return output;
    }
    return "";
}

function jsonDouble(map, keys) {
    for (const key of keys) {
        const value = map[key];
        if (value == null) continue;
        if (typeof value === "number") return value;
        const output = String(value).trim().replace(/,/g, ".");
        const match = output.match(/-?\d+(?:\.\d+)?/);
        if (match) return Number(match[0]);
    }
    return null;
}

function splitLinks(raw) {
    return String(raw || "").split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

function reservationFromString(value) {
    const normalized = text(value).toLowerCase();
    if (["reservation_yes", "yes"].includes(normalized)) return "yes";
    if (["reservation_recommended", "recommended"].includes(normalized)) return "recommended";
    return "no";
}

function cleanJson(raw) { return String(raw || "").replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim(); }
function refreshIcons() { if (window.lucide) window.lucide.createIcons(); }
function text(value) { return value == null ? "" : String(value).trim(); }
function number(value) { const raw = String(value ?? "").trim(); if (!raw) return null; const parsed = Number(raw.replace(",", ".")); return Number.isFinite(parsed) ? parsed : null; }
function normalize(value) { return text(value).toLowerCase().replace(/[\s,./\\-]+/g, " ").trim(); }
function stripHtml(value) { const div = document.createElement("div"); div.innerHTML = value || ""; return div.textContent || ""; }
function escapeHtml(value) { return text(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char])); }
function escapeAttr(value) { return escapeHtml(value).replace(/'/g, "&#039;"); }
function editInput(field, label, value) { return `<label class="edit-field"><span>${escapeHtml(label)}</span><input data-edit-field="${escapeAttr(field)}" value="${escapeAttr(value)}" /></label>`; }
function editTextarea(field, label, value) { return `<label class="edit-field full"><span>${escapeHtml(label)}</span><textarea data-edit-field="${escapeAttr(field)}" rows="4">${escapeHtml(value)}</textarea></label>`; }
function emptyHtml(message) { return `<div class="empty-screen"><i data-lucide="inbox"></i><p>${escapeHtml(message)}</p></div>`; }
function setStatus(id, message, isError = false) { const el = $(id); if (!el) return; el.textContent = message || ""; el.style.color = isError ? "var(--red)" : "var(--muted)"; }

function truncate(value, max) {
    const normalized = text(value);
    if (normalized.length <= max) return normalized;
    return `${normalized.slice(0, max - 1)}…`;
}

function shortId(value) {
    const normalized = text(value);
    return normalized.length <= 10 ? normalized : `${normalized.slice(0, 6)}…${normalized.slice(-3)}`;
}

function distanceKm(lat1, lon1, lat2, lon2) {
    const radius = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
