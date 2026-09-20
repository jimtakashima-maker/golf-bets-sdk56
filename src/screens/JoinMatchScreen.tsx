import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRoundState } from '../state/useRoundState';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import BackButton from '../components/BackButton';

interface JoinMatchScreenProps {
  onPickedRound: (roundCode: string, name: string) => void;
  onBack: () => void;
  // Set when arriving here from a scanned QR / deep link (thenpressme://join?code=...)
  // so the code doesn't have to be retyped.
  initialCode?: string;
}

export default function JoinMatchScreen({ onPickedRound, onBack, initialCode }: JoinMatchScreenProps) {
  const previewRound = useRoundState((state) => state.previewRound);
  const status = useRoundState((state) => state.status);
  const errorMessage = useRoundState((state) => state.errorMessage);
  const profile = useRoundState((state) => state.profile);
  const loadProfile = useRoundState((state) => state.loadProfile);
  const setDisplayName = useRoundState((state) => state.setDisplayName);

  const [code, setCode] = useState(initialCode ?? '');
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

  const canSubmit = code.trim().length > 0 && name.trim().length > 0 && status !== 'connecting';

  const handleJoin = async () => {
    try {
      const trimmedCode = code.trim().toUpperCase();
      const trimmedName = name.trim();
      await previewRound(trimmedCode);
      if (trimmedName !== profile?.displayName) void setDisplayName(trimmedName);
      onPickedRound(trimmedCode, trimmedName);
    } catch {
      // errorMessage is already set in the store and rendered below.
    }
  };

  return (
    <PreRoundBackground>
      <View style={styles.container}>
        <BackButton onPress={onBack} />

        <AppLogo />
        <Text style={styles.title}>Join a Match</Text>
        <Text style={styles.subtitle}>Enter the round code your tee group shared with you.</Text>

        <TextInput
          style={styles.codeInput}
          placeholder="ROUND CODE"
          autoCapitalize="characters"
          autoCorrect={false}
          value={code}
          onChangeText={setCode}
          maxLength={8}
        />

        <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />

        {errorMessage && status === 'error' && <Text style={styles.error}>{errorMessage}</Text>}

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleJoin}
          disabled={!canSubmit}
        >
          {status === 'connecting' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
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

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#667',
    marginBottom: 24,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 12,
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
});
