import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, Alert } from 'react-native';
import { useRoundState } from '../state/useRoundState';
import { shareRoundInvite } from '../lib/invite';
import RoundPrepScreen from './RoundPrepScreen';
import ScanScorecardScreen from './ScanScorecardScreen';
import ScoreScreen from './ScoreScreen';
import LeaderboardScreen from './LeaderboardScreen';
import SettlementScreen from './SettlementScreen';
import BackButton from '../components/BackButton';
import AppLogo from '../components/AppLogo';

interface RoundScreenProps {
  onLeaveRound: () => void;
  onProfile: () => void;
}

// Score, Leaderboard, and Settlement are the three places you're actually
// checking during a round, so those are the tabs. Setup and leaving the
// round are occasional admin actions, not something you flip to mid-round,
// so they live behind a single settings menu in the header instead of
// eating tab space or header width with two separate buttons.
type RoundTab = 'score' | 'leaderboard' | 'settlement';

export default function RoundScreen({ onLeaveRound, onProfile }: RoundScreenProps) {
  const roundCode = useRoundState((state) => state.roundCode);
  const roundStatus = useRoundState((state) => state.roundStatus);
  const leaveRound = useRoundState((state) => state.leaveRound);

  const [tab, setTab] = useState<RoundTab>('score');
  const [showAdmin, setShowAdmin] = useState(false);
  const [showCourseEdit, setShowCourseEdit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleGameAdmin = () => {
    setSettingsOpen(false);
    setShowAdmin(true);
  };

  // Available any time a round exists (not just once it's active) - a
  // wrong par or handicap index is just as easy to catch during setup as
  // mid-round, and there's otherwise no way back into this screen once
  // "Continue" has been tapped.
  const handleCourseDetails = () => {
    setSettingsOpen(false);
    setShowCourseEdit(true);
  };

  const handleInvite = () => {
    setSettingsOpen(false);
    if (roundCode) void shareRoundInvite(roundCode);
  };

  const handleProfile = () => {
    setSettingsOpen(false);
    onProfile();
  };

  const handleLeave = () => {
    setSettingsOpen(false);
    Alert.alert('Leave this round?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          leaveRound();
          onLeaveRound();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <AppLogo size={26} showWordmark style={styles.headerLogo} />
          {roundCode && <Text style={styles.roundCode}>Code: {roundCode}</Text>}
        </View>
        <Pressable style={styles.settingsButton} onPress={() => setSettingsOpen(true)} hitSlop={8}>
          <Text style={styles.settingsButtonText}>{'\u2699'}</Text>
        </Pressable>
      </View>

      {showCourseEdit ? (
        <ScanScorecardScreen
          editExisting
          onDone={() => setShowCourseEdit(false)}
          onBack={() => setShowCourseEdit(false)}
        />
      ) : roundStatus === 'prep' ? (
        <RoundPrepScreen />
      ) : showAdmin ? (
        <>
          <View style={styles.adminBackWrap}>
            <BackButton onPress={() => setShowAdmin(false)} label="Back to Round" />
          </View>
          <RoundPrepScreen />
        </>
      ) : (
        <>
          <View style={styles.tabBar}>
            <TabButton label="Scoring" active={tab === 'score'} onPress={() => setTab('score')} />
            <TabButton
              label="Leaderboard"
              active={tab === 'leaderboard'}
              onPress={() => setTab('leaderboard')}
            />
            <TabButton
              label="Settlement"
              active={tab === 'settlement'}
              onPress={() => setTab('settlement')}
            />
          </View>

          <View style={styles.body}>
            {tab === 'score' && <ScoreScreen />}
            {tab === 'leaderboard' && <LeaderboardScreen />}
            {tab === 'settlement' && <SettlementScreen />}
          </View>
        </>
      )}

      <Modal
        visible={settingsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSettingsOpen(false)}>
          <View style={styles.settingsSheet}>
            {roundStatus === 'active' && !showAdmin && (
              <Pressable style={styles.settingsMenuRow} onPress={handleGameAdmin}>
                <Text style={styles.settingsMenuRowText}>{'\u2699'} Game Admin</Text>
              </Pressable>
            )}
            <Pressable style={styles.settingsMenuRow} onPress={handleCourseDetails}>
              <Text style={styles.settingsMenuRowText}>Modify Course Details</Text>
            </Pressable>
            {roundCode && (
              <Pressable style={styles.settingsMenuRow} onPress={handleInvite}>
                <Text style={styles.settingsMenuRowText}>Invite Players</Text>
              </Pressable>
            )}
            <Pressable style={styles.settingsMenuRow} onPress={handleProfile}>
              <Text style={styles.settingsMenuRowText}>My Profile</Text>
            </Pressable>
            <Pressable style={styles.settingsMenuRow} onPress={handleLeave}>
              <Text style={styles.settingsMenuRowTextDanger}>Leave Round</Text>
            </Pressable>
            <Pressable style={styles.settingsCancelRow} onPress={() => setSettingsOpen(false)}>
              <Text style={styles.settingsCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

interface TabButtonProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function TabButton({ label, active, onPress }: TabButtonProps) {
  return (
    <Pressable style={[styles.tabButton, active && styles.tabButtonActive]} onPress={onPress}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerLogo: {
    alignSelf: 'flex-start',
    marginBottom: 0,
  },
  roundCode: {
    color: '#667',
    fontSize: 12,
    letterSpacing: 2,
    marginTop: 2,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonText: {
    fontSize: 16,
  },

  adminBackWrap: {
    paddingHorizontal: 16,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#1a7f37',
  },
  tabButtonText: {
    color: '#889',
    fontWeight: '600',
    fontSize: 14,
  },
  tabButtonTextActive: {
    color: '#1a7f37',
  },
  body: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  settingsSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  settingsMenuRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingsMenuRowText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#234',
  },
  settingsMenuRowTextDanger: {
    fontSize: 16,
    fontWeight: '600',
    color: '#c0392b',
  },
  settingsCancelRow: {
    paddingVertical: 14,
    marginTop: 4,
    alignItems: 'center',
  },
  settingsCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#667',
  },
});
