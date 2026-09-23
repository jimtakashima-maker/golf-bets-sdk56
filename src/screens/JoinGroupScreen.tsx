import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useRoundState, isUnclaimedPlayerId, Player } from '../state/useRoundState';
import PreRoundBackground from '../components/PreRoundBackground';
import AppLogo from '../components/AppLogo';
import BackButton from '../components/BackButton';

// joinGroup/createGroupAndJoin can come back with a different name than
// what was typed, if someone else already in the round has it - see
// dedupePlayerName in useRoundState. Surface that once, then continue.
function announceRenameIfNeeded(requested: string, resolved: string, onDone: () => void) {
  if (resolved === requested) {
    onDone();
    return;
  }
  Alert.alert(
    "You're not the only one",
    `There's already a "${requested}" in this round, so you're "${resolved}" for this one.`,
    [{ text: 'Got it', onPress: onDone }]
  );
}

interface JoinGroupScreenProps {
  roundCode: string;
  name: string;
  onJoined: () => void;
  onBack: () => void;
}

export default function JoinGroupScreen({ roundCode, name, onJoined, onBack }: JoinGroupScreenProps) {
  const previewGroups = useRoundState((state) => state.previewGroups);
  const joinGroup = useRoundState((state) => state.joinGroup);
  const createGroupAndJoin = useRoundState((state) => state.createGroupAndJoin);
  const claimPlayer = useRoundState((state) => state.claimPlayer);
  const status = useRoundState((state) => state.status);
  const errorMessage = useRoundState((state) => state.errorMessage);

  const [newGroupName, setNewGroupName] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const busy = status === 'connecting';

  const handleJoinExisting = async (groupId: string) => {
    setJoiningId(groupId);
    try {
      const resolvedName = await joinGroup(roundCode, groupId, name);
      announceRenameIfNeeded(name, resolvedName, onJoined);
    } catch {
      // errorMessage is already set in the store and rendered below.
    } finally {
      setJoiningId(null);
    }
  };

  // For someone who's already been added by name - a teammate entering
  // their scores for them before they had the app open. Confirms first
  // since this merges everything already recorded under that name (scores,
  // handicap, bet participation) onto this device for good; there's no
  // undo once the two entries are combined.
  const handleClaim = (groupId: string, player: Player) => {
    Alert.alert(`Is "${player.name}" you?`, "This'll bring in whatever's already been scored for them.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: "Yes, that's me",
        onPress: async () => {
          setClaimingId(player.id);
          try {
            await claimPlayer(roundCode, groupId, player.id);
            onJoined();
          } catch {
            // errorMessage is already set in the store and rendered below.
          } finally {
            setClaimingId(null);
          }
        },
      },
    ]);
  };

  const handleCreateGroup = async () => {
    try {
      const resolvedName = await createGroupAndJoin(roundCode, name, newGroupName.trim() || undefined);
      announceRenameIfNeeded(name, resolvedName, onJoined);
    } catch {
      // errorMessage is already set in the store and rendered below.
    }
  };

  return (
    <PreRoundBackground>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <BackButton onPress={onBack} />

        <AppLogo />
        <Text style={styles.title}>Pick Your Tee Group</Text>
        <Text style={styles.subtitle}>
          Rounds can have more than one tee group sharing a code. Join yours so your scores
          stay separate from everyone else's - only your tee group can ever change them.
        </Text>

        {previewGroups.length === 0 && (
          <Text style={styles.hint}>No tee groups yet - be the first to start one below.</Text>
        )}

        {previewGroups.map((group) => {
          const unclaimed = group.players.filter((player) => isUnclaimedPlayerId(player.id));
          return (
            <View key={group.id} style={styles.groupCard}>
              <Pressable style={styles.groupRow} onPress={() => handleJoinExisting(group.id)} disabled={busy}>
                <View>
                  <Text style={styles.groupName}>{group.name}</Text>
                  <Text style={styles.groupCount}>
                    {group.playerCount} player{group.playerCount === 1 ? '' : 's'}
                  </Text>
                </View>
                {joiningId === group.id ? (
                  <ActivityIndicator color="#1a7f37" />
                ) : (
                  <Text style={styles.groupJoin}>Join as new player</Text>
                )}
              </Pressable>

              {unclaimed.length > 0 && (
                <View style={styles.rosterBox}>
                  <Text style={styles.rosterLabel}>Already listed in this group - is one of these you?</Text>
                  {unclaimed.map((player) => (
                    <Pressable
                      key={player.id}
                      style={styles.rosterRow}
                      onPress={() => handleClaim(group.id, player)}
                      disabled={busy}
                    >
                      <Text style={styles.rosterName}>{player.name}</Text>
                      {claimingId === player.id ? (
                        <ActivityIndicator color="#1a7f37" />
                      ) : (
                        <Text style={styles.rosterClaim}>That's me</Text>
                      )}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {errorMessage && status === 'error' && <Text style={styles.error}>{errorMessage}</Text>}

        <View style={styles.newGroupBox}>
          <Text style={styles.newGroupLabel}>Or start a new tee group</Text>
          <TextInput
            style={styles.input}
            placeholder={`Tee Group ${previewGroups.length + 1} (optional name)`}
            value={newGroupName}
            onChangeText={setNewGroupName}
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={handleCreateGroup}
            disabled={busy}
          >
            {busy && joiningId === null ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Start New Tee Group</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </PreRoundBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    padding: 24,
    paddingTop: 48,
    paddingBottom: 48,
  },

  title: {
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#667',
    marginBottom: 20,
    lineHeight: 20,
  },
  hint: {
    color: '#667',
    marginBottom: 12,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 10,
    overflow: 'hidden',
  },
  groupRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
  },
  groupCount: {
    color: '#667',
    fontSize: 13,
    marginTop: 2,
  },
  groupJoin: {
    color: '#1a7f37',
    fontWeight: '700',
  },
  rosterBox: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    backgroundColor: '#f7f8fa',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rosterLabel: {
    fontSize: 12,
    color: '#889',
    marginBottom: 6,
  },
  rosterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rosterName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#234',
  },
  rosterClaim: {
    color: '#1a7f37',
    fontWeight: '700',
    fontSize: 13,
  },
  error: {
    color: '#c0392b',
    marginBottom: 12,
  },
  newGroupBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  newGroupLabel: {
    fontWeight: '600',
    marginBottom: 8,
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
});
