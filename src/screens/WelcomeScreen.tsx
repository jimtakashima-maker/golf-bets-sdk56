import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import FeedbackModal from '../components/FeedbackModal';
import LegalFooter from '../components/LegalFooter';

interface WelcomeScreenProps {
  onJoin: () => void;
  onStart: () => void;
  onHistory: () => void;
  onStats: () => void;
  onProfile: () => void;
  onLegal: () => void;
  // Only ever passed by App.tsx when this device's own profile has
  // isAdmin set - everyone else's Welcome screen never even gets this
  // prop, so there's nothing to hide client-side, just nothing to show.
  onAdmin?: () => void;
  resumeAvailable?: boolean;
  resuming?: boolean;
  resumeError?: string | null;
  onResume?: () => void;
}

export default function WelcomeScreen({
  onJoin,
  onStart,
  onHistory,
  onStats,
  onProfile,
  onLegal,
  onAdmin,
  resumeAvailable,
  resuming,
  resumeError,
  onResume,
}: WelcomeScreenProps) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <PreRoundBackground>
      <View style={styles.container}>
        <AppLogo size={56} />
        <Text style={styles.subtitle}>Track Nassau, presses, and more with your tee group, live.</Text>

        {resumeAvailable && (
          <Pressable
            style={[styles.button, styles.resumeButton, resuming && styles.buttonDisabled]}
            onPress={onResume}
            disabled={resuming}
          >
            {resuming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryButtonText}>Resume Round</Text>
                <Text style={styles.primaryButtonHint}>Pick up where you left off</Text>
              </>
            )}
          </Pressable>
        )}
        {resumeError && <Text style={styles.resumeError}>{resumeError}</Text>}

        <Pressable style={[styles.button, styles.primaryButton]} onPress={onJoin}>
          <Text style={styles.primaryButtonText}>Join a Match</Text>
          <Text style={styles.primaryButtonHint}>Have a round code from your tee group?</Text>
        </Pressable>

        <Pressable style={[styles.button, styles.secondaryButton]} onPress={onStart}>
          <Text style={styles.secondaryButtonText}>Start a Match</Text>
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable style={styles.linkButton} onPress={onProfile} hitSlop={8}>
            <Text style={styles.historyLinkText}>My Profile</Text>
          </Pressable>
          <Text style={styles.linkDivider}>{'\u00b7'}</Text>
          <Pressable style={styles.linkButton} onPress={onHistory} hitSlop={8}>
            <Text style={styles.historyLinkText}>My History</Text>
          </Pressable>
          <Text style={styles.linkDivider}>{'\u00b7'}</Text>
          <Pressable style={styles.linkButton} onPress={onStats} hitSlop={8}>
            <Text style={styles.historyLinkText}>My Stats</Text>
          </Pressable>
          <Text style={styles.linkDivider}>{'\u00b7'}</Text>
          <Pressable style={styles.linkButton} onPress={() => setFeedbackOpen(true)} hitSlop={8}>
            <Text style={styles.historyLinkText}>Send Feedback</Text>
          </Pressable>
          <Text style={styles.linkDivider}>{'\u00b7'}</Text>
          <Pressable style={styles.linkButton} onPress={onLegal} hitSlop={8}>
            <Text style={styles.historyLinkText}>Legal</Text>
          </Pressable>
        </View>

        {onAdmin && (
          <Pressable style={styles.adminLink} onPress={onAdmin} hitSlop={8}>
            <Text style={styles.adminLinkText}>Admin</Text>
          </Pressable>
        )}
      </View>

      <LegalFooter />

      <FeedbackModal visible={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
    </PreRoundBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#667',
    textAlign: 'center',
    marginBottom: 40,
  },
  button: {
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryButton: {
    backgroundColor: '#1a7f37',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  primaryButtonHint: {
    color: '#d7f2df',
    fontSize: 12,
    marginTop: 4,
  },
  resumeButton: {
    backgroundColor: '#2d6cdf',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  resumeError: {
    color: '#c0392b',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 16,
  },
  secondaryButton: {
    backgroundColor: '#f2f2f2',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    rowGap: 4,
  },
  linkButton: {
    paddingVertical: 8,
  },
  linkDivider: {
    color: '#ccd',
    fontSize: 14,
    marginHorizontal: 8,
  },
  historyLinkText: {
    color: '#667',
    fontSize: 14,
    fontWeight: '600',
  },
  adminLink: {
    alignSelf: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  adminLinkText: {
    color: '#bbc',
    fontSize: 12,
    fontWeight: '600',
  },
});
