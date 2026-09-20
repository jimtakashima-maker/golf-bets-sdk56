// Seeds the shared course library (Firebase Realtime Database, `courses`
// node) with a curated starter set of well-known SE Michigan public golf
// courses - real scorecard data (par, hole handicap index, tee ratings/
// slope/yardage), researched from official scorecards where available and
// cross-checked against multiple aggregator sites otherwise. Every entry
// with any data-quality caveat (a cross-source conflict, a single-sourced
// number) carries that caveat in its `notes` field, which the app's course
// picker shows to whoever selects it - see courses-data.json for the raw
// data.
//
// Run once from the project root: node scripts/seed-courses.js
//
// Safe to re-run: courses are looked up by name first and skipped if a
// course with that exact name already exists, so this won't create
// duplicates on a second run (e.g. after adding more courses to the data
// file later).

// No dotenv dependency in this project - read .env by hand instead of
// adding one just for this script.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

const { initializeApp } = require('@firebase/app');
const { getAuth, signInAnonymously } = require('@firebase/auth');
const { getDatabase, ref, get, push, set } = require('@firebase/database');
const courses = require('./courses-data.json');

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

async function main() {
  const missing = Object.entries(firebaseConfig).filter(([, v]) => !v);
  if (missing.length > 0) {
    console.error('Missing Firebase config (check .env):', missing.map(([k]) => k).join(', '));
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);

  console.log('Signing in anonymously...');
  const cred = await signInAnonymously(auth);
  const uid = cred.user.uid;
  console.log('Signed in as', uid);

  console.log('Loading existing courses...');
  const snapshot = await get(ref(db, 'courses'));
  const existing = snapshot.val() || {};
  const existingNames = new Set(Object.values(existing).map((c) => c.name));

  let created = 0;
  let skipped = 0;

  for (const course of courses) {
    if (existingNames.has(course.name)) {
      console.log(`Skipping "${course.name}" - a course with this name already exists.`);
      skipped += 1;
      continue;
    }

    const courseRef = push(ref(db, 'courses'));
    const payload = {
      name: course.name,
      totalHoles: course.totalHoles,
      holes: course.holes,
      createdBy: uid,
      createdAt: Date.now(),
    };
    if (course.tees && course.tees.length > 0) payload.tees = course.tees;
    if (course.notes) payload.notes = course.notes;

    await set(courseRef, payload);
    console.log(`Created "${course.name}" (${courseRef.key})`);
    created += 1;
  }

  console.log(`\nDone. ${created} course(s) created, ${skipped} skipped (already present).`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
