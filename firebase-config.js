/* =========================================================
   FIREBASE CONFIG
   Replace the values below with your own Firebase project's
   config (Firebase Console → Project Settings → Your apps →
   SDK setup and configuration → Config).
   ========================================================= */
const firebaseConfig = {
  apiKey: "AIzaSyC7iMjYTJXdFyQDHAMNWA7RyuX5ToO802g",
  authDomain: "veritas-labs-af962.firebaseapp.com",
  projectId: "veritas-labs-af962",
  storageBucket: "veritas-labs-af962.firebasestorage.app",
  messagingSenderId: "99374158078",
  appId: "1:99374158078:web:3ffd09df586e91a11c95af"
};

firebase.initializeApp(firebaseConfig);

const mpDb = firebase.firestore();
const mpAuth = firebase.auth();

// Every player is signed in anonymously — no login screen needed.
// This gives each device a stable uid to identify players/turns by.
const mpReady = new Promise((resolve) => {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      resolve(user.uid);
    } else {
      firebase.auth().signInAnonymously().catch((err) => {
        console.error("Anonymous sign-in failed:", err);
      });
    }
  });
});

window.mpFirebase = { db: mpDb, auth: mpAuth, ready: mpReady };
