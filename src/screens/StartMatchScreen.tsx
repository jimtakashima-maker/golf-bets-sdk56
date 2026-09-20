import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useRoundState } from '../state/useRoundState';
import { shareRoundInvite } from '../lib/invite';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import BackButton from '../components/BackButton';

interface StartMatchScreenProps {
  onStarted: () => void;
  onScanScorecard: () => void;
  onBack: () => void;
}

export default function StartMatchScreen({ onStarted, onScanScorecard, onBack }: StartMatchScreenProps) {
  const createRound = useRoundState((state) => state.createRound);
  const roundCode = useRoundState((state) => state.roundCode);
  const status = useRoundState((state) => state.status);
  const errorMessage = useRoundState((state) => state.errorMessage);
  const profile = useRoundState((state) => state.profile);
  const loadProfile = useRoundState((state) => state.loadProfile);
  const setDisplayName = useRoundState((state) => state.setDisplayName);
  const leaveRound = useRoundState((state) => state.leaveRound);

  const [name, setName] = useState('');

  // Prefill from a previously-saved name so it doesn't have to be retyped
  // every time - only while the field is still untouched, so it never
  // clobbers something the person is actively typing.
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);
  useEffect(() => {
    if (profile?.displayName && !name) setName(profile.displayName);
  }, [profile]);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createRound(trimmed);
      if (trimmed !== profile?.displayName) void setDisplayName(trimmed);
    } catch {
      // errorMessage is already set in the store and rendered below.
    }
  };

  // The round exists in Firebase the moment createRound() resolves, but
  // nobody's been invited to it yet at this point - there was previously no
  // way back to Welcome from here at all once a round was created by
  // mistake, short of continuing all the way into the round and finding
  // "Leave Round" in its settings menu. This mirrors that same action here.
  const handleLeaveRound = () => {
    Alert.alert('Leave this round?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          leaveRound();
          onBack();
        },
      },
    ]);
  };

  // Once the round exists, show its code plus manual add-player controls -
  // this is the one place manual entry lives, for anyone in the group who
  // isn't joining from their own phone.
  if (roundCode) {
    // 1. Course, 2. Invite, 3. Round code (with QR), 4. Continue - the
    // course has to be picked before anyone's strokes can be worked out,
    // and the round code is what everyone actually needs in hand once
    // they've been invited, so it sits right before moving on.
    return (
      <PreRoundBackground>
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <AppLogo />
          <Text style={styles.title}>Match Started</Text>

          <Pressable style={styles.button} onPress={onScanScorecard}>
            <Text style={styles.buttonText}>Select Course</Text>
          </Pressable>

          <Pressable
            style={[styles.button, styles.secondaryButton]}
            onPress={() => void shareRoundInvite(roundCode)}
          >
            <Text style={styles.secondaryButtonText}>Send Invite</Text>
          </Pressable>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Round Code</Text>
            <Text style={styles.code}>{roundCode}</Text>
            <View style={styles.qrWrap}>
              <QRCode
                value={`THENPRESSME://JOIN/${roundCode}`}
                size={160}
                color="#000000"
                backgroundColor="#ffffff"
              />
            </View>
            <Text style={styles.codeHint}>
              Share this so others can join from their own phone - by code, or by scanning the
              QR to jump straight to Join with the code already filled in. Anyone who joins picks
              a tee group - each tee group's scores can only ever be changed by its own members.
            </Text>
          </View>

          <Pressable style={styles.button} onPress={onStarted}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>

          <Pressable onPress={handleLeaveRound} hitSlop={8} style={styles.manualLink}>
            <Text style={styles.manualLinkText}>Leave This Round</Text>
          </Pressable>
        </ScrollView>
      </PreRoundBackground>
    );
  }

  return (
    <PreRoundBackground>
      <View style={styles.container}>
        <BackButton onPress={onBack} />

        <AppLogo />
        <Text style={styles.title}>Start a Match</Text>
        <Text style={styles.subtitle}>You will get a round code to share with your tee group.</Text>

        <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />

        {errorMessage && status === 'error' && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable
          style={[styles.button, !name.trim() && styles.buttonDisabled]}
          onPress={handleCreate}
          disabled={!name.trim() || status === 'connecting'}
        >
          {status === 'connecting' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create Round</Text>
          )}
        </Pressable>
      </View>
    </PreRoundBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    paddingTop: 48,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  secondaryButton: {
    backgroundColor: '#f2f2f2',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#667',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  error: {
    color: '#c0392b',
    marginBottom: 12,
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
  button: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  codeBox: {
    backgroundColor: '#eef6ff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    marginBottom: 8,
  },
  codeLabel: {
    color: '#556',
    fontSize: 13,
    marginBottom: 6,
  },
  code: {
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 6,
  },
  codeHint: {
    color: '#556',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  qrWrap: {
    marginTop: 12,
    // A generous white quiet zone around the code - QR readers (especially
    // a phone camera photographing an emulator/monitor rather than a real
    // screen) need real margin around the modules to lock on reliably.
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
});
