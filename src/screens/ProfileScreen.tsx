import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRoundState, HandicapType, MAX_HANDICAP } from '../state/useRoundState';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import BackButton from '../components/BackButton';
import InfoButton from '../components/InfoButton';

interface ProfileScreenProps {
  // Omitted when this is the app-opening confirmation gate, shown before
  // Welcome - there's nothing to go back to yet.
  onBack?: () => void;
  // Present only for the opening gate: renders a "Continue" step instead
  // of "Save", requires both name and handicap before advancing, and
  // saves whatever's dirty along the way.
  onContinue?: () => void;
}

const HANDICAP_TYPES: { value: HandicapType; label: string }[] = [
  { value: 'ghin', label: 'GHIN' },
  { value: 'league', label: 'League (18 Adjusted)' },
  { value: 'usga_like', label: 'USGA Like' },
  { value: 'best_guess', label: 'Best Guess (18 Hole)' },
];

// A profile holds the display name and 18-hole handicap that get saved
// whenever you create or join a round - this screen is just a direct way
// to see and change any of it without having to start a round to do so.
export default function ProfileScreen({ onBack, onContinue }: ProfileScreenProps) {
  const profile = useRoundState((state) => state.profile);
  const loadProfile = useRoundState((state) => state.loadProfile);
  const setDisplayName = useRoundState((state) => state.setDisplayName);
  const setHandicap18 = useRoundState((state) => state.setHandicap18);
  const setHandicapType = useRoundState((state) => state.setHandicapType);
  const paymentHandles = useRoundState((state) => state.paymentHandles);
  const loadPaymentHandles = useRoundState((state) => state.loadPaymentHandles);
  const savePaymentHandles = useRoundState((state) => state.savePaymentHandles);

  const [name, setName] = useState('');
  const [handicapDraft, setHandicapDraft] = useState('');
  const [handicapType, setHandicapTypeDraft] = useState<HandicapType | null>(null);
  const [venmo, setVenmo] = useState('');
  const [paypal, setPaypal] = useState('');
  const [cashapp, setCashapp] = useState('');
  const [zelle, setZelle] = useState('');
  const [otherLabel, setOtherLabel] = useState('');
  const [otherValue, setOtherValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const isGate = !!onContinue;

  useEffect(() => {
    let cancelled = false;
    const tasks = [loadProfile()];
    if (!isGate) tasks.push(loadPaymentHandles());
    Promise.all(tasks).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProfile, loadPaymentHandles]);

  // Prefill from the saved values once they load - only while each field is
  // still untouched, so this never clobbers something being actively typed.
  useEffect(() => {
    if (profile?.displayName && !name) setName(profile.displayName);
    if (profile?.handicap18 != null && !handicapDraft) setHandicapDraft(String(profile.handicap18));
    if (profile?.handicapType && !handicapType) setHandicapTypeDraft(profile.handicapType);
  }, [profile]);

  useEffect(() => {
    if (paymentHandles?.venmo && !venmo) setVenmo(paymentHandles.venmo);
    if (paymentHandles?.paypal && !paypal) setPaypal(paymentHandles.paypal);
    if (paymentHandles?.cashapp && !cashapp) setCashapp(paymentHandles.cashapp);
    if (paymentHandles?.zelle && !zelle) setZelle(paymentHandles.zelle);
    if (paymentHandles?.otherLabel && !otherLabel) setOtherLabel(paymentHandles.otherLabel);
    if (paymentHandles?.otherValue && !otherValue) setOtherValue(paymentHandles.otherValue);
  }, [paymentHandles]);

  const trimmedName = name.trim();
  const handicapTrimmed = handicapDraft.trim();
  const handicapNumeric = handicapTrimmed === '' ? null : Number(handicapTrimmed);
  const handicapValid =
    handicapTrimmed === '' ||
    (Number.isFinite(handicapNumeric) && (handicapNumeric as number) <= MAX_HANDICAP);

  const nameDirty = trimmedName !== (profile?.displayName ?? '');
  const handicapDirty = handicapValid && handicapNumeric !== (profile?.handicap18 ?? null);
  const handicapTypeDirty = handicapType !== (profile?.handicapType ?? null);
  const venmoDirty = venmo.trim() !== (paymentHandles?.venmo ?? '');
  const paypalDirty = paypal.trim() !== (paymentHandles?.paypal ?? '');
  const cashappDirty = cashapp.trim() !== (paymentHandles?.cashapp ?? '');
  const zelleDirty = zelle.trim() !== (paymentHandles?.zelle ?? '');
  const otherLabelDirty = otherLabel.trim() !== (paymentHandles?.otherLabel ?? '');
  const otherValueDirty = otherValue.trim() !== (paymentHandles?.otherValue ?? '');
  const paymentDirty =
    venmoDirty || paypalDirty || cashappDirty || zelleDirty || otherLabelDirty || otherValueDirty;
  const dirty = nameDirty || handicapDirty || handicapTypeDirty || paymentDirty;

  // The opening gate requires both a name and an actual (non-blank)
  // handicap - blank is fine once you're just editing your profile later,
  // but not fine as the very thing this screen exists to confirm before a
  // round starts. Payment methods are never part of the gate - they stay
  // on the full Profile screen only.
  const canContinue = !!trimmedName && handicapTrimmed !== '' && handicapValid;

  const handleContinue = async () => {
    if (!onContinue || !canContinue || continuing) return;
    setContinuing(true);
    setContinueError(null);
    try {
      const tasks: Promise<void>[] = [];
      if (nameDirty) tasks.push(setDisplayName(trimmedName));
      if (handicapDirty) tasks.push(setHandicap18(handicapNumeric));
      if (handicapTypeDirty) tasks.push(setHandicapType(handicapType));
      await Promise.all(tasks);
      onContinue();
    } catch (error) {
      setContinueError((error as Error).message);
    } finally {
      setContinuing(false);
    }
  };

  const handleSave = async () => {
    if (!trimmedName || !handicapValid || saving || !dirty) return;
    setSaving(true);
    setSaved(false);
    try {
      const tasks: Promise<void>[] = [];
      if (nameDirty) tasks.push(setDisplayName(trimmedName));
      if (handicapDirty) tasks.push(setHandicap18(handicapNumeric));
      if (handicapTypeDirty) tasks.push(setHandicapType(handicapType));
      if (paymentDirty) {
        tasks.push(
          savePaymentHandles({
            venmo: venmo.trim() || null,
            paypal: paypal.trim() || null,
            cashapp: cashapp.trim() || null,
            zelle: zelle.trim() || null,
            otherLabel: otherLabel.trim() || null,
            otherValue: otherValue.trim() || null,
          })
        );
      }
      await Promise.all(tasks);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const screen = (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        {onBack && <BackButton onPress={onBack} />}
        {isGate && <AppLogo size={32} />}
        <Text style={styles.title}>{isGate ? 'Confirm Your Profile' : 'My Profile'}</Text>
        {isGate && (
          <Text style={styles.gateHint}>
            Set your name and handicap before creating or joining a round.
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1a7f37" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.labelRow}>
            <Text style={styles.label}>Display Name</Text>
            <InfoButton
              title="Display Name"
              message="This is the name your tee group sees when you join or start a round."
            />
          </View>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={(text) => {
              setName(text);
              setSaved(false);
            }}
            placeholder="Your name"
            autoCapitalize="words"
          />

          <View style={styles.labelRow}>
            <Text style={styles.label}>18-Hole Handicap</Text>
            <InfoButton
              title="18-Hole Handicap"
              message="Always your full 18-hole number. Used to work out your strokes for a round - a 9-hole round automatically uses half of this, on the hardest holes only."
            />
          </View>
          <TextInput
            style={styles.input}
            value={handicapDraft}
            onChangeText={(text) => {
              setHandicapDraft(text);
              setSaved(false);
            }}
            placeholder="e.g. 14.2"
            keyboardType="decimal-pad"
          />
          {!handicapValid && (
            <Text style={styles.error}>
              {isGate
                ? `Enter a number up to ${MAX_HANDICAP}.`
                : `Enter a number up to ${MAX_HANDICAP}, or leave it blank.`}
            </Text>
          )}

          <Text style={styles.label}>Handicap Type</Text>
          <Text style={styles.hint}>Where this number comes from - tap again to clear.</Text>
          <View style={styles.chipRow}>
            {HANDICAP_TYPES.map((option) => {
              const active = handicapType === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    setHandicapTypeDraft(active ? null : option.value);
                    setSaved(false);
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                </Pressable>
              );
            })}

          </View>

          {!isGate && (
            <View style={styles.paymentSection}>
              <View style={styles.labelRow}>
                <Text style={styles.sectionTitle}>Payment Methods</Text>
                <InfoButton
                  title="Payment Methods"
                  message="Add the handles your golf buddies can pay you with. Once saved, anyone who owes you money in a round's payout plan gets a prefilled pay-via button using whichever app you both have."
                />
              </View>

              <View style={styles.labelRow}>
                <Text style={styles.label}>Venmo</Text>
              </View>
              <TextInput
                style={styles.input}
                value={venmo}
                onChangeText={(text) => {
                  setVenmo(text);
                  setSaved(false);
                }}
                placeholder="@your-venmo"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>PayPal</Text>
              </View>
              <TextInput
                style={styles.input}
                value={paypal}
                onChangeText={(text) => {
                  setPaypal(text);
                  setSaved(false);
                }}
                placeholder="paypal.me username"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Cash App</Text>
              </View>
              <TextInput
                style={styles.input}
                value={cashapp}
                onChangeText={(text) => {
                  setCashapp(text);
                  setSaved(false);
                }}
                placeholder="$your-cashtag"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Zelle</Text>
                <InfoButton
                  title="Zelle"
                  message="Zelle has no public handle or payment link, so this is just for reference - your buddies will still send it themselves from their own bank app using the phone number or email you enter here."
                />
              </View>
              <TextInput
                style={styles.input}
                value={zelle}
                onChangeText={(text) => {
                  setZelle(text);
                  setSaved(false);
                }}
                placeholder="Phone number or email"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Other</Text>
                <InfoButton
                  title="Other"
                  message="Any other app your group uses - Apple Cash, a bank app, whatever works. Name it and add the handle or info someone would need."
                />
              </View>
              <View style={styles.otherRow}>
                <TextInput
                  style={[styles.input, styles.otherLabelInput]}
                  value={otherLabel}
                  onChangeText={(text) => {
                    setOtherLabel(text);
                    setSaved(false);
                  }}
                  placeholder="App name"
                />
                <TextInput
                  style={[styles.input, styles.otherValueInput]}
                  value={otherValue}
                  onChangeText={(text) => {
                    setOtherValue(text);
                    setSaved(false);
                  }}
                  placeholder="Handle"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>
          )}

          {isGate ? (
            <>
              {!canContinue && (
                <Text style={styles.error}>
                  {!trimmedName ? 'Enter a name to continue.' : 'Enter your handicap to continue.'}
                </Text>
              )}
              {continueError && <Text style={styles.error}>{continueError}</Text>}
              <Pressable
                style={[styles.button, (!canContinue || continuing) && styles.buttonDisabled]}
                onPress={handleContinue}
                disabled={!canContinue || continuing}
              >
                {continuing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                style={[styles.button, (!trimmedName || !handicapValid || !dirty || saving) && styles.buttonDisabled]}
                onPress={handleSave}
                disabled={!trimmedName || !handicapValid || !dirty || saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
              </Pressable>

              {saved && !dirty && <Text style={styles.saved}>Saved</Text>}
            </>
          )}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );

  // Only the opening gate (before Welcome) gets the watermark - editing
  // your profile mid-round from the settings menu stays as plain as
  // before.
  return isGate ? <PreRoundBackground>{screen}</PreRoundBackground> : screen;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 8,
  },

  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  gateHint: {
    color: '#889',
    fontSize: 13,
    marginBottom: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    // Extra room at the bottom so the Save button (and the Payment
    // Methods section above it) can scroll fully clear of the keyboard
    // and the home indicator instead of sitting flush against either.
    paddingBottom: 40,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  paymentSection: {
    marginTop: 4,
    marginBottom: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#223',
  },
  otherRow: {
    flexDirection: 'row',
    gap: 10,
  },
  otherLabelInput: {
    flex: 1,
  },
  otherValueInput: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#556',
  },
  hint: {
    color: '#889',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
    marginTop: -12,
    marginBottom: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#f7f8fa',
  },
  chipActive: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  chipText: {
    color: '#556',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  button: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  saved: {
    color: '#1a7f37',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
});
