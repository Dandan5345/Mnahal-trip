import {
    ADMIN_AI_MODEL_OPTIONS,
    ADMIN_AI_REASONING_OPTIONS,
    adminAiModelSelectHtml,
    adminAiReasoningSelectHtml,
    requestAdminAiCompletion,
    cleanBookingUrl,
    isBrokenBookingUrl
} from "./shared.js";

const lfEscapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const lfEscapeAttr = (value) => lfEscapeHtml(value);

// Builds a self-managing "fix links" panel inside `mountId`.
// config: { mountId, kind: "hotel"|"attraction", getUser, getItems,
//           itemId, itemTitle, itemSubtitle, itemUrl, itemContext,
//           applyUrl(item, url) -> Promise, reload() -> Promise }
export function createLinkFixer(config) {
    const state = {
        selected: new Set(),
        model: ADMIN_AI_MODEL_OPTIONS[1].value,
        reasoning: "high",
        busy: false,
        suggestions: new Map(),
        statusMessage: "",
        statusError: false
    };

    const mount = () => document.getElementById(config.mountId);

    function brokenItems() {
        return (config.getItems() || []).filter((item) => isBrokenBookingUrl(config.itemUrl(item)));
    }

    function setStatus(message, isError = false) {
        state.statusMessage = message || "";
        state.statusError = Boolean(isError);
        const el = mount()?.querySelector(".linkfix-status");
        if (el) {
            el.textContent = state.statusMessage;
            el.classList.toggle("is-error", state.statusError);
        }
    }

    function render() {
        const host = mount();
        if (!host) return;
        const items = brokenItems();
        // Drop selections that are no longer broken.
        const validIds = new Set(items.map((item) => String(config.itemId(item))));
        state.selected.forEach((id) => { if (!validIds.has(id)) state.selected.delete(id); });

        const kindLabel = config.kind === "hotel" ? "מלונות" : "אטרקציות";
        const allSelected = items.length > 0 && items.every((item) => state.selected.has(String(config.itemId(item))));

        host.innerHTML = `
            <article class="panel linkfix-panel">
                <div class="panel-heading">
                    <span class="panel-icon coral"><i data-lucide="link-2-off" aria-hidden="true"></i></span>
                    <div>
                        <h2>תיקון קישורים</h2>
                        <p>${kindLabel} עם קישור הזמנה ריק או לא תקין. בחר פריטים ותקן ידנית או בעזרת AI.</p>
                    </div>
                </div>

                <div class="linkfix-toolbar">
                    <span class="count-pill">${items.length} קישורים לתיקון</span>
                    <button class="ghost-action small-action" type="button" data-lf="reload"><i data-lucide="refresh-cw"></i><span>רענן</span></button>
                    <button class="ghost-action small-action" type="button" data-lf="toggle-all"${items.length ? "" : " disabled"}><i data-lucide="${allSelected ? "square" : "check-square"}"></i><span>${allSelected ? "נקה בחירה" : "בחר הכל"}</span></button>
                    <span class="linkfix-selected-count">${state.selected.size} נבחרו</span>
                </div>

                <div class="linkfix-ai-row">
                    <label class="linkfix-ai-field"><span>מודל AI</span>${adminAiModelSelectHtml(`${config.mountId}-model`, state.model)}</label>
                    <label class="linkfix-ai-field"><span>רמת חשיבה</span>${adminAiReasoningSelectHtml(`${config.mountId}-reasoning`, state.reasoning)}</label>
                    <button class="primary-action" type="button" data-lf="ai-fix"${state.selected.size && !state.busy ? "" : " disabled"}><i data-lucide="sparkles"></i><span>${state.busy ? "שולח ל-AI..." : "תקן בעזרת AI"}</span></button>
                </div>
                <p class="linkfix-hint"><i data-lucide="info"></i>ה-AI אינו גולש באינטרנט, ולכן הוא מציע קישור משוער בלבד שצריך לבדוק. תיקון ידני הוא הדרך הבטוחה.</p>

                <div class="linkfix-list">
                    ${items.length ? items.map(renderItem).join("") : '<div class="empty-state linkfix-empty"><i data-lucide="party-popper"></i><p>כל הקישורים תקינים 🎉</p></div>'}
                </div>

                <p class="status-line linkfix-status${state.statusError ? " is-error" : ""}">${lfEscapeHtml(state.statusMessage)}</p>
            </article>
        `;

        bind();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderItem(item) {
        const id = String(config.itemId(item));
        const url = config.itemUrl(item);
        const suggestion = state.suggestions.get(id) || "";
        const inputValue = suggestion || (isBrokenBookingUrl(url) ? "" : url);
        const checked = state.selected.has(id) ? " checked" : "";
        return `
            <div class="linkfix-item" data-lf-id="${lfEscapeAttr(id)}">
                <label class="linkfix-check"><input type="checkbox" data-lf="select"${checked}></label>
                <div class="linkfix-main">
                    <div class="linkfix-title">${lfEscapeHtml(config.itemTitle(item) || "ללא שם")}</div>
                    ${config.itemSubtitle(item) ? `<div class="linkfix-sub">${lfEscapeHtml(config.itemSubtitle(item))}</div>` : ""}
                    <div class="linkfix-current">קישור נוכחי: <span class="linkfix-bad">${url ? lfEscapeHtml(url) : "(ריק)"}</span></div>
                    ${suggestion ? `<div class="linkfix-suggestion"><i data-lucide="sparkles"></i><span>הצעת AI:</span> <a href="${lfEscapeAttr(suggestion)}" target="_blank" rel="noopener noreferrer">${lfEscapeHtml(suggestion)}</a></div>` : ""}
                    <div class="linkfix-manual">
                        <input type="url" class="linkfix-input" inputmode="url" placeholder="הדבק קישור הזמנה תקין" value="${lfEscapeAttr(inputValue)}">
                        <button class="primary-action small-action" type="button" data-lf="save"><i data-lucide="save"></i><span>שמור</span></button>
                    </div>
                </div>
            </div>
        `;
    }

    function bind() {
        const host = mount();
        if (!host) return;
        host.querySelector('[data-lf="reload"]')?.addEventListener("click", reload);
        host.querySelector('[data-lf="toggle-all"]')?.addEventListener("click", toggleAll);
        host.querySelector('[data-lf="ai-fix"]')?.addEventListener("click", runAiFix);
        document.getElementById(`${config.mountId}-model`)?.addEventListener("change", (event) => { state.model = event.target.value; });
        document.getElementById(`${config.mountId}-reasoning`)?.addEventListener("change", (event) => { state.reasoning = event.target.value; });
        host.querySelectorAll(".linkfix-item").forEach((row) => {
            const id = row.dataset.lfId;
            row.querySelector('[data-lf="select"]')?.addEventListener("change", (event) => {
                if (event.target.checked) state.selected.add(id); else state.selected.delete(id);
                updateToolbarCounts();
            });
            row.querySelector('[data-lf="save"]')?.addEventListener("click", () => saveManual(id, row.querySelector(".linkfix-input")?.value));
            row.querySelector(".linkfix-input")?.addEventListener("keydown", (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                saveManual(id, event.target.value);
            });
        });
    }

    function updateToolbarCounts() {
        const host = mount();
        if (!host) return;
        const countEl = host.querySelector(".linkfix-selected-count");
        if (countEl) countEl.textContent = `${state.selected.size} נבחרו`;
        const aiBtn = host.querySelector('[data-lf="ai-fix"]');
        if (aiBtn) aiBtn.disabled = !(state.selected.size && !state.busy);
    }

    function findItemById(id) {
        return (config.getItems() || []).find((item) => String(config.itemId(item)) === String(id)) || null;
    }

    function toggleAll() {
        const items = brokenItems();
        const allSelected = items.length > 0 && items.every((item) => state.selected.has(String(config.itemId(item))));
        if (allSelected) state.selected.clear();
        else items.forEach((item) => state.selected.add(String(config.itemId(item))));
        render();
    }

    async function reload() {
        if (state.busy) return;
        setStatus("טוען מחדש...");
        try {
            await config.reload();
            state.suggestions.clear();
            render();
            setStatus("");
        } catch (error) {
            setStatus(`טעינה נכשלה: ${error.message}`, true);
        }
    }

    async function saveManual(id, rawValue) {
        const item = findItemById(id);
        if (!item) return;
        const url = cleanBookingUrl(rawValue);
        if (isBrokenBookingUrl(url)) {
            setStatus("הקישור עדיין לא תקין. ודא שהוא מתחיל ב-https:// ובלי רווחים או סוגריים.", true);
            return;
        }
        setStatus("שומר קישור...");
        try {
            await config.applyUrl(item, url);
            state.suggestions.delete(id);
            state.selected.delete(id);
            render();
            setStatus("הקישור נשמר. ✓");
        } catch (error) {
            setStatus(`שמירת הקישור נכשלה: ${error.message}`, true);
        }
    }

    async function runAiFix() {
        if (state.busy || !state.selected.size) return;
        const items = brokenItems().filter((item) => state.selected.has(String(config.itemId(item))));
        if (!items.length) return;
        state.busy = true;
        render();
        setStatus(`שולח ${items.length} פריטים ל-AI לתיקון...`);
        try {
            const text = await requestAdminAiCompletion(config.getUser(), {
                systemPrompt: buildSystemPrompt(config.kind),
                userPrompt: buildUserPrompt(config.kind, items),
                model: state.model,
                reasoningEffort: state.reasoning,
                maxTokens: 4096
            });
            const fixes = parseAiFixes(text);
            if (!fixes.length) throw new Error("ה-AI לא החזיר קישורים תקינים.");
            let applied = 0;
            fixes.forEach(({ id, bookingUrl }) => {
                const cleaned = cleanBookingUrl(bookingUrl);
                if (!cleaned || isBrokenBookingUrl(cleaned)) return;
                if (!items.some((item) => String(config.itemId(item)) === String(id))) return;
                state.suggestions.set(String(id), cleaned);
                applied += 1;
            });
            state.busy = false;
            render();
            setStatus(applied ? `ה-AI הציע ${applied} קישורים. בדוק כל אחד ולחץ שמור כדי לאשר.` : "ה-AI לא הצליח להציע קישורים. נסה מודל/רמת חשיבה אחרת או תקן ידנית.", !applied);
        } catch (error) {
            state.busy = false;
            render();
            setStatus(`הפנייה ל-AI נכשלה: ${error.message}`, true);
        }
    }

    function buildUserPrompt(kind, items) {
        const what = kind === "hotel" ? "מלונות" : "אטרקציות / מקומות";
        const lines = items.map((item) => {
            const id = config.itemId(item);
            const context = config.itemContext(item) || config.itemTitle(item);
            const current = config.itemUrl(item) || "(ריק)";
            return `- id: ${id}\n  פרטים: ${context}\n  קישור נוכחי (שגוי): ${current}`;
        }).join("\n");
        return `הנה רשימת ${what} שצריך למצוא להם קישור הזמנה תקין:\n\n${lines}\n\nהחזר אך ורק מערך JSON תקין בלי markdown ובלי טקסט נוסף, בפורמט:\n[{"id":"<אותו id>","bookingUrl":"https://..."}]`;
    }

    function buildSystemPrompt(kind) {
        const target = kind === "hotel"
            ? "אתה עוזר למצוא קישור הזמנה ישיר ותקין למלון (למשל Booking.com או אתר המלון הרשמי)."
            : "אתה עוזר למצוא קישור הזמנה ישיר ותקין לאטרקציה/סיור (למשל GetYourGuide, Tiqets או האתר הרשמי).";
        return `${target} לכל פריט החזר את הקישור הטוב ביותר שאתה מכיר. כל קישור חייב להיות URL נקי שמתחיל ב-https://, בלי סוגריים מרובעים, בלי תחביר markdown ובלי טקסט עוטף. אם אינך בטוח בקישור ספציפי, השמט את הפריט מהתשובה. החזר אך ורק מערך JSON תקין.`;
    }

    function parseAiFixes(text) {
        if (!text) return [];
        let raw = String(text).trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
        let decoded;
        try {
            decoded = JSON.parse(raw);
        } catch (_) {
            return [];
        }
        const list = Array.isArray(decoded) ? decoded : (Array.isArray(decoded?.fixes) ? decoded.fixes : []);
        return list
            .filter((entry) => entry && (entry.id != null) && (entry.bookingUrl || entry.url))
            .map((entry) => ({ id: String(entry.id), bookingUrl: String(entry.bookingUrl || entry.url) }));
    }

    return { render, reload, setStatus };
}
