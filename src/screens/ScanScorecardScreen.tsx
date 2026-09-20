import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
} from 'react-native';
// expo-image-picker's native module is not bundled in Expo Go, and its
// module body reads native constants at import time - a static top-level
// import here would crash the WHOLE app on startup in Expo Go, not just
// this screen. Import it lazily (only when actually used) and use a
// type-only import for the TypeScript types, which is erased at compile
// time and never touches the native module.
import type * as ImagePickerModule from 'expo-image-picker';
import { useRoundState, HoleInfo, HolesInfo, CourseInfo, TeeInfo } from '../state/useRoundState';
import { scanScorecard, isGeminiConfigured } from '../lib/gemini';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import BackButton from '../components/BackButton';

const IMAGE_PICKER_UNAVAILABLE_MESSAGE =
  'Photo scanning needs a custom development build - it is not available in Expo Go. ' +
  'Use "Skip photo, enter manually" below for now.';

// Thrown deliberately when the user denies a permission prompt, so it can
// be told apart from a native-module failure (which should show the
// generic Expo Go message instead of a confusing raw error).
class PermissionDeniedError extends Error {}

async function loadImagePicker(): Promise<typeof ImagePickerModule> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any;
  try {
    mod = await import('expo-image-picker');
  } catch {
    throw new Error(IMAGE_PICKER_UNAVAILABLE_MESSAGE);
  }

  // Depending on Metro's CJS/ESM interop for dynamic import(), the real
  // exports can land either directly on the module or nested under
  // .default - check both rather than assuming one shape.
  const resolved = typeof mod?.launchCameraAsync === 'function' ? mod : mod?.default;

  if (!resolved || typeof resolved.launchCameraAsync !== 'function') {
    throw new Error(IMAGE_PICKER_UNAVAILABLE_MESSAGE);
  }

  return resolved as typeof ImagePickerModule;
}

interface ScanScorecardScreenProps {
  onDone: () => void;
  onBack: () => void;
  // When true, skips straight to the editable review grid, pre-filled with
  // the round's current hole info, instead of the capture/scan flow - for
  // fixing a wrong par or handicap index after the round (or that hole)
  // has already started, rather than setting a course up for the first
  // time. Reused from the round settings menu's "Modify Course Details".
  editExisting?: boolean;
}

type Mode = 'capture' | 'loading' | 'review' | 'backNinePrompt';

function defaultHoles(): HolesInfo {
  const holes: HolesInfo = {};
  for (let i = 1; i <= 18; i++) {
    holes[i] = { par: 4, handicapIndex: i };
  }
  return holes;
}

