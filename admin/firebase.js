import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import {
    initializeAppCheck,
    ReCaptchaV3Provider,
    getToken as getAppCheckTokenResult
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app-check.js";
import {
    browserLocalPersistence,
    GoogleAuthProvider,
    getAuth,
    getRedirectResult,
    onAuthStateChanged,
    setPersistence,
    signInWithPopup,
    signInWithRedirect,
    signOut
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocFromServer,
    getDocs,
    getFirestore,
    limit,
    query,
    setDoc,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBZGLV8MNwjoWRY0_KVgetVtpTHyTpII2k",
    authDomain: "trip-planner-pro-3fbd2.firebaseapp.com",
    projectId: "trip-planner-pro-3fbd2",
    storageBucket: "trip-planner-pro-3fbd2.firebasestorage.app",
    messagingSenderId: "726939691292",
    appId: "1:726939691292:web:0ecd0d1c7a01028d48b2d9",
    measurementId: "G-HL9S1WH2JY"
};

const app = initializeApp(firebaseConfig);

// --- Firebase App Check (reCAPTCHA v3) ---
// אתחול עטוף ב-try/catch: כשל ב-App Check (דומיין לא רשום, localhost, חסימת רשת)
// לא אמור לשבור את טעינת שאר Firebase או את הדף. האכיפה האמיתית בצד ה-Worker.
const APP_CHECK_SITE_KEY = "6LcXIQctAAAAAHsdHeGS1dsYFskibiuHZ7sXn_TX";
let appCheck = null;
try {
    appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true
    });
} catch (error) {
    console.warn("App Check initialization failed; continuing without it.", error);
}

// מחזיר את טוקן ה-App Check העדכני, או מחרוזת ריקה אם לא זמין (לא מפיל את הבקשה).
export async function getAppCheckToken() {
    if (!appCheck) return "";
    try {
        const result = await getAppCheckTokenResult(appCheck, /* forceRefresh */ false);
        return result?.token || "";
    } catch (_) {
        return "";
    }
}

const auth = getAuth(app);
const db = getFirestore(app);
const analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(app) : null)).catch(() => null);
const authReady = setPersistence(auth, browserLocalPersistence).catch(() => null);

export const tripTapAdminFirebase = {
    app,
    appCheck,
    getAppCheckToken,
    auth,
    db,
    analyticsPromise,
    authReady,
    authFns: {
        GoogleAuthProvider,
        getRedirectResult,
        onAuthStateChanged,
        signInWithPopup,
        signInWithRedirect,
        signOut
    },
    firestore: { addDoc, collection, deleteDoc, doc, getDoc, getDocFromServer, getDocs, limit, query, setDoc, serverTimestamp, where }
};
