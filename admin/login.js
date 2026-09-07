import { tripTapAdminFirebase } from "./firebase.js";
import { ADMIN_EMAIL, isAdminUser, resolveNextPage } from "./shared.js";

const firebase = tripTapAdminFirebase;
const $ = (id) => document.getElementById(id);
let signInPending = false;

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
            finishSignInAttempt();
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
    if (signInPending) return;

    const provider = new firebase.authFns.GoogleAuthProvider();
    signInPending = true;
    setSignInButtonBusy(true);

    try {
        if (isMobileAuthEnvironment()) {
            await startGoogleRedirect(provider);
            return;
        }

        setStatus("פותח התחברות עם Google...");
        await firebase.authFns.signInWithPopup(firebase.auth, provider);
    } catch (error) {
        if (shouldRetryPopupWithRedirect(error)) {
            try {
                await startGoogleRedirect(provider);
                return;
            } catch (redirectError) {
                showSignInError(redirectError);
                return;
            }
        }
        showSignInError(error);
    }
}

async function startGoogleRedirect(provider) {
    setStatus("מעביר אותך ל-Google באותו חלון...");
    await firebase.authFns.signInWithRedirect(firebase.auth, provider);
}

function isMobileAuthEnvironment() {
    const userAgent = navigator.userAgent || "";
    const mobileClientHint = navigator.userAgentData?.mobile === true;
    const mobileUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    // iPadOS may identify itself as macOS when "Request Desktop Website" is enabled.
    const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    return mobileClientHint || mobileUserAgent || iPadDesktopMode;
}

function shouldRetryPopupWithRedirect(error) {
    const code = error?.code || "";
    return code === "auth/popup-blocked"
        || code === "auth/cancelled-popup-request"
        || code === "auth/operation-not-supported-in-this-environment"
        || (code === "auth/popup-closed-by-user" && isMobileAuthEnvironment());
}

function showSignInError(error) {
    setStatus(`התחברות Google נכשלה: ${error?.message || "שגיאה לא ידועה"}`, true);
    finishSignInAttempt();
}

function finishSignInAttempt() {
    signInPending = false;
    setSignInButtonBusy(false);
}

function setSignInButtonBusy(isBusy) {
    const button = $("googleSignInButton");
    if (!button) return;
    button.disabled = isBusy;
    if (isBusy) {
        button.setAttribute("aria-busy", "true");
    } else {
        button.removeAttribute("aria-busy");
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
