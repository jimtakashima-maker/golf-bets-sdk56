import { useEffect, useState, ReactNode } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Modal,
  Alert,
} from 'react-native';
import {
  useRoundState,
  Group,
  Player,
  PlayerHandicaps,
  Team,
  PlayerTeams,
  SkinsBet,
  SkinsPayoutMode,
  StrokePlayBet,
  StrokePlayPayoutMode,
  BirdiesBet,
  DoublesBet,
  PressStackingMode,
  MAX_HANDICAP,
  StakesUnit,
  stakesSymbol,
  formatStakeAmount,
  stakeFieldLabel,
} from '../state/useRoundState';
import NassauSettings from '../components/NassauSettings';
import StakesUnitToggle from '../components/StakesUnitToggle';
import { generateRandomBets, RandomBetPlan } from '../lib/randomBetGenerator';

// Shown to every player while a round is being organized (and reachable
// again later via the Setup tab): who's on which tee, and how bets/games
// are set up. Nobody sees score entry until someone taps "Start Round" -
// and a host entering scores from one phone can rename any tee group, add
// or remove players in any tee group, and move players between tee groups
// right here, since there's no other way to organize everyone when only
// one device is doing the setup.
//
// The whole thing is one screen: tee groups with a roster of players, each
// with a "Move to" button (which tee group) and an "Add to" button (which
// bets/games - Nassau team and/or Skins bets). Both buttons pop open a
// small modal instead of expanding inline chips, so no player row ever
// grows past a couple of lines. Money and rules for the bets themselves
// (dollar amounts, net/gross, carryover) live in a compact settings strip
// at the bottom, since those are set once and rarely revisited.
export default function RoundPrepScreen() {
  const groups = useRoundState((state) => state.groups);
  const myGroupId = useRoundState((state) => state.myGroupId);
  const playerId = useRoundState((state) => state.playerId);
  const roundStatus = useRoundState((state) => state.roundStatus);
  const teams = useRoundState((state) => state.teams);
  const playerTeams = useRoundState((state) => state.playerTeams);
  const nassauNet = useRoundState((state) => state.nassauNet);
  const nassauAmounts = useRoundState((state) => state.nassauAmounts);
  const matchPlayTeams = useRoundState((state) => state.matchPlayTeams);
  const matchPlayPlayerTeams = useRoundState((state) => state.matchPlayPlayerTeams);
  const matchPlayNet = useRoundState((state) => state.matchPlayNet);
  const matchPlayAmounts = useRoundState((state) => state.matchPlayAmounts);
  const skinsBets = useRoundState((state) => state.skinsBets);
  const strokePlayBets = useRoundState((state) => state.strokePlayBets);
  const birdiesBets = useRoundState((state) => state.birdiesBets);
  const doublesBets = useRoundState((state) => state.doublesBets);
  const totalHoles = useRoundState((state) => state.totalHoles);
  const setTotalHoles = useRoundState((state) => state.setTotalHoles);
  const handicaps = useRoundState((state) => state.handicaps);
  const addPlayer = useRoundState((state) => state.addPlayer);
  const removePlayer = useRoundState((state) => state.removePlayer);
  const renameGroup = useRoundState((state) => state.renameGroup);
  const createGroup = useRoundState((state) => state.createGroup);
  const movePlayerToGroup = useRoundState((state) => state.movePlayerToGroup);
  const createTeam = useRoundState((state) => state.createTeam);
  const renameTeam = useRoundState((state) => state.renameTeam);
  const deleteTeam = useRoundState((state) => state.deleteTeam);
  const setPlayerTeam = useRoundState((state) => state.setPlayerTeam);
  const setNassauNet = useRoundState((state) => state.setNassauNet);
  const setNassauAmount = useRoundState((state) => state.setNassauAmount);
  const createMatchPlayTeam = useRoundState((state) => state.createMatchPlayTeam);
  const renameMatchPlayTeam = useRoundState((state) => state.renameMatchPlayTeam);
  const deleteMatchPlayTeam = useRoundState((state) => state.deleteMatchPlayTeam);
  const setMatchPlayPlayerTeam = useRoundState((state) => state.setMatchPlayPlayerTeam);
  const setMatchPlayNet = useRoundState((state) => state.setMatchPlayNet);
  const setMatchPlayAmount = useRoundState((state) => state.setMatchPlayAmount);
  const createSkinsBet = useRoundState((state) => state.createSkinsBet);
  const renameSkinsBet = useRoundState((state) => state.renameSkinsBet);
  const deleteSkinsBet = useRoundState((state) => state.deleteSkinsBet);
  const setSkinsBetCarryover = useRoundState((state) => state.setSkinsBetCarryover);
  const setSkinsBetNet = useRoundState((state) => state.setSkinsBetNet);
  const setSkinsBetValuePerSkin = useRoundState((state) => state.setSkinsBetValuePerSkin);
  const setSkinsBetPayoutMode = useRoundState((state) => state.setSkinsBetPayoutMode);
  const setSkinsBetBuyIn = useRoundState((state) => state.setSkinsBetBuyIn);
  const setPlayerInSkinsBet = useRoundState((state) => state.setPlayerInSkinsBet);
  const createStrokePlayBet = useRoundState((state) => state.createStrokePlayBet);
  const renameStrokePlayBet = useRoundState((state) => state.renameStrokePlayBet);
  const deleteStrokePlayBet = useRoundState((state) => state.deleteStrokePlayBet);
  const setStrokePlayBetNet = useRoundState((state) => state.setStrokePlayBetNet);
  const setStrokePlayBetPayoutMode = useRoundState((state) => state.setStrokePlayBetPayoutMode);
  const setStrokePlayBetValuePerStroke = useRoundState((state) => state.setStrokePlayBetValuePerStroke);
  const setStrokePlayBetBuyIn = useRoundState((state) => state.setStrokePlayBetBuyIn);
  const setPlayerInStrokePlayBet = useRoundState((state) => state.setPlayerInStrokePlayBet);
  const createBirdiesBet = useRoundState((state) => state.createBirdiesBet);
  const renameBirdiesBet = useRoundState((state) => state.renameBirdiesBet);
  const deleteBirdiesBet = useRoundState((state) => state.deleteBirdiesBet);
  const setBirdiesBetNet = useRoundState((state) => state.setBirdiesBetNet);
  const setBirdiesBetAmount = useRoundState((state) => state.setBirdiesBetAmount);
  const setPlayerInBirdiesBet = useRoundState((state) => state.setPlayerInBirdiesBet);
  const createDoublesBet = useRoundState((state) => state.createDoublesBet);
  const renameDoublesBet = useRoundState((state) => state.renameDoublesBet);
  const deleteDoublesBet = useRoundState((state) => state.deleteDoublesBet);
  const setDoublesBetNet = useRoundState((state) => state.setDoublesBetNet);
  const setDoublesBetAmount = useRoundState((state) => state.setDoublesBetAmount);
  const setPlayerInDoublesBet = useRoundState((state) => state.setPlayerInDoublesBet);
  const setPlayerHandicap = useRoundState((state) => state.setPlayerHandicap);
  const nassauAutoPress = useRoundState((state) => state.nassauAutoPress);
  const nassauPressStacking = useRoundState((state) => state.nassauPressStacking);
  const setNassauAutoPress = useRoundState((state) => state.setNassauAutoPress);
  const setNassauPressStacking = useRoundState((state) => state.setNassauPressStacking);
  const startRound = useRoundState((state) => state.startRound);
  const profile = useRoundState((state) => state.profile);
  const loadProfile = useRoundState((state) => state.loadProfile);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  // The first time you're in a round with nothing set for you yet, pull
  // your own per-round handicap straight from your saved profile instead
  // of making you retype it every time. Always the 18-hole number - a
  // 9-hole round is halved automatically wherever handicaps are actually
  // used, not baked in here, so it stays correct even if the round length
  // changes later. Once anything is explicitly set for you (including a
  // deliberate 0), this never runs again.
  useEffect(() => {
    if (!playerId || profile?.handicap18 == null) return;
    if (handicaps[playerId] !== undefined) return;
    void setPlayerHandicap(playerId, profile.handicap18);
  }, [playerId, profile, handicaps, setPlayerHandicap]);

  const [addingGroup, setAddingGroup] = useState(false);
  const [starting, setStarting] = useState(false);
  const [moveModalPlayerId, setMoveModalPlayerId] = useState<string | null>(null);
  const [addModalPlayerId, setAddModalPlayerId] = useState<string | null>(null);
  const [showSurpriseModal, setShowSurpriseModal] = useState(false);
  const [surpriseAmount, setSurpriseAmount] = useState('20');
  const [generating, setGenerating] = useState(false);

  const allPlayers = groups.flatMap((group) => group.players);

  const handleAddGroup = async () => {
    setAddingGroup(true);
    try {
      await createGroup();
    } finally {
      setAddingGroup(false);
    }
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await startRound();
    } finally {
      setStarting(false);
    }
  };

  const hasExistingBets =
    teams.length > 0 ||
    matchPlayTeams.length > 0 ||
    skinsBets.length > 0 ||
    strokePlayBets.length > 0 ||
    birdiesBets.length > 0 ||
    doublesBets.length > 0;

  // Rolls a full slate of bets - team bet, Skins, Stroke Play, whichever
  // random.ts decides to include - sized so no player's worst case passes
  // the cap they enter. Clears whatever teams/bets already exist first, so
  // tapping this again re-rolls cleanly instead of piling duplicates on
  // top of the last attempt.
  const handleGenerateRandomBets = async () => {
    const amount = Number(surpriseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Enter an amount', 'Max $ per player must be a positive number.');
      return;
    }

    setGenerating(true);
    try {
      const plan: RandomBetPlan = generateRandomBets(allPlayers, groups, totalHoles, amount);

      if (!plan.team && !plan.skins && !plan.strokePlay) {
        Alert.alert('Surprise Me', plan.summary.join('\n'));
        return;
      }

      // Clear the board so this replaces rather than adds to whatever was
      // already set up.
      await Promise.all(teams.map((team) => deleteTeam(team.id)));
      await Promise.all(matchPlayTeams.map((team) => deleteMatchPlayTeam(team.id)));
      await Promise.all(skinsBets.map((bet) => deleteSkinsBet(bet.id)));
      await Promise.all(strokePlayBets.map((bet) => deleteStrokePlayBet(bet.id)));
      // The cap this promises only covers the bets generated here - a live
      // Nassau press is a separate, opt-in add-on, so auto-press is turned
      // off rather than left to silently stack on top of the cap.
      await setNassauAutoPress(false);

      if (plan.team) {
        const { kind, amounts, pairs } = plan.team;
        for (const pair of pairs) {
          if (kind === 'nassau') {
            const teamAId = await createTeam(pair.teamAName);
            await Promise.all(pair.teamAPlayerIds.map((id) => setPlayerTeam(id, teamAId)));
            const teamBId = await createTeam(pair.teamBName);
            await Promise.all(pair.teamBPlayerIds.map((id) => setPlayerTeam(id, teamBId)));
          } else {
            const teamAId = await createMatchPlayTeam(pair.teamAName);
            await Promise.all(pair.teamAPlayerIds.map((id) => setMatchPlayPlayerTeam(id, teamAId)));
            const teamBId = await createMatchPlayTeam(pair.teamBName);
            await Promise.all(pair.teamBPlayerIds.map((id) => setMatchPlayPlayerTeam(id, teamBId)));
          }
        }
        if (kind === 'nassau') {
          await setNassauNet(true);
          await setNassauAmount('front', amounts.front);
          await setNassauAmount('back', amounts.back);
          await setNassauAmount('overall', amounts.overall);
        } else {
          await setMatchPlayNet(true);
          await setMatchPlayAmount('front', amounts.front);
          await setMatchPlayAmount('back', amounts.back);
          await setMatchPlayAmount('overall', amounts.overall);
        }
      }

      if (plan.skins) {
        const betId = await createSkinsBet();
        await setSkinsBetNet(betId, true);
        await setSkinsBetPayoutMode(betId, plan.skins.payoutMode);
        if (plan.skins.payoutMode === 'perSkin') {
          await setSkinsBetValuePerSkin(betId, plan.skins.valuePerSkin);
        } else {
          await setSkinsBetBuyIn(betId, plan.skins.buyIn);
        }
        await Promise.all(plan.skins.playerIds.map((id) => setPlayerInSkinsBet(betId, id, true)));
      }

      if (plan.strokePlay) {
        const betId = await createStrokePlayBet();
        await setStrokePlayBetNet(betId, true);
        await setStrokePlayBetPayoutMode(betId, plan.strokePlay.payoutMode);
        await setStrokePlayBetBuyIn(betId, plan.strokePlay.buyIn);
        await Promise.all(plan.strokePlay.playerIds.map((id) => setPlayerInStrokePlayBet(betId, id, true)));
      }

      setShowSurpriseModal(false);
      Alert.alert(
        'Bets Generated',
        [...plan.summary, '', 'Presses called live during play are separate and add to this.'].join('\n')
      );
    } finally {
      setGenerating(false);
    }
  };

  // "Move to" modal state - which player, and which group they're in now.
  const moveModalPlayer = allPlayers.find((player) => player.id === moveModalPlayerId) ?? null;
  const moveModalGroupId = moveModalPlayerId
    ? groups.find((group) => group.players.some((player) => player.id === moveModalPlayerId))?.id ?? null
    : null;

  const handleMoveToGroup = async (toGroupId: string) => {
    if (!moveModalPlayerId || !moveModalGroupId) return;
    await movePlayerToGroup(moveModalPlayerId, moveModalGroupId, toGroupId);
    setMoveModalPlayerId(null);
  };

  const handleMoveToNewGroup = async () => {
    if (!moveModalPlayerId || !moveModalGroupId) return;
    const newGroupId = await createGroup();
    await movePlayerToGroup(moveModalPlayerId, moveModalGroupId, newGroupId);
    setMoveModalPlayerId(null);
  };

  // "Add to" modal state - which player, and the bets/games they can join.
  const addModalPlayer = allPlayers.find((player) => player.id === addModalPlayerId) ?? null;

  const handleCreateTeamAndAssign = async () => {
    if (!addModalPlayerId) return;
    const teamId = await createTeam(addModalPlayer?.name ?? `Team ${teams.length + 1}`);
    await setPlayerTeam(addModalPlayerId, teamId);
  };

  const handleCreateMatchPlayTeamAndAssign = async () => {
    if (!addModalPlayerId) return;
    const teamId = await createMatchPlayTeam(addModalPlayer?.name ?? `Team ${matchPlayTeams.length + 1}`);
    await setMatchPlayPlayerTeam(addModalPlayerId, teamId);
  };

  const handleCreateSkinsBetAndAssign = async () => {
    if (!addModalPlayerId) return;
    const betId = await createSkinsBet();
    await setPlayerInSkinsBet(betId, addModalPlayerId, true);
  };

  const handleCreateStrokePlayBetAndAssign = async () => {
    if (!addModalPlayerId) return;
    const betId = await createStrokePlayBet();
    await setPlayerInStrokePlayBet(betId, addModalPlayerId, true);
  };

  const handleCreateBirdiesBetAndAssign = async () => {
    if (!addModalPlayerId) return;
    const betId = await createBirdiesBet();
    await setPlayerInBirdiesBet(betId, addModalPlayerId, true);
  };

  const handleCreateDoublesBetAndAssign = async () => {
    if (!addModalPlayerId) return;
    const betId = await createDoublesBet();
    await setPlayerInDoublesBet(betId, addModalPlayerId, true);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Pressable style={styles.surpriseCard} onPress={() => setShowSurpriseModal(true)}>
        <Text style={styles.surpriseCardEmoji}>{'\uD83C\uDFB2'}</Text>
        <View style={styles.surpriseCardText}>
          <Text style={styles.surpriseCardTitle}>Surprise Me</Text>
          <Text style={styles.surpriseCardSubtitle}>Auto-build a full slate of bets sized to your budget</Text>
        </View>
        <Text style={styles.surpriseCardChevron}>{'\u203A'}</Text>
      </Pressable>

      <View style={styles.roundLengthRow}>
        <Text style={styles.roundLengthLabel}>Holes</Text>
        <View style={styles.roundLengthChips}>
          <Pressable
            style={[styles.roundLengthChip, totalHoles === 9 && styles.roundLengthChipActive]}
            onPress={() => setTotalHoles(9)}
          >
            <Text
              style={[styles.roundLengthChipText, totalHoles === 9 && styles.roundLengthChipTextActive]}
            >
              9
            </Text>
          </Pressable>
          <Pressable
            style={[styles.roundLengthChip, totalHoles === 18 && styles.roundLengthChipActive]}
            onPress={() => setTotalHoles(18)}
          >
            <Text
              style={[styles.roundLengthChipText, totalHoles === 18 && styles.roundLengthChipTextActive]}
            >
              18
            </Text>
          </Pressable>
        </View>
      </View>
      {totalHoles === 9 && (
        <Text style={styles.handicapLengthHint}>
          Handicaps below are 18-hole - halved automatically for this 9-hole round.
        </Text>
      )}

      {groups.map((group) => (
        <TeeGroupCard
          key={group.id}
          group={group}
          isMyGroup={group.id === myGroupId}
          playerId={playerId}
          handicaps={handicaps}
          onSetHandicap={setPlayerHandicap}
          onRename={(name) => renameGroup(group.id, name)}
          onAddPlayer={(name) => addPlayer(group.id, name)}
          onRemovePlayer={(removedPlayerId) => removePlayer(group.id, removedPlayerId)}
          onMoveTo={(movedPlayerId) => setMoveModalPlayerId(movedPlayerId)}
          onAddTo={(targetPlayerId) => setAddModalPlayerId(targetPlayerId)}
        />
      ))}

      <Pressable
        style={[styles.newGroupButton, addingGroup && styles.buttonDisabled]}
        onPress={handleAddGroup}
        disabled={addingGroup}
      >
        {addingGroup ? (
          <ActivityIndicator color="#1a7f37" />
        ) : (
          <Text style={styles.newGroupButtonText}>+ New Tee Group</Text>
        )}
      </Pressable>

      <View style={styles.divider} />

      <BetSettings
        nassauNet={nassauNet}
        nassauAmounts={nassauAmounts}
        onSetNassauNet={setNassauNet}
        onSetNassauAmount={setNassauAmount}
        nassauAutoPress={nassauAutoPress}
        nassauPressStacking={nassauPressStacking}
        onSetNassauAutoPress={setNassauAutoPress}
        onSetNassauPressStacking={setNassauPressStacking}
        teams={teams}
        onRenameTeam={renameTeam}
        onDeleteTeam={deleteTeam}
        onCreateTeam={() => createTeam(`Team ${teams.length + 1}`)}
        matchPlayNet={matchPlayNet}
        matchPlayAmounts={matchPlayAmounts}
        onSetMatchPlayNet={setMatchPlayNet}
        onSetMatchPlayAmount={setMatchPlayAmount}
        matchPlayTeams={matchPlayTeams}
        onRenameMatchPlayTeam={renameMatchPlayTeam}
        onDeleteMatchPlayTeam={deleteMatchPlayTeam}
        onCreateMatchPlayTeam={() => createMatchPlayTeam(`Team ${matchPlayTeams.length + 1}`)}
        skinsBets={skinsBets}
        onRenameSkinsBet={renameSkinsBet}
        onDeleteSkinsBet={deleteSkinsBet}
        onSetSkinsBetCarryover={setSkinsBetCarryover}
        onSetSkinsBetNet={setSkinsBetNet}
        onSetSkinsBetValuePerSkin={setSkinsBetValuePerSkin}
        onSetSkinsBetPayoutMode={setSkinsBetPayoutMode}
        onSetSkinsBetBuyIn={setSkinsBetBuyIn}
        onCreateSkinsBet={() => createSkinsBet()}
        strokePlayBets={strokePlayBets}
        onRenameStrokePlayBet={renameStrokePlayBet}
        onDeleteStrokePlayBet={deleteStrokePlayBet}
        onSetStrokePlayBetNet={setStrokePlayBetNet}
        onSetStrokePlayBetPayoutMode={setStrokePlayBetPayoutMode}
        onSetStrokePlayBetValuePerStroke={setStrokePlayBetValuePerStroke}
        onSetStrokePlayBetBuyIn={setStrokePlayBetBuyIn}
        onCreateStrokePlayBet={() => createStrokePlayBet()}
        birdiesBets={birdiesBets}
        onRenameBirdiesBet={renameBirdiesBet}
        onDeleteBirdiesBet={deleteBirdiesBet}
        onSetBirdiesBetNet={setBirdiesBetNet}
        onSetBirdiesBetAmount={setBirdiesBetAmount}
        onCreateBirdiesBet={() => createBirdiesBet()}
        doublesBets={doublesBets}
        onRenameDoublesBet={renameDoublesBet}
        onDeleteDoublesBet={deleteDoublesBet}
        onSetDoublesBetNet={setDoublesBetNet}
        onSetDoublesBetAmount={setDoublesBetAmount}
        onCreateDoublesBet={() => createDoublesBet()}
        totalHoles={totalHoles}
        playerTeams={playerTeams}
        matchPlayPlayerTeams={matchPlayPlayerTeams}
        allPlayers={allPlayers}
        playerId={playerId}
        onSetPlayerTeam={setPlayerTeam}
        onSetMatchPlayPlayerTeam={setMatchPlayPlayerTeam}
        onSetPlayerInSkinsBet={setPlayerInSkinsBet}
        onSetPlayerInStrokePlayBet={setPlayerInStrokePlayBet}
        onSetPlayerInBirdiesBet={setPlayerInBirdiesBet}
        onSetPlayerInDoublesBet={setPlayerInDoublesBet}
        groups={groups}
      />

      {roundStatus === 'prep' ? (
        <>
          <Pressable
            style={[styles.startButton, starting && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={starting}
          >
            {starting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Start Round</Text>
            )}
          </Pressable>
          <Text style={styles.startHint}>
            Moves everyone in the round to live scoring - do this once every group is set up.
          </Text>
        </>
      ) : (
        <Text style={styles.liveHint}>
          This round is live - changes here take effect immediately for everyone.
        </Text>
      )}

      <MoveToModal
        visible={moveModalPlayer !== null}
        player={moveModalPlayer}
        otherGroups={groups.filter((group) => group.id !== moveModalGroupId)}
        onMove={handleMoveToGroup}
        onCreateGroup={handleMoveToNewGroup}
        onClose={() => setMoveModalPlayerId(null)}
      />

      <AddToModal
        visible={addModalPlayer !== null}
        player={addModalPlayer}
        teams={teams}
        playerTeams={playerTeams}
        nassauNet={nassauNet}
        nassauAmounts={nassauAmounts}
        matchPlayTeams={matchPlayTeams}
        matchPlayPlayerTeams={matchPlayPlayerTeams}
        matchPlayNet={matchPlayNet}
        matchPlayAmounts={matchPlayAmounts}
        skinsBets={skinsBets}
        strokePlayBets={strokePlayBets}
        birdiesBets={birdiesBets}
        doublesBets={doublesBets}
        onSetPlayerTeam={setPlayerTeam}
        onCreateTeam={handleCreateTeamAndAssign}
        onSetMatchPlayPlayerTeam={setMatchPlayPlayerTeam}
        onCreateMatchPlayTeam={handleCreateMatchPlayTeamAndAssign}
        onSetPlayerInSkinsBet={setPlayerInSkinsBet}
        onCreateSkinsBet={handleCreateSkinsBetAndAssign}
        onSetPlayerInStrokePlayBet={setPlayerInStrokePlayBet}
        onCreateStrokePlayBet={handleCreateStrokePlayBetAndAssign}
        onSetPlayerInBirdiesBet={setPlayerInBirdiesBet}
        onCreateBirdiesBet={handleCreateBirdiesBetAndAssign}
        onSetPlayerInDoublesBet={setPlayerInDoublesBet}
        onCreateDoublesBet={handleCreateDoublesBetAndAssign}
        totalHoles={totalHoles}
        allPlayers={allPlayers}
        groups={groups}
        onClose={() => setAddModalPlayerId(null)}
      />

      <Modal
        visible={showSurpriseModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSurpriseModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowSurpriseModal(false)} />
        <View style={styles.modalSheet}>
          <Text style={styles.modalTitle}>Surprise Me</Text>
          <Text style={styles.modalSectionSubtext}>
            Randomly picks teams and bets - Nassau or Match Play, Skins, Stroke Play - so no player's
            worst case passes the cap below. Always net scoring.
          </Text>

          <View style={styles.valueField}>
            <Text style={styles.valueLabel}>Max $ / player</Text>
            <TextInput
              style={styles.valueInput}
              value={surpriseAmount}
              onChangeText={setSurpriseAmount}
              keyboardType="decimal-pad"
            />
          </View>

          {hasExistingBets && (
            <Text style={styles.modalEmptyHint}>This replaces the teams and bets already set up.</Text>
          )}

          <Pressable
            style={[styles.startButton, generating && styles.buttonDisabled]}
            onPress={handleGenerateRandomBets}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.startButtonText}>Generate</Text>
            )}
          </Pressable>
          <Pressable style={styles.modalCloseButton} onPress={() => setShowSurpriseModal(false)}>
            <Text style={styles.modalCloseButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

interface TeeGroupCardProps {
  group: Group;
  isMyGroup: boolean;
  playerId: string | null;
  handicaps: PlayerHandicaps;
  onSetHandicap: (playerId: string, handicap: number) => void;
  onRename: (name: string) => void;
  onAddPlayer: (name: string) => void;
  onRemovePlayer: (playerId: string) => void;
  onMoveTo: (playerId: string) => void;
  onAddTo: (playerId: string) => void;
}

// One tee group, fully editable in place: rename, add/remove players. Each
// player's tee group and bet/game membership are handled by the "Move to"
// and "Add to" buttons, which pop open a modal rather than expanding
// inline - keeps every row short no matter how many groups or bets exist.
function TeeGroupCard({
  group,
  isMyGroup,
  playerId,
  handicaps,
  onSetHandicap,
  onRename,
  onAddPlayer,
  onRemovePlayer,
  onMoveTo,
  onAddTo,
}: TeeGroupCardProps) {
  const [nameDraft, setNameDraft] = useState(group.name);
  const [newPlayerName, setNewPlayerName] = useState('');

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== group.name) {
      onRename(trimmed);
    } else {
      setNameDraft(group.name);
    }
  };

  const handleAddPlayer = () => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    onAddPlayer(trimmed);
    setNewPlayerName('');
  };

  return (
    <View style={styles.groupCard}>
      <TextInput
        style={styles.groupNameInput}
        value={nameDraft}
        onChangeText={setNameDraft}
        onEndEditing={commitName}
        onBlur={commitName}
        placeholder="Tee group name"
      />
      {isMyGroup && <Text style={styles.youBadge}>This is your tee group</Text>}

      <Text style={styles.subheading}>Players ({group.players.length})</Text>
      {group.players.length === 0 && <Text style={styles.hint}>No players yet</Text>}
      {group.players.map((player) => {
        const isSelf = player.id === playerId;
        return (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerRowHeader}>
              <Text style={styles.playerName}>
                {player.name}
                {isSelf ? ' (You)' : ''}
              </Text>
              {!isSelf && (
                <RemoveButton label={player.name} onConfirm={() => onRemovePlayer(player.id)} />
              )}
            </View>
            <View style={styles.playerActionsRow}>
              <HandicapField
                value={handicaps[player.id] ?? 0}
                onChange={(value) => onSetHandicap(player.id, value)}
              />
              {!isSelf && (
                <Pressable style={styles.actionButton} onPress={() => onMoveTo(player.id)}>
                  <Text style={styles.actionButtonText}>Move to</Text>
                </Pressable>
              )}
              <Pressable style={styles.actionButton} onPress={() => onAddTo(player.id)}>
                <Text style={styles.actionButtonText}>Add to</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <View style={styles.addPlayerRow}>
        <TextInput
          style={styles.addPlayerInput}
          placeholder="Player name"
          value={newPlayerName}
          onChangeText={setNewPlayerName}
          onSubmitEditing={handleAddPlayer}
          returnKeyType="done"
        />
        <Pressable
          style={[styles.addPlayerButton, !newPlayerName.trim() && styles.buttonDisabled]}
          onPress={handleAddPlayer}
          disabled={!newPlayerName.trim()}
        >
          <Text style={styles.addPlayerButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

function HandicapField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Keeps this in sync with a handicap set from outside this input - most
  // importantly the profile auto-fill effect in RoundPrepScreen, which
  // writes to Firebase well after this field has already mounted (and
  // therefore already locked in its own initial "0" draft) once the
  // player's saved profile handicap round-trips back through the
  // handicaps listener. Skipped while focused so it never clobbers active
  // typing.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(parsed, MAX_HANDICAP);
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(value));
    }
  };

  return (
    <View style={styles.handicapField}>
      <Text style={styles.handicapLabel}>18 Hcp</Text>
      <TextInput
        style={styles.handicapInput}
        value={draft}
        onChangeText={setDraft}
        onFocus={() => setFocused(true)}
        onEndEditing={commit}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        keyboardType="number-pad"
      />
    </View>
  );
}

// A compact "x" that stands in for a text "Remove" link/button wherever a
// row needs one - saves the width a full word takes, and folds the confirm
// step into the native alert instead of a second on-screen button.
function RemoveButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const handlePress = () => {
    Alert.alert(`Remove ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: onConfirm },
    ]);
  };

  return (
    <Pressable style={styles.removeIconButton} onPress={handlePress} hitSlop={8}>
      <Text style={styles.removeIconText}>{'✕'}</Text>
    </Pressable>
  );
}

// The "Move to" picker for one player: every other tee group, plus a way
// to spin up a brand new one. Tapping a destination moves the player and
// closes the modal right away.
function MoveToModal({
  visible,
  player,
  otherGroups,
  onMove,
  onCreateGroup,
  onClose,
}: {
  visible: boolean;
  player: Player | null;
  otherGroups: Group[];
  onMove: (groupId: string) => void;
  onCreateGroup: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>Move {player?.name ?? ''} to</Text>

        {otherGroups.length === 0 && (
          <Text style={styles.modalEmptyHint}>No other tee groups yet</Text>
        )}
        {otherGroups.map((group) => (
          <Pressable key={group.id} style={styles.modalRow} onPress={() => onMove(group.id)}>
            <Text style={styles.modalRowText}>{group.name}</Text>
          </Pressable>
        ))}

        <Pressable style={styles.modalAddRow} onPress={onCreateGroup}>
          <Text style={styles.modalAddRowText}>+ New Tee Group</Text>
        </Pressable>

        <Pressable style={styles.modalCloseButton} onPress={onClose}>
          <Text style={styles.modalCloseButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

// The "Add to" picker for one player: which Nassau team they're paired
// with (single choice) and which Skins bets they're opted into (any
// number). Selections apply immediately; the modal stays open so several
// picks can be made in one visit, closed with Done or the backdrop.
function AddToModal({
  visible,
  player,
  teams,
  playerTeams,
  nassauNet,
  nassauAmounts,
  matchPlayTeams,
  matchPlayPlayerTeams,
  matchPlayNet,
  matchPlayAmounts,
  skinsBets,
  strokePlayBets,
  birdiesBets,
  doublesBets,
  onSetPlayerTeam,
  onCreateTeam,
  onSetMatchPlayPlayerTeam,
  onCreateMatchPlayTeam,
  onSetPlayerInSkinsBet,
  onCreateSkinsBet,
  onSetPlayerInStrokePlayBet,
  onCreateStrokePlayBet,
  onSetPlayerInBirdiesBet,
  onCreateBirdiesBet,
  onSetPlayerInDoublesBet,
  onCreateDoublesBet,
  totalHoles,
  allPlayers,
  groups,
  onClose,
}: {
  visible: boolean;
  player: Player | null;
  teams: Team[];
  playerTeams: PlayerTeams;
  nassauNet: boolean;
  nassauAmounts: { front: number; back: number; overall: number };
  matchPlayTeams: Team[];
  matchPlayPlayerTeams: PlayerTeams;
  matchPlayNet: boolean;
  matchPlayAmounts: { front: number; back: number; overall: number };
  skinsBets: SkinsBet[];
  strokePlayBets: StrokePlayBet[];
  birdiesBets: BirdiesBet[];
  doublesBets: DoublesBet[];
  onSetPlayerTeam: (playerId: string, teamId: string | null) => void;
  onCreateTeam: () => void;
  onSetMatchPlayPlayerTeam: (playerId: string, teamId: string | null) => void;
  onCreateMatchPlayTeam: () => void;
  onSetPlayerInSkinsBet: (betId: string, playerId: string, inBet: boolean) => void;
  onCreateSkinsBet: () => void;
  onSetPlayerInStrokePlayBet: (betId: string, playerId: string, inBet: boolean) => void;
  onCreateStrokePlayBet: () => void;
  onSetPlayerInBirdiesBet: (betId: string, playerId: string, inBet: boolean) => void;
  onCreateBirdiesBet: () => void;
  onSetPlayerInDoublesBet: (betId: string, playerId: string, inBet: boolean) => void;
  onCreateDoublesBet: () => void;
  totalHoles: number;
  allPlayers: Player[];
  groups: Group[];
  onClose: () => void;
}) {
  const nassauStakesUnit = useRoundState((state) => state.nassauStakesUnit);
  const matchPlayStakesUnit = useRoundState((state) => state.matchPlayStakesUnit);

  if (!player) {
    return (
      <Modal visible={visible} transparent onRequestClose={onClose}>
        <View />
      </Modal>
    );
  }

  const currentTeamId = playerTeams[player.id] ?? null;
  const currentMatchPlayTeamId = matchPlayPlayerTeams[player.id] ?? null;
  const nassauTerms = describeNassauTerms(nassauNet, nassauAmounts, totalHoles, nassauStakesUnit);
  const matchPlayTerms = describeNassauTerms(matchPlayNet, matchPlayAmounts, totalHoles, matchPlayStakesUnit);
  // Only offer Nassau teams this player could actually join - the team
  // they're already on always stays visible so they can leave it.
  const qualifyingTeams = teams.filter(
    (team) => currentTeamId === team.id || nassauTeamAcceptsPlayer(team.id, player.id, playerTeams, groups),
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose} />
      <ScrollView style={styles.modalSheet} contentContainerStyle={styles.modalSheetContent}>
        <Text style={styles.modalTitle}>Add {player.name} to</Text>

        <Text style={styles.modalSectionLabel}>Nassau Team</Text>
        <Text style={styles.modalSectionSubtext}>{nassauTerms}</Text>
        {qualifyingTeams.length === 0 && (
          <Text style={styles.modalEmptyHint}>
            {teams.length === 0
              ? 'No Nassau teams yet'
              : "No Nassau teams in this player's tee group - Nassau pairs only play together"}
          </Text>
        )}
        {qualifyingTeams.map((team) => {
          const selected = currentTeamId === team.id;
          return (
            <Pressable
              key={team.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetPlayerTeam(player.id, selected ? null : team.id)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {team.name}
              </Text>
              <Text style={styles.modalRowSubtext}>
                {describeTeamMembers(team.id, playerTeams, allPlayers)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateTeam}>
          <Text style={styles.modalAddRowText}>+ New Team (just me)</Text>
        </Pressable>

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>Match Play Team</Text>
        <Text style={styles.modalSectionSubtext}>{matchPlayTerms}</Text>
        {matchPlayTeams.length === 0 && (
          <Text style={styles.modalEmptyHint}>No Match Play teams yet</Text>
        )}
        {matchPlayTeams.map((team) => {
          const selected = currentMatchPlayTeamId === team.id;
          return (
            <Pressable
              key={team.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetMatchPlayPlayerTeam(player.id, selected ? null : team.id)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {team.name}
              </Text>
              <Text style={styles.modalRowSubtext}>
                {describeTeamMembers(team.id, matchPlayPlayerTeams, allPlayers)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateMatchPlayTeam}>
          <Text style={styles.modalAddRowText}>+ New Team (just me)</Text>
        </Pressable>

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>Skins Bets</Text>
        {skinsBets.length === 0 && <Text style={styles.modalEmptyHint}>No Skins bets yet</Text>}
        {skinsBets.map((bet) => {
          const selected = bet.playerIds.includes(player.id);
          return (
            <Pressable
              key={bet.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetPlayerInSkinsBet(bet.id, player.id, !selected)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {bet.name}
              </Text>
              <Text style={styles.modalRowSubtext}>{describeSkinsBet(bet)}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateSkinsBet}>
          <Text style={styles.modalAddRowText}>+ New Skins Bet</Text>
        </Pressable>

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>Stroke Play Bets</Text>
        {strokePlayBets.length === 0 && (
          <Text style={styles.modalEmptyHint}>No Stroke Play bets yet</Text>
        )}
        {strokePlayBets.map((bet) => {
          const selected = bet.playerIds.includes(player.id);
          return (
            <Pressable
              key={bet.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetPlayerInStrokePlayBet(bet.id, player.id, !selected)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {bet.name}
              </Text>
              <Text style={styles.modalRowSubtext}>{describeStrokePlayBet(bet)}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateStrokePlayBet}>
          <Text style={styles.modalAddRowText}>+ New Stroke Play Bet</Text>
        </Pressable>

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>Birdies Bets</Text>
        {birdiesBets.length === 0 && <Text style={styles.modalEmptyHint}>No Birdies bets yet</Text>}
        {birdiesBets.map((bet) => {
          const selected = bet.playerIds.includes(player.id);
          return (
            <Pressable
              key={bet.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetPlayerInBirdiesBet(bet.id, player.id, !selected)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {bet.name}
              </Text>
              <Text style={styles.modalRowSubtext}>{describeBirdiesBet(bet)}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateBirdiesBet}>
          <Text style={styles.modalAddRowText}>+ New Birdies Bet</Text>
        </Pressable>

        <Text style={[styles.modalSectionLabel, styles.modalSectionLabelSpaced]}>Doubles Bets</Text>
        {doublesBets.length === 0 && <Text style={styles.modalEmptyHint}>No Doubles bets yet</Text>}
        {doublesBets.map((bet) => {
          const selected = bet.playerIds.includes(player.id);
          return (
            <Pressable
              key={bet.id}
              style={[styles.modalRow, selected && styles.modalRowSelected]}
              onPress={() => onSetPlayerInDoublesBet(bet.id, player.id, !selected)}
            >
              <Text style={[styles.modalRowText, selected && styles.modalRowTextSelected]}>
                {selected ? '✓ ' : ''}
                {bet.name}
              </Text>
              <Text style={styles.modalRowSubtext}>{describeDoublesBet(bet)}</Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.modalAddRow} onPress={onCreateDoublesBet}>
          <Text style={styles.modalAddRowText}>+ New Doubles Bet</Text>
        </Pressable>

        <Pressable style={styles.modalCloseButton} onPress={onClose}>
          <Text style={styles.modalCloseButtonText}>Done</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  );
}

// One-line descriptions shown in the "Add to" picker, so a player can see
// a bet's terms - the $ amount, net vs. gross, and whether Skins carries
// over on ties - without leaving the picker to go check the settings
// strip below. Carryover is only mentioned when it's on; nothing extra is
// shown when it's off, per how the picker should read either way.
function describeNassauTerms(
  net: boolean,
  amounts: { front: number; back: number; overall: number },
  totalHoles: number,
  unit: StakesUnit,
): string {
  const amountParts: string[] = [];
  if (totalHoles === 9) {
    // Front and Overall are the same nine holes on a 9-hole round - see
    // NassauSettings, which only shows a single "Bet $" field there.
    if (amounts.front > 0) amountParts.push(formatStakeAmount(amounts.front, unit));
  } else {
    if (amounts.front > 0) amountParts.push(`${formatStakeAmount(amounts.front, unit)} front`);
    if (amounts.back > 0) amountParts.push(`${formatStakeAmount(amounts.back, unit)} back`);
    if (amounts.overall > 0) amountParts.push(`${formatStakeAmount(amounts.overall, unit)} overall`);
  }

  const parts: string[] = [];
  if (amountParts.length > 0) parts.push(amountParts.join(', '));
  parts.push(net ? 'net' : 'gross');
  return parts.join(', ');
}

// Who's actually on a team - shown wherever a team is listed, so an open
// team (room for a partner) is obvious from one you'd be double-booking.
function describeTeamMembers(teamId: string, playerTeams: PlayerTeams, allPlayers: Player[]): string {
  const names = allPlayers
    .filter((candidate) => playerTeams[candidate.id] === teamId)
    .map((candidate) => candidate.name);
  return names.length > 0 ? names.join(' & ') : 'No one on this team yet';
}

// Same idea as describeTeamMembers, for a Skins/Stroke Play bet - those
// bets keep their own playerIds list rather than a separate team map.
function describeBetMembers(playerIds: string[], allPlayers: Player[]): string {
  const names = allPlayers.filter((candidate) => playerIds.includes(candidate.id)).map((candidate) => candidate.name);
  return names.length > 0 ? names.join(' & ') : 'No one in this bet yet';
}

function playersTeeGroupId(playerId: string, groups: Group[]): string | null {
  const group = groups.find((candidateGroup) => candidateGroup.players.some((p) => p.id === playerId));
  return group?.id ?? null;
}

// Nassau's press mechanic (calling a press mid-round) only makes sense
// between sides actually playing together, so a Nassau team can only take
// players from the same tee group - Match Play has no press option and
// isn't restricted this way. An empty team has no group of its own yet,
// so anyone can start one; once it has a member, only players from that
// same tee group can join.
function nassauTeamAcceptsPlayer(
  teamId: string,
  candidatePlayerId: string,
  playerTeams: PlayerTeams,
  groups: Group[],
): boolean {
  const candidateGroupId = playersTeeGroupId(candidatePlayerId, groups);
  const memberIds = Object.keys(playerTeams).filter(
    (id) => playerTeams[id] === teamId && id !== candidatePlayerId,
  );
  if (memberIds.length === 0) return true;
  return memberIds.every((id) => playersTeeGroupId(id, groups) === candidateGroupId);
}

function describeSkinsBet(bet: SkinsBet): string {
  const unit = bet.unit;
  const parts: string[] = [];
  if (bet.payoutMode === 'pot') {
    parts.push(bet.buyIn > 0 ? `${formatStakeAmount(bet.buyIn, unit)} buy-in, pot split` : `No ${stakesSymbol(unit)} set`);
  } else {
    parts.push(bet.valuePerSkin > 0 ? `${formatStakeAmount(bet.valuePerSkin, unit)} entry` : `No ${stakesSymbol(unit)} set`);
  }

  const terms: string[] = [];
  if (bet.net) terms.push('net');
  if (bet.carryover) terms.push('carryover');
  if (terms.length > 0) parts.push(terms.join(' '));

  const count = bet.playerIds.length;
  const description = parts.join(', ');
  return `${description} • ${count} player${count === 1 ? '' : 's'}`;
}

function describeStrokePlayBet(bet: StrokePlayBet): string {
  const unit = bet.unit;
  const parts: string[] = [];
  if (bet.payoutMode === 'perStroke') {
    parts.push(bet.valuePerStroke > 0 ? `${formatStakeAmount(bet.valuePerStroke, unit)}/stroke` : `No ${stakesSymbol(unit)} set`);
  } else {
    const label = bet.payoutMode === 'potWinner' ? 'winner take all' : 'split by finish';
    parts.push(bet.buyIn > 0 ? `${formatStakeAmount(bet.buyIn, unit)} buy-in, ${label}` : `No ${stakesSymbol(unit)} set`);
  }

  if (bet.net) parts.push('net');

  const count = bet.playerIds.length;
  const description = parts.join(', ');
  return `${description} • ${count} player${count === 1 ? '' : 's'}`;
}

function describeBirdiesBet(bet: BirdiesBet): string {
  const unit = bet.unit;
  const parts: string[] = [
    bet.amountPerBirdie > 0 ? `${formatStakeAmount(bet.amountPerBirdie, unit)}/point (eagle pays 2x)` : `No ${stakesSymbol(unit)} set`,
  ];
  if (bet.net) parts.push('net');

  const count = bet.playerIds.length;
  const description = parts.join(', ');
  return `${description} • ${count} player${count === 1 ? '' : 's'}`;
}

function describeDoublesBet(bet: DoublesBet): string {
  const unit = bet.unit;
  const parts: string[] = [
    bet.amountPerDouble > 0 ? `${formatStakeAmount(bet.amountPerDouble, unit)}/double bogey+` : `No ${stakesSymbol(unit)} set`,
  ];
  if (bet.net) parts.push('net');

  const count = bet.playerIds.length;
  const description = parts.join(', ');
  return `${description} • ${count} player${count === 1 ? '' : 's'}`;
}

// The compact, always-visible strip for bet-level money and rules - the
// stuff that's set once and rarely touched, as opposed to who's playing
// which bet (handled per-player above via "Add to"). One line per team or
// bet, no player chips.
function BetSettings({
  nassauNet,
  nassauAmounts,
  onSetNassauNet,
  onSetNassauAmount,
  nassauAutoPress,
  nassauPressStacking,
  onSetNassauAutoPress,
  onSetNassauPressStacking,
  teams,
  onRenameTeam,
  onDeleteTeam,
  onCreateTeam,
  matchPlayNet,
  matchPlayAmounts,
  onSetMatchPlayNet,
  onSetMatchPlayAmount,
  matchPlayTeams,
  onRenameMatchPlayTeam,
  onDeleteMatchPlayTeam,
  onCreateMatchPlayTeam,
  skinsBets,
  onRenameSkinsBet,
  onDeleteSkinsBet,
  onSetSkinsBetCarryover,
  onSetSkinsBetNet,
  onSetSkinsBetValuePerSkin,
  onSetSkinsBetPayoutMode,
  onSetSkinsBetBuyIn,
  onCreateSkinsBet,
  strokePlayBets,
  onRenameStrokePlayBet,
  onDeleteStrokePlayBet,
  onSetStrokePlayBetNet,
  onSetStrokePlayBetPayoutMode,
  onSetStrokePlayBetValuePerStroke,
  onSetStrokePlayBetBuyIn,
  onCreateStrokePlayBet,
  birdiesBets,
  onRenameBirdiesBet,
  onDeleteBirdiesBet,
  onSetBirdiesBetNet,
  onSetBirdiesBetAmount,
  onCreateBirdiesBet,
  doublesBets,
  onRenameDoublesBet,
  onDeleteDoublesBet,
  onSetDoublesBetNet,
  onSetDoublesBetAmount,
  onCreateDoublesBet,
  totalHoles,
  playerTeams,
  matchPlayPlayerTeams,
  allPlayers,
  playerId,
  onSetPlayerTeam,
  onSetMatchPlayPlayerTeam,
  onSetPlayerInSkinsBet,
  onSetPlayerInStrokePlayBet,
  onSetPlayerInBirdiesBet,
  onSetPlayerInDoublesBet,
  groups,
}: {
  nassauNet: boolean;
  nassauAmounts: { front: number; back: number; overall: number };
  onSetNassauNet: (net: boolean) => void;
  onSetNassauAmount: (segment: 'front' | 'back' | 'overall', amount: number) => void;
  nassauAutoPress: boolean;
  nassauPressStacking: PressStackingMode;
  onSetNassauAutoPress: (enabled: boolean) => void;
  onSetNassauPressStacking: (mode: PressStackingMode) => void;
  teams: Team[];
  onRenameTeam: (teamId: string, name: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onCreateTeam: () => void;
  matchPlayNet: boolean;
  matchPlayAmounts: { front: number; back: number; overall: number };
  onSetMatchPlayNet: (net: boolean) => void;
  onSetMatchPlayAmount: (segment: 'front' | 'back' | 'overall', amount: number) => void;
  matchPlayTeams: Team[];
  onRenameMatchPlayTeam: (teamId: string, name: string) => void;
  onDeleteMatchPlayTeam: (teamId: string) => void;
  onCreateMatchPlayTeam: () => void;
  skinsBets: SkinsBet[];
  onRenameSkinsBet: (betId: string, name: string) => void;
  onDeleteSkinsBet: (betId: string) => void;
  onSetSkinsBetCarryover: (betId: string, carryover: boolean) => void;
  onSetSkinsBetNet: (betId: string, net: boolean) => void;
  onSetSkinsBetValuePerSkin: (betId: string, valuePerSkin: number) => void;
  onSetSkinsBetPayoutMode: (betId: string, payoutMode: SkinsPayoutMode) => void;
  onSetSkinsBetBuyIn: (betId: string, buyIn: number) => void;
  onCreateSkinsBet: () => void;
  strokePlayBets: StrokePlayBet[];
  onRenameStrokePlayBet: (betId: string, name: string) => void;
  onDeleteStrokePlayBet: (betId: string) => void;
  onSetStrokePlayBetNet: (betId: string, net: boolean) => void;
  onSetStrokePlayBetPayoutMode: (betId: string, payoutMode: StrokePlayPayoutMode) => void;
  onSetStrokePlayBetValuePerStroke: (betId: string, valuePerStroke: number) => void;
  onSetStrokePlayBetBuyIn: (betId: string, buyIn: number) => void;
  onCreateStrokePlayBet: () => void;
  birdiesBets: BirdiesBet[];
  onRenameBirdiesBet: (betId: string, name: string) => void;
  onDeleteBirdiesBet: (betId: string) => void;
  onSetBirdiesBetNet: (betId: string, net: boolean) => void;
  onSetBirdiesBetAmount: (betId: string, amountPerBirdie: number) => void;
  onCreateBirdiesBet: () => void;
  doublesBets: DoublesBet[];
  onRenameDoublesBet: (betId: string, name: string) => void;
  onDeleteDoublesBet: (betId: string) => void;
  onSetDoublesBetNet: (betId: string, net: boolean) => void;
  onSetDoublesBetAmount: (betId: string, amountPerDouble: number) => void;
  onCreateDoublesBet: () => void;
  totalHoles: number;
  playerTeams: PlayerTeams;
  matchPlayPlayerTeams: PlayerTeams;
  allPlayers: Player[];
  playerId: string | null;
  onSetPlayerTeam: (playerId: string, teamId: string | null) => void;
  onSetMatchPlayPlayerTeam: (playerId: string, teamId: string | null) => void;
  onSetPlayerInSkinsBet: (betId: string, playerId: string, inBet: boolean) => void;
  onSetPlayerInStrokePlayBet: (betId: string, playerId: string, inBet: boolean) => void;
  onSetPlayerInBirdiesBet: (betId: string, playerId: string, inBet: boolean) => void;
  onSetPlayerInDoublesBet: (betId: string, playerId: string, inBet: boolean) => void;
  groups: Group[];
}) {
  // Every bet type starts collapsed unless the round already has something
  // in it (loading an in-progress round, or a player joining a team from
  // their own "Add to" modal before ever opening this strip) - and once a
  // section picks up its first team/bet, it opens and stays open, so noone
  // loses track of something they just added.
  const nassauStakesUnit = useRoundState((state) => state.nassauStakesUnit);
  const setNassauStakesUnit = useRoundState((state) => state.setNassauStakesUnit);
  const matchPlayStakesUnit = useRoundState((state) => state.matchPlayStakesUnit);
  const setMatchPlayStakesUnit = useRoundState((state) => state.setMatchPlayStakesUnit);
  const [nassauOpen, setNassauOpen] = useState(teams.length > 0);
  const [matchPlayOpen, setMatchPlayOpen] = useState(matchPlayTeams.length > 0);
  const [skinsOpen, setSkinsOpen] = useState(skinsBets.length > 0);
  const [strokePlayOpen, setStrokePlayOpen] = useState(strokePlayBets.length > 0);
  const [birdiesOpen, setBirdiesOpen] = useState(birdiesBets.length > 0);
  const [doublesOpen, setDoublesOpen] = useState(doublesBets.length > 0);

  useEffect(() => {
    if (teams.length > 0) setNassauOpen(true);
  }, [teams.length]);
  useEffect(() => {
    if (matchPlayTeams.length > 0) setMatchPlayOpen(true);
  }, [matchPlayTeams.length]);
  useEffect(() => {
    if (skinsBets.length > 0) setSkinsOpen(true);
  }, [skinsBets.length]);
  useEffect(() => {
    if (strokePlayBets.length > 0) setStrokePlayOpen(true);
  }, [strokePlayBets.length]);
  useEffect(() => {
    if (birdiesBets.length > 0) setBirdiesOpen(true);
  }, [birdiesBets.length]);
  useEffect(() => {
    if (doublesBets.length > 0) setDoublesOpen(true);
  }, [doublesBets.length]);

  return (
    <View style={styles.settingsContainer}>
      <SectionHeader
        title="Nassau"
        open={nassauOpen}
        onToggle={() => setNassauOpen((prev) => !prev)}
        summary={teams.length > 0 ? `${teams.length} team${teams.length === 1 ? '' : 's'}` : 'Not used'}
        rightExtra={<StakesUnitToggle unit={nassauStakesUnit} onChange={setNassauStakesUnit} />}
      />
      {nassauOpen && (
        <>
          <NassauSettings
            net={nassauNet}
            amounts={nassauAmounts}
            onSetNet={onSetNassauNet}
            onSetAmount={onSetNassauAmount}
            totalHoles={totalHoles}
            autoPress={nassauAutoPress}
            pressStacking={nassauPressStacking}
            onSetAutoPress={onSetNassauAutoPress}
            onSetPressStacking={onSetNassauPressStacking}
            unit={nassauStakesUnit}
          />
          {teams.map((team) => (
            <NassauTeamRow
              key={team.id}
              team={team}
              membersLabel={describeTeamMembers(team.id, playerTeams, allPlayers)}
              onRename={(name) => onRenameTeam(team.id, name)}
              onDelete={() => onDeleteTeam(team.id)}
              amIOnTeam={playerId != null && playerTeams[playerId] === team.id}
              onToggleMe={
                playerId &&
                (playerTeams[playerId] === team.id ||
                  nassauTeamAcceptsPlayer(team.id, playerId, playerTeams, groups))
                  ? () => onSetPlayerTeam(playerId, playerTeams[playerId] === team.id ? null : team.id)
                  : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateTeam}>
            <Text style={styles.settingsAddRowText}>+ New Team</Text>
          </Pressable>
        </>
      )}

      <SectionHeader
        title="Match Play"
        open={matchPlayOpen}
        onToggle={() => setMatchPlayOpen((prev) => !prev)}
        summary={
          matchPlayTeams.length > 0 ? `${matchPlayTeams.length} team${matchPlayTeams.length === 1 ? '' : 's'}` : 'Not used'
        }
        rightExtra={<StakesUnitToggle unit={matchPlayStakesUnit} onChange={setMatchPlayStakesUnit} />}
      />
      {matchPlayOpen && (
        <>
          <NassauSettings
            net={matchPlayNet}
            amounts={matchPlayAmounts}
            onSetNet={onSetMatchPlayNet}
            onSetAmount={onSetMatchPlayAmount}
            totalHoles={totalHoles}
            unit={matchPlayStakesUnit}
          />
          {matchPlayTeams.map((team) => (
            <NassauTeamRow
              key={team.id}
              team={team}
              membersLabel={describeTeamMembers(team.id, matchPlayPlayerTeams, allPlayers)}
              onRename={(name) => onRenameMatchPlayTeam(team.id, name)}
              onDelete={() => onDeleteMatchPlayTeam(team.id)}
              amIOnTeam={playerId != null && matchPlayPlayerTeams[playerId] === team.id}
              onToggleMe={
                playerId
                  ? () =>
                      onSetMatchPlayPlayerTeam(
                        playerId,
                        matchPlayPlayerTeams[playerId] === team.id ? null : team.id,
                      )
                  : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateMatchPlayTeam}>
            <Text style={styles.settingsAddRowText}>+ New Team</Text>
          </Pressable>
        </>
      )}

      <SectionHeader
        title="Skins"
        open={skinsOpen}
        onToggle={() => setSkinsOpen((prev) => !prev)}
        summary={skinsBets.length > 0 ? `${skinsBets.length} bet${skinsBets.length === 1 ? '' : 's'}` : 'Not used'}
      />
      {skinsOpen && (
        <>
          {skinsBets.map((bet) => (
            <SkinsBetSettingsRow
              key={bet.id}
              bet={bet}
              onRename={(name) => onRenameSkinsBet(bet.id, name)}
              onSetCarryover={(carryover) => onSetSkinsBetCarryover(bet.id, carryover)}
              onSetNet={(net) => onSetSkinsBetNet(bet.id, net)}
              onSetValuePerSkin={(value) => onSetSkinsBetValuePerSkin(bet.id, value)}
              onSetPayoutMode={(mode) => onSetSkinsBetPayoutMode(bet.id, mode)}
              onSetBuyIn={(value) => onSetSkinsBetBuyIn(bet.id, value)}
              onDelete={() => onDeleteSkinsBet(bet.id)}
              allPlayers={allPlayers}
              amIIn={playerId != null && bet.playerIds.includes(playerId)}
              onToggleMe={
                playerId ? () => onSetPlayerInSkinsBet(bet.id, playerId, !bet.playerIds.includes(playerId)) : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateSkinsBet}>
            <Text style={styles.settingsAddRowText}>+ New Skins Bet</Text>
          </Pressable>
        </>
      )}

      <SectionHeader
        title="Stroke Play"
        open={strokePlayOpen}
        onToggle={() => setStrokePlayOpen((prev) => !prev)}
        summary={
          strokePlayBets.length > 0 ? `${strokePlayBets.length} bet${strokePlayBets.length === 1 ? '' : 's'}` : 'Not used'
        }
      />
      {strokePlayOpen && (
        <>
          {strokePlayBets.map((bet) => (
            <StrokePlaySettingsRow
              key={bet.id}
              bet={bet}
              onRename={(name) => onRenameStrokePlayBet(bet.id, name)}
              onSetNet={(net) => onSetStrokePlayBetNet(bet.id, net)}
              onSetPayoutMode={(mode) => onSetStrokePlayBetPayoutMode(bet.id, mode)}
              onSetValuePerStroke={(value) => onSetStrokePlayBetValuePerStroke(bet.id, value)}
              onSetBuyIn={(value) => onSetStrokePlayBetBuyIn(bet.id, value)}
              onDelete={() => onDeleteStrokePlayBet(bet.id)}
              allPlayers={allPlayers}
              amIIn={playerId != null && bet.playerIds.includes(playerId)}
              onToggleMe={
                playerId
                  ? () => onSetPlayerInStrokePlayBet(bet.id, playerId, !bet.playerIds.includes(playerId))
                  : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateStrokePlayBet}>
            <Text style={styles.settingsAddRowText}>+ New Stroke Play Bet</Text>
          </Pressable>
        </>
      )}

      <SectionHeader
        title="Birdies"
        open={birdiesOpen}
        onToggle={() => setBirdiesOpen((prev) => !prev)}
        summary={birdiesBets.length > 0 ? `${birdiesBets.length} bet${birdiesBets.length === 1 ? '' : 's'}` : 'Not used'}
      />
      {birdiesOpen && (
        <>
          {birdiesBets.map((bet) => (
            <BirdiesSettingsRow
              key={bet.id}
              bet={bet}
              onRename={(name) => onRenameBirdiesBet(bet.id, name)}
              onSetNet={(net) => onSetBirdiesBetNet(bet.id, net)}
              onSetAmount={(value) => onSetBirdiesBetAmount(bet.id, value)}
              onDelete={() => onDeleteBirdiesBet(bet.id)}
              allPlayers={allPlayers}
              amIIn={playerId != null && bet.playerIds.includes(playerId)}
              onToggleMe={
                playerId ? () => onSetPlayerInBirdiesBet(bet.id, playerId, !bet.playerIds.includes(playerId)) : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateBirdiesBet}>
            <Text style={styles.settingsAddRowText}>+ New Birdies Bet</Text>
          </Pressable>
        </>
      )}

      <SectionHeader
        title="Doubles"
        open={doublesOpen}
        onToggle={() => setDoublesOpen((prev) => !prev)}
        summary={doublesBets.length > 0 ? `${doublesBets.length} bet${doublesBets.length === 1 ? '' : 's'}` : 'Not used'}
      />
      {doublesOpen && (
        <>
          {doublesBets.map((bet) => (
            <DoublesSettingsRow
              key={bet.id}
              bet={bet}
              onRename={(name) => onRenameDoublesBet(bet.id, name)}
              onSetNet={(net) => onSetDoublesBetNet(bet.id, net)}
              onSetAmount={(value) => onSetDoublesBetAmount(bet.id, value)}
              onDelete={() => onDeleteDoublesBet(bet.id)}
              allPlayers={allPlayers}
              amIIn={playerId != null && bet.playerIds.includes(playerId)}
              onToggleMe={
                playerId ? () => onSetPlayerInDoublesBet(bet.id, playerId, !bet.playerIds.includes(playerId)) : undefined
              }
            />
          ))}
          <Pressable style={styles.settingsAddRow} onPress={onCreateDoublesBet}>
            <Text style={styles.settingsAddRowText}>+ New Doubles Bet</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

// A tappable section heading - title on the left, a one-line summary and a
// chevron on the right - so an unused bet type collapses down to a single
// row instead of forcing a scroll past inputs nobody's touching.
function SectionHeader({
  title,
  open,
  onToggle,
  summary,
  rightExtra,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  summary: string;
  // Optional extra control shown next to the title, before the summary/
  // chevron - used by Nassau/Match Play to surface their stakes toggle
  // right in the header, without needing to open the section.
  rightExtra?: ReactNode;
}) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={styles.settingsHeading}>{title}</Text>
        {rightExtra}
      </View>
      <View style={styles.sectionHeaderRight}>
        <Text style={styles.sectionHeaderSummary}>{summary}</Text>
        <Text style={styles.sectionChevron}>{open ? '\u25BE' : '\u25B8'}</Text>
      </View>
    </Pressable>
  );
}

function NassauTeamRow({
  team,
  membersLabel,
  onRename,
  onDelete,
  amIOnTeam,
  onToggleMe,
}: {
  team: Team;
  membersLabel: string;
  onRename: (name: string) => void;
  onDelete: () => void;
  amIOnTeam?: boolean;
  onToggleMe?: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(team.name);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== team.name) {
      onRename(trimmed);
    } else {
      setNameDraft(team.name);
    }
  };

  return (
    <View style={styles.settingsTeamCard}>
      <View style={styles.settingsRow}>
        <TextInput
          style={styles.settingsNameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <RemoveButton label={team.name} onConfirm={onDelete} />
      </View>
      <View style={styles.settingsMembersRow}>
        <Text style={styles.settingsRowSubtext}>{membersLabel}</Text>
        {onToggleMe && (
          <Pressable style={styles.addMeChip} onPress={onToggleMe}>
            <Text style={styles.addMeChipText}>{amIOnTeam ? 'Remove me' : 'Add me'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function SkinsBetSettingsRow({
  bet,
  onRename,
  onSetCarryover,
  onSetNet,
  onSetValuePerSkin,
  onSetPayoutMode,
  onSetBuyIn,
  onDelete,
  allPlayers,
  amIIn,
  onToggleMe,
}: {
  bet: SkinsBet;
  onRename: (name: string) => void;
  onSetCarryover: (carryover: boolean) => void;
  onSetNet: (net: boolean) => void;
  onSetValuePerSkin: (valuePerSkin: number) => void;
  onSetPayoutMode: (payoutMode: SkinsPayoutMode) => void;
  onSetBuyIn: (buyIn: number) => void;
  onDelete: () => void;
  allPlayers: Player[];
  amIIn?: boolean;
  onToggleMe?: () => void;
}) {
  const unit = bet.unit;
  const setSkinsBetUnit = useRoundState((state) => state.setSkinsBetUnit);
  const [nameDraft, setNameDraft] = useState(bet.name);
  const [valueDraft, setValueDraft] = useState(String(bet.valuePerSkin));
  const [buyInDraft, setBuyInDraft] = useState(String(bet.buyIn));
  const [valueFocused, setValueFocused] = useState(false);
  const [buyInFocused, setBuyInFocused] = useState(false);
  const isPot = bet.payoutMode === 'pot';

  // Keeps these two in sync with amounts set from outside this input -
  // the random bet generator's setSkinsBetValuePerSkin/setSkinsBetBuyIn
  // calls in particular, which used to leave whatever was on screen
  // stale even though the stored amount had changed underneath it.
  // Skipped while a field is focused so it never clobbers active typing.
  useEffect(() => {
    if (!valueFocused) setValueDraft(String(bet.valuePerSkin));
  }, [bet.valuePerSkin, valueFocused]);
  useEffect(() => {
    if (!buyInFocused) setBuyInDraft(String(bet.buyIn));
  }, [bet.buyIn, buyInFocused]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== bet.name) {
      onRename(trimmed);
    } else {
      setNameDraft(bet.name);
    }
  };

  const commitValue = () => {
    const parsed = Number(valueDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetValuePerSkin(parsed);
      setValueDraft(String(parsed));
    } else {
      setValueDraft(String(bet.valuePerSkin));
    }
  };

  const commitBuyIn = () => {
    const parsed = Number(buyInDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetBuyIn(parsed);
      setBuyInDraft(String(parsed));
    } else {
      setBuyInDraft(String(bet.buyIn));
    }
  };

  // Live estimate of the pot, from however many players are opted in so
  // far - just a preview, the real payout uses whoever's still opted in
  // once skins are actually won.
  const potPreview = bet.buyIn * bet.playerIds.length;

  // Every bet follows the same step order: name, then Game Amt, then Game
  // Options/attributes, then who's in it (team first if the bet has one,
  // individual participants after) - Skins has no team, so it goes
  // straight from options to the "Add me" row.
  return (
    <View style={styles.skinsSettingsCard}>
      <View style={styles.settingsRow}>
        <TextInput
          style={styles.settingsNameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <StakesUnitToggle unit={unit} onChange={(newUnit) => setSkinsBetUnit(bet.id, newUnit)} />
        <RemoveButton label={bet.name} onConfirm={onDelete} />
      </View>

      <View style={styles.skinsSettingsOptionsRow}>
        {isPot ? (
          <View style={styles.valueField}>
            <Text style={styles.valueLabel}>{stakesSymbol(unit)}/buy-in</Text>
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
          </View>
        ) : (
          <View style={styles.valueField}>
            <Text style={styles.valueLabel}>{stakesSymbol(unit)}/skin</Text>
            <TextInput
              style={styles.valueInput}
              value={valueDraft}
              onChangeText={setValueDraft}
              onFocus={() => setValueFocused(true)}
              onEndEditing={commitValue}
              onBlur={() => {
                setValueFocused(false);
                commitValue();
              }}
              keyboardType="decimal-pad"
            />
          </View>
        )}
      </View>

      <View style={styles.skinsSettingsOptionsRow}>
        <Pressable
          style={[styles.payoutModeChip, !isPot && styles.payoutModeChipActive]}
          onPress={() => onSetPayoutMode('perSkin')}
        >
          <Text style={[styles.payoutModeChipText, !isPot && styles.payoutModeChipTextActive]}>
            {stakesSymbol(unit)}/Skin
          </Text>
        </Pressable>
        <Pressable
          style={[styles.payoutModeChip, isPot && styles.payoutModeChipActive]}
          onPress={() => onSetPayoutMode('pot')}
        >
          <Text style={[styles.payoutModeChipText, isPot && styles.payoutModeChipTextActive]}>
            Pot
          </Text>
        </Pressable>
        <Pressable style={styles.toggleChip} onPress={() => onSetNet(!bet.net)}>
          <View style={[styles.checkbox, bet.net && styles.checkboxChecked]}>
            {bet.net && <Text style={styles.checkboxMark}>{'✓'}</Text>}
          </View>
          <Text style={styles.toggleChipText}>Net</Text>
        </Pressable>
        <Pressable style={styles.toggleChip} onPress={() => onSetCarryover(!bet.carryover)}>
          <View style={[styles.checkbox, bet.carryover && styles.checkboxChecked]}>
            {bet.carryover && <Text style={styles.checkboxMark}>{'✓'}</Text>}
          </View>
          <Text style={styles.toggleChipText}>Carryover</Text>
        </Pressable>
      </View>

      <View style={styles.settingsMembersRow}>
        <Text style={styles.settingsRowSubtext}>{describeBetMembers(bet.playerIds, allPlayers)}</Text>
        {onToggleMe && (
          <Pressable style={styles.addMeChip} onPress={onToggleMe}>
            <Text style={styles.addMeChipText}>{amIIn ? 'Remove me' : 'Add me'}</Text>
          </Pressable>
        )}
      </View>

      {isPot && potPreview > 0 && (
        <Text style={styles.potPreviewText}>
          Pot: {formatStakeAmount(potPreview, unit)} ({bet.playerIds.length} player{bet.playerIds.length === 1 ? '' : 's'})
        </Text>
      )}
    </View>
  );
}

function StrokePlaySettingsRow({
  bet,
  onRename,
  onSetNet,
  onSetPayoutMode,
  onSetValuePerStroke,
  onSetBuyIn,
  onDelete,
  allPlayers,
  amIIn,
  onToggleMe,
}: {
  bet: StrokePlayBet;
  onRename: (name: string) => void;
  onSetNet: (net: boolean) => void;
  onSetPayoutMode: (payoutMode: StrokePlayPayoutMode) => void;
  onSetValuePerStroke: (valuePerStroke: number) => void;
  onSetBuyIn: (buyIn: number) => void;
  onDelete: () => void;
  allPlayers: Player[];
  amIIn?: boolean;
  onToggleMe?: () => void;
}) {
  const unit = bet.unit;
  const setStrokePlayBetUnit = useRoundState((state) => state.setStrokePlayBetUnit);
  const [nameDraft, setNameDraft] = useState(bet.name);
  const [valueDraft, setValueDraft] = useState(String(bet.valuePerStroke));
  const [buyInDraft, setBuyInDraft] = useState(String(bet.buyIn));
  const [valueFocused, setValueFocused] = useState(false);
  const [buyInFocused, setBuyInFocused] = useState(false);
  const isPot = bet.payoutMode !== 'perStroke';

  // Keeps these two in sync with amounts set from outside this input -
  // the random bet generator's setStrokePlayBetValuePerStroke/
  // setStrokePlayBetBuyIn calls in particular, which used to leave
  // whatever was on screen stale even though the stored amount had
  // changed underneath it. Skipped while a field is focused so it never
  // clobbers active typing.
  useEffect(() => {
    if (!valueFocused) setValueDraft(String(bet.valuePerStroke));
  }, [bet.valuePerStroke, valueFocused]);
  useEffect(() => {
    if (!buyInFocused) setBuyInDraft(String(bet.buyIn));
  }, [bet.buyIn, buyInFocused]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== bet.name) {
      onRename(trimmed);
    } else {
      setNameDraft(bet.name);
    }
  };

  const commitValue = () => {
    const parsed = Number(valueDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetValuePerStroke(parsed);
      setValueDraft(String(parsed));
    } else {
      setValueDraft(String(bet.valuePerStroke));
    }
  };

  const commitBuyIn = () => {
    const parsed = Number(buyInDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetBuyIn(parsed);
      setBuyInDraft(String(parsed));
    } else {
      setBuyInDraft(String(bet.buyIn));
    }
  };

  // Live estimate of the pot, from however many players are opted in so
  // far - just a preview, the real payout depends on final standings.
  const potPreview = bet.buyIn * bet.playerIds.length;

  // Same step order as Skins: name, then Game Amt, then Game
  // Options/attributes, then individual participants (Stroke Play has no
  // team concept either).
  return (
    <View style={styles.strokePlaySettingsCard}>
      <View style={styles.settingsRow}>
        <TextInput
          style={styles.settingsNameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <StakesUnitToggle unit={unit} onChange={(newUnit) => setStrokePlayBetUnit(bet.id, newUnit)} />
        <RemoveButton label={bet.name} onConfirm={onDelete} />
      </View>

      <View style={styles.strokePlaySettingsOptionsRow}>
        {isPot ? (
          <View style={styles.valueField}>
            <Text style={styles.valueLabel}>{stakesSymbol(unit)}/buy-in</Text>
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
          </View>
        ) : (
          <View style={styles.valueField}>
            <Text style={styles.valueLabel}>{stakesSymbol(unit)}/stroke</Text>
            <TextInput
              style={styles.valueInput}
              value={valueDraft}
              onChangeText={setValueDraft}
              onFocus={() => setValueFocused(true)}
              onEndEditing={commitValue}
              onBlur={() => {
                setValueFocused(false);
                commitValue();
              }}
              keyboardType="decimal-pad"
            />
          </View>
        )}
      </View>

      <View style={styles.strokePlaySettingsOptionsRow}>
        <Pressable
          style={[styles.payoutModeChip, !isPot && styles.payoutModeChipActive]}
          onPress={() => onSetPayoutMode('perStroke')}
        >
          <Text style={[styles.payoutModeChipText, !isPot && styles.payoutModeChipTextActive]}>
            {stakesSymbol(unit)}/Stroke
          </Text>
        </Pressable>
        <Pressable
          style={[styles.payoutModeChip, bet.payoutMode === 'potWinner' && styles.payoutModeChipActive]}
          onPress={() => onSetPayoutMode('potWinner')}
        >
          <Text
            style={[
              styles.payoutModeChipText,
              bet.payoutMode === 'potWinner' && styles.payoutModeChipTextActive,
            ]}
          >
            Winner Pot
          </Text>
        </Pressable>
        <Pressable
          style={[styles.payoutModeChip, bet.payoutMode === 'potFinish' && styles.payoutModeChipActive]}
          onPress={() => onSetPayoutMode('potFinish')}
        >
          <Text
            style={[
              styles.payoutModeChipText,
              bet.payoutMode === 'potFinish' && styles.payoutModeChipTextActive,
            ]}
          >
            Split Pot
          </Text>
        </Pressable>
        <Pressable style={styles.toggleChip} onPress={() => onSetNet(!bet.net)}>
          <View style={[styles.checkbox, bet.net && styles.checkboxChecked]}>
            {bet.net && <Text style={styles.checkboxMark}>{'✓'}</Text>}
          </View>
          <Text style={styles.toggleChipText}>Net</Text>
        </Pressable>
      </View>

      <View style={styles.settingsMembersRow}>
        <Text style={styles.settingsRowSubtext}>{describeBetMembers(bet.playerIds, allPlayers)}</Text>
        {onToggleMe && (
          <Pressable style={styles.addMeChip} onPress={onToggleMe}>
            <Text style={styles.addMeChipText}>{amIIn ? 'Remove me' : 'Add me'}</Text>
          </Pressable>
        )}
      </View>

      {isPot && potPreview > 0 && (
        <Text style={styles.potPreviewText}>
          Pot: {formatStakeAmount(potPreview, unit)} ({bet.playerIds.length} player{bet.playerIds.length === 1 ? '' : 's'})
        </Text>
      )}
    </View>
  );
}

// A flat-payout-only bet settings row - just a name, one $ amount, a Net
// toggle, and who's in it. Shared shape for Birdies and Doubles, which
// unlike Skins/Stroke Play have no carryover rule and no pot mode to
// choose between - every point/double is worth a fixed amount the moment
// it happens, full stop.
function BirdiesSettingsRow({
  bet,
  onRename,
  onSetNet,
  onSetAmount,
  onDelete,
  allPlayers,
  amIIn,
  onToggleMe,
}: {
  bet: BirdiesBet;
  onRename: (name: string) => void;
  onSetNet: (net: boolean) => void;
  onSetAmount: (amountPerBirdie: number) => void;
  onDelete: () => void;
  allPlayers: Player[];
  amIIn?: boolean;
  onToggleMe?: () => void;
}) {
  const unit = bet.unit;
  const setBirdiesBetUnit = useRoundState((state) => state.setBirdiesBetUnit);
  const [nameDraft, setNameDraft] = useState(bet.name);
  const [valueDraft, setValueDraft] = useState(String(bet.amountPerBirdie));
  const [valueFocused, setValueFocused] = useState(false);

  // Keeps this in sync with an amount set from outside this input - same
  // reason as Skins/Stroke Play's own value fields (the random bet
  // generator, in particular). Skipped while focused so it never clobbers
  // active typing.
  useEffect(() => {
    if (!valueFocused) setValueDraft(String(bet.amountPerBirdie));
  }, [bet.amountPerBirdie, valueFocused]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== bet.name) {
      onRename(trimmed);
    } else {
      setNameDraft(bet.name);
    }
  };

  const commitValue = () => {
    const parsed = Number(valueDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetAmount(parsed);
      setValueDraft(String(parsed));
    } else {
      setValueDraft(String(bet.amountPerBirdie));
    }
  };

  return (
    <View style={styles.birdiesSettingsCard}>
      <View style={styles.settingsRow}>
        <TextInput
          style={styles.settingsNameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <StakesUnitToggle unit={unit} onChange={(newUnit) => setBirdiesBetUnit(bet.id, newUnit)} />
        <RemoveButton label={bet.name} onConfirm={onDelete} />
      </View>

      <View style={styles.birdiesSettingsOptionsRow}>
        <View style={styles.valueField}>
          <Text style={styles.valueLabel}>{stakesSymbol(unit)}/point</Text>
          <TextInput
            style={styles.valueInput}
            value={valueDraft}
            onChangeText={setValueDraft}
            onFocus={() => setValueFocused(true)}
            onEndEditing={commitValue}
            onBlur={() => {
              setValueFocused(false);
              commitValue();
            }}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.betHint}>Birdie = 1 point, eagle = 2</Text>
        <Pressable style={styles.toggleChip} onPress={() => onSetNet(!bet.net)}>
          <View style={[styles.checkbox, bet.net && styles.checkboxChecked]}>
            {bet.net && <Text style={styles.checkboxMark}>{'✓'}</Text>}
          </View>
          <Text style={styles.toggleChipText}>Net</Text>
        </Pressable>
      </View>

      <View style={styles.settingsMembersRow}>
        <Text style={styles.settingsRowSubtext}>{describeBetMembers(bet.playerIds, allPlayers)}</Text>
        {onToggleMe && (
          <Pressable style={styles.addMeChip} onPress={onToggleMe}>
            <Text style={styles.addMeChipText}>{amIIn ? 'Remove me' : 'Add me'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function DoublesSettingsRow({
  bet,
  onRename,
  onSetNet,
  onSetAmount,
  onDelete,
  allPlayers,
  amIIn,
  onToggleMe,
}: {
  bet: DoublesBet;
  onRename: (name: string) => void;
  onSetNet: (net: boolean) => void;
  onSetAmount: (amountPerDouble: number) => void;
  onDelete: () => void;
  allPlayers: Player[];
  amIIn?: boolean;
  onToggleMe?: () => void;
}) {
  const unit = bet.unit;
  const setDoublesBetUnit = useRoundState((state) => state.setDoublesBetUnit);
  const [nameDraft, setNameDraft] = useState(bet.name);
  const [valueDraft, setValueDraft] = useState(String(bet.amountPerDouble));
  const [valueFocused, setValueFocused] = useState(false);

  useEffect(() => {
    if (!valueFocused) setValueDraft(String(bet.amountPerDouble));
  }, [bet.amountPerDouble, valueFocused]);

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== bet.name) {
      onRename(trimmed);
    } else {
      setNameDraft(bet.name);
    }
  };

  const commitValue = () => {
    const parsed = Number(valueDraft);
    if (Number.isFinite(parsed) && parsed >= 0) {
      onSetAmount(parsed);
      setValueDraft(String(parsed));
    } else {
      setValueDraft(String(bet.amountPerDouble));
    }
  };

  return (
    <View style={styles.doublesSettingsCard}>
      <View style={styles.settingsRow}>
        <TextInput
          style={styles.settingsNameInput}
          value={nameDraft}
          onChangeText={setNameDraft}
          onEndEditing={commitName}
          onBlur={commitName}
        />
        <StakesUnitToggle unit={unit} onChange={(newUnit) => setDoublesBetUnit(bet.id, newUnit)} />
        <RemoveButton label={bet.name} onConfirm={onDelete} />
      </View>

      <View style={styles.doublesSettingsOptionsRow}>
        <View style={styles.valueField}>
          <Text style={styles.valueLabel}>{stakesSymbol(unit)}/double</Text>
          <TextInput
            style={styles.valueInput}
            value={valueDraft}
            onChangeText={setValueDraft}
            onFocus={() => setValueFocused(true)}
            onEndEditing={commitValue}
            onBlur={() => {
              setValueFocused(false);
              commitValue();
            }}
            keyboardType="decimal-pad"
          />
        </View>
        <Text style={styles.betHint}>Double bogey or worse pays everyone else</Text>
        <Pressable style={styles.toggleChip} onPress={() => onSetNet(!bet.net)}>
          <View style={[styles.checkbox, bet.net && styles.checkboxChecked]}>
            {bet.net && <Text style={styles.checkboxMark}>{'✓'}</Text>}
          </View>
          <Text style={styles.toggleChipText}>Net</Text>
        </Pressable>
      </View>

      <View style={styles.settingsMembersRow}>
        <Text style={styles.settingsRowSubtext}>{describeBetMembers(bet.playerIds, allPlayers)}</Text>
        {onToggleMe && (
          <Pressable style={styles.addMeChip} onPress={onToggleMe}>
            <Text style={styles.addMeChipText}>{amIIn ? 'Remove me' : 'Add me'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  roundLengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  roundLengthLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#667',
  },
  roundLengthChips: {
    flexDirection: 'row',
    gap: 6,
  },
  handicapLengthHint: {
    color: '#889',
    fontSize: 12,
    marginTop: -8,
    marginBottom: 14,
  },
  roundLengthChip: {
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f7f7f7',
  },
  roundLengthChipActive: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  roundLengthChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#445',
  },
  roundLengthChipTextActive: {
    color: '#fff',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  hint: {
    color: '#667',
    fontSize: 13,
    marginBottom: 14,
    lineHeight: 18,
  },
  groupCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  youBadge: {
    color: '#1a7f37',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  newGroupButton: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1a7f37',
    marginTop: 4,
  },
  newGroupButtonText: {
    color: '#1a7f37',
    fontWeight: '600',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 20,
  },
  groupNameInput: {
    fontSize: 17,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 4,
  },
  playerRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  playerRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playerName: {
    fontSize: 15,
  },
  removeIconButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fdecea',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeIconText: {
    color: '#c0392b',
    fontSize: 12,
    fontWeight: '700',
  },
  playerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 8,
  },
  handicapField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginRight: 4,
  },
  handicapLabel: {
    fontSize: 12,
    color: '#667',
  },
  handicapInput: {
    width: 40,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: '#1a7f37',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionButtonText: {
    color: '#1a7f37',
    fontSize: 12,
    fontWeight: '600',
  },
  addPlayerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 8,
  },
  addPlayerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  addPlayerButton: {
    backgroundColor: '#1a7f37',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addPlayerButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '75%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  modalSheetContent: {
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#556',
    marginTop: 10,
    marginBottom: 6,
  },
  modalSectionLabelSpaced: {
    marginTop: 18,
  },
  modalEmptyHint: {
    color: '#889',
    fontSize: 13,
    marginBottom: 6,
  },
  modalRow: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  modalRowSelected: {
    borderColor: '#1a7f37',
    backgroundColor: '#eef8f0',
  },
  modalRowText: {
    fontSize: 15,
    color: '#234',
  },
  modalRowSubtext: {
    fontSize: 12,
    color: '#889',
    marginTop: 2,
  },
  modalSectionSubtext: {
    fontSize: 12,
    color: '#889',
    marginBottom: 6,
    marginTop: -2,
  },
  modalRowTextSelected: {
    color: '#1a7f37',
    fontWeight: '600',
  },
  modalAddRow: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1a7f37',
    marginBottom: 4,
  },
  modalAddRowText: {
    color: '#1a7f37',
    fontWeight: '600',
    fontSize: 13,
  },
  modalCloseButton: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 24,
  },
  modalCloseButtonText: {
    color: '#556',
    fontWeight: '600',
  },
  settingsContainer: {
    marginBottom: 8,
  },
  settingsHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  settingsHeadingSpaced: {
    marginTop: 16,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  settingsNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    paddingVertical: 4,
    marginRight: 12,
  },
  settingsAddRow: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#1a7f37',
    marginBottom: 4,
  },
  settingsAddRowText: {
    color: '#1a7f37',
    fontWeight: '600',
    fontSize: 13,
  },
  settingsTeamCard: {
    marginBottom: 8,
  },
  settingsRowSubtext: {
    fontSize: 12,
    color: '#889',
    flexShrink: 1,
  },
  settingsMembersRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 6,
    gap: 8,
  },
  addMeChip: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1a7f37',
  },
  addMeChipText: {
    color: '#1a7f37',
    fontWeight: '600',
    fontSize: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderSummary: {
    fontSize: 12,
    color: '#889',
  },
  sectionChevron: {
    fontSize: 13,
    color: '#889',
  },
  skinsSettingsCard: {
    backgroundColor: '#fff6e8',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  skinsSettingsOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  strokePlaySettingsCard: {
    backgroundColor: '#eaf3fb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  strokePlaySettingsOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  birdiesSettingsCard: {
    backgroundColor: '#eaf7ee',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  birdiesSettingsOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  doublesSettingsCard: {
    backgroundColor: '#fbeceb',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  doublesSettingsOptionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  betHint: {
    color: '#889',
    fontSize: 11,
    flexShrink: 1,
  },
  payoutModeChip: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
  },
  payoutModeChipActive: {
    backgroundColor: '#1a7f37',
    borderColor: '#1a7f37',
  },
  payoutModeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#556',
  },
  payoutModeChipTextActive: {
    color: '#fff',
  },
  potPreviewText: {
    fontSize: 11,
    color: '#886a2a',
    marginTop: 6,
  },
  valueField: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueLabel: {
    fontSize: 12,
    color: '#556',
    marginRight: 6,
  },
  valueInput: {
    width: 52,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 13,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#b8862f',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  checkboxChecked: {
    backgroundColor: '#b8862f',
  },
  checkboxMark: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  toggleChipText: {
    fontSize: 12,
    color: '#234',
  },
  startButton: {
    backgroundColor: '#1a7f37',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  startHint: {
    color: '#667',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  liveHint: {
    color: '#667',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
  },
  surpriseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a7f37',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  surpriseCardEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  surpriseCardText: {
    flex: 1,
  },
  surpriseCardTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  surpriseCardSubtitle: {
    color: '#d7f0dd',
    fontSize: 12,
  },
  surpriseCardChevron: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginLeft: 8,
  },
});
