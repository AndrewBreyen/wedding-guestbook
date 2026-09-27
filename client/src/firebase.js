// Initializes the Firebase app used for storing guestbook entries (Firestore)
// and photos (Storage). Config comes from env vars so real credentials never
// get committed — see client/.env.example. GitHub Pages demo mode never
// touches this file, since api.js short-circuits before firebase.js is used.
import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Firestore's default streaming transport gets blocked by some ad blockers /
// privacy extensions (its long-polling URLs look like tracking beacons),
// which can make writes appear to fail even though they went through.
// Auto-detecting long-polling avoids that on kiosk machines with unknown
// browser configs.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});
export const storage = getStorage(app);