export default function ScanScorecardScreen({ onDone, onBack, editExisting }: ScanScorecardScreenProps) {
  const setHoles = useRoundState((state) => state.setHoles);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const setTotalHoles = useRoundState((state) => state.setTotalHoles);
  const currentHoles = useRoundState((state) => state.holes);
  const courses = useRoundState((state) => state.courses);
  const loadCourses = useRoundState((state) => state.loadCourses);
  const applyCourse = useRoundState((state) => state.applyCourse);
  const saveCourse = useRoundState((state) => state.saveCourse);

  const [mode, setMode] = useState<Mode>(editExisting ? 'review' : 'capture');
  const [draftHoles, setDraftHoles] = useState<HolesInfo>(() =>
    editExisting && Object.keys(currentHoles).length > 0 ? { ...currentHoles } : defaultHoles(),
  );
  // Tee sets entered when saving this course to the shared library - see
  // SaveCourseModal below. Not part of the round itself (nothing about the
  // current round's holes depends on which tee anyone plays), so there's
  // nothing to prefill when just fixing hole info mid-round.
  const [draftTees, setDraftTees] = useState<TeeInfo[]>([]);
  const [holeCount, setHoleCount] = useState<9 | 18>(totalHoles === 9 ? 9 : 18);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Picking a saved course, and saving the current draft as a new one - see
  // CoursePickerModal/SaveCourseModal below.
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [showSaveCourse, setShowSaveCourse] = useState(false);
  const [courseNameInput, setCourseNameInput] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  const applyScanResult = async (
    backNine: boolean,
    pickImage: (ImagePicker: typeof ImagePickerModule) => Promise<ImagePickerModule.ImagePickerResult>
  ) => {
    const ImagePicker = await loadImagePicker();
    return applyScanResultWithPicker(backNine, ImagePicker, pickImage);
  };

  const applyScanResultWithPicker = async (
    backNine: boolean,
    ImagePicker: typeof ImagePickerModule,
    pickImage: (ImagePicker: typeof ImagePickerModule) => Promise<ImagePickerModule.ImagePickerResult>
  ) => {
    setError(null);

    // Expo modules resolve their native bridge lazily, inside each
    // function call rather than at import time - so a missing native
    // module (e.g. running in Expo Go) only throws here, not in
    // loadImagePicker(). Any failure here that isn't our own deliberate
    // permission-denied throw gets normalized to the same friendly
    // Expo Go message rather than leaking a raw native error string.
    let result: ImagePickerModule.ImagePickerResult;
    try {
      result = await pickImage(ImagePicker);
    } catch (err) {
      if (err instanceof PermissionDeniedError) throw err;
      throw new Error(IMAGE_PICKER_UNAVAILABLE_MESSAGE);
    }

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!asset.base64) {
      setError('Could not read that photo - try again.');
      return;
    }

    setMode('loading');
    try {
      const scanned = await scanScorecard(asset.base64, asset.mimeType ?? 'image/jpeg');

      // A misread from the OCR pass (a stray 0, an out-of-range hole
      // number) would otherwise sit in the review grid unvalidated until
      // someone retypes it - clamp to the same valid ranges the manual
      // entry fields below enforce, so a missed misread can never leave
      // an impossible par (like 0) saved to the round.
      if (backNine) {
        // A second, back-9 photo is merged into whatever the front-9 photo
        // already found, shifted onto holes 10-18. Its own card may be
        // numbered 1-9 (a separate nine played as the "back") or already
        // print 10-18 - accept either.
        setDraftHoles((prev) => {
          const next = { ...prev };
          for (const entry of scanned) {
            const targetHole = entry.hole <= 9 ? entry.hole + 9 : entry.hole;
            if (targetHole < 10 || targetHole > 18) continue;
            const par = entry.par >= 3 && entry.par <= 6 ? entry.par : 4;
            const handicapIndex =
              entry.handicapIndex >= 1 && entry.handicapIndex <= 18 ? entry.handicapIndex : targetHole;
            next[targetHole] = { par, handicapIndex };
          }
          return next;
        });
        setHoleCount(18);
        setMode('review');
      } else {
        // Start empty rather than pre-seeding all 18 with placeholders -
        // only holes the photo actually showed end up in draftHoles, so a
        // genuinely 9-hole scan leaves 10-18 truly absent (not just hidden
        // in the UI) rather than baking in fake par-4 filler that would
        // later look like a real 18-hole course.
        const holes: HolesInfo = {};
        for (const entry of scanned) {
          if (entry.hole < 1 || entry.hole > 18) continue;
          const par = entry.par >= 3 && entry.par <= 6 ? entry.par : 4;
          const handicapIndex =
            entry.handicapIndex >= 1 && entry.handicapIndex <= 18 ? entry.handicapIndex : entry.hole;
          holes[entry.hole] = { par, handicapIndex };
        }
        setDraftHoles(holes);

        // A stray hallucinated extra hole shouldn't count as "this card has
        // a back 9" - require a handful of real back-9 entries before
        // treating the scan as already covering all 18.
        const backNineHolesSeen = scanned.filter((entry) => entry.hole > 9).length;
        if (backNineHolesSeen >= 5) {
          setHoleCount(18);
          setMode('review');
        } else {
          setHoleCount(9);
          setMode('backNinePrompt');
        }
      }
    } catch (err) {
      setError((err as Error).message);
      setMode(backNine ? 'backNinePrompt' : 'capture');
    }
  };

  const handleTakePhoto = () => {
    applyScanResult(false, async (ImagePicker) => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new PermissionDeniedError('Camera access is needed to scan a scorecard.');
      }
      return ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    }).catch((err: Error) => {
      setError(err.message);
      setMode('capture');
    });
  };

  const handleChooseFromLibrary = () => {
    applyScanResult(false, async (ImagePicker) => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new PermissionDeniedError('Photo library access is needed to pick a scorecard photo.');
      }
      return ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    }).catch((err: Error) => {
      setError(err.message);
      setMode('capture');
    });
  };

  const handleTakeBackNinePhoto = () => {
    applyScanResult(true, async (ImagePicker) => {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        throw new PermissionDeniedError('Camera access is needed to scan a scorecard.');
      }
      return ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 });
    }).catch((err: Error) => {
      setError(err.message);
      setMode('backNinePrompt');
    });
  };

  const handleChooseBackNineFromLibrary = () => {
    applyScanResult(true, async (ImagePicker) => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new PermissionDeniedError('Photo library access is needed to pick a scorecard photo.');
      }
      return ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.7 });
    }).catch((err: Error) => {
      setError(err.message);
      setMode('backNinePrompt');
    });
  };

  const handleDeclineBackNine = () => {
    setError(null);
    setHoleCount(9);
    setMode('review');
  };

  const handleEnterManually = () => {
    setError(null);
    setDraftHoles(defaultHoles());
    setHoleCount(18);
    setMode('review');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await setHoles(draftHoles);
      await setTotalHoles(holeCount);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCoursePicker = async () => {
    setError(null);
    setShowCoursePicker(true);
    setLoadingCourses(true);
    try {
      await loadCourses();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingCourses(false);
    }
  };

  // Applying a saved course writes straight to the round and skips the
  // review grid - that data was already reviewed once, when it was first
  // saved, so there's nothing to re-check here.
  const handlePickCourse = async (course: CourseInfo) => {
    setShowCoursePicker(false);
    setError(null);
    try {
      await applyCourse(course.id);
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveCourse = async () => {
    if (!courseNameInput.trim()) return;
    setSavingCourse(true);
    setError(null);
    try {
      const cleanTees = draftTees.filter((t) => t.name.trim().length > 0);
      await saveCourse(courseNameInput.trim(), draftHoles, holeCount, cleanTees);
      setShowSaveCourse(false);
      setCourseNameInput('');
      setDraftTees([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingCourse(false);
    }
  };

  if (mode === 'loading') {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#1a7f37" />
        <Text style={styles.loadingText}>Reading scorecard...</Text>
      </View>
    );
  }

  if (mode === 'backNinePrompt') {
    return (
      <PreRoundBackground>
        <View style={styles.container}>
          <Text style={styles.title}>Back 9?</Text>
          <Text style={styles.subtitle}>
            That photo only showed 9 holes. Got a photo of the back 9 (or a second nine), or is
            this round just those 9 holes?
          </Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.button, !isGeminiConfigured() && styles.buttonDisabled]}
            onPress={handleTakeBackNinePhoto}
            disabled={!isGeminiConfigured()}
          >
            <Text style={styles.buttonText}>Take Photo of Back 9</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.secondaryButton, !isGeminiConfigured() && styles.buttonDisabled]}
            onPress={handleChooseBackNineFromLibrary}
            disabled={!isGeminiConfigured()}
          >
            <Text style={styles.secondaryButtonText}>Choose from Library</Text>
          </Pressable>

          <Pressable onPress={handleDeclineBackNine} hitSlop={8} style={styles.manualLink}>
            <Text style={styles.manualLinkText}>No, only 9 holes</Text>
          </Pressable>
        </View>
      </PreRoundBackground>
    );
  }

  if (mode === 'review') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{editExisting ? 'Modify Course Details' : 'Review Scorecard'}</Text>
        <Text style={styles.subtitle}>
          {editExisting
            ? "Fix any hole's par or handicap index, then save - this updates the course for everyone in the round."
            : 'Fix anything that was misread, then save.'}
        </Text>

        <View style={styles.headerRow}>
          <Text style={[styles.holeNumber, styles.headerText]}>Hole</Text>
          <Text style={[styles.holeInput, styles.headerText]}>Par</Text>
          <Text style={[styles.holeInput, styles.headerText]}>Index</Text>
        </View>

        <ScrollView style={styles.list}>
          {Array.from({ length: holeCount }, (_, i) => i + 1).map((hole) => (
            <HoleRow
              key={hole}
              hole={hole}
              info={draftHoles[hole] ?? { par: 4, handicapIndex: hole }}
              onChange={(h, info) => setDraftHoles((prev) => ({ ...prev, [h]: info }))}
            />
          ))}
        </ScrollView>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
        </Pressable>

        <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => setShowSaveCourse(true)}>
          <Text style={styles.secondaryButtonText}>Save as Course...</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.secondaryButton]} onPress={onBack} disabled={saving}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>

        <SaveCourseModal
          visible={showSaveCourse}
          name={courseNameInput}
          onChangeName={setCourseNameInput}
          tees={draftTees}
          onChangeTees={setDraftTees}
          onCancel={() => {
            setShowSaveCourse(false);
            setCourseNameInput('');
            setDraftTees([]);
          }}
          onSave={handleSaveCourse}
          saving={savingCourse}
        />
      </View>
    );
  }

  return (
    <PreRoundBackground>
      <View style={styles.container}>
        <BackButton onPress={onBack} />

        <AppLogo />
        <Text style={styles.title}>Set Up the Course</Text>
        <Text style={styles.subtitle}>
          Pick a course you've saved before, or photograph a printed scorecard to fill in par and
          handicap index for each hole.
        </Text>

        {!isGeminiConfigured() && (
          <Text style={styles.warning}>
            Gemini isn't configured yet (missing EXPO_PUBLIC_GEMINI_API_KEY) - you can still enter
            hole info manually below.
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.button} onPress={handleOpenCoursePicker}>
          <Text style={styles.buttonText}>Use a Saved Course</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.secondaryButton, !isGeminiConfigured() && styles.buttonDisabled]}
          onPress={handleTakePhoto}
          disabled={!isGeminiConfigured()}
        >
          <Text style={styles.secondaryButtonText}>Take Photo</Text>
        </Pressable>

        <Pressable
          style={[styles.button, styles.secondaryButton, !isGeminiConfigured() && styles.buttonDisabled]}
          onPress={handleChooseFromLibrary}
          disabled={!isGeminiConfigured()}
        >
          <Text style={styles.secondaryButtonText}>Choose from Library</Text>
        </Pressable>

        <Pressable onPress={handleEnterManually} hitSlop={8} style={styles.manualLink}>
          <Text style={styles.manualLinkText}>Skip photo, enter manually</Text>
        </Pressable>

        <CoursePickerModal
          visible={showCoursePicker}
          courses={courses}
          loading={loadingCourses}
          onPick={handlePickCourse}
          onCancel={() => setShowCoursePicker(false)}
        />
      </View>
    </PreRoundBackground>
  );
}

