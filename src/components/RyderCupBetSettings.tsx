import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Modal, ScrollView, Alert } from 'react-native';
import {
  useRoundState,
  RyderCupBet,
  RyderCupPairMatch,
  RyderCupSinglesMatch,
  Player,
  formatStakeAmount,
} from '../state/useRoundState';

interface RyderCupBetSettingsProps {
  bet: RyderCupBet;
  allPlayers: Player[];
}

// Ryder Cup's own settings card - a lot bigger than any other bet type's
// (Skins/Stroke Play/Birdies/Doubles/Wolf), because pairings here are
// picked by hand rather than derived from an add-order or a flat opted-in
// pool (see RyderCupBet's own comment), so there's real setup work: two
// named team rosters, then three independent lists of matches (Best
// Ball, Modified Alternate Shot, Singles), each built one match at a
// time from a small picker modal. Deliberately reads its own actions
// straight from the store rather than taking a dozen callback props from
// RoundPrepScreen's already sprawling BetSettings - the only things it
// needs from outside are the bet itself and the round's player list.
export default function RyderCupBetSettings({ bet, allPlayers }: RyderCupBetSettingsProps) {
  const renameRyderCupBet = useRoundState((state) => state.renameRyderCupBet);
  const deleteRyderCupBet = useRoundState((state) => state.deleteRyderCupBet);
  const setRyderCupBuyIn = useRoundState((state) => state.setRyderCupBuyIn);
  const setRyderCupTeamName = useRoundState((state) => state.setRyderCupTeamName);
  const setPlayerInRyderCupTeam = useRoundState((state) => state.setPlayerInRyderCupTeam);
  const addPairMatch = useRoundState((state) => state.addPairMatch);
  const removePairMatch = useRoundState((state) => state.removePairMatch);
  const addSinglesMatch = useRoundState((state) => state.addSinglesMatch);
  const removeSinglesMatch = useRoundState((state) => state.removeSinglesMatch);

  const [nameDraft, setNameDraft] = useState(bet.name);
  const [teamANameDraft, setTeamANameDraft] = useState(bet.teamAName);
  const [teamBNameDraft, setTeamBNameDraft] = useState(bet.teamBName);
  const [buyInDraft, setBuyInDraft] = useState(String(bet.buyIn));
  const [buyInFocused, setBuyInFocused] = useState(false);
  const [matchBuilderSegment, setMatchBuilderSegment] = useState<'bestBall' | 'altShot' | 'singles' | null>(null);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== bet.name) renameRyderCupBet(bet.id, trimmed);
    else setNameDraft(bet.name);
  };

  const commitTeamAName = () => {
    const trimmed = teamANameDraft.trim();
    if (trimmed && trimmed !== bet.teamAName) setRyderCupTeamName(bet.id, 'A', trimmed);
    else setTeamANameDraft(bet.teamAName);
  };

  const commitTeamBName = () => {
    const trimmed = teamBNameDraft.trim();
    if (trimmed && trimmed !== bet.teamBName) setRyderCupTeamName(bet.id, 'B', trimmed);
    else setTeamBNameDraft(bet.teamBName);
  };

  const commitBuyIn = () => {
    const parsed = Number(buyInDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setRyderCupBuyIn(bet.id, parsed);
      setBuyInDraft(String(parsed));
    } else {
      setBuyInDraft(String(bet.buyIn));
    }
  };

  const handleDelete = () => {
    Alert.alert(`Remove ${bet.name}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteRyderCupBet(bet.id) },
    ]);
  };

  // Moving a player to the other side, or off both, is really up to two
  // writes (leave the old side, join the new one) - fired without
  // awaiting either, same fire-and-forget pattern the rest of this app's
  // roster toggles already use (see BetRosterModal's Select All).
  const setPlayerSide = (playerId: string, side: 'A' | 'B' | null) => {
    const onA = bet.teamAPlayerIds.includes(playerId);
    const onB = bet.teamBPlayerIds.includes(playerId);
    if (side === 'A') {
      if (onB) setPlayerInRyderCupTeam(bet.id, 'B', playerId, false);
      if (!onA) setPlayerInRyderCupTeam(bet.id, 'A', playerId, true);
    } else if (side === 'B') {
      if (onA) setPlayerInRyderCupTeam(bet.id, 'A', playerId, false);
      if (!onB) setPlayerInRyderCupTeam(bet.id, 'B', playerId, true);
    } else {
      if (onA) setPlayerInRyderCupTeam(bet.id, 'A', playerId, false);
      if (onB) setPlayerInRyderCupTeam(bet.id, 'B', playerId, false);
    }
  };

  const handleRemovePairMatch = (segment: 'bestBall' | 'altShot', matchId: string) => {
    removePairMatch(bet.id, segment, matchId);
  };

  const handleCreatePairMatch = (segment: 'bestBall' | 'altShot', teamA: [string, string], teamB: [string, string]) => {
    addPairMatch(bet.id, segment, teamA, teamB);
    setMatchBuilderSegment(null);
  };

  const handleCreateSinglesMatch = (teamAPlayerId: string, teamBPlayerId: string) => {
    addSinglesMatch(bet.id, teamAPlayerId, teamBPlayerId);
    setMatchBuilderSegment(null);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <TextInput
          style={styles.nameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <Pressable style={styles.removeButton} onPress={handleDelete} hitSlop={8}>
          <Text style={styles.removeButtonText}>{'✕'}</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>
        18-hole format: holes 1-6 Best Ball, 7-12 Modified Alternate Shot, 13-18 Singles.
      </Text>

      <View style={styles.buyInRow}>
        <Text style={styles.valueLabel}>Buy-in $/player</Text>
        <TextInput
          style={styles.valueInput}
          value={buyInDraft}
          onChangeText={setBuyInDraft}
          onFocus={() => setBuyInFocused(true)}
          onEndEditing={commitBuyIn}
          onBlur={() => {
            setBuyInFocused(false);
            commitBuyIn();
          }}
          keyboardType="decimal-pad"
        />
        <Text style={styles.hint}>
          {bet.buyIn > 0
            ? `Winner-take-all pot: ${formatStakeAmount(bet.buyIn * (bet.teamAPlayerIds.length + bet.teamBPlayerIds.length), 'money')}`
            : 'No buy-in set yet'}
        </Text>
      </View>

      <View style={styles.teamNamesRow}>
        <TextInput
          style={styles.teamNameInput}
          value={teamANameDraft}
          onChangeText={setTeamANameDraft}
          onEndEditing={commitTeamAName}
          onBlur={commitTeamAName}
        />
        <Text style={styles.vsText}>vs</Text>
        <TextInput
          style={styles.teamNameInput}
          value={teamBNameDraft}
          onChangeText={setTeamBNameDraft}
          onEndEditing={commitTeamBName}
          onBlur={commitTeamBName}
        />
      </View>

      <View style={styles.rosterList}>
        {allPlayers.map((player) => {
          const onA = bet.teamAPlayerIds.includes(player.id);
          const onB = bet.teamBPlayerIds.includes(player.id);
          return (
            <View key={player.id} style={styles.rosterRow}>
              <Text style={styles.rosterName}>{player.name}</Text>
              <View style={styles.rosterToggles}>
                <Pressable
                  style={[styles.rosterToggle, onA && styles.rosterToggleActiveA]}
                  onPress={() => setPlayerSide(player.id, onA ? null : 'A')}
                >
                  <Text style={[styles.rosterToggleText, onA && styles.rosterToggleTextActive]}>{bet.teamAName}</Text>
                </Pressable>
                <Pressable
                  style={[styles.rosterToggle, onB && styles.rosterToggleActiveB]}
                  onPress={() => setPlayerSide(player.id, onB ? null : 'B')}
                >
                  <Text style={[styles.rosterToggleText, onB && styles.rosterToggleTextActive]}>{bet.teamBName}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {allPlayers.length === 0 && <Text style={styles.hint}>No players in this round yet</Text>}
      </View>

      <MatchSegmentSection
        title="Best Ball (holes 1-6)"
        matches={bet.bestBallMatches}
        isSingles={false}
        allPlayers={allPlayers}
        onAdd={() => setMatchBuilderSegment('bestBall')}
        onRemove={(matchId) => handleRemovePairMatch('bestBall', matchId)}
        addDisabled={bet.teamAPlayerIds.length < 2 || bet.teamBPlayerIds.length < 2}
      />
      <MatchSegmentSection
        title="Modified Alternate Shot (holes 7-12)"
        matches={bet.altShotMatches}
        isSingles={false}
        allPlayers={allPlayers}
        onAdd={() => setMatchBuilderSegment('altShot')}
        onRemove={(matchId) => handleRemovePairMatch('altShot', matchId)}
        addDisabled={bet.teamAPlayerIds.length < 2 || bet.teamBPlayerIds.length < 2}
      />
      <MatchSegmentSection
        title="Singles (holes 13-18)"
        matches={bet.singlesMatches}
        isSingles
        allPlayers={allPlayers}
        onAdd={() => setMatchBuilderSegment('singles')}
        onRemove={(matchId) => removeSinglesMatch(bet.id, matchId)}
        addDisabled={bet.teamAPlayerIds.length < 1 || bet.teamBPlayerIds.length < 1}
      />

      <RyderCupMatchBuilderModal
        visible={matchBuilderSegment != null}
        segment={matchBuilderSegment ?? 'bestBall'}
        teamAName={bet.teamAName}
        teamBName={bet.teamBName}
        teamAPlayerIds={bet.teamAPlayerIds}
        teamBPlayerIds={bet.teamBPlayerIds}
        allPlayers={allPlayers}
        onCreatePair={(segment, teamA, teamB) => handleCreatePairMatch(segment, teamA, teamB)}
        onCreateSingles={handleCreateSinglesMatch}
        onClose={() => setMatchBuilderSegment(null)}
      />
    </View>
  );
}

function playerNameById(allPlayers: Player[], id: string): string {
  return allPlayers.find((player) => player.id === id)?.name ?? 'Player';
}

function MatchSegmentSection({
  title,
  matches,
  isSingles,
  allPlayers,
  onAdd,
  onRemove,
  addDisabled,
}: {
  title: string;
  matches: (RyderCupPairMatch | RyderCupSinglesMatch)[];
  isSingles: boolean;
  allPlayers: Player[];
  onAdd: () => void;
  onRemove: (matchId: string) => void;
  addDisabled: boolean;
}) {
  return (
    <View style={styles.segmentSection}>
      <Text style={styles.segmentTitle}>{title}</Text>
      {matches.length === 0 && <Text style={styles.hint}>No matches yet</Text>}
      {matches.map((match) => {
        const label = isSingles
          ? `${playerNameById(allPlayers, (match as RyderCupSinglesMatch).teamAPlayerId)} vs ${playerNameById(
              allPlayers,
              (match as RyderCupSinglesMatch).teamBPlayerId
            )}`
          : `${playerNameById(allPlayers, (match as RyderCupPairMatch).teamAPlayerIds[0])} & ${playerNameById(
              allPlayers,
              (match as RyderCupPairMatch).teamAPlayerIds[1]
            )}  vs  ${playerNameById(allPlayers, (match as RyderCupPairMatch).teamBPlayerIds[0])} & ${playerNameById(
              allPlayers,
              (match as RyderCupPairMatch).teamBPlayerIds[1]
            )}`;
        return (
          <View key={match.id} style={styles.matchRow}>
            <Text style={styles.matchText}>{label}</Text>
            <Pressable style={styles.matchRemove} onPress={() => onRemove(match.id)} hitSlop={8}>
              <Text style={styles.matchRemoveText}>{'✕'}</Text>
            </Pressable>
          </View>
        );
      })}
      <Pressable
        style={[styles.addMatchButton, addDisabled && styles.addMatchButtonDisabled]}
        onPress={onAdd}
        disabled={addDisabled}
      >
        <Text style={styles.addMatchButtonText}>
          {addDisabled ? `Add ${isSingles ? '1+' : '2+'} players to each team first` : '+ Add Match'}
        </Text>
      </Pressable>
    </View>
  );
}

// One picker modal reused by all three segments - Best Ball/Alt Shot need
// exactly 2 players per side (a pair), Singles needs exactly 1 - the
// picksPerSide the segment implies is the only thing that changes between
// them, so there's no need for three near-identical modals.
function RyderCupMatchBuilderModal({
  visible,
  segment,
  teamAName,
  teamBName,
  teamAPlayerIds,
  teamBPlayerIds,
  allPlayers,
  onCreatePair,
  onCreateSingles,
  onClose,
}: {
  visible: boolean;
  segment: 'bestBall' | 'altShot' | 'singles';
  teamAName: string;
  teamBName: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  allPlayers: Player[];
  onCreatePair: (segment: 'bestBall' | 'altShot', teamA: [string, string], teamB: [string, string]) => void;
  onCreateSingles: (teamAPlayerId: string, teamBPlayerId: string) => void;
  onClose: () => void;
}) {
  const picksPerSide = segment === 'singles' ? 1 : 2;
  const [teamASelected, setTeamASelected] = useState<string[]>([]);
  const [teamBSelected, setTeamBSelected] = useState<string[]>([]);

  // Resets whenever the modal opens (or is opened for a different
  // segment) rather than carrying over a stale pick from last time.
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const key = `${visible}:${segment}`;
  if (visible && key !== openedFor) {
    setOpenedFor(key);
    if (teamASelected.length > 0) setTeamASelected([]);
    if (teamBSelected.length > 0) setTeamBSelected([]);
  }

  const toggle = (list: string[], setList: (ids: string[]) => void, id: string) => {
    if (list.includes(id)) {
      setList(list.filter((existing) => existing !== id));
    } else if (list.length < picksPerSide) {
      setList([...list, id]);
    }
  };

  const canCreate = teamASelected.length === picksPerSide && teamBSelected.length === picksPerSide;

  const handleCreate = () => {
    if (!canCreate) return;
    if (segment === 'singles') {
      onCreateSingles(teamASelected[0], teamBSelected[0]);
    } else {
      onCreatePair(segment, [teamASelected[0], teamASelected[1]], [teamBSelected[0], teamBSelected[1]]);
    }
  };

  const title =
    segment === 'bestBall' ? 'Best Ball Match' : segment === 'altShot' ? 'Modified Alternate Shot Match' : 'Singles Match';
  const subtitle = picksPerSide === 1 ? 'Pick 1 player from each side' : 'Pick 2 players from each side';

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalSheetContent}>
        <Text style={styles.modalTitle}>{title}</Text>
        <Text style={styles.hint}>{subtitle}</Text>

        <Text style={styles.modalSectionLabel}>{teamAName}</Text>
        {teamAPlayerIds.length === 0 && <Text style={styles.hint}>No one on this side yet</Text>}
        {teamAPlayerIds.map((id) => {
          const selected = teamASelected.includes(id);
          return (
            <Pressable
              key={id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => toggle(teamASelected, setTeamASelected, id)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {playerNameById(allPlayers, id)}
              </Text>
            </Pressable>
          );
        })}

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>{teamBName}</Text>
        {teamBPlayerIds.length === 0 && <Text style={styles.hint}>No one on this side yet</Text>}
        {teamBPlayerIds.map((id) => {
          const selected = teamBSelected.includes(id);
          return (
            <Pressable
              key={id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => toggle(teamBSelected, setTeamBSelected, id)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {playerNameById(allPlayers, id)}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          style={[styles.modalCreateButton, !canCreate && styles.modalCreateButtonDisabled]}
          onPress={handleCreate}
          disabled={!canCreate}
        >
          <Text style={styles.modalCreateButtonText}>Create Match</Text>
        </Pressable>
        <Pressable style={styles.modalCloseButton} onPress={onClose}>
          <Text style={styles.modalCloseButtonText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#b8862f',
    padding: 10,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 14,
    fontWeight: '600',
  },
  removeButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#b3261e',
    fontSize: 14,
  },
  hint: {
    color: '#889',
    fontSize: 11,
    marginTop: 4,
  },
  buyInRow: {
    marginTop: 10,
  },
  valueLabel: {
    fontSize: 12,
    color: '#556',
    marginBottom: 4,
  },
  valueInput: {
    width: 70,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  teamNamesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  teamNameInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  vsText: {
    fontSize: 12,
    color: '#889',
  },
  rosterList: {
    marginTop: 10,
  },
  rosterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  rosterName: {
    fontSize: 13,
    color: '#334',
    flex: 1,
  },
  rosterToggles: {
    flexDirection: 'row',
    gap: 6,
  },
  rosterToggle: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f5f5f5',
  },
  rosterToggleActiveA: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  rosterToggleActiveB: {
    backgroundColor: '#1e5fb3',
    borderColor: '#1e5fb3',
  },
  rosterToggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#556',
  },
  rosterToggleTextActive: {
    color: '#fff',
  },
  segmentSection: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  segmentTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334',
    marginBottom: 4,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f7f7f7',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  matchText: {
    fontSize: 12,
    color: '#334',
    flex: 1,
    marginRight: 8,
  },
  matchRemove: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matchRemoveText: {
    color: '#b3261e',
    fontSize: 12,
  },
  addMatchButton: {
    marginTop: 6,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#b8862f',
    borderStyle: 'dashed',
  },
  addMatchButtonDisabled: {
    borderColor: '#ccc',
  },
  addMatchButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b8862f',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: '10%',
    bottom: '10%',
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  modalSheetContent: {
    padding: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#223',
    marginBottom: 2,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
    marginTop: 12,
    marginBottom: 4,
  },
  modalSectionLabelSpaced: {
    marginTop: 16,
  },
  modalRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    marginBottom: 4,
  },
  modalRowSelected: {
    backgroundColor: '#1a7f37',
  },
  modalRowText: {
    fontSize: 13,
    color: '#334',
  },
  modalRowTextSelected: {
    color: '#fff',
    fontWeight: '600',
  },
  modalCreateButton: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1a7f37',
    alignItems: 'center',
  },
  modalCreateButtonDisabled: {
    backgroundColor: '#c7ddcd',
  },
  modalCreateButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  modalCloseButton: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#889',
    fontSize: 13,
  },
});
