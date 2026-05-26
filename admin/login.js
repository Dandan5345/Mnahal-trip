import { tripTapAdminFirebase } from "./firebase.js";
import { ADMIN_EMAIL, isAdminUser, resolveNextPage } from "./shared.js";

const firebase = tripTapAdminFirebase;
const $ = (id) => document.getElementById(id);

async function init() {
    if (window.lucide) window.lucide.createIcons();
    bindEvents();
    applyEnvironmentHints();
    await firebase.authReady;
    try {
        await firebase.authFns.getRedirectResult(firebase.auth);
    } catch (error) {
        setStatus(`חזרה מהתחברות Google נכשלה: ${error.message}`, true);
    }
    firebase.authFns.onAuthStateChanged(firebase.auth, async (user) => {
        if (!user) return;
        if (!isAdminUser(user)) {
            setStatus(`אין הרשאת אדמין למייל ${user.email || user.uid}. רק ${ADMIN_EMAIL} מורשה להיכנס.`, true);
            await firebase.authFns.signOut(firebase.auth);
            return;
        }
        window.location.replace(resolveNextPage());
    });
}

function bindEvents() {
    $("googleSignInButton").addEventListener("click", signInWithGoogle);
}

async function signInWithGoogle() {
    if (isFileOrigin()) {
        setStatus("התחברות עם Google לא זמינה מתוך file://. צריך לפתוח את האדמין דרך שרת HTTP/HTTPS שמוגדר כ-Authorized domain ב-Firebase.", true);
        return;
    }
    const provider = new firebase.authFns.GoogleAuthProvider();
    try {
        setStatus("פותח התחברות עם Google...");
        await firebase.authFns.signInWithPopup(firebase.auth, provider);
    } catch (error) {
        if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
            await firebase.authFns.signInWithRedirect(firebase.auth, provider);
            return;
        }
        setStatus(`התחברות Google נכשלה: ${error.message}`, true);
    }
}

function applyEnvironmentHints() {
    if (!isFileOrigin()) return;
    const button = $("googleSignInButton");
    const hint = $("loginHint");
    if (button) {
        button.disabled = true;
        button.title = "Google Sign-In דורש הרצה משרת HTTP/HTTPS ולא מקובץ מקומי";
    }
    if (hint) {
        hint.textContent = "Google Sign-In עובד רק דרך HTTP/HTTPS עם Authorized Domain ב-Firebase Authentication. כרגע הדף פתוח כ-file://, לכן צריך להריץ את האדמין דרך שרת מקומי או deploy.";
    }
}

function isFileOrigin() {
    return window.location.protocol === "file:";
}

function setStatus(message, isError = false) {
    const status = $("loginStatus");
    if (!status) return;
    status.textContent = message || "";
    status.style.color = isError ? "var(--red)" : "var(--muted)";
}

init();