// A short naming prompt shown after reviewing scanned/manual hole data, so
// the same course doesn't have to be re-entered next time it's played.
function emptyTee(): TeeInfo {
  return { name: '', rating: 72, slope: 113, yardage: 6200 };
}

// A single tee's rating/slope/yardage, entered as part of saving a course -
// optional, so a quick "just the hole info" save doesn't force anyone
// through fields they don't have handy.
function TeeEditRow({
  tee,
  onChange,
  onRemove,
}: {
  tee: TeeInfo;
  onChange: (tee: TeeInfo) => void;
  onRemove: () => void;
}) {
  const [ratingText, setRatingText] = useState(String(tee.rating));
  const [slopeText, setSlopeText] = useState(String(tee.slope));
  const [yardageText, setYardageText] = useState(String(tee.yardage));

  const commitRating = (raw: string) => {
    setRatingText(raw);
    const num = parseFloat(raw);
    if (!isNaN(num)) onChange({ ...tee, rating: num });
  };
  const commitSlope = (raw: string) => {
    setSlopeText(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) onChange({ ...tee, slope: num });
  };
  const commitYardage = (raw: string) => {
    setYardageText(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num)) onChange({ ...tee, yardage: num });
  };

  return (
    <View style={modalStyles.teeCard}>
      <View style={modalStyles.teeNameRow}>
        <TextInput
          style={modalStyles.teeNameInput}
          placeholder="Tee name (e.g. Blue)"
          value={tee.name}
          onChangeText={(name) => onChange({ ...tee, name })}
        />
        <Pressable onPress={onRemove} hitSlop={8}>
          <Text style={modalStyles.teeRemove}>Remove</Text>
        </Pressable>
      </View>
      <View style={modalStyles.teeFieldsRow}>
        <View style={modalStyles.teeField}>
          <Text style={modalStyles.teeFieldLabel}>Rating</Text>
          <TextInput
            style={modalStyles.teeFieldInput}
            keyboardType="decimal-pad"
            value={ratingText}
            onChangeText={commitRating}
          />
        </View>
        <View style={modalStyles.teeField}>
          <Text style={modalStyles.teeFieldLabel}>Slope</Text>
          <TextInput
            style={modalStyles.teeFieldInput}
            keyboardType="number-pad"
            value={slopeText}
            onChangeText={commitSlope}
          />
        </View>
        <View style={modalStyles.teeField}>
          <Text style={modalStyles.teeFieldLabel}>Yardage</Text>
          <TextInput
            style={modalStyles.teeFieldInput}
            keyboardType="number-pad"
            value={yardageText}
            onChangeText={commitYardage}
          />
        </View>
      </View>
    </View>
  );
}

