import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";
import {
    ReCaptchaV3Provider,
    getToken,
    initializeAppCheck
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

const APP_CHECK_SITE_KEY = "6LcXIQctAAAAAHsdHeGS1dsYFskibiuHZ7sXn_TX";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appCheckPromise = Promise.resolve()
    .then(() => initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
        isTokenAutoRefreshEnabled: true
    }))
    .catch((error) => {
        console.error("Firebase App Check initialization failed", error);
        return null;
    });
const analyticsPromise = isSupported().then((supported) => (supported ? getAnalytics(app) : null)).catch(() => null);
const authReady = setPersistence(auth, browserLocalPersistence).catch(() => null);

export const tripTapAdminFirebase = {
    app,
    appCheckPromise,
    auth,
    db,
    analyticsPromise,
    authReady,
    appCheckFns: {
        getToken
    },
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
