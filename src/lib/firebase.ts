import { initializeApp, getApps, getApp } from '@firebase/app';
import { initializeAuth, getAuth, signInAnonymously } from '@firebase/auth';
// @firebase/auth's type declarations resolve to a platform-generic file that
// omits getReactNativePersistence, even though the React Native build it
// ships at runtime (which Metro correctly resolves) does export it - a known
// quirk of how the package's "exports" map is set up. Safe to suppress here;
// this is the one place it's used.
// @ts-expect-error - see comment above
import { getReactNativePersistence } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '@firebase/database';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const requiredKeys: (keyof typeof firebaseConfig)[] = [
  'apiKey',
  'authDomain',
  'databaseURL',
  'projectId',
  'appId',
];

const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  console.warn(
    `Firebase config is missing: ${missingKeys.join(', ')}. ` +
      'Add them to a .env file (see .env.example) before creating or joining online rounds.'
  );
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getDatabase(firebaseApp);

// initializeAuth() sets up persistent (AsyncStorage-backed) anonymous auth,
// so a player keeps the same identity across app restarts instead of
// silently becoming a "new" player each time - that identity is what the
// database security rules check to decide which group's scores a device is
// allowed to write. initializeAuth() may only be called once per app, so on
// Fast Refresh (which re-runs this module) it throws "already initialized" -
// fall back to plain getAuth() in that case, which returns the existing
// instance.
export const auth = (() => {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
})();

let signInPromise: Promise<void> | null = null;

// Anonymous auth is enough to let Realtime Database rules require
// "auth != null" without asking players to create an account.
export function ensureSignedIn(): Promise<void> {
  if (auth.currentUser) return Promise.resolve();
  if (!signInPromise) {
    signInPromise = signInAnonymously(auth)
      .then(() => undefined)
      .catch((error: unknown) => {
        signInPromise = null;
        throw error;
      });
  }
  return signInPromise as Promise<void>;
}