function SaveCourseModal({
  visible,
  name,
  onChangeName,
  tees,
  onChangeTees,
  onCancel,
  onSave,
  saving,
}: {
  visible: boolean;
  name: string;
  onChangeName: (name: string) => void;
  tees: TeeInfo[];
  onChangeTees: (tees: TeeInfo[]) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={modalStyles.backdrop} onPress={onCancel} />
      <View style={modalStyles.sheet}>
        <Text style={modalStyles.title}>Save as Course</Text>
        <Text style={modalStyles.subtitle}>
          Anyone using the app can pick this course next time, instead of re-entering it.
        </Text>
        <TextInput
          style={modalStyles.input}
          placeholder="Course name"
          value={name}
          onChangeText={onChangeName}
          autoFocus
        />

        <Text style={modalStyles.teesSectionLabel}>Tees (optional)</Text>
        <ScrollView style={modalStyles.teesList}>
          {tees.map((tee, i) => (
            <TeeEditRow
              key={i}
              tee={tee}
              onChange={(updated) => onChangeTees(tees.map((t, j) => (j === i ? updated : t)))}
              onRemove={() => onChangeTees(tees.filter((_, j) => j !== i))}
            />
          ))}
        </ScrollView>
        <Pressable
          style={modalStyles.addTeeButton}
          onPress={() => onChangeTees([...tees, emptyTee()])}
        >
          <Text style={modalStyles.addTeeButtonText}>+ Add Tee</Text>
        </Pressable>

        <Pressable
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={onSave}
          disabled={!name.trim() || saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Course</Text>}
        </Pressable>
        <Pressable style={modalStyles.cancelButton} onPress={onCancel}>
          <Text style={modalStyles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// A short "6,555 yds · 70.8/118" style summary from a course's longest tee,
// so the picker gives a hint of scale without opening the course.
function teeSummary(course: CourseInfo): string | null {
  if (!course.tees || course.tees.length === 0) return null;
  const longest = [...course.tees].sort((a, b) => b.yardage - a.yardage)[0];
  return `${longest.name} ${longest.yardage.toLocaleString()} yds · ${longest.rating}/${longest.slope}`;
}

// Browse the shared course library and apply one directly to this round.
function CoursePickerModal({
  visible,
  courses,
  loading,
  onPick,
  onCancel,
}: {
  visible: boolean;
  courses: CourseInfo[];
  loading: boolean;
  onPick: (course: CourseInfo) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? courses.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : courses;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <Pressable style={modalStyles.backdrop} onPress={onCancel} />
      <View style={modalStyles.sheet}>
        <Text style={modalStyles.title}>Saved Courses</Text>

        {courses.length > 0 && (
          <TextInput
            style={modalStyles.searchInput}
            placeholder="Search courses..."
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#1a7f37" style={modalStyles.loading} />
        ) : courses.length === 0 ? (
          <Text style={modalStyles.empty}>No saved courses yet - scan or enter one, then save it for next time.</Text>
        ) : filtered.length === 0 ? (
          <Text style={modalStyles.empty}>No courses match "{query}".</Text>
        ) : (
          <ScrollView style={modalStyles.list}>
            {filtered.map((course) => {
              const summary = teeSummary(course);
              return (
                <Pressable key={course.id} style={modalStyles.courseRow} onPress={() => onPick(course)}>
                  <View style={modalStyles.courseRowText}>
                    <Text style={modalStyles.courseName}>{course.name}</Text>
                    <Text style={modalStyles.courseMeta}>
                      {course.totalHoles} holes{summary ? ` · ${summary}` : ''}
                    </Text>
                    {course.notes && <Text style={modalStyles.courseNotes}>{course.notes}</Text>}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <Pressable style={modalStyles.cancelButton} onPress={onCancel}>
          <Text style={modalStyles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

interface HoleRowProps {
  hole: number;
  info: HoleInfo;
  onChange: (hole: number, info: HoleInfo) => void;
}

function HoleRow({ hole, info, onChange }: HoleRowProps) {
  const [parText, setParText] = useState(String(info.par));
  const [indexText, setIndexText] = useState(String(info.handicapIndex));

  useEffect(() => {
    setParText(String(info.par));
  }, [info.par]);

  useEffect(() => {
    setIndexText(String(info.handicapIndex));
  }, [info.handicapIndex]);

  const commitPar = (raw: string) => {
    setParText(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 3 && num <= 6) {
      onChange(hole, { ...info, par: num });
    }
  };

  const commitIndex = (raw: string) => {
    setIndexText(raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= 18) {
      onChange(hole, { ...info, handicapIndex: num });
    }
  };

  return (
    <View style={styles.holeRow}>
      <Text style={styles.holeNumber}>{hole}</Text>
      <TextInput
        style={styles.holeInput}
        keyboardType="number-pad"
        value={parText}
        onChangeText={commitPar}
      />
      <TextInput
        style={styles.holeInput}
        keyboardType="number-pad"
        value={indexText}
        onChangeText={commitIndex}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 48,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#667',
    marginBottom: 20,
  },
  warning: {
    color: '#a15c00',
    backgroundColor: '#fff6e5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  error: {
    color: '#c0392b',
    marginBottom: 12,
  },
  loadingText: {
    marginTop: 16,
    color: '#556',
    fontSize: 15,
  },
  button: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#f2f2f2',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  manualLink: {
    alignItems: 'center',
    marginTop: 8,
  },
  manualLinkText: {
    color: '#667',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667',
    textTransform: 'uppercase',
  },
  list: {
    flex: 1,
    marginBottom: 12,
  },
  holeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  holeNumber: {
    width: 60,
    fontSize: 15,
    fontWeight: '600',
  },
  holeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    marginRight: 8,
  },
});

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: '#889',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },
  loading: {
    marginVertical: 20,
  },
  empty: {
    color: '#889',
    paddingVertical: 12,
  },
  list: {
    maxHeight: 320,
  },
  courseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f3f3',
  },
  courseRowText: {
    flex: 1,
  },
  courseName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#234',
  },
  courseMeta: {
    fontSize: 12,
    color: '#889',
    marginTop: 2,
  },
  courseNotes: {
    fontSize: 11,
    color: '#a15c00',
    marginTop: 3,
    fontStyle: 'italic',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 8,
  },
  teesSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  teesList: {
    maxHeight: 220,
  },
  teeCard: {
    backgroundColor: '#f7f8f8',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  teeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teeNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 10,
    backgroundColor: '#fff',
  },
  teeRemove: {
    color: '#c0392b',
    fontSize: 13,
    fontWeight: '600',
  },
  teeFieldsRow: {
    flexDirection: 'row',
  },
  teeField: {
    flex: 1,
    marginRight: 8,
  },
  teeFieldLabel: {
    fontSize: 10,
    color: '#889',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  teeFieldInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: 'center',
    backgroundColor: '#fff',
  },
  addTeeButton: {
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  addTeeButtonText: {
    color: '#1a7f37',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelButton: {
    alignSelf: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#889',
    fontWeight: '600',
  },
});